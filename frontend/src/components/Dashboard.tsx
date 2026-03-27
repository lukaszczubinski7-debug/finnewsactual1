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

      {/* Market Overview */}
      <div style={sectionStyle}>
        <div style={sectionHeadStyle}>Rynki Globalne</div>
        <TVWidget
          type="market-overview"
          height={520}
          config={{
            colorTheme: "dark",
            dateRange: "1D",
            showChart: true,
            locale: "pl",
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
                  { s: "TVC:DXY", d: "DXY" },
                ],
                originalTitle: "Indeksy",
              },
              {
                title: "Waluty",
                symbols: [
                  { s: "FX:USDPLN", d: "USD/PLN" },
                  { s: "FX:EURPLN", d: "EUR/PLN" },
                  { s: "FX:EURUSD", d: "EUR/USD" },
                  { s: "FX:USDJPY", d: "USD/JPY" },
                ],
                originalTitle: "Waluty",
              },
              {
                title: "Surowce",
                symbols: [
                  { s: "NYMEX:CL1!", d: "WTI Ropa" },
                  { s: "COMEX:GC1!", d: "Złoto" },
                  { s: "NYMEX:NG1!", d: "Gaz" },
                ],
                originalTitle: "Surowce",
              },
              {
                title: "Obligacje",
                symbols: [
                  { s: "TVC:US10Y", d: "US 10Y" },
                  { s: "TVC:US02Y", d: "US 2Y" },
                  { s: "TVC:DE10Y", d: "Bund 10Y" },
                  { s: "TVC:PL10Y", d: "PL 10Y" },
                ],
                originalTitle: "Obligacje",
              },
            ],
          }}
        />
      </div>

      {/* Economic Calendar */}
      <div style={sectionStyle}>
        <div style={sectionHeadStyle}>Kalendarz Makroekonomiczny</div>
        <TVWidget
          type="events"
          height={420}
          config={{
            colorTheme: "dark",
            isTransparent: true,
            width: "100%",
            height: 400,
            locale: "pl",
            importanceFilter: "0,1",
            countryFilter: "us,eu,de,pl,gb,jp,cn",
          }}
        />
      </div>
    </div>
  );
}
