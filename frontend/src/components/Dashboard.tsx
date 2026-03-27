"use client";

import { useCallback, useEffect, useState } from "react";
import { getMarketInstruments, getMarketQuotes } from "../lib/api";
import type { MarketCategory, MarketQuote } from "../lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashGroup {
  id: string;
  name: string;
  tickers: string[];
}

const STORAGE_KEY = "dashboard_groups_v2";
const REFRESH_MS = 60_000;

function loadGroups(): DashGroup[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveGroups(groups: DashGroup[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtPrice(price: number | null): string {
  if (price === null) return "—";
  if (price >= 10000) return price.toLocaleString("pl-PL", { maximumFractionDigits: 0 });
  if (price >= 100) return price.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toLocaleString("pl-PL", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return price.toLocaleString("pl-PL", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function fmtChange(n: number | null): string {
  if (n === null) return "—";
  const sign = n >= 0 ? "+" : "";
  if (Math.abs(n) >= 100) return `${sign}${n.toLocaleString("pl-PL", { maximumFractionDigits: 0 })}`;
  if (Math.abs(n) >= 1) return `${sign}${n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${sign}${n.toLocaleString("pl-PL", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
}

function fmtPct(n: number | null): string {
  if (n === null) return "";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

// ── QuoteTile ─────────────────────────────────────────────────────────────────

function QuoteTile({ quote, onRemove }: { quote: MarketQuote; onRemove: () => void }) {
  const pos = (quote.change ?? 0) >= 0;
  const clr = pos ? "#4ade80" : "#f87171";
  const bgClr = pos ? "rgba(34,90,50,0.5)" : "rgba(90,30,30,0.5)";

  return (
    <div style={{
      padding: "12px 14px", position: "relative",
      borderBottom: "1px solid rgba(100,140,200,0.08)",
    }}>
      <button
        onClick={onRemove}
        title="Usuń"
        style={{
          position: "absolute", top: 10, right: 10,
          background: "rgba(30,45,70,0.9)", border: "1px solid rgba(100,130,180,0.3)",
          borderRadius: 5, color: "rgba(160,190,230,0.8)",
          cursor: "pointer", fontSize: 11, lineHeight: 1, padding: "3px 7px",
          fontWeight: 700,
        }}
        onMouseEnter={(e) => {
          const b = e.currentTarget as HTMLButtonElement;
          b.style.color = "#f87171";
          b.style.background = "rgba(80,20,20,0.9)";
          b.style.borderColor = "rgba(248,113,113,0.5)";
        }}
        onMouseLeave={(e) => {
          const b = e.currentTarget as HTMLButtonElement;
          b.style.color = "rgba(160,190,230,0.8)";
          b.style.background = "rgba(30,45,70,0.9)";
          b.style.borderColor = "rgba(100,130,180,0.3)";
        }}
      >
        ✕
      </button>
      <p style={{ margin: "0 0 1px", fontSize: 13, fontWeight: 700, color: "#d0e4ff", paddingRight: 28 }}>
        {quote.name}
      </p>
      <p style={{ margin: "0 0 6px", fontSize: 10, color: "#3a6090", letterSpacing: "0.06em" }}>
        {quote.ticker}
      </p>
      <p style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: "#eef4ff", fontVariantNumeric: "tabular-nums" }}>
        {fmtPrice(quote.price)}
      </p>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ color: clr, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
          {fmtChange(quote.change)}
        </span>
        <span style={{ background: bgClr, color: clr, borderRadius: 5, padding: "2px 7px", fontSize: 12, fontWeight: 600 }}>
          {fmtPct(quote.change_pct)}
        </span>
      </div>
    </div>
  );
}

// ── Ticker Selector Modal ──────────────────────────────────────────────────────

function TickerSelector({ categories, usedTickers, onSelect, onClose }: {
  categories: MarketCategory[];
  usedTickers: Set<string>;
  onSelect: (ticker: string) => void;
  onClose: () => void;
}) {
  const [cat, setCat] = useState<MarketCategory | null>(null);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200, background: "rgba(4,8,14,0.85)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "linear-gradient(180deg, #0e1a2e 0%, #080f1c 100%)",
        border: "1px solid rgba(100,140,200,0.25)", borderRadius: 14,
        padding: "20px", width: 340, maxHeight: "70vh", display: "flex", flexDirection: "column",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ color: "#d0e4ff", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            {cat ? cat.name : "Wybierz kategorię"}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            {cat && (
              <button onClick={() => setCat(null)} style={{
                background: "none", border: "1px solid rgba(80,110,160,0.3)", borderRadius: 6,
                color: "#4a7ab0", cursor: "pointer", fontSize: 11, padding: "3px 8px" }}>
                ← Wróć
              </button>
            )}
            <button onClick={onClose} style={{
              background: "none", border: "1px solid rgba(80,110,160,0.3)", borderRadius: 6,
              color: "#4a7ab0", cursor: "pointer", fontSize: 11, padding: "3px 8px" }}>
              ✕
            </button>
          </div>
        </div>

        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 5 }}>
          {categories.length === 0 && (
            <p style={{ color: "#3a5a80", fontSize: 12, textAlign: "center", padding: "20px 0", margin: 0 }}>
              Ładowanie...
            </p>
          )}
          {!cat ? categories.map((c) => (
            <button key={c.name} onClick={() => setCat(c)} style={{
              border: "1px solid rgba(100,140,200,0.22)", borderRadius: 9, padding: "10px 13px",
              background: "rgba(16,26,42,0.7)", color: "#c0d8f4",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
              textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {c.name}
              <span style={{ color: "#3a6090", fontSize: 11 }}>{c.instruments.length} →</span>
            </button>
          )) : cat.instruments.map((inst) => {
            const used = usedTickers.has(inst.ticker);
            return (
              <button key={inst.ticker} disabled={used} onClick={() => { onSelect(inst.ticker); onClose(); }} style={{
                border: `1px solid ${used ? "rgba(30,50,80,0.3)" : "rgba(100,140,200,0.22)"}`,
                borderRadius: 9, padding: "9px 13px",
                background: used ? "rgba(10,16,28,0.5)" : "rgba(16,26,42,0.7)",
                color: used ? "#1e3050" : "#c0d8f4",
                fontSize: 12, cursor: used ? "not-allowed" : "pointer",
                textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {inst.name}
                <span style={{ color: used ? "#1e3050" : "#3a6090", fontSize: 10 }}>{inst.ticker}</span>
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
    <div style={{
      position: "fixed", inset: 0, zIndex: 200, background: "rgba(4,8,14,0.85)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "linear-gradient(180deg, #0e1a2e 0%, #080f1c 100%)",
        border: "1px solid rgba(100,140,200,0.25)", borderRadius: 14,
        padding: "24px", width: 320,
      }}>
        <p style={{ margin: "0 0 14px", color: "#d0e4ff", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Nowa grupa
        </p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) { onConfirm(name.trim()); onClose(); } if (e.key === "Escape") onClose(); }}
          placeholder="Nazwa grupy (np. Surowce)"
          style={{
            width: "100%", boxSizing: "border-box", padding: "10px 12px",
            background: "rgba(10,18,30,0.8)", border: "1px solid rgba(80,120,180,0.3)",
            borderRadius: 8, color: "#d0e4ff", fontSize: 13, outline: "none",
            marginBottom: 14,
          }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "9px", background: "transparent",
            border: "1px solid rgba(60,90,140,0.35)", borderRadius: 8,
            color: "#4a6890", cursor: "pointer", fontSize: 12 }}>
            Anuluj
          </button>
          <button
            disabled={!name.trim()}
            onClick={() => { if (name.trim()) { onConfirm(name.trim()); onClose(); } }}
            style={{
              flex: 1, padding: "9px", background: name.trim() ? "rgba(50,90,160,0.7)" : "rgba(20,35,60,0.4)",
              border: "1px solid rgba(80,130,210,0.4)", borderRadius: 8,
              color: name.trim() ? "#d0e4ff" : "#2a4060", cursor: name.trim() ? "pointer" : "not-allowed",
              fontSize: 12, fontWeight: 700 }}>
            Utwórz
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Group Section ──────────────────────────────────────────────────────────────

const COLS = 4;

function GroupSection({
  group, quotes, allTickers, categories,
  onAddTicker, onRemoveTicker, onDeleteGroup, onRenameGroup,
}: {
  group: DashGroup;
  quotes: Map<string, MarketQuote>;
  allTickers: Set<string>;
  categories: MarketCategory[];
  onAddTicker: (groupId: string, ticker: string) => void;
  onRemoveTicker: (groupId: string, ticker: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onRenameGroup: (groupId: string, name: string) => void;
}) {
  const [showSelector, setShowSelector] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(group.name);

  const cells: Array<{ type: "quote"; ticker: string } | { type: "add" }> = [
    ...group.tickers.map((t) => ({ type: "quote" as const, ticker: t })),
    { type: "add" as const },
  ];
  while (cells.length % COLS !== 0) cells.push({ type: "add" as const });

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Group header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, padding: "0 4px" }}>
        {renaming ? (
          <input
            autoFocus
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onBlur={() => { if (renameVal.trim()) onRenameGroup(group.id, renameVal.trim()); setRenaming(false); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { if (renameVal.trim()) onRenameGroup(group.id, renameVal.trim()); setRenaming(false); }
              if (e.key === "Escape") { setRenameVal(group.name); setRenaming(false); }
            }}
            style={{
              background: "rgba(10,18,30,0.8)", border: "1px solid rgba(80,120,180,0.4)",
              borderRadius: 6, color: "#d0e4ff", fontSize: 14, fontWeight: 700,
              padding: "4px 10px", outline: "none",
            }}
          />
        ) : (
          <span style={{ fontSize: 14, fontWeight: 700, color: "#c0d4f0", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {group.name}
          </span>
        )}
        <button onClick={() => { setRenameVal(group.name); setRenaming(true); }} title="Zmień nazwę" style={{
          background: "none", border: "none", color: "#2a4870", cursor: "pointer", fontSize: 12, padding: "2px 4px" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#6a9ac8"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#2a4870"; }}>
          ✏️
        </button>
        <button onClick={() => onDeleteGroup(group.id)} title="Usuń grupę" style={{
          background: "none", border: "none", color: "#2a4870", cursor: "pointer", fontSize: 12, padding: "2px 4px" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#2a4870"; }}>
          🗑
        </button>
      </div>

      {/* Grid */}
      <div style={{
        border: "1px solid rgba(140,170,210,0.14)", borderRadius: 14, overflow: "hidden",
        display: "grid", gridTemplateColumns: `repeat(${COLS}, 1fr)`,
      }}>
        {cells.map((cell, i) => {
          const isLastAdd = i === group.tickers.length;
          const borderRight = (i + 1) % COLS !== 0 ? "1px solid rgba(100,140,200,0.1)" : "none";
          const borderBottom = i < cells.length - COLS ? "1px solid rgba(100,140,200,0.1)" : "none";

          if (cell.type === "add" && isLastAdd) {
            return (
              <div key="add" style={{ borderRight, borderBottom }}>
                <button onClick={() => setShowSelector(true)} style={{
                  width: "100%", minHeight: 110, padding: "16px",
                  background: "rgba(20,35,60,0.25)", border: "none", cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
                  color: "rgba(100,150,210,0.6)", transition: "all 0.15s",
                }}
                  onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(40,70,130,0.4)"; b.style.color = "rgba(160,200,255,0.9)"; }}
                  onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(20,35,60,0.25)"; b.style.color = "rgba(100,150,210,0.6)"; }}>
                  <span style={{ fontSize: 24, lineHeight: 1, fontWeight: 300 }}>+</span>
                  <span style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase" }}>Dodaj ticker</span>
                </button>
              </div>
            );
          }

          if (cell.type === "add") {
            return <div key={`pad-${i}`} style={{ borderRight, borderBottom, minHeight: 110 }} />;
          }

          const q = quotes.get(cell.ticker);
          return (
            <div key={cell.ticker} style={{ borderRight, borderBottom }}>
              {q ? (
                <QuoteTile quote={q} onRemove={() => onRemoveTicker(group.id, cell.ticker)} />
              ) : (
                <div style={{ padding: "12px 14px", minHeight: 110, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ color: "#2a4060", fontSize: 11 }}>{cell.ticker}<br /><span style={{ fontSize: 10 }}>ładowanie...</span></span>
                  <button onClick={() => onRemoveTicker(group.id, cell.ticker)} style={{
                    background: "rgba(30,45,70,0.9)", border: "1px solid rgba(100,130,180,0.3)",
                    borderRadius: 5, color: "rgba(160,190,230,0.8)", cursor: "pointer",
                    fontSize: 11, padding: "3px 7px", fontWeight: 700 }}
                    onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.color = "#f87171"; b.style.background = "rgba(80,20,20,0.9)"; }}
                    onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.color = "rgba(160,190,230,0.8)"; b.style.background = "rgba(30,45,70,0.9)"; }}>
                    ✕
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showSelector && (
        <TickerSelector
          categories={categories}
          usedTickers={allTickers}
          onSelect={(ticker) => onAddTicker(group.id, ticker)}
          onClose={() => setShowSelector(false)}
        />
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

  useEffect(() => {
    setGroups(loadGroups());
    getMarketInstruments().then((r) => setCategories(r.categories)).catch(() => {});
  }, []);

  const allTickers = new Set(groups.flatMap((g) => g.tickers));

  const fetchQuotes = useCallback(async (tickers: string[]) => {
    if (!tickers.length) return;
    try {
      const data = await getMarketQuotes(tickers);
      setQuotes((prev) => {
        const next = new Map(prev);
        data.forEach((q) => next.set(q.ticker, q));
        return next;
      });
      setLastRefresh(new Date());
    } catch {}
  }, []);

  useEffect(() => {
    const tickers = [...allTickers];
    if (tickers.length) void fetchQuotes(tickers);
    const id = setInterval(() => {
      const t = [...new Set(groups.flatMap((g) => g.tickers))];
      if (t.length) void fetchQuotes(t);
    }, REFRESH_MS);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  const updateGroups = (next: DashGroup[]) => { setGroups(next); saveGroups(next); };

  const handleCreateGroup = (name: string) => {
    updateGroups([...groups, { id: uid(), name, tickers: [] }]);
  };

  const handleDeleteGroup = (id: string) => {
    updateGroups(groups.filter((g) => g.id !== id));
  };

  const handleRenameGroup = (id: string, name: string) => {
    updateGroups(groups.map((g) => g.id === id ? { ...g, name } : g));
  };

  const handleAddTicker = (groupId: string, ticker: string) => {
    updateGroups(groups.map((g) => g.id === groupId ? { ...g, tickers: [...g.tickers, ticker] } : g));
    void fetchQuotes([ticker]);
  };

  const handleRemoveTicker = (groupId: string, ticker: string) => {
    updateGroups(groups.map((g) => g.id === groupId ? { ...g, tickers: g.tickers.filter((t) => t !== ticker) } : g));
  };

  return (
    <div style={{ padding: "0 4px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <span style={{ fontSize: 11, color: "#2a4870", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Dashboard rynkowy
        </span>
        {lastRefresh && (
          <span style={{ fontSize: 10, color: "#1e3555" }}>
            · odświeżono {lastRefresh.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      {/* Groups */}
      {groups.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#2a4870" }}>
          <p style={{ fontSize: 14, marginBottom: 8 }}>Brak grup</p>
          <p style={{ fontSize: 12 }}>Utwórz pierwszą grupę i dodaj do niej instrumenty</p>
        </div>
      )}

      {groups.map((group) => (
        <GroupSection
          key={group.id}
          group={group}
          quotes={quotes}
          allTickers={allTickers}
          categories={categories}
          onAddTicker={handleAddTicker}
          onRemoveTicker={handleRemoveTicker}
          onDeleteGroup={handleDeleteGroup}
          onRenameGroup={handleRenameGroup}
        />
      ))}

      {/* Add group button */}
      <button onClick={() => setShowNewGroup(true)} style={{
        padding: "10px 20px", background: "rgba(20,36,65,0.6)",
        border: "1px dashed rgba(80,120,190,0.35)", borderRadius: 10,
        color: "rgba(100,150,210,0.7)", cursor: "pointer",
        fontSize: 12, fontWeight: 600, letterSpacing: "0.08em",
        display: "flex", alignItems: "center", gap: 8, transition: "all 0.15s",
      }}
        onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(40,70,130,0.5)"; b.style.color = "rgba(160,200,255,0.9)"; b.style.borderColor = "rgba(120,170,240,0.5)"; }}
        onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(20,36,65,0.6)"; b.style.color = "rgba(100,150,210,0.7)"; b.style.borderColor = "rgba(80,120,190,0.35)"; }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> Dodaj grupę
      </button>

      {showNewGroup && (
        <NewGroupModal onConfirm={handleCreateGroup} onClose={() => setShowNewGroup(false)} />
      )}
    </div>
  );
}
