"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getMarketInstruments, getMarketQuotes, patchPreferences } from "../lib/api";
import type { MarketCategory, MarketQuote, UserPreference } from "../lib/types";
import MarketCard from "./MarketCard";
import MarketPersonalizeModal from "./MarketPersonalizeModal";

const REFRESH_INTERVAL_MS = 60_000;

interface MarketDashboardProps {
  token: string | null;
  preferences: UserPreference | null;
  onPreferencesUpdate: (pref: UserPreference) => void;
}

function getDefaultTickers(categories: MarketCategory[]): string[] {
  return categories.flatMap((cat) =>
    cat.instruments.filter((i) => i.default).map((i) => i.ticker),
  );
}

function buildQuoteMap(quotes: MarketQuote[]): Map<string, MarketQuote> {
  return new Map(quotes.map((q) => [q.ticker, q]));
}

export default function MarketDashboard({
  token,
  preferences,
  onPreferencesUpdate,
}: MarketDashboardProps) {
  const [categories, setCategories] = useState<MarketCategory[]>([]);
  const [quotes, setQuotes] = useState<Map<string, MarketQuote>>(new Map());
  const [activeTickers, setActiveTickers] = useState<string[]>([]);
  const [loadingInstruments, setLoadingInstruments] = useState(true);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showPersonalize, setShowPersonalize] = useState(false);
  const [pendingTickers, setPendingTickers] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const tickersRef = useRef<string[]>([]);
  tickersRef.current = activeTickers;

  const fetchQuotes = useCallback(async (tickers: string[]) => {
    if (tickers.length === 0) return;
    setLoadingQuotes(true);
    try {
      const data = await getMarketQuotes(tickers);
      setQuotes(buildQuoteMap(data));
      setLastUpdated(new Date());
    } catch {
      // Silent — stale data remains
    } finally {
      setLoadingQuotes(false);
    }
  }, []);

  // Load instruments on mount
  useEffect(() => {
    setLoadingInstruments(true);
    getMarketInstruments()
      .then((data) => {
        setCategories(data.categories);
        const savedTickers = preferences?.market_tickers;
        const tickers =
          savedTickers && savedTickers.length > 0
            ? savedTickers
            : getDefaultTickers(data.categories);
        setActiveTickers(tickers);
        void fetchQuotes(tickers);
      })
      .catch(() => {
        // ignore
      })
      .finally(() => setLoadingInstruments(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh every minute
  useEffect(() => {
    const id = setInterval(() => {
      if (tickersRef.current.length > 0) {
        void fetchQuotes(tickersRef.current);
      }
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchQuotes]);

  const handleOpenPersonalize = () => {
    setPendingTickers(new Set(activeTickers));
    setShowPersonalize(true);
  };

  const handleToggleTicker = (ticker: string) => {
    setPendingTickers((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) {
        next.delete(ticker);
      } else {
        next.add(ticker);
      }
      return next;
    });
  };

  const handleSavePersonalize = async () => {
    const newTickers = Array.from(pendingTickers);
    setActiveTickers(newTickers);
    setShowPersonalize(false);
    void fetchQuotes(newTickers);

    if (token) {
      setSaving(true);
      try {
        const updated = await patchPreferences(token, { market_tickers: newTickers });
        onPreferencesUpdate(updated);
      } catch {
        // non-critical — preferences not saved
      } finally {
        setSaving(false);
      }
    }
  };

  const formatTime = (d: Date) =>
    d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const isInitialLoad = loadingInstruments || (loadingQuotes && quotes.size === 0);

  if (isInitialLoad) {
    return (
      <div style={{ display: "grid", gap: 22 }}>
        <style>{`
          @keyframes shimmer {
            0% { background-position: -600px 0; }
            100% { background-position: 600px 0; }
          }
          .sk {
            background: linear-gradient(90deg,
              rgba(20,30,48,0.7) 25%,
              rgba(40,58,90,0.5) 50%,
              rgba(20,30,48,0.7) 75%
            );
            background-size: 600px 100%;
            animation: shimmer 1.6s infinite linear;
            border-radius: 8px;
          }
        `}</style>

        {/* Toolbar skeleton */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="sk" style={{ width: 180, height: 14 }} />
          <div className="sk" style={{ width: 100, height: 30, borderRadius: 10 }} />
        </div>

        {/* Category skeletons */}
        {[5, 4, 3, 4].map((count, ci) => (
          <div key={ci}>
            <div className="sk" style={{ width: 90, height: 10, marginBottom: 12, borderRadius: 4 }} />
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
              gap: 10,
            }}>
              {Array.from({ length: count }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    border: "1px solid rgba(120,148,188,0.1)",
                    borderRadius: 14,
                    background: "rgba(14,20,30,0.6)",
                    padding: "12px 14px",
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div style={{ display: "grid", gap: 5 }}>
                      <div className="sk" style={{ width: 80, height: 12 }} />
                      <div className="sk" style={{ width: 50, height: 8 }} />
                    </div>
                    <div className="sk" style={{ width: 38, height: 18, borderRadius: 6 }} />
                  </div>
                  <div className="sk" style={{ width: 70, height: 20 }} />
                  <div className="sk" style={{ width: 90, height: 16, borderRadius: 6 }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const visibleCategories = categories
    .map((cat) => ({
      ...cat,
      instruments: cat.instruments.filter((i) => activeTickers.includes(i.ticker)),
    }))
    .filter((cat) => cat.instruments.length > 0);

  return (
    <div style={{ display: "grid", gap: 22 }}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              color: "#92a9cb",
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            {loadingQuotes
              ? "Aktualizowanie..."
              : lastUpdated
              ? `Ostatnia aktualizacja: ${formatTime(lastUpdated)}`
              : "Ładowanie cen..."}
          </span>
          <button
            onClick={() => void fetchQuotes(activeTickers)}
            disabled={loadingQuotes}
            style={{
              border: "1px solid rgba(140,180,255,0.3)",
              borderRadius: 8,
              padding: "4px 10px",
              background: "rgba(30,50,80,0.5)",
              color: "#a0c0f0",
              fontSize: 11,
              cursor: loadingQuotes ? "not-allowed" : "pointer",
              opacity: loadingQuotes ? 0.5 : 1,
              letterSpacing: "0.08em",
            }}
          >
            Odśwież
          </button>
        </div>
        <button
          onClick={handleOpenPersonalize}
          style={{
            border: "1px solid rgba(163,185,215,0.4)",
            borderRadius: 10,
            padding: "7px 14px",
            color: "#d8e4f7",
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            background: "linear-gradient(180deg, rgba(51,63,80,0.9), rgba(30,38,51,0.94))",
            cursor: "pointer",
          }}
        >
          Personalizuj
        </button>
      </div>

      {/* Categories */}
      {visibleCategories.length === 0 ? (
        <div
          style={{
            padding: "32px 0",
            color: "#5a7498",
            fontSize: 13,
            letterSpacing: "0.1em",
            textAlign: "center",
          }}
        >
          Brak wybranych instrumentów. Kliknij &quot;Personalizuj&quot; aby dodać.
        </div>
      ) : (
        visibleCategories.map((cat) => (
          <section key={cat.name}>
            <p
              style={{
                margin: "0 0 10px",
                color: "#7a9abf",
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                borderBottom: "1px solid rgba(120,160,200,0.15)",
                paddingBottom: 6,
              }}
            >
              {cat.name}
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
                gap: 10,
              }}
            >
              {cat.instruments.map((inst) => {
                const quote = quotes.get(inst.ticker);
                return quote ? (
                  <MarketCard key={inst.ticker} quote={quote} />
                ) : (
                  <div
                    key={inst.ticker}
                    style={{
                      border: "1px solid rgba(120,148,188,0.1)",
                      borderRadius: 14,
                      background: "rgba(14,20,30,0.6)",
                      padding: "12px 14px",
                      display: "grid",
                      gap: 10,
                    }}
                  >
                    <style>{`@keyframes shimmer{0%{background-position:-600px 0}100%{background-position:600px 0}}.sk2{background:linear-gradient(90deg,rgba(20,30,48,0.7) 25%,rgba(40,58,90,0.5) 50%,rgba(20,30,48,0.7) 75%);background-size:600px 100%;animation:shimmer 1.6s infinite linear;border-radius:8px}`}</style>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <div style={{ display: "grid", gap: 5 }}>
                        <div className="sk2" style={{ width: 80, height: 12 }} />
                        <div className="sk2" style={{ width: 50, height: 8 }} />
                      </div>
                      <div className="sk2" style={{ width: 38, height: 18, borderRadius: 6 }} />
                    </div>
                    <div className="sk2" style={{ width: 70, height: 20 }} />
                    <div className="sk2" style={{ width: 90, height: 16, borderRadius: 6 }} />
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}

      {showPersonalize && (
        <MarketPersonalizeModal
          categories={categories}
          selectedTickers={pendingTickers}
          onToggle={handleToggleTicker}
          onSave={() => void handleSavePersonalize()}
          onClose={() => setShowPersonalize(false)}
          saving={saving}
        />
      )}
    </div>
  );
}
