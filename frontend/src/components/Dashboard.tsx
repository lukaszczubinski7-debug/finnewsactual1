"use client";

import { useEffect, useRef } from "react";

function TVWidget({
  type,
  config,
  height,
}: {
  type: string;
  config: object;
  height: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    container.innerHTML = "";

    const inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    inner.style.height = "100%";
    inner.style.width = "100%";
    container.appendChild(inner);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src = `https://s3.tradingview.com/external-embedding/embed-widget-${type}.js`;
    script.textContent = JSON.stringify(config);
    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  return (
    <div
      ref={ref}
      className="tradingview-widget-container"
      style={{ height, width: "100%", overflow: "hidden" }}
    />
  );
}

const sectionStyle: React.CSSProperties = {
  background: "rgba(12,18,28,0.95)",
  border: "1px solid rgba(186,205,231,0.14)",
  borderRadius: 14,
  overflow: "hidden",
};

const sectionHeadStyle: React.CSSProperties = {
  padding: "14px 20px 0",
  color: "#8ab4f0",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

export default function Dashboard() {
  return (
    <div style={{ display: "grid", gap: 20, paddingBottom: 40 }}>

      {/* Row 1: Market Overview (full width) */}
      <div style={sectionStyle}>
        <div style={sectionHeadStyle}>Rynki Globalne — Indeksy · Waluty · Surowce · Obligacje</div>
        <TVWidget
          type="market-overview"
          height={520}
          config={{
            colorTheme: "dark",
            dateRange: "1D",
            showChart: true,
            locale: "pl",
            largeChartUrl: "",
            isTransparent: true,
            showSymbolLogo: false,
            showFloatingTooltip: false,
            width: "100%",
            height: "500",
            tabs: [
              {
                title: "Indeksy",
                symbols: [
                  { s: "GPWREG:WIG20", d: "WIG20" },
                  { s: "SP:SPX", d: "S&P 500" },
                  { s: "NASDAQ:NDX", d: "NASDAQ 100" },
                  { s: "XETR:DAX", d: "DAX" },
                  { s: "SPREADEX:FTSE", d: "FTSE 100" },
                  { s: "TVC:DXY", d: "DXY (Dolar)" },
                ],
                originalTitle: "Indeksy",
              },
              {
                title: "Waluty (FX)",
                symbols: [
                  { s: "FX:USDPLN", d: "USD/PLN" },
                  { s: "FX:EURPLN", d: "EUR/PLN" },
                  { s: "FX:EURUSD", d: "EUR/USD" },
                  { s: "FX:USDJPY", d: "USD/JPY" },
                  { s: "FX:GBPUSD", d: "GBP/USD" },
                  { s: "FX:USDCHF", d: "USD/CHF" },
                ],
                originalTitle: "Waluty (FX)",
              },
              {
                title: "Surowce",
                symbols: [
                  { s: "NYMEX:CL1!", d: "WTI Ropa" },
                  { s: "ICEEUR:B1!", d: "Brent" },
                  { s: "COMEX:GC1!", d: "Złoto" },
                  { s: "COMEX:SI1!", d: "Srebro" },
                  { s: "NYMEX:NG1!", d: "Gaz Ziemny" },
                  { s: "CBOT:ZC1!", d: "Kukurydza" },
                ],
                originalTitle: "Surowce",
              },
              {
                title: "Obligacje (Yields)",
                symbols: [
                  { s: "TVC:US10Y", d: "US 10Y" },
                  { s: "TVC:US02Y", d: "US 2Y" },
                  { s: "TVC:DE10Y", d: "Bund 10Y" },
                  { s: "TVC:PL10Y", d: "PL 10Y" },
                  { s: "TVC:JP10Y", d: "JP 10Y" },
                  { s: "CBOT:ZB1!", d: "T-Bond Fut." },
                ],
                originalTitle: "Obligacje (Yields)",
              },
            ],
          }}
        />
      </div>

      {/* Row 2: 2-column — Forex Cross Rates + Economic Calendar */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={sectionStyle}>
          <div style={sectionHeadStyle}>Krzyżowe Kursy Walut</div>
          <TVWidget
            type="forex-cross-rates"
            height={440}
            config={{
              width: "100%",
              height: 400,
              currencies: ["EUR", "USD", "PLN", "JPY", "GBP", "CHF", "NOK", "HUF"],
              isTransparent: true,
              colorTheme: "dark",
              locale: "pl",
            }}
          />
        </div>

        <div style={sectionStyle}>
          <div style={sectionHeadStyle}>Kalendarz Makroekonomiczny</div>
          <TVWidget
            type="events"
            height={440}
            config={{
              colorTheme: "dark",
              isTransparent: true,
              width: "100%",
              height: 400,
              locale: "pl",
              importanceFilter: "-1,0,1",
              countryFilter: "us,eu,de,pl,gb,jp,cn",
            }}
          />
        </div>
      </div>

      {/* Row 3: Screener */}
      <div style={sectionStyle}>
        <div style={sectionHeadStyle}>Skaner Akcji — Biggest Movers</div>
        <TVWidget
          type="screener"
          height={500}
          config={{
            width: "100%",
            height: 480,
            defaultColumn: "overview",
            defaultScreen: "most_capitalized",
            market: "poland",
            showToolbar: true,
            colorTheme: "dark",
            locale: "pl",
            isTransparent: true,
          }}
        />
      </div>
    </div>
  );
}
