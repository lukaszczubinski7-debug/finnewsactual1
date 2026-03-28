"use client";

import { useCallback, useEffect, useState } from "react";
import { getMarketInstruments, getMarketQuotes } from "../lib/api";
import type { MarketCategory, MarketQuote } from "../lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashGroup  { id: string; name: string; tickers: string[]; col: 0 | 1 }
interface DashBoard  { id: string; name: string; groups: DashGroup[] }

const STORAGE_KEY   = "dashboard_boards_v1";
const ACTIVE_KEY    = "dashboard_active_v1";
const REFRESH_MS    = 60_000;

function loadBoards(): DashBoard[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) { const p = JSON.parse(raw); if (Array.isArray(p) && p.length) return p; }
  } catch {}
  return [{ id: uid(), name: "Dashboard", groups: [] }];
}
function saveBoards(b: DashBoard[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(b)); }
function loadActive(boards: DashBoard[]): string { return localStorage.getItem(ACTIVE_KEY) ?? boards[0]?.id ?? ""; }
function saveActive(id: string) { localStorage.setItem(ACTIVE_KEY, id); }
function uid() { return Math.random().toString(36).slice(2, 10); }

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtPrice(p: number | null): string {
  if (p === null) return "—";
  if (p >= 10000) return p.toLocaleString("pl-PL", { maximumFractionDigits: 0 });
  if (p >= 100)   return p.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1)     return p.toLocaleString("pl-PL", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return p.toLocaleString("pl-PL", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}
function fmtChange(n: number | null): string {
  if (n === null) return "—";
  const s = n >= 0 ? "+" : "";
  if (Math.abs(n) >= 100) return `${s}${n.toLocaleString("pl-PL", { maximumFractionDigits: 0 })}`;
  if (Math.abs(n) >= 1)   return `${s}${n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${s}${n.toLocaleString("pl-PL", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
}
function fmtPct(n: number | null): string {
  if (n === null) return "";
  const s = n >= 0 ? "+" : "";
  return `${s}${n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

// ── Ticker Row ────────────────────────────────────────────────────────────────

function TickerRow({ quote, ticker, onRemove }: { quote?: MarketQuote; ticker: string; onRemove: () => void }) {
  const [hov, setHov] = useState(false);
  const pos = (quote?.change ?? 0) >= 0;
  const clr = pos ? "#4ade80" : "#f87171";
  const bg  = pos ? "rgba(34,90,50,0.45)" : "rgba(90,30,30,0.45)";
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: "flex", alignItems: "center", padding: "7px 10px",
        borderBottom: "1px solid rgba(100,140,200,0.06)",
        background: hov ? "rgba(255,255,255,0.03)" : "transparent", gap: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#c0d4f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{quote?.name ?? ticker}</div>
        <div style={{ fontSize: 9, color: "#2a4870", letterSpacing: "0.05em" }}>{ticker}</div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        {!quote ? (
          <span style={{ display: "inline-flex", gap: 3 }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{
                display: "inline-block", width: 4, height: 4, borderRadius: "50%",
                background: "#1e3a5a",
                animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
            <style>{`@keyframes pulse{0%,80%,100%{opacity:0.2}40%{opacity:1}}`}</style>
          </span>
        ) : (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#eef4ff", fontVariantNumeric: "tabular-nums" }}>{fmtPrice(quote.price)}</div>
            <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
              <span style={{ fontSize: 10, color: clr, fontVariantNumeric: "tabular-nums" }}>{fmtChange(quote.change)}</span>
              <span style={{ fontSize: 10, background: bg, color: clr, borderRadius: 4, padding: "1px 5px", fontWeight: 600 }}>{fmtPct(quote.change_pct)}</span>
            </div>
          </>
        )}
      </div>
      <button onClick={(e) => { e.stopPropagation(); onRemove(); }} style={{
        opacity: hov ? 1 : 0, background: "rgba(30,45,70,0.9)", border: "1px solid rgba(100,130,180,0.3)",
        borderRadius: 4, color: "rgba(160,190,230,0.8)", cursor: "pointer", fontSize: 10,
        padding: "2px 6px", fontWeight: 700, transition: "opacity 0.15s", flexShrink: 0 }}
        onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.color = "#f87171"; b.style.background = "rgba(80,20,20,0.9)"; }}
        onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.color = "rgba(160,190,230,0.8)"; b.style.background = "rgba(30,45,70,0.9)"; }}>✕</button>
    </div>
  );
}

// ── Ticker Selector ───────────────────────────────────────────────────────────

function TickerSelector({ categories, usedTickers, onSelect, onClose, anchorRect }: {
  categories: MarketCategory[]; usedTickers: Set<string>; onSelect: (t: string) => void; onClose: () => void;
  anchorRect: DOMRect;
}) {
  const [cat, setCat] = useState<MarketCategory | null>(null);

  // Position dropdown below the anchor button, flip up if too close to bottom
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const dropTop = spaceBelow > 260 ? anchorRect.bottom + 4 : anchorRect.top - 264;
  const dropLeft = Math.min(anchorRect.left, window.innerWidth - 290);

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 199 }} onClick={onClose} />
      <div style={{
        position: "fixed", zIndex: 200,
        top: dropTop, left: dropLeft, width: 280,
        background: "linear-gradient(180deg,#0e1a2e,#080f1c)",
        border: "1px solid rgba(100,140,200,0.25)", borderRadius: 10,
        padding: "10px", maxHeight: 260, display: "flex", flexDirection: "column",
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ color: "#d0e4ff", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            {cat ? cat.name : "Kategoria"}
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            {cat && <button onClick={() => setCat(null)} style={{ background: "none", border: "1px solid rgba(60,90,140,0.3)", borderRadius: 4, color: "#4a7ab0", cursor: "pointer", fontSize: 9, padding: "2px 6px" }}>← wróć</button>}
            <button onClick={onClose} style={{ background: "none", border: "1px solid rgba(60,90,140,0.3)", borderRadius: 4, color: "#4a7ab0", cursor: "pointer", fontSize: 9, padding: "2px 6px" }}>✕</button>
          </div>
        </div>
        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
          {categories.length === 0 && <p style={{ color: "#3a5a80", fontSize: 11, textAlign: "center", padding: "12px 0", margin: 0 }}>Ładowanie...</p>}
          {!cat ? categories.map((c) => (
            <button key={c.name} onClick={() => setCat(c)} style={{ border: "1px solid rgba(80,120,180,0.2)", borderRadius: 6, padding: "7px 10px", background: "rgba(14,22,36,0.7)", color: "#b0cce8", fontSize: 11, fontWeight: 600, cursor: "pointer", textAlign: "left", display: "flex", justifyContent: "space-between" }}>
              {c.name}<span style={{ color: "#2a4870", fontSize: 10 }}>{c.instruments.length} →</span>
            </button>
          )) : cat.instruments.map((inst) => {
            const used = usedTickers.has(inst.ticker);
            return (
              <button key={inst.ticker} disabled={used} onClick={() => { onSelect(inst.ticker); onClose(); }} style={{ border: `1px solid ${used ? "rgba(20,40,70,0.3)" : "rgba(80,120,180,0.2)"}`, borderRadius: 6, padding: "7px 10px", background: used ? "rgba(8,14,24,0.4)" : "rgba(14,22,36,0.7)", color: used ? "#1e3050" : "#b0cce8", fontSize: 11, cursor: used ? "not-allowed" : "pointer", textAlign: "left", display: "flex", justifyContent: "space-between" }}>
                {inst.name}<span style={{ fontSize: 10, color: used ? "#1a2e4a" : "#2a4870" }}>{inst.ticker}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ── Name Input Modal ──────────────────────────────────────────────────────────

function NameModal({ title, initial, onConfirm, onClose }: { title: string; initial?: string; onConfirm: (n: string) => void; onClose: () => void }) {
  const [val, setVal] = useState(initial ?? "");
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(4,8,14,0.85)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "linear-gradient(180deg,#0e1a2e,#080f1c)", border: "1px solid rgba(100,140,200,0.25)", borderRadius: 14, padding: "22px", width: 300 }}>
        <p style={{ margin: "0 0 12px", color: "#d0e4ff", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>{title}</p>
        <input autoFocus value={val} onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && val.trim()) { onConfirm(val.trim()); onClose(); } if (e.key === "Escape") onClose(); }}
          style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", background: "rgba(8,14,26,0.8)", border: "1px solid rgba(80,120,180,0.3)", borderRadius: 7, color: "#d0e4ff", fontSize: 12, outline: "none", marginBottom: 12 }} />
        <div style={{ display: "flex", gap: 7 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "8px", background: "transparent", border: "1px solid rgba(50,80,130,0.3)", borderRadius: 7, color: "#3a5a80", cursor: "pointer", fontSize: 11 }}>Anuluj</button>
          <button disabled={!val.trim()} onClick={() => { if (val.trim()) { onConfirm(val.trim()); onClose(); } }}
            style={{ flex: 1, padding: "8px", background: val.trim() ? "rgba(45,80,150,0.65)" : "rgba(15,28,50,0.4)", border: "1px solid rgba(70,120,200,0.35)", borderRadius: 7, color: val.trim() ? "#c0d8f8" : "#1e3050", cursor: val.trim() ? "pointer" : "not-allowed", fontSize: 11, fontWeight: 700 }}>OK</button>
        </div>
      </div>
    </div>
  );
}

// ── Group Card ────────────────────────────────────────────────────────────────

function GroupCard({ group, quotes, allTickers, categories, isDragging, onAddTicker, onRemoveTicker, onDeleteGroup, onRenameGroup }: {
  group: DashGroup; quotes: Map<string, MarketQuote>; allTickers: Set<string>; categories: MarketCategory[];
  isDragging: boolean; onAddTicker: (id: string, t: string) => void; onRemoveTicker: (id: string, t: string) => void;
  onDeleteGroup: (id: string) => void; onRenameGroup: (id: string, n: string) => void;
}) {
  const [selAnchor, setSelAnchor] = useState<DOMRect | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(group.name);
  return (
    <div style={{ background: isDragging ? "rgba(20,36,70,0.6)" : "rgba(255,255,255,0.025)", border: `1px solid ${isDragging ? "rgba(80,130,220,0.4)" : "rgba(120,160,210,0.1)"}`, borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: isDragging ? "0 8px 32px rgba(0,0,0,0.5)" : "0 1px 8px rgba(0,0,0,0.15)", transition: "box-shadow 0.15s, border-color 0.15s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 10px", borderBottom: "1px solid rgba(100,140,200,0.08)", background: "rgba(255,255,255,0.02)", cursor: "grab" }}>
        <span style={{ color: "#1e3555", fontSize: 11, marginRight: 2, userSelect: "none" }}>≡</span>
        {renaming ? (
          <input autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)}
            onBlur={() => { if (renameVal.trim()) onRenameGroup(group.id, renameVal.trim()); setRenaming(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") { if (renameVal.trim()) onRenameGroup(group.id, renameVal.trim()); setRenaming(false); } if (e.key === "Escape") { setRenameVal(group.name); setRenaming(false); } }}
            style={{ flex: 1, background: "rgba(8,14,26,0.8)", border: "1px solid rgba(80,120,180,0.35)", borderRadius: 5, color: "#c0d4f0", fontSize: 11, fontWeight: 700, padding: "3px 7px", outline: "none" }} />
        ) : (
          <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: "#90b8e0", letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{group.name}</span>
        )}
        <button onClick={(e) => { e.stopPropagation(); setRenameVal(group.name); setRenaming(true); }} style={{ background: "none", border: "none", color: "#1e3555", cursor: "pointer", fontSize: 11, padding: "0 2px" }} onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#6a9ac8"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#1e3555"; }}>~</button>
        <button onClick={(e) => { e.stopPropagation(); onDeleteGroup(group.id); }} style={{ background: "none", border: "none", color: "#1e3555", cursor: "pointer", fontSize: 11, padding: "0 2px" }} onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#1e3555"; }}>✕</button>
      </div>
      {group.tickers.length === 0 && <div style={{ padding: "14px 10px", color: "#1e3555", fontSize: 11, textAlign: "center" }}>Brak tickerów</div>}
      {group.tickers.map((ticker) => (
        <TickerRow key={ticker} ticker={ticker} quote={quotes.get(ticker)} onRemove={() => onRemoveTicker(group.id, ticker)} />
      ))}
      <button onClick={(e) => setSelAnchor((e.currentTarget as HTMLButtonElement).getBoundingClientRect())} style={{ margin: "8px 10px 10px", padding: "6px 10px", background: "rgba(16,30,56,0.5)", border: "1px dashed rgba(60,100,170,0.3)", borderRadius: 7, color: "rgba(70,120,190,0.6)", cursor: "pointer", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 5, transition: "all 0.15s" }} onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(30,55,110,0.5)"; b.style.color = "rgba(130,180,255,0.9)"; b.style.borderColor = "rgba(100,160,240,0.45)"; }} onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(16,30,56,0.5)"; b.style.color = "rgba(70,120,190,0.6)"; b.style.borderColor = "rgba(60,100,170,0.3)"; }}>
        <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> Dodaj ticker
      </button>
      {selAnchor && <TickerSelector categories={categories} usedTickers={allTickers} onSelect={(t) => { onAddTicker(group.id, t); setSelAnchor(null); }} onClose={() => setSelAnchor(null)} anchorRect={selAnchor} />}
    </div>
  );
}

// ── Column ────────────────────────────────────────────────────────────────────

function Column({ colIdx, groups, quotes, allTickers, categories, dragId, onDragStart, onDrop, onAddTicker, onRemoveTicker, onDeleteGroup, onRenameGroup, onAddGroup }: {
  colIdx: 0 | 1; groups: DashGroup[]; quotes: Map<string, MarketQuote>; allTickers: Set<string>; categories: MarketCategory[];
  dragId: string | null; onDragStart: (id: string) => void; onDrop: (targetId: string | null, col: 0 | 1) => void;
  onAddTicker: (id: string, t: string) => void; onRemoveTicker: (id: string, t: string) => void;
  onDeleteGroup: (id: string) => void; onRenameGroup: (id: string, n: string) => void; onAddGroup: (col: 0 | 1) => void;
}) {
  const [dragOverId, setDragOverId] = useState<string | "bottom" | null>(null);
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onDrop(null, colIdx); setDragOverId(null); }}>
      {groups.map((group) => (
        <div key={group.id} draggable
          onDragStart={(e) => { e.stopPropagation(); onDragStart(group.id); }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverId(group.id); }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(group.id, colIdx); setDragOverId(null); }}
          onDragLeave={() => setDragOverId(null)}
          style={{ opacity: dragId === group.id ? 0.45 : 1, transition: "opacity 0.15s", outline: dragOverId === group.id && dragId !== group.id ? "2px dashed rgba(80,140,240,0.5)" : "none", borderRadius: 10 }}>
          <GroupCard group={group} quotes={quotes} allTickers={allTickers} categories={categories} isDragging={dragId === group.id}
            onAddTicker={onAddTicker} onRemoveTicker={onRemoveTicker} onDeleteGroup={onDeleteGroup} onRenameGroup={onRenameGroup} />
        </div>
      ))}
      <div onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverId("bottom"); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(null, colIdx); setDragOverId(null); }}
        onDragLeave={() => setDragOverId(null)}
        style={{ minHeight: 40, borderRadius: 10, border: dragOverId === "bottom" && dragId ? "2px dashed rgba(80,140,240,0.4)" : "2px dashed transparent", transition: "border-color 0.15s" }} />
      <button onClick={() => onAddGroup(colIdx)} style={{ padding: "7px 14px", background: "rgba(14,26,50,0.5)", border: "1px dashed rgba(60,100,170,0.25)", borderRadius: 9, color: "rgba(60,110,180,0.5)", cursor: "pointer", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s" }} onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(30,55,110,0.5)"; b.style.color = "rgba(130,180,255,0.9)"; b.style.borderColor = "rgba(100,160,240,0.4)"; }} onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(14,26,50,0.5)"; b.style.color = "rgba(60,110,180,0.5)"; b.style.borderColor = "rgba(60,100,170,0.25)"; }}>
        <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> Dodaj grupę
      </button>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [boards, setBoards] = useState<DashBoard[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [quotes, setQuotes] = useState<Map<string, MarketQuote>>(new Map());
  const [categories, setCategories] = useState<MarketCategory[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [newGroupCol, setNewGroupCol] = useState<0 | 1 | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [modal, setModal] = useState<{ type: "newBoard" } | { type: "renameBoard"; id: string; current: string } | null>(null);
  const [renamingTab, setRenamingTab] = useState<string | null>(null);

  useEffect(() => {
    const b = loadBoards(); setBoards(b);
    const a = loadActive(b); setActiveId(a);
    getMarketInstruments().then((r) => setCategories(r.categories)).catch(() => {});
  }, []);

  const board = boards.find((b) => b.id === activeId) ?? boards[0];
  const groups = board?.groups ?? [];
  const allTickers = new Set(groups.flatMap((g) => g.tickers));

  const fetchQuotes = useCallback(async (tickers: string[]) => {
    if (!tickers.length) return;
    try {
      const data = await getMarketQuotes(tickers);
      setQuotes((prev) => { const m = new Map(prev); data.forEach((q) => m.set(q.ticker, q)); return m; });
      setLastRefresh(new Date());
    } catch {}
  }, []);

  useEffect(() => {
    const tickers = [...allTickers];
    if (tickers.length) void fetchQuotes(tickers);
    const id = setInterval(() => {
      const t = [...new Set((board?.groups ?? []).flatMap((g) => g.tickers))];
      if (t.length) void fetchQuotes(t);
    }, REFRESH_MS);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, groups]);

  const updateBoards = (next: DashBoard[]) => { setBoards(next); saveBoards(next); };
  const updateGroups = (next: DashGroup[]) => {
    updateBoards(boards.map((b) => b.id === activeId ? { ...b, groups: next } : b));
  };

  // Board actions
  const addBoard = (name: string) => {
    const nb: DashBoard = { id: uid(), name, groups: [] };
    const next = [...boards, nb];
    updateBoards(next);
    setActiveId(nb.id); saveActive(nb.id);
  };
  const renameBoard = (id: string, name: string) => updateBoards(boards.map((b) => b.id === id ? { ...b, name } : b));
  const deleteBoard = (id: string) => {
    if (boards.length <= 1) return;
    const next = boards.filter((b) => b.id !== id);
    updateBoards(next);
    if (activeId === id) { setActiveId(next[0].id); saveActive(next[0].id); }
  };
  const switchBoard = (id: string) => { setActiveId(id); saveActive(id); };

  // Group drag-drop
  const handleDrop = (targetId: string | null, col: 0 | 1) => {
    if (!dragId) return;
    setDragId(null);
    const src = groups.find((g) => g.id === dragId);
    if (!src) return;
    const without = groups.filter((g) => g.id !== dragId);
    const updated = src.col !== col ? { ...src, col } : src;
    if (!targetId) {
      const colItems = without.filter((g) => g.col === col);
      const other = without.filter((g) => g.col !== col);
      updateGroups([...other, ...colItems, updated]);
    } else {
      const idx = without.findIndex((g) => g.id === targetId);
      const result = [...without]; result.splice(idx, 0, updated); updateGroups(result);
    }
  };

  const sharedProps = {
    quotes, allTickers, categories, dragId,
    onDragStart: (id: string) => setDragId(id),
    onDrop: handleDrop,
    onAddTicker: (id: string, ticker: string) => {
      updateGroups(groups.map((g) => g.id === id ? { ...g, tickers: [...g.tickers, ticker] } : g));
      void fetchQuotes([ticker]);
    },
    onRemoveTicker: (id: string, ticker: string) =>
      updateGroups(groups.map((g) => g.id === id ? { ...g, tickers: g.tickers.filter((t) => t !== ticker) } : g)),
    onDeleteGroup: (id: string) => updateGroups(groups.filter((g) => g.id !== id)),
    onRenameGroup: (id: string, name: string) => updateGroups(groups.map((g) => g.id === id ? { ...g, name } : g)),
    onAddGroup: (col: 0 | 1) => setNewGroupCol(col),
  };

  if (!board) return null;

  return (
    <div style={{ padding: "0 4px" }}>
      {/* Tab bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 20, borderBottom: "1px solid rgba(100,140,200,0.1)", paddingBottom: 0 }}>
        {boards.map((b) => {
          const active = b.id === activeId;
          return (
            <div key={b.id} style={{ position: "relative", display: "flex", alignItems: "center" }}>
              {renamingTab === b.id ? (
                <input autoFocus defaultValue={b.name}
                  onBlur={(e) => { const v = e.currentTarget.value.trim(); if (v) renameBoard(b.id, v); setRenamingTab(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { const v = e.currentTarget.value.trim(); if (v) renameBoard(b.id, v); setRenamingTab(null); } if (e.key === "Escape") setRenamingTab(null); }}
                  style={{ padding: "6px 10px", background: "rgba(20,40,80,0.7)", border: "1px solid rgba(80,130,210,0.4)", borderBottom: "none", borderRadius: "8px 8px 0 0", color: "#d0e4ff", fontSize: 11, outline: "none", width: 120 }} />
              ) : (
                <button
                  onClick={() => switchBoard(b.id)}
                  onDoubleClick={() => setRenamingTab(b.id)}
                  style={{ padding: "8px 14px 9px", background: active ? "rgba(255,255,255,0.04)" : "transparent", border: active ? "1px solid rgba(100,140,200,0.15)" : "1px solid transparent", borderBottom: active ? "1px solid transparent" : "none", borderRadius: "8px 8px 0 0", color: active ? "#c0d8f4" : "#3a5a80", fontSize: 11, fontWeight: active ? 700 : 400, cursor: "pointer", letterSpacing: "0.06em", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6, position: "relative", top: 1 }}>
                  {b.name}
                  {boards.length > 1 && (
                    <span onClick={(e) => { e.stopPropagation(); deleteBoard(b.id); }}
                      style={{ fontSize: 9, color: active ? "#2a4870" : "#1e3050", lineHeight: 1, padding: "1px 2px" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLSpanElement).style.color = "#f87171"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLSpanElement).style.color = active ? "#2a4870" : "#1e3050"; }}>✕</span>
                  )}
                </button>
              )}
            </div>
          );
        })}
        {/* Add board */}
        <button onClick={() => setModal({ type: "newBoard" })} style={{ padding: "7px 10px 9px", background: "transparent", border: "1px solid transparent", borderRadius: "8px 8px 0 0", color: "#2a4870", fontSize: 14, cursor: "pointer", lineHeight: 1, position: "relative", top: 1, transition: "color 0.15s" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#8ab4d8"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#2a4870"; }}>+</button>

        {lastRefresh && <span style={{ marginLeft: "auto", fontSize: 10, color: "#1a2e4a", paddingBottom: 6 }}>· {lastRefresh.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}</span>}
      </div>

      {/* 2-column layout */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }} onDragEnd={() => setDragId(null)}>
        <Column colIdx={0} groups={groups.filter((g) => g.col === 0)} {...sharedProps} />
        <Column colIdx={1} groups={groups.filter((g) => g.col === 1)} {...sharedProps} />
      </div>

      {/* Modals */}
      {modal?.type === "newBoard" && (
        <NameModal title="Nowy dashboard" onConfirm={addBoard} onClose={() => setModal(null)} />
      )}
      {newGroupCol !== null && (
        <NameModal title="Nowa grupa" onConfirm={(name) => {
          updateGroups([...groups, { id: uid(), name, tickers: [], col: newGroupCol }]);
          setNewGroupCol(null);
        }} onClose={() => setNewGroupCol(null)} />
      )}
    </div>
  );
}
