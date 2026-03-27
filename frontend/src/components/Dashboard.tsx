"use client";

import { useCallback, useEffect, useState } from "react";
import { getMarketInstruments, getMarketQuotes } from "../lib/api";
import type { MarketCategory, MarketQuote } from "../lib/types";

const STORAGE_KEY = "dashboard_tickers";
const GRID_SIZE = 12;
const REFRESH_MS = 60_000;

function loadSaved(): (string | null)[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as (string | null)[];
  } catch {}
  return Array(GRID_SIZE).fill(null);
}

function saveTickers(tickers: (string | null)[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tickers));
}

function fmt(n: number | null, digits = 2) {
  if (n === null) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtPrice(price: number | null) {
  if (price === null) return "—";
  const d = price < 10 ? 4 : price < 1000 ? 2 : 0;
  return price.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ── Selector modal ──────────────────────────────────────────────────────────

interface SelectorProps {
  categories: MarketCategory[];
  usedTickers: Set<string>;
  onSelect: (ticker: string) => void;
  onClose: () => void;
}

function Selector({ categories, usedTickers, onSelect, onClose }: SelectorProps) {
  const [step, setStep] = useState<"category" | "instrument">("category");
  const [selectedCat, setSelectedCat] = useState<MarketCategory | null>(null);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(5,9,15,0.88)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px 18px",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "100%", maxWidth: 480,
        border: "1px solid rgba(160,186,222,0.28)", borderRadius: 16,
        background: "linear-gradient(180deg, rgba(20,28,40,0.99), rgba(12,18,26,0.99))",
        boxShadow: "0 24px 56px rgba(2,6,13,0.7)",
      }}>
        {/* header */}
        <div style={{
          padding: "14px 18px", borderBottom: "1px solid rgba(180,206,236,0.15)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {step === "instrument" && (
              <button onClick={() => setStep("category")} style={{
                background: "none", border: "1px solid rgba(140,180,220,0.28)",
                borderRadius: 8, color: "#92a9cb", cursor: "pointer", padding: "3px 9px", fontSize: 12,
              }}>← Wróć</button>
            )}
            <span style={{ color: "#d9e8ff", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              {step === "category" ? "Wybierz kategorię" : selectedCat?.name}
            </span>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "1px solid rgba(140,180,220,0.28)",
            borderRadius: 8, color: "#92a9cb", cursor: "pointer", padding: "3px 9px", fontSize: 12,
          }}>✕</button>
        </div>

        {/* body */}
        <div style={{ padding: "14px 18px 18px", display: "grid", gap: 8 }}>
          {step === "category" ? (
            categories.map((cat) => (
              <button key={cat.name} onClick={() => { setSelectedCat(cat); setStep("instrument"); }} style={{
                border: "1px solid rgba(120,160,210,0.24)", borderRadius: 10,
                padding: "11px 14px", background: "rgba(20,32,50,0.7)",
                color: "#c8dcf8", fontSize: 13, fontWeight: 600, cursor: "pointer",
                textAlign: "left", letterSpacing: "0.04em",
                display: "flex", justifyContent: "space-between",
              }}>
                {cat.name}
                <span style={{ color: "#4a6a9a", fontSize: 11 }}>{cat.instruments.length} →</span>
              </button>
            ))
          ) : (
            selectedCat?.instruments.map((inst) => {
              const used = usedTickers.has(inst.ticker);
              return (
                <button key={inst.ticker} disabled={used} onClick={() => onSelect(inst.ticker)} style={{
                  border: `1px solid ${used ? "rgba(60,90,130,0.3)" : "rgba(120,160,210,0.24)"}`,
                  borderRadius: 10, padding: "10px 14px",
                  background: used ? "rgba(20,30,46,0.4)" : "rgba(20,32,50,0.7)",
                  color: used ? "#3a5070" : "#c8dcf8", fontSize: 13,
                  cursor: used ? "not-allowed" : "pointer",
                  textAlign: "left", display: "flex", justifyContent: "space-between",
                  alignItems: "center",
                }}>
                  <span style={{ fontWeight: 600 }}>{inst.name}</span>
                  <span style={{ color: used ? "#2a4060" : "#4a7aaa", fontSize: 11 }}>{inst.ticker}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tile ────────────────────────────────────────────────────────────────────

function EmptyTile({ onAdd }: { onAdd: () => void }) {
  return (
    <button onClick={onAdd} style={{
      border: "1px dashed rgba(100,140,190,0.25)", borderRadius: 14,
      background: "rgba(12,18,28,0.5)", cursor: "pointer",
      minHeight: 110, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 6,
      transition: "border-color 0.15s, background 0.15s",
    }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(100,160,220,0.5)";
        (e.currentTarget as HTMLButtonElement).style.background = "rgba(20,30,48,0.7)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(100,140,190,0.25)";
        (e.currentTarget as HTMLButtonElement).style.background = "rgba(12,18,28,0.5)";
      }}
    >
      <span style={{ fontSize: 24, color: "rgba(100,150,200,0.4)", lineHeight: 1 }}>+</span>
      <span style={{ fontSize: 10, color: "rgba(100,150,200,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Dodaj
      </span>
    </button>
  );
}

function QuoteTile({ quote, onRemove }: { quote: MarketQuote; onRemove: () => void }) {
  const pos = (quote.change ?? 0) >= 0;
  const neutral = quote.change === null;
  const clr = neutral ? "#92a9cb" : pos ? "#4ade80" : "#f87171";
  const bg = neutral ? "rgba(92,120,160,0.1)" : pos ? "rgba(74,222,128,0.07)" : "rgba(248,113,113,0.07)";

  return (
    <div style={{
      border: "1px solid rgba(150,180,220,0.2)", borderRadius: 14,
      background: "linear-gradient(180deg, rgba(16,24,36,0.98), rgba(10,16,26,0.98))",
      padding: "12px 14px", position: "relative", minHeight: 110,
      display: "flex", flexDirection: "column", justifyContent: "space-between",
    }}>
      <button onClick={onRemove} title="Usuń" style={{
        position: "absolute", top: 8, right: 8,
        background: "none", border: "none", color: "rgba(100,130,170,0.4)",
        cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 2,
      }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(100,130,170,0.4)"; }}
      >✕</button>

      <div>
        <p style={{ margin: 0, color: "#dce9ff", fontSize: 13, fontWeight: 700, paddingRight: 18,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {quote.name}
        </p>
        <p style={{ margin: "2px 0 0", color: "#4a6a9a", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          {quote.ticker}
        </p>
      </div>

      <div>
        <p style={{ margin: "8px 0 4px", color: "#d0e4ff", fontSize: 20, fontWeight: 700,
          fontVariantNumeric: "tabular-nums", letterSpacing: "0.01em" }}>
          {fmtPrice(quote.price)}
          {quote.currency && quote.currency !== "USD" &&
            <span style={{ fontSize: 11, color: "#4a6a9a", marginLeft: 4 }}>{quote.currency}</span>}
        </p>
        <span style={{
          background: bg, color: clr, borderRadius: 6,
          padding: "2px 7px", fontSize: 11, fontWeight: 600, fontVariantNumeric: "tabular-nums",
        }}>
          {quote.change !== null ? `${quote.change >= 0 ? "+" : ""}${fmt(quote.change)} (${quote.change_pct !== null ? `${quote.change_pct >= 0 ? "+" : ""}${fmt(quote.change_pct)}%` : "—"})` : "—"}
        </span>
      </div>
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [slots, setSlots] = useState<(string | null)[]>(() => loadSaved());
  const [quotes, setQuotes] = useState<Map<string, MarketQuote>>(new Map());
  const [categories, setCategories] = useState<MarketCategory[]>([]);
  const [addingSlot, setAddingSlot] = useState<number | null>(null);

  const activeTickers = slots.filter(Boolean) as string[];

  const fetchQuotes = useCallback(async (tickers: string[]) => {
    if (!tickers.length) return;
    try {
      const data = await getMarketQuotes(tickers);
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
    if (activeTickers.length) void fetchQuotes(activeTickers);
    const id = setInterval(() => {
      if (activeTickers.length) void fetchQuotes(activeTickers);
    }, REFRESH_MS);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  const handleAdd = (slotIdx: number, ticker: string) => {
    const next = [...slots];
    next[slotIdx] = ticker;
    setSlots(next);
    saveTickers(next);
    setAddingSlot(null);
    void fetchQuotes([ticker]);
  };

  const handleRemove = (slotIdx: number) => {
    const next = [...slots];
    next[slotIdx] = null;
    setSlots(next);
    saveTickers(next);
  };

  return (
    <div style={{ paddingBottom: 40 }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
        gap: 14,
      }}>
        {slots.map((ticker, i) =>
          ticker ? (
            quotes.get(ticker) ? (
              <QuoteTile key={i} quote={quotes.get(ticker)!} onRemove={() => handleRemove(i)} />
            ) : (
              <div key={i} style={{
                border: "1px solid rgba(150,180,220,0.15)", borderRadius: 14,
                background: "rgba(14,20,30,0.6)", minHeight: 110,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ color: "#2a4060", fontSize: 11 }}>{ticker}</span>
              </div>
            )
          ) : (
            <EmptyTile key={i} onAdd={() => setAddingSlot(i)} />
          )
        )}
      </div>

      {addingSlot !== null && (
        <Selector
          categories={categories}
          usedTickers={new Set(slots.filter(Boolean) as string[])}
          onSelect={(ticker) => handleAdd(addingSlot, ticker)}
          onClose={() => setAddingSlot(null)}
        />
      )}
    </div>
  );
}
