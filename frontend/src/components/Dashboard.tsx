"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getMarketInstruments, getMarketQuotes } from "../lib/api";
import type { MarketCategory, MarketQuote } from "../lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashGroup { id: string; name: string; tickers: string[] }

const STORAGE_KEY = "dashboard_groups_v2";
const REFRESH_MS = 60_000;

function loadGroups(): DashGroup[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) return p; }
  } catch {}
  return [];
}
function saveGroups(g: DashGroup[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(g)); }
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

// ── Ticker Row ─────────────────────────────────────────────────────────────────

function TickerRow({ quote, loading, ticker, onRemove }: {
  quote?: MarketQuote; loading?: boolean; ticker: string; onRemove: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const pos = (quote?.change ?? 0) >= 0;
  const clr = pos ? "#4ade80" : "#f87171";
  const bgClr = pos ? "rgba(34,90,50,0.45)" : "rgba(90,30,30,0.45)";

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", padding: "7px 10px",
        borderBottom: "1px solid rgba(80,120,180,0.08)",
        background: hovered ? "rgba(30,50,90,0.25)" : "transparent",
        transition: "background 0.1s", gap: 8,
      }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#c0d4f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {quote?.name ?? ticker}
        </div>
        <div style={{ fontSize: 9, color: "#2a4870", letterSpacing: "0.06em" }}>{ticker}</div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        {loading ? (
          <span style={{ fontSize: 10, color: "#1e3555" }}>ładowanie…</span>
        ) : (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#eef4ff", fontVariantNumeric: "tabular-nums" }}>
              {fmtPrice(quote?.price ?? null)}
            </div>
            <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", alignItems: "center" }}>
              <span style={{ fontSize: 10, color: clr, fontVariantNumeric: "tabular-nums" }}>{fmtChange(quote?.change ?? null)}</span>
              <span style={{ fontSize: 10, background: bgClr, color: clr, borderRadius: 4, padding: "1px 5px", fontWeight: 600 }}>{fmtPct(quote?.change_pct ?? null)}</span>
            </div>
          </>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        style={{
          opacity: hovered ? 1 : 0, background: "rgba(30,45,70,0.9)",
          border: "1px solid rgba(100,130,180,0.3)", borderRadius: 4,
          color: "rgba(160,190,230,0.8)", cursor: "pointer",
          fontSize: 10, padding: "2px 6px", fontWeight: 700,
          transition: "opacity 0.15s", flexShrink: 0,
        }}
        onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.color = "#f87171"; b.style.background = "rgba(80,20,20,0.9)"; }}
        onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.color = "rgba(160,190,230,0.8)"; b.style.background = "rgba(30,45,70,0.9)"; }}>
        ✕
      </button>
    </div>
  );
}

// ── Ticker Selector Modal ──────────────────────────────────────────────────────

function TickerSelector({ categories, usedTickers, onSelect, onClose }: {
  categories: MarketCategory[]; usedTickers: Set<string>;
  onSelect: (ticker: string) => void; onClose: () => void;
}) {
  const [cat, setCat] = useState<MarketCategory | null>(null);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(4,8,14,0.85)",
      display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "linear-gradient(180deg,#0e1a2e,#080f1c)", border: "1px solid rgba(100,140,200,0.25)",
        borderRadius: 14, padding: "18px", width: 320, maxHeight: "65vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ color: "#d0e4ff", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            {cat ? cat.name : "Kategoria"}
          </span>
          <div style={{ display: "flex", gap: 5 }}>
            {cat && <button onClick={() => setCat(null)} style={{ background: "none", border: "1px solid rgba(60,90,140,0.3)", borderRadius: 5, color: "#4a7ab0", cursor: "pointer", fontSize: 10, padding: "2px 7px" }}>← wróć</button>}
            <button onClick={onClose} style={{ background: "none", border: "1px solid rgba(60,90,140,0.3)", borderRadius: 5, color: "#4a7ab0", cursor: "pointer", fontSize: 10, padding: "2px 7px" }}>✕</button>
          </div>
        </div>
        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          {categories.length === 0 && <p style={{ color: "#3a5a80", fontSize: 11, textAlign: "center", padding: "16px 0", margin: 0 }}>Ładowanie...</p>}
          {!cat ? categories.map((c) => (
            <button key={c.name} onClick={() => setCat(c)} style={{
              border: "1px solid rgba(80,120,180,0.2)", borderRadius: 8, padding: "9px 12px",
              background: "rgba(14,22,36,0.7)", color: "#b0cce8", fontSize: 11, fontWeight: 600,
              cursor: "pointer", textAlign: "left", display: "flex", justifyContent: "space-between" }}>
              {c.name}<span style={{ color: "#2a4870", fontSize: 10 }}>{c.instruments.length} →</span>
            </button>
          )) : cat.instruments.map((inst) => {
            const used = usedTickers.has(inst.ticker);
            return (
              <button key={inst.ticker} disabled={used} onClick={() => { onSelect(inst.ticker); onClose(); }} style={{
                border: `1px solid ${used ? "rgba(20,40,70,0.3)" : "rgba(80,120,180,0.2)"}`,
                borderRadius: 8, padding: "8px 12px",
                background: used ? "rgba(8,14,24,0.4)" : "rgba(14,22,36,0.7)",
                color: used ? "#1e3050" : "#b0cce8", fontSize: 11, cursor: used ? "not-allowed" : "pointer",
                textAlign: "left", display: "flex", justifyContent: "space-between" }}>
                {inst.name}<span style={{ fontSize: 10, color: used ? "#1a2e4a" : "#2a4870" }}>{inst.ticker}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── New Group Modal ────────────────────────────────────────────────────────────

function NewGroupModal({ onConfirm, onClose }: { onConfirm: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(4,8,14,0.85)",
      display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "linear-gradient(180deg,#0e1a2e,#080f1c)", border: "1px solid rgba(100,140,200,0.25)",
        borderRadius: 14, padding: "22px", width: 300 }}>
        <p style={{ margin: "0 0 12px", color: "#d0e4ff", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>Nowa grupa</p>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) { onConfirm(name.trim()); onClose(); } if (e.key === "Escape") onClose(); }}
          placeholder="Nazwa grupy (np. Obligacje USA)"
          style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", background: "rgba(8,14,26,0.8)",
            border: "1px solid rgba(80,120,180,0.3)", borderRadius: 7, color: "#d0e4ff", fontSize: 12, outline: "none", marginBottom: 12 }} />
        <div style={{ display: "flex", gap: 7 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "8px", background: "transparent",
            border: "1px solid rgba(50,80,130,0.3)", borderRadius: 7, color: "#3a5a80", cursor: "pointer", fontSize: 11 }}>Anuluj</button>
          <button disabled={!name.trim()} onClick={() => { if (name.trim()) { onConfirm(name.trim()); onClose(); } }}
            style={{ flex: 1, padding: "8px", background: name.trim() ? "rgba(45,80,150,0.65)" : "rgba(15,28,50,0.4)",
              border: "1px solid rgba(70,120,200,0.35)", borderRadius: 7,
              color: name.trim() ? "#c0d8f8" : "#1e3050", cursor: name.trim() ? "pointer" : "not-allowed",
              fontSize: 11, fontWeight: 700 }}>Utwórz</button>
        </div>
      </div>
    </div>
  );
}

// ── Group Card ─────────────────────────────────────────────────────────────────

function GroupCard({
  group, quotes, allTickers, categories,
  onAddTicker, onRemoveTicker, onDeleteGroup, onRenameGroup,
  dragHandleProps,
}: {
  group: DashGroup; quotes: Map<string, MarketQuote>; allTickers: Set<string>; categories: MarketCategory[];
  onAddTicker: (id: string, ticker: string) => void; onRemoveTicker: (id: string, ticker: string) => void;
  onDeleteGroup: (id: string) => void; onRenameGroup: (id: string, name: string) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}) {
  const [showSel, setShowSel] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(group.name);

  return (
    <div style={{ background: "rgba(10,18,32,0.75)", border: "1px solid rgba(80,120,190,0.18)",
      borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 10px",
        borderBottom: "1px solid rgba(80,120,190,0.12)", background: "rgba(14,24,44,0.5)" }}>
        {/* Drag handle */}
        <div {...dragHandleProps} title="Przesuń" style={{
          cursor: "grab", color: "#1e3555", fontSize: 13, padding: "0 4px 0 0",
          lineHeight: 1, userSelect: "none", ...dragHandleProps?.style }}>⠿</div>

        {renaming ? (
          <input autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)}
            onBlur={() => { if (renameVal.trim()) onRenameGroup(group.id, renameVal.trim()); setRenaming(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") { if (renameVal.trim()) onRenameGroup(group.id, renameVal.trim()); setRenaming(false); } if (e.key === "Escape") { setRenameVal(group.name); setRenaming(false); } }}
            style={{ flex: 1, background: "rgba(8,14,26,0.8)", border: "1px solid rgba(80,120,180,0.35)",
              borderRadius: 5, color: "#c0d4f0", fontSize: 11, fontWeight: 700, padding: "3px 7px", outline: "none" }} />
        ) : (
          <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: "#90b8e0", letterSpacing: "0.08em", textTransform: "uppercase",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{group.name}</span>
        )}

        <button onClick={() => { setRenameVal(group.name); setRenaming(true); }} title="Zmień nazwę"
          style={{ background: "none", border: "none", color: "#1e3555", cursor: "pointer", fontSize: 11, padding: "0 2px", lineHeight: 1 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#6a9ac8"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#1e3555"; }}>✏</button>
        <button onClick={() => onDeleteGroup(group.id)} title="Usuń grupę"
          style={{ background: "none", border: "none", color: "#1e3555", cursor: "pointer", fontSize: 11, padding: "0 2px", lineHeight: 1 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#1e3555"; }}>✕</button>
      </div>

      {/* Tickers */}
      <div style={{ flex: 1 }}>
        {group.tickers.length === 0 && (
          <div style={{ padding: "14px 10px", color: "#1e3555", fontSize: 11, textAlign: "center" }}>Brak tickerów</div>
        )}
        {group.tickers.map((ticker) => (
          <TickerRow key={ticker} ticker={ticker} quote={quotes.get(ticker)} loading={!quotes.has(ticker)}
            onRemove={() => onRemoveTicker(group.id, ticker)} />
        ))}
      </div>

      {/* Add ticker */}
      <button onClick={() => setShowSel(true)} style={{
        margin: "8px 10px 10px", padding: "6px 10px", background: "rgba(16,30,56,0.5)",
        border: "1px dashed rgba(60,100,170,0.3)", borderRadius: 7, color: "rgba(70,120,190,0.6)",
        cursor: "pointer", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
        display: "flex", alignItems: "center", gap: 5, transition: "all 0.15s" }}
        onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(30,55,110,0.5)"; b.style.color = "rgba(130,180,255,0.9)"; b.style.borderColor = "rgba(100,160,240,0.45)"; }}
        onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(16,30,56,0.5)"; b.style.color = "rgba(70,120,190,0.6)"; b.style.borderColor = "rgba(60,100,170,0.3)"; }}>
        <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> Dodaj ticker
      </button>

      {showSel && (
        <TickerSelector categories={categories} usedTickers={allTickers}
          onSelect={(t) => onAddTicker(group.id, t)} onClose={() => setShowSel(false)} />
      )}
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [groups, setGroups] = useState<DashGroup[]>([]);
  const [quotes, setQuotes] = useState<Map<string, MarketQuote>>(new Map());
  const [categories, setCategories] = useState<MarketCategory[]>([]);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const dragSrc = useRef<number | null>(null);

  useEffect(() => {
    setGroups(loadGroups());
    getMarketInstruments().then((r) => setCategories(r.categories)).catch(() => {});
  }, []);

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
    const tickers = [...new Set(groups.flatMap((g) => g.tickers))];
    if (tickers.length) void fetchQuotes(tickers);
    const id = setInterval(() => {
      const t = [...new Set(groups.flatMap((g) => g.tickers))];
      if (t.length) void fetchQuotes(t);
    }, REFRESH_MS);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  const update = (next: DashGroup[]) => { setGroups(next); saveGroups(next); };

  // Drag-and-drop reorder
  const handleDragStart = (i: number) => { dragSrc.current = i; };
  const handleDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    if (dragSrc.current === null || dragSrc.current === i) return;
    const next = [...groups];
    const [moved] = next.splice(dragSrc.current, 1);
    next.splice(i, 0, moved);
    dragSrc.current = i;
    update(next);
  };
  const handleDragEnd = () => { dragSrc.current = null; };

  return (
    <div style={{ padding: "0 4px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <span style={{ fontSize: 10, color: "#1e3555", letterSpacing: "0.1em", textTransform: "uppercase" }}>Dashboard rynkowy</span>
        {lastRefresh && (
          <span style={{ fontSize: 10, color: "#1a2e4a" }}>· {lastRefresh.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}</span>
        )}
      </div>

      {groups.length === 0 && (
        <div style={{ textAlign: "center", padding: "50px 20px", color: "#1e3555" }}>
          <p style={{ fontSize: 13, marginBottom: 6 }}>Brak grup</p>
          <p style={{ fontSize: 11 }}>Utwórz pierwszą grupę klikając przycisk poniżej</p>
        </div>
      )}

      {/* Groups grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14, marginBottom: 16 }}>
        {groups.map((group, i) => (
          <div key={group.id}
            draggable
            onDragStart={() => handleDragStart(i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDragEnd={handleDragEnd}
            style={{ cursor: "default" }}>
            <GroupCard
              group={group} quotes={quotes} allTickers={allTickers} categories={categories}
              onAddTicker={(id, ticker) => { update(groups.map((g) => g.id === id ? { ...g, tickers: [...g.tickers, ticker] } : g)); void fetchQuotes([ticker]); }}
              onRemoveTicker={(id, ticker) => update(groups.map((g) => g.id === id ? { ...g, tickers: g.tickers.filter((t) => t !== ticker) } : g))}
              onDeleteGroup={(id) => update(groups.filter((g) => g.id !== id))}
              onRenameGroup={(id, name) => update(groups.map((g) => g.id === id ? { ...g, name } : g))}
            />
          </div>
        ))}
      </div>

      {/* Add group */}
      <button onClick={() => setShowNewGroup(true)} style={{
        padding: "8px 18px", background: "rgba(14,26,50,0.5)",
        border: "1px dashed rgba(60,100,170,0.3)", borderRadius: 9,
        color: "rgba(70,120,190,0.65)", cursor: "pointer",
        fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
        display: "flex", alignItems: "center", gap: 7, transition: "all 0.15s" }}
        onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(30,55,110,0.5)"; b.style.color = "rgba(130,180,255,0.9)"; b.style.borderColor = "rgba(100,160,240,0.4)"; }}
        onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(14,26,50,0.5)"; b.style.color = "rgba(70,120,190,0.65)"; b.style.borderColor = "rgba(60,100,170,0.3)"; }}>
        <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Dodaj grupę
      </button>

      {showNewGroup && <NewGroupModal onConfirm={(name) => update([...groups, { id: uid(), name, tickers: [] }])} onClose={() => setShowNewGroup(false)} />}
    </div>
  );
}
