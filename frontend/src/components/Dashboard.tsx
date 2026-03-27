"use client";

import { useCallback, useEffect, useState } from "react";
import { getMarketInstruments, getMarketQuotes } from "../lib/api";
import type { MarketCategory, MarketQuote } from "../lib/types";

const STORAGE_KEY = "dashboard_tickers";
const REFRESH_MS = 60_000;

function loadSaved(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((t): t is string => typeof t === "string" && t.length > 0);
    }
  } catch {}
  return [];
}

function saveTickers(tickers: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tickers));
}

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

// ── Selector ──────────────────────────────────────────────────────────────────

function Selector({ categories, usedTickers, onSelect, onSelectGroup, onClose, groupMode }: {
  categories: MarketCategory[];
  usedTickers: Set<string>;
  onSelect?: (ticker: string) => void;
  onSelectGroup?: (cat: MarketCategory) => void;
  onClose: () => void;
  groupMode?: boolean;
}) {
  const [cat, setCat] = useState<MarketCategory | null>(null);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(5,9,15,0.88)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 18px" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: "100%", maxWidth: 460, border: "1px solid rgba(160,186,222,0.26)",
        borderRadius: 16, background: "linear-gradient(180deg, rgba(18,26,38,0.99), rgba(11,17,26,0.99))",
        boxShadow: "0 24px 56px rgba(2,6,13,0.7)" }}>
        <div style={{ padding: "13px 16px", borderBottom: "1px solid rgba(180,206,236,0.14)",
          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {cat && (
              <button onClick={() => setCat(null)} style={{ background: "none",
                border: "1px solid rgba(120,160,210,0.3)", borderRadius: 7,
                color: "#7a9abf", cursor: "pointer", padding: "3px 9px", fontSize: 11 }}>← Wróć</button>
            )}
            <span style={{ color: "#d0e4ff", fontSize: 12, fontWeight: 700,
              letterSpacing: "0.12em", textTransform: "uppercase" }}>
              {groupMode ? "Dodaj grupę" : cat ? cat.name : "Wybierz kategorię"}
            </span>
          </div>
          <button onClick={onClose} style={{ background: "none",
            border: "1px solid rgba(120,160,210,0.3)", borderRadius: 7,
            color: "#7a9abf", cursor: "pointer", padding: "3px 9px", fontSize: 11 }}>✕</button>
        </div>
        <div style={{ padding: "12px 16px 16px", display: "grid", gap: 6, maxHeight: 420, overflowY: "auto" }}>
          {categories.length === 0 && (
            <p style={{ color: "#3a5a80", fontSize: 12, textAlign: "center", padding: "20px 0", margin: 0 }}>
              Ładowanie kategorii... sprawdź czy backend działa.
            </p>
          )}
          {groupMode ? (
            categories.map((c) => {
              const available = c.instruments.filter((i) => !usedTickers.has(i.ticker)).length;
              return (
                <button key={c.name} disabled={available === 0} onClick={() => onSelectGroup?.(c)} style={{
                  border: `1px solid ${available === 0 ? "rgba(40,70,110,0.3)" : "rgba(100,140,200,0.22)"}`,
                  borderRadius: 9, padding: "10px 13px",
                  background: available === 0 ? "rgba(14,22,34,0.4)" : "rgba(16,26,42,0.7)",
                  color: available === 0 ? "#2a4060" : "#c0d8f4",
                  fontSize: 12, fontWeight: 600, cursor: available === 0 ? "not-allowed" : "pointer",
                  textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  {c.name}
                  <span style={{ color: available === 0 ? "#1e3050" : "#3a6090", fontSize: 11 }}>
                    {available === 0 ? "dodano" : `+${available}`}
                  </span>
                </button>
              );
            })
          ) : !cat && categories.length > 0 ? (
            categories.map((c) => (
              <button key={c.name} onClick={() => setCat(c)} style={{
                border: "1px solid rgba(100,140,200,0.22)", borderRadius: 9,
                padding: "10px 13px", background: "rgba(16,26,42,0.7)",
                color: "#c0d8f4", fontSize: 12, fontWeight: 600, cursor: "pointer",
                textAlign: "left", display: "flex", justifyContent: "space-between" }}>
                {c.name}
                <span style={{ color: "#3a5a80", fontSize: 11 }}>{c.instruments.length} →</span>
              </button>
            ))
          ) : cat && !groupMode ? (
            cat.instruments.map((inst) => {
              const used = usedTickers.has(inst.ticker);
              return (
                <button key={inst.ticker} disabled={used} onClick={() => onSelect(inst.ticker)} style={{
                  border: `1px solid ${used ? "rgba(40,70,110,0.3)" : "rgba(100,140,200,0.22)"}`,
                  borderRadius: 9, padding: "9px 13px",
                  background: used ? "rgba(14,22,34,0.4)" : "rgba(16,26,42,0.7)",
                  color: used ? "#2a4060" : "#c0d8f4",
                  fontSize: 12, cursor: used ? "not-allowed" : "pointer",
                  textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600 }}>{inst.name}</span>
                  <span style={{ color: used ? "#1e3050" : "#3a6090", fontSize: 10 }}>{inst.ticker}</span>
                </button>
              );
            })
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Tile ──────────────────────────────────────────────────────────────────────

function QuoteTile({ quote, onRemove }: { quote: MarketQuote; onRemove: () => void }) {
  const pos = (quote.change ?? 0) >= 0;
  const neutral = quote.change === null;
  const clr = neutral ? "#7a9abf" : pos ? "#34d399" : "#f87171";
  const bgClr = neutral ? "rgba(80,110,150,0.1)" : pos ? "rgba(52,211,153,0.09)" : "rgba(248,113,113,0.09)";

  return (
    <div style={{ padding: "16px 18px", position: "relative" }}>
      <button onClick={onRemove} style={{
        position: "absolute", top: 8, right: 8,
        background: "rgba(30,50,80,0.8)", border: "1px solid rgba(120,150,200,0.3)",
        borderRadius: 6, color: "rgba(180,205,235,0.8)",
        cursor: "pointer", fontSize: 11, padding: "3px 7px", lineHeight: 1 }}
        onMouseEnter={(e) => {
          const b = e.currentTarget as HTMLButtonElement;
          b.style.color = "#f87171"; b.style.background = "rgba(80,25,25,0.85)"; b.style.borderColor = "rgba(248,113,113,0.5)";
        }}
        onMouseLeave={(e) => {
          const b = e.currentTarget as HTMLButtonElement;
          b.style.color = "rgba(180,205,235,0.8)"; b.style.background = "rgba(30,50,80,0.8)"; b.style.borderColor = "rgba(120,150,200,0.3)";
        }}>
        ✕
      </button>
      <p style={{ margin: "0 0 2px", color: "#c8dff8", fontSize: 13, fontWeight: 700,
        paddingRight: 18, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {quote.name}
      </p>
      <p style={{ margin: "0 0 10px", color: "#2a4a70", fontSize: 10,
        letterSpacing: "0.1em", textTransform: "uppercase" }}>
        {quote.ticker}{quote.currency && quote.currency !== "USD" ? ` · ${quote.currency}` : ""}
      </p>
      <p style={{ margin: "0 0 6px", color: "#e0eeff", fontSize: 22, fontWeight: 700,
        fontVariantNumeric: "tabular-nums", letterSpacing: "0.01em" }}>
        {fmtPrice(quote.price)}
      </p>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ color: clr, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
          {fmtChange(quote.change)}
        </span>
        <span style={{ background: bgClr, color: clr, borderRadius: 5,
          padding: "2px 7px", fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          {fmtPct(quote.change_pct)}
        </span>
      </div>
    </div>
  );
}

function EmptyTile({ onAddTicker, onAddGroup }: { onAddTicker: () => void; onAddGroup: () => void }) {
  const btnStyle = (hover: string): React.CSSProperties => ({
    flex: 1, padding: "10px 6px", background: "rgba(25,40,65,0.6)",
    border: "1px solid rgba(100,140,200,0.2)", borderRadius: 8,
    cursor: "pointer", display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", gap: 5,
    color: "rgba(130,170,220,0.65)", transition: "all 0.15s",
  });

  return (
    <div style={{ padding: "12px 14px", display: "flex", gap: 8, minHeight: 110, alignItems: "stretch" }}>
      <button style={btnStyle("")} onClick={onAddTicker}
        onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(40,65,110,0.7)"; b.style.color = "rgba(180,215,255,0.9)"; b.style.borderColor = "rgba(140,180,230,0.4)"; }}
        onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(25,40,65,0.6)"; b.style.color = "rgba(130,170,220,0.65)"; b.style.borderColor = "rgba(100,140,200,0.2)"; }}>
        <span style={{ fontSize: 20, lineHeight: 1, fontWeight: 300 }}>+</span>
        <span style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", textAlign: "center" }}>Dodaj ticker</span>
      </button>
      <button style={btnStyle("")} onClick={onAddGroup}
        onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(40,65,110,0.7)"; b.style.color = "rgba(180,215,255,0.9)"; b.style.borderColor = "rgba(140,180,230,0.4)"; }}
        onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(25,40,65,0.6)"; b.style.color = "rgba(130,170,220,0.65)"; b.style.borderColor = "rgba(100,140,200,0.2)"; }}>
        <span style={{ fontSize: 20, lineHeight: 1, fontWeight: 300 }}>⊞</span>
        <span style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", textAlign: "center" }}>Dodaj grupę</span>
      </button>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

const COLS = 4;

export default function Dashboard() {
  const [tickers, setTickers] = useState<string[]>(() => loadSaved());
  const [quotes, setQuotes] = useState<Map<string, MarketQuote>>(new Map());
  const [categories, setCategories] = useState<MarketCategory[]>([]);
  const [selectorMode, setSelectorMode] = useState<"ticker" | "group" | null>(null);

  const fetchQuotes = useCallback(async (t: string[]) => {
    if (!t.length) return;
    try {
      const data = await getMarketQuotes(t);
      setQuotes((prev) => {
        const next = new Map(prev);
        data.forEach((q) => next.set(q.ticker, q));
        return next;
      });
    } catch {}
  }, []);

  useEffect(() => {
    getMarketInstruments()
      .then((d) => setCategories(d.categories))
      .catch(() => {
        // retry once after 2s if first attempt fails
        setTimeout(() => {
          getMarketInstruments().then((d) => setCategories(d.categories)).catch(() => {});
        }, 2000);
      });
  }, []);

  useEffect(() => {
    if (tickers.length) void fetchQuotes(tickers);
    const id = setInterval(() => { if (tickers.length) void fetchQuotes(tickers); }, REFRESH_MS);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers]);

  const handleAdd = (ticker: string) => {
    const next = [...tickers, ticker];
    setTickers(next);
    saveTickers(next);
    setSelectorMode(null);
    void fetchQuotes([ticker]);
  };

  const handleAddGroup = (cat: MarketCategory) => {
    const used = new Set(tickers);
    const toAdd = cat.instruments.map((i) => i.ticker).filter((t) => !used.has(t));
    if (!toAdd.length) return;
    const next = [...tickers, ...toAdd];
    setTickers(next);
    saveTickers(next);
    setSelectorMode(null);
    void fetchQuotes(toAdd);
  };

  const handleRemove = (ticker: string) => {
    const next = tickers.filter((t) => t !== ticker);
    setTickers(next);
    saveTickers(next);
  };

  // Build cells: filled tiles + one empty "add" tile
  const cells: Array<{ type: "quote"; ticker: string } | { type: "empty" }> = [
    ...tickers.map((t) => ({ type: "quote" as const, ticker: t })),
    { type: "empty" as const },
  ];

  // Pad to full row
  while (cells.length % COLS !== 0) cells.push({ type: "empty" as const });

  const handleClearAll = () => {
    setTickers([]);
    saveTickers([]);
    setQuotes(new Map());
  };

  return (
    <div style={{ paddingBottom: 40 }}>
      {tickers.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <button onClick={handleClearAll} style={{
            background: "none", border: "1px solid rgba(200,80,80,0.3)", borderRadius: 8,
            color: "rgba(200,100,100,0.6)", cursor: "pointer", fontSize: 11,
            padding: "4px 12px", letterSpacing: "0.08em", textTransform: "uppercase" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(248,113,113,0.5)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(200,100,100,0.6)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(200,80,80,0.3)"; }}>
            Wyczyść wszystko
          </button>
        </div>
      )}
      <div style={{
        border: "1px solid rgba(140,170,210,0.18)", borderRadius: 14, overflow: "hidden",
        background: "linear-gradient(180deg, rgba(14,22,34,0.98), rgba(9,15,24,0.98))",
        display: "grid",
        gridTemplateColumns: `repeat(${COLS}, 1fr)`,
      }}>
        {cells.map((cell, i) => {
          const col = i % COLS;
          const row = Math.floor(i / COLS);
          const totalRows = Math.ceil(cells.length / COLS);
          const borderRight = col < COLS - 1 ? "1px solid rgba(140,170,210,0.1)" : "none";
          const borderBottom = row < totalRows - 1 ? "1px solid rgba(140,170,210,0.1)" : "none";

          return (
            <div key={i} style={{ borderRight, borderBottom }}>
              {cell.type === "quote" ? (
                quotes.get(cell.ticker) ? (
                  <QuoteTile quote={quotes.get(cell.ticker)!} onRemove={() => handleRemove(cell.ticker)} />
                ) : (
                  <div style={{ padding: "16px 18px", color: "#2a4060", fontSize: 12, minHeight: 110,
                    display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>{cell.ticker}…</span>
                    <button onClick={() => handleRemove(cell.ticker)} style={{
                      background: "none", border: "none", color: "rgba(80,110,150,0.35)",
                      cursor: "pointer", fontSize: 12, padding: "0 2px" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(80,110,150,0.35)"; }}>✕</button>
                  </div>
                )
              ) : i === tickers.length ? (
                <EmptyTile onAddTicker={() => setSelectorMode("ticker")} onAddGroup={() => setSelectorMode("group")} />
              ) : (
                <div style={{ minHeight: 110 }} />
              )}
            </div>
          );
        })}
      </div>

      {selectorMode === "ticker" && (
        <Selector
          categories={categories}
          usedTickers={new Set(tickers)}
          onSelect={handleAdd}
          onClose={() => setSelectorMode(null)}
        />
      )}
      {selectorMode === "group" && (
        <Selector
          categories={categories}
          usedTickers={new Set(tickers)}
          groupMode
          onSelectGroup={handleAddGroup}
          onClose={() => setSelectorMode(null)}
        />
      )}
    </div>
  );
}
