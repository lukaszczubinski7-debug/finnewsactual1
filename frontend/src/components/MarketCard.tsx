"use client";

import type { MarketQuote } from "../lib/types";

interface MarketCardProps {
  quote: MarketQuote;
}

function formatPrice(price: number | null, currency: string | null): string {
  if (price === null) return "—";
  const digits = price < 10 ? 4 : price < 1000 ? 2 : 0;
  const formatted = price.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (!currency || currency === "USD") return formatted;
  return `${formatted} ${currency}`;
}

function formatChange(change: number | null): string {
  if (change === null) return "—";
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(2)}`;
}

function formatChangePct(pct: number | null): string {
  if (pct === null) return "";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export default function MarketCard({ quote }: MarketCardProps) {
  const isPositive = (quote.change ?? 0) >= 0;
  const isNeutral = quote.change === null;
  const changeColor = isNeutral ? "#92a9cb" : isPositive ? "#4ade80" : "#f87171";
  const changeBg = isNeutral
    ? "rgba(92,120,160,0.12)"
    : isPositive
    ? "rgba(74,222,128,0.08)"
    : "rgba(248,113,113,0.08)";

  return (
    <div
      style={{
        border: "1px solid rgba(160,186,222,0.22)",
        borderRadius: 14,
        background: "linear-gradient(180deg, rgba(18,26,38,0.97) 0%, rgba(11,17,26,0.97) 100%)",
        padding: "12px 14px",
        display: "grid",
        gap: 6,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04), 0 4px 14px rgba(2,6,13,0.4)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <p
            style={{
              margin: 0,
              color: "#e8efff",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.04em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: 130,
            }}
          >
            {quote.name}
          </p>
          <p
            style={{
              margin: "2px 0 0",
              color: "#5a7498",
              fontSize: 10,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            {quote.ticker}
          </p>
        </div>
        <span
          style={{
            fontSize: 9,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#5a7498",
            border: "1px solid rgba(90,116,152,0.3)",
            borderRadius: 6,
            padding: "2px 5px",
            whiteSpace: "nowrap",
          }}
        >
          {quote.market_state || "—"}
        </span>
      </div>

      <p
        style={{
          margin: 0,
          color: "#d9e8ff",
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: "0.02em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {formatPrice(quote.price, quote.currency)}
      </p>

      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        <span
          style={{
            background: changeBg,
            color: changeColor,
            borderRadius: 6,
            padding: "2px 7px",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.03em",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatChange(quote.change)} {formatChangePct(quote.change_pct)}
        </span>
      </div>
    </div>
  );
}
