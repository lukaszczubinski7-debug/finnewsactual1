"use client";

import { useCallback, useEffect, useState } from "react";
import { getMarketInstruments, getMarketQuotes } from "../lib/api";
import type { MarketCategory, MarketQuote } from "../lib/types";

const STORAGE_KEY = "dashboard_tickers";
const REFRESH_MS = 60_000;

function loadSaved(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as string[];
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

// ── Selector ─────────────────────────────────────────────────────────────────

function Selector({ categories, usedTickers, onSelect, onClose }: {
  categories: MarketCategory[];
  usedTickers: Set<string>;
  onSelect: (ticker: string) => void;
  onClose: () => void;
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
              {cat ? cat.name : "Wybierz kategorię"}
            </span>
          </div>
          <button onClick={onClose} style={{ background: "none",
            border: "1px solid rgba(120,160,210,0.3)", borderRadius: 7,
            color: "#7a9abf", cursor: "pointer", padding: "3px 9px", fontSize: 11 }}>✕</button>
        </div>
        <div style={{ padding: "12px 16px 16px", display: "grid", gap: 6, maxHeight: 420, overflowY: "auto" }}>
          {!cat ? (
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
          ) : (
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
          )}
        </div>
      </div>
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function QuoteRow({ quote, onRemove }: { quote: MarketQuote; onRemove: () => void }) {
  const pos = (quote.change ?? 0) >= 0;
  const neutral = quote.change === null;
  const clr = neutral ? "#7a9abf" : pos ? "#34d399" : "#f87171";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto 28px",
      alignItems: "center", gap: "0 16px",
      padding: "10px 14px", borderBottom: "1px solid rgba(140,170,210,0.08)" }}>
      <div style={{ minWidth: 0 }}>
        <span style={{ color: "#d0e4ff", fontSize: 13, fontWeight: 600,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
          {quote.name}
        </span>
        <span style={{ color: "#3a5a80", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {quote.ticker}
        </span>
      </div>
      <span style={{ color: "#e0eeff", fontSize: 15, fontWeight: 700,
        fontVariantNumeric: "tabular-nums", textAlign: "right", whiteSpace: "nowrap" }}>
        {fmtPrice(quote.price)}
        {quote.currency && quote.currency !== "USD" &&
          <span style={{ fontSize: 10, color: "#3a5a80", marginLeft: 4 }}>{quote.currency}</span>}
      </span>
      <span style={{ color: clr, fontSize: 12, fontVariantNumeric: "tabular-nums",
        textAlign: "right", whiteSpace: "nowrap" }}>
        {fmtChange(quote.change)}
      </span>
      <span style={{ color: clr, fontSize: 12, fontWeight: 600,
        fontVariantNumeric: "tabular-nums", textAlign: "right", whiteSpace: "nowrap",
        background: neutral ? "rgba(80,110,150,0.1)" : pos ? "rgba(52,211,153,0.09)" : "rgba(248,113,113,0.09)",
        borderRadius: 5, padding: "2px 6px" }}>
        {fmtPct(quote.change_pct)}
      </span>
      <button onClick={onRemove} style={{ background: "none", border: "none",
        color: "rgba(80,110,150,0.35)", cursor: "pointer", fontSize: 12,
        padding: 0, textAlign: "center", lineHeight: 1 }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(80,110,150,0.35)"; }}>
        ✕
      </button>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [tickers, setTickers] = useState<string[]>(() => loadSaved());
  const [quotes, setQuotes] = useState<Map<string, MarketQuote>>(new Map());
  const [categories, setCategories] = useState<MarketCategory[]>([]);
  const [showSelector, setShowSelector] = useState(false);

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
    getMarketInstruments().then((d) => setCategories(d.categories)).catch(() => {});
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
    setShowSelector(false);
    void fetchQuotes([ticker]);
  };

  const handleRemove = (ticker: string) => {
    const next = tickers.filter((t) => t !== ticker);
    setTickers(next);
    saveTickers(next);
  };

  return (
    <div style={{ paddingBottom: 40 }}>
      <div style={{ border: "1px solid rgba(140,170,210,0.18)", borderRadius: 14,
        background: "linear-gradient(180deg, rgba(14,22,34,0.98), rgba(9,15,24,0.98))",
        overflow: "hidden" }}>

        {/* Column headers */}
        {tickers.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto 28px",
            gap: "0 16px", padding: "8px 14px",
            borderBottom: "1px solid rgba(140,170,210,0.14)",
            background: "rgba(10,16,26,0.6)" }}>
            <span style={{ color: "#2a4a6a", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase" }}>Instrument</span>
            <span style={{ color: "#2a4a6a", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", textAlign: "right" }}>Cena</span>
            <span style={{ color: "#2a4a6a", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", textAlign: "right" }}>Zmiana</span>
            <span style={{ color: "#2a4a6a", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", textAlign: "right" }}>%</span>
            <span />
          </div>
        )}

        {/* Rows */}
        {tickers.map((ticker) => {
          const q = quotes.get(ticker);
          return q ? (
            <QuoteRow key={ticker} quote={q} onRemove={() => handleRemove(ticker)} />
          ) : (
            <div key={ticker} style={{ padding: "10px 14px", borderBottom: "1px solid rgba(140,170,210,0.08)",
              color: "#2a4060", fontSize: 12 }}>
              {ticker} <span style={{ fontSize: 10 }}>ładowanie...</span>
            </div>
          );
        })}

        {/* Add row */}
        <button onClick={() => setShowSelector(true)} style={{
          width: "100%", padding: "11px 14px", background: "none",
          border: "none", borderTop: tickers.length > 0 ? "1px dashed rgba(80,120,170,0.18)" : "none",
          cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
          color: "rgba(80,130,190,0.45)", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(120,170,230,0.7)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(80,130,190,0.45)"; }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
          <span>Dodaj instrument</span>
        </button>
      </div>

      {showSelector && (
        <Selector
          categories={categories}
          usedTickers={new Set(tickers)}
          onSelect={handleAdd}
          onClose={() => setShowSelector(false)}
        />
      )}
    </div>
  );
}
