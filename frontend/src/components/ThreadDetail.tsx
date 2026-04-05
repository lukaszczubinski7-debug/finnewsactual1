"use client";

import { useState } from "react";
import type { Thread, ThreadScenario, ThreadDevelopment, ThreadAsset } from "../lib/types";

type Tab = "teraz" | "geneza" | "scenariusze";

const tabs: { key: Tab; label: string }[] = [
  { key: "teraz", label: "Teraz" },
  { key: "geneza", label: "Geneza" },
  { key: "scenariusze", label: "Scenariusze" },
];

const sectionLabel: React.CSSProperties = {
  color: "#8ab4f0",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  marginBottom: 6,
};

const card: React.CSSProperties = {
  background: "rgba(14,22,34,0.95)",
  border: "1px solid rgba(186,205,231,0.14)",
  borderRadius: 12,
  padding: "14px 18px",
};

function ProbabilityDot({ prob }: { prob: string }) {
  const color = prob === "wysoka" ? "#f07070" : prob === "srednia" ? "#f0c060" : "#70c090";
  return <span style={{ color, fontSize: 12, fontWeight: 700 }}>{prob.toUpperCase()}</span>;
}

function DirectionArrow({ dir }: { dir: string }) {
  if (dir === "up") return <span style={{ color: "#60d090" }}>↑</span>;
  if (dir === "down") return <span style={{ color: "#f07070" }}>↓</span>;
  return <span style={{ color: "#f0c060" }}>↔</span>;
}

/** Splits developments into tiers by date relative to today */
function tierDevelopments(devs: ThreadDevelopment[]): {
  h24: ThreadDevelopment[];
  h72: ThreadDevelopment[];
  week: ThreadDevelopment[];
  older: ThreadDevelopment[];
} {
  const now = Date.now();
  const DAY = 86400000;
  const tiers = { h24: [] as ThreadDevelopment[], h72: [] as ThreadDevelopment[], week: [] as ThreadDevelopment[], older: [] as ThreadDevelopment[] };
  for (const dev of devs) {
    const parsed = dev.date ? Date.parse(dev.date) : NaN;
    if (isNaN(parsed)) {
      tiers.older.push(dev);
      continue;
    }
    const age = now - parsed;
    if (age <= DAY) tiers.h24.push(dev);
    else if (age <= 3 * DAY) tiers.h72.push(dev);
    else if (age <= 7 * DAY) tiers.week.push(dev);
    else tiers.older.push(dev);
  }
  return tiers;
}

function DevCard({ dev }: { dev: ThreadDevelopment }) {
  return (
    <div style={card}>
      <div style={{ color: "#7a9abc", fontSize: 12, marginBottom: 4 }}>{dev.date}</div>
      <div style={{ color: "#dce9ff", fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{dev.title}</div>
      <p style={{ margin: 0, color: "#c6d8f4", fontSize: 14, lineHeight: 1.6 }}>{dev.body}</p>
    </div>
  );
}

function TieredNews({ devs }: { devs: ThreadDevelopment[] }) {
  if (devs.length === 0) return null;
  const { h24, h72, week, older } = tierDevelopments(devs);

  // If no tiering possible (all older / no dates), just show all flat
  const hasAnyTier = h24.length > 0 || h72.length > 0 || week.length > 0;

  if (!hasAnyTier) {
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <div style={sectionLabel}>Ostatnie zdarzenia</div>
        {devs.map((dev, i) => <DevCard key={i} dev={dev} />)}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {h24.length > 0 && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ ...sectionLabel, color: "#90d0a0" }}>Ostatnie 24h ({h24.length})</div>
          {h24.slice(0, 5).map((dev, i) => <DevCard key={i} dev={dev} />)}
        </div>
      )}
      {h72.length > 0 && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ ...sectionLabel, color: "#c0c870" }}>24–72h ({h72.length})</div>
          {h72.slice(0, 3).map((dev, i) => <DevCard key={i} dev={dev} />)}
        </div>
      )}
      {week.length > 0 && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ ...sectionLabel, color: "#9fb6d8" }}>Ostatni tydzień ({week.length})</div>
          {week.slice(0, 2).map((dev, i) => <DevCard key={i} dev={dev} />)}
        </div>
      )}
      {older.length > 0 && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={sectionLabel}>Starsze</div>
          {older.map((dev, i) => <DevCard key={i} dev={dev} />)}
        </div>
      )}
    </div>
  );
}

export default function ThreadDetail({ thread, onClose }: { thread: Thread; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("teraz");
  const snap = thread.context_snapshot;

  return (
    <section
      style={{
        padding: 28,
        borderRadius: 20,
        border: "1px solid rgba(186,205,231,0.22)",
        background: "linear-gradient(180deg, rgba(19,28,40,0.98), rgba(10,16,25,0.98))",
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: 22 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <h2 style={{ margin: 0, color: "#e5f0ff", fontSize: 26 }}>📌 {thread.name}</h2>
            {thread.assets && (
              <div style={{ color: "#7a9abc", fontSize: 13, marginTop: 4 }}>
                Aktywa: {thread.assets}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "6px 14px",
              borderRadius: 999,
              border: "1px solid rgba(161,187,224,0.28)",
              background: "transparent",
              color: "#9fb6d8",
              cursor: "pointer",
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            ← Wróć
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                padding: "7px 16px",
                borderRadius: 999,
                border: tab === t.key ? "1px solid rgba(80,120,180,0.8)" : "1px solid rgba(161,187,224,0.2)",
                background: tab === t.key ? "rgba(80,120,180,0.3)" : "transparent",
                color: tab === t.key ? "#c6d8f4" : "#7a9abc",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: tab === t.key ? 600 : 400,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {!snap && (
          <div style={{ color: "#9fb6d8", fontSize: 14 }}>
            {thread.status === "initializing"
              ? "Wątek jest inicjalizowany..."
              : "Brak danych. Odśwież wątek."}
          </div>
        )}

        {snap?.error && (
          <div style={{ color: "#ffd7d7", fontSize: 14 }}>{snap.error}</div>
        )}

        {snap && !snap.error && (
          <>
            {/* TAB: Teraz */}
            {tab === "teraz" && (
              <div style={{ display: "grid", gap: 16 }}>
                {/* Aktualna sytuacja */}
                {snap.current_state && (
                  <div style={card}>
                    <div style={sectionLabel}>Aktualna sytuacja</div>
                    <p style={{ margin: 0, color: "#d6e6ff", fontSize: 16, lineHeight: 1.7 }}>
                      {snap.current_state}
                    </p>
                  </div>
                )}

                {/* Wpływ na rynki */}
                {(snap.market_implications?.correlation_map || (snap.market_implications?.assets ?? []).length > 0 || (snap.market_implications?.sectors ?? []).length > 0) && (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ ...sectionLabel, color: "#d0a060" }}>Wpływ na rynki</div>
                    {snap.market_implications?.correlation_map && (
                      <div style={card}>
                        <div style={{ color: "#9fb6d8", fontSize: 13, marginBottom: 6 }}>Mechanizm transmisji</div>
                        <p style={{ margin: 0, color: "#d6e6ff", fontSize: 14, lineHeight: 1.7 }}>
                          {snap.market_implications.correlation_map}
                        </p>
                      </div>
                    )}
                    {(snap.market_implications?.assets ?? []).length > 0 && (
                      <div style={{ display: "grid", gap: 8 }}>
                        {(snap.market_implications!.assets as ThreadAsset[]).map((a, i) => (
                          <div key={i} style={{ ...card, display: "flex", alignItems: "center", gap: 12 }}>
                            <DirectionArrow dir={a.direction} />
                            <span style={{ color: "#dce9ff", fontWeight: 700, minWidth: 80 }}>{a.asset}</span>
                            <span style={{ color: "#9fb6d8", fontSize: 14, flex: 1 }}>{a.why}</span>
                            <span style={{ color: "#7a9abc", fontSize: 12 }}>{a.confidence}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {(snap.market_implications?.sectors ?? []).length > 0 && (
                      <div style={card}>
                        <div style={{ color: "#9fb6d8", fontSize: 13, marginBottom: 8 }}>Sektory</div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {snap.market_implications!.sectors!.map((s, i) => (
                            <span
                              key={i}
                              style={{
                                padding: "4px 12px",
                                borderRadius: 999,
                                background: "rgba(80,120,180,0.2)",
                                color: "#9fb6d8",
                                fontSize: 13,
                              }}
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Tiered news */}
                {(snap.latest_developments ?? []).length > 0 && (
                  <TieredNews devs={snap.latest_developments as ThreadDevelopment[]} />
                )}
              </div>
            )}

            {/* TAB: Geneza */}
            {tab === "geneza" && (
              <div style={{ display: "grid", gap: 16 }}>
                {snap.background && (
                  <div style={card}>
                    <div style={sectionLabel}>Historia konfliktu</div>
                    <p style={{ margin: 0, color: "#d6e6ff", fontSize: 15, lineHeight: 1.7 }}>
                      {snap.background}
                    </p>
                  </div>
                )}
                {(snap.timeline ?? []).length > 0 && (
                  <div style={{ display: "grid", gap: 0 }}>
                    <div style={{ ...sectionLabel, marginBottom: 12 }}>Oś czasu</div>
                    {snap.timeline!.map((ev, i) => (
                      <div
                        key={i}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "100px 1fr",
                          gap: 12,
                          paddingBottom: 14,
                          borderLeft: "2px solid rgba(80,120,180,0.4)",
                          paddingLeft: 16,
                          marginLeft: 8,
                        }}
                      >
                        <div style={{ color: "#7a9abc", fontSize: 12 }}>{ev.date}</div>
                        <div>
                          <div style={{ color: "#dce9ff", fontSize: 14 }}>{ev.event}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {(snap.key_actors ?? []).length > 0 && (
                  <div style={card}>
                    <div style={sectionLabel}>Kluczowi aktorzy</div>
                    <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                      {snap.key_actors!.map((actor, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, fontSize: 14 }}>
                          <span style={{ color: "#dce9ff", fontWeight: 600, minWidth: 120 }}>{actor.name}</span>
                          <span style={{ color: "#9fb6d8" }}>{actor.role} — {actor.position}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB: Scenariusze */}
            {tab === "scenariusze" && (
              <div style={{ display: "grid", gap: 12 }}>
                {(snap.scenarios ?? []).length === 0 && (
                  <div style={{ color: "#7a9abc", fontSize: 14 }}>Brak scenariuszy.</div>
                )}
                {(snap.scenarios as ThreadScenario[]).map((sc, i) => (
                  <div key={i} style={card}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <span style={{ color: "#dce9ff", fontSize: 15, fontWeight: 700 }}>{sc.name}</span>
                      <ProbabilityDot prob={sc.probability} />
                    </div>
                    <div style={{ display: "grid", gap: 4, fontSize: 14 }}>
                      <div><span style={{ color: "#7a9abc" }}>Trigger: </span><span style={{ color: "#c6d8f4" }}>{sc.trigger}</span></div>
                      <div><span style={{ color: "#7a9abc" }}>Wpływ na rynki: </span><span style={{ color: "#c6d8f4" }}>{sc.market_impact}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
