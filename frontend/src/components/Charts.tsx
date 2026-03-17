"use client";

import { useEffect, useRef, useState } from "react";

const PRESETS = [
  { label: "S&P 500", symbol: "SP:SPX" },
  { label: "NASDAQ", symbol: "NASDAQ:NDX" },
  { label: "WIG20", symbol: "GPWREG:WIG20" },
  { label: "DAX", symbol: "XETR:DAX" },
  { label: "WTI", symbol: "NYMEX:CL1!" },
  { label: "Brent", symbol: "ICEEUR:B1!" },
  { label: "Złoto", symbol: "COMEX:GC1!" },
  { label: "US 10Y", symbol: "TVC:US10Y" },
  { label: "EUR/USD", symbol: "FX:EURUSD" },
  { label: "USD/PLN", symbol: "FX:USDPLN" },
  { label: "BTC", symbol: "BINANCE:BTCUSDT" },
];

function AdvancedChart({ symbol }: { symbol: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    container.innerHTML = "";

    const inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    inner.style.height = "calc(100% - 32px)";
    inner.style.width = "100%";
    container.appendChild(inner);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.textContent = JSON.stringify({
      autosize: true,
      symbol,
      interval: "D",
      timezone: "Europe/Warsaw",
      theme: "dark",
      style: "1",
      locale: "pl",
      enable_publishing: false,
      withdateranges: true,
      range: "3M",
      hide_side_toolbar: false,
      allow_symbol_change: true,
      details: true,
      hotlist: true,
      calendar: false,
      studies: ["RSI@tv-basicstudies", "MACD@tv-basicstudies"],
      backgroundColor: "rgba(5, 9, 15, 0.0)",
      gridColor: "rgba(186, 205, 231, 0.06)",
    });
    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, [symbol]);

  return (
    <div
      ref={ref}
      className="tradingview-widget-container"
      style={{ height: "100%", width: "100%" }}
    />
  );
}

const btnBase: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: 999,
  border: "1px solid rgba(161,187,224,0.22)",
  background: "transparent",
  color: "#9fb6d8",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
  transition: "all 0.15s",
  whiteSpace: "nowrap",
};

const btnActive: React.CSSProperties = {
  ...btnBase,
  background: "rgba(80,120,180,0.85)",
  color: "#e5f0ff",
  border: "1px solid rgba(80,120,180,0.6)",
};

export default function Charts() {
  const [activeSymbol, setActiveSymbol] = useState("SP:SPX");
  const [customInput, setCustomInput] = useState("");

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sym = customInput.trim().toUpperCase();
    if (sym) {
      setActiveSymbol(sym);
      setCustomInput("");
    }
  };

  return (
    <div style={{ display: "grid", gap: 16, paddingBottom: 40 }}>
      {/* Toolbar */}
      <div
        style={{
          background: "rgba(12,18,28,0.95)",
          border: "1px solid rgba(186,205,231,0.14)",
          borderRadius: 14,
          padding: "14px 20px",
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            color: "#8ab4f0",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            marginRight: 4,
            whiteSpace: "nowrap",
          }}
        >
          Instrument:
        </span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
          {PRESETS.map((p) => (
            <button
              key={p.symbol}
              type="button"
              style={activeSymbol === p.symbol ? btnActive : btnBase}
              onClick={() => setActiveSymbol(p.symbol)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <form
          onSubmit={handleCustomSubmit}
          style={{ display: "flex", gap: 8, alignItems: "center" }}
        >
          <input
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder="Wpisz ticker (np. AAPL)"
            style={{
              background: "rgba(10,16,25,0.8)",
              border: "1px solid rgba(161,187,224,0.28)",
              borderRadius: 8,
              padding: "7px 12px",
              color: "#dce9ff",
              fontSize: 13,
              width: 180,
            }}
          />
          <button
            type="submit"
            style={{
              ...btnBase,
              background: "rgba(80,120,180,0.7)",
              color: "#e5f0ff",
              border: "none",
            }}
          >
            Szukaj
          </button>
        </form>
      </div>

      {/* Chart */}
      <div
        style={{
          background: "rgba(5,9,15,0.98)",
          border: "1px solid rgba(186,205,231,0.14)",
          borderRadius: 14,
          overflow: "hidden",
          height: 640,
        }}
      >
        <AdvancedChart key={activeSymbol} symbol={activeSymbol} />
      </div>

      {/* Bottom row: mini symbol overviews */}
      <div
        style={{
          background: "rgba(12,18,28,0.95)",
          border: "1px solid rgba(186,205,231,0.14)",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "14px 20px 0",
            color: "#8ab4f0",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Przegląd Rynku — Ticker
        </div>
        <TickerTape />
      </div>
    </div>
  );
}

function TickerTape() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    container.innerHTML = "";

    const inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    container.appendChild(inner);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
    script.textContent = JSON.stringify({
      symbols: [
        { description: "S&P 500", proName: "SP:SPX" },
        { description: "NASDAQ", proName: "NASDAQ:NDX" },
        { description: "WIG20", proName: "GPWREG:WIG20" },
        { description: "DAX", proName: "XETR:DAX" },
        { description: "WTI", proName: "NYMEX:CL1!" },
        { description: "Złoto", proName: "COMEX:GC1!" },
        { description: "EUR/USD", proName: "FX:EURUSD" },
        { description: "USD/PLN", proName: "FX:USDPLN" },
        { description: "US 10Y", proName: "TVC:US10Y" },
        { description: "BTC/USD", proName: "BINANCE:BTCUSDT" },
      ],
      showSymbolLogo: true,
      isTransparent: true,
      displayMode: "adaptive",
      colorTheme: "dark",
      locale: "pl",
    });
    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, []);

  return (
    <div
      ref={ref}
      className="tradingview-widget-container"
      style={{ height: 80 }}
    />
  );
}
