"use client";

import type { Thread, ThreadDevelopment, ThreadScenario, ThreadSectorImpact } from "../lib/types";

/* ─── design tokens ─────────────────────────────────────────── */
const BG = "rgba(14,22,34,0.96)";
const BORDER = "1px solid rgba(186,205,231,0.13)";
const SECTION_LABEL: React.CSSProperties = {
  color: "#6a90bc",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  marginBottom: 10,
};
const CARD: React.CSSProperties = {
  background: BG,
  border: BORDER,
  borderRadius: 12,
  padding: "16px 20px",
};

/* ─── helpers ───────────────────────────────────────────────── */
function ProbBadge({ prob }: { prob: string }) {
  const p = prob?.toLowerCase() ?? "";
  const color = p === "wysoka" ? "#e06060" : p === "srednia" ? "#d4a830" : "#50b878";
  const bg = p === "wysoka" ? "rgba(224,96,96,0.15)" : p === "srednia" ? "rgba(212,168,48,0.15)" : "rgba(80,184,120,0.12)";
  return (
    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" as const, color, background: bg, border: `1px solid ${color}44`, borderRadius: 999, padding: "3px 10px" }}>
      {prob ?? "—"}
    </span>
  );
}

function ConfBadge({ level }: { level?: string }) {
  if (!level) return null;
  const map: Record<string, { label: string; color: string }> = {
    high: { label: "Wysoka pewność", color: "#50b878" },
    medium: { label: "Średnia pewność", color: "#d4a830" },
    low: { label: "Niska pewność", color: "#e06060" },
  };
  const info = map[level] ?? { label: level, color: "#7a9abc" };
  return <span style={{ fontSize: 11, color: info.color, fontWeight: 600 }}>● {info.label}</span>;
}

function SectorRow({ s }: { s: ThreadSectorImpact }) {
  const isUp = s.direction === "up";
  const isDown = s.direction === "down";
  const arrowColor = isUp ? "#50b878" : isDown ? "#e06060" : "#d4a830";
  const arrow = isUp ? "↑" : isDown ? "↓" : "↔";
  const bg = isUp ? "rgba(80,184,120,0.08)" : isDown ? "rgba(224,96,96,0.08)" : "rgba(212,168,48,0.08)";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 10, alignItems: "start", background: bg, border: `1px solid ${arrowColor}22`, borderRadius: 10, padding: "10px 14px" }}>
      <span style={{ fontSize: 20, color: arrowColor, fontWeight: 900, lineHeight: 1.2 }}>{arrow}</span>
      <div>
        <div style={{ color: "#dce9ff", fontSize: 13, fontWeight: 700 }}>{s.sector}</div>
        <div style={{ color: "#8aabcc", fontSize: 12, marginTop: 2 }}>{s.why}</div>
      </div>
    </div>
  );
}

function SectorGrid({ items }: { items: ThreadSectorImpact[] }) {
  if (!items?.length) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
      {items.map((s, i) => <SectorRow key={i} s={s} />)}
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "4px 0 2px" }}>
      <div style={{ flex: 1, height: 1, background: "rgba(186,205,231,0.1)" }} />
      <span style={{ color: "#4a6a8c", fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase" as const, whiteSpace: "nowrap" as const }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: "rgba(186,205,231,0.1)" }} />
    </div>
  );
}

/* ─── main ──────────────────────────────────────────────────── */
export default function ThreadDetail({ thread, onClose }: { thread: Thread; onClose: () => void }) {
  const snap = thread.context_snapshot;

  return (
    <article style={{ borderRadius: 20, border: "1px solid rgba(186,205,231,0.2)", background: "linear-gradient(180deg, rgba(16,24,36,0.99) 0%, rgba(8,14,22,0.99) 100%)", overflow: "hidden" }}>

      {/* HEADER */}
      <div style={{ padding: "22px 28px 18px", borderBottom: "1px solid rgba(186,205,231,0.1)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: "#4a6a8c", fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
            Wątek geopolityczny
          </div>
          <h2 style={{ margin: "0 0 8px", color: "#e5f0ff", fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>
            📌 {thread.name}
          </h2>
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <ConfBadge level={snap?.confidence_level} />
            {thread.last_refreshed_at && (
              <span style={{ color: "#4a6a8c", fontSize: 11 }}>
                Aktualizacja:{" "}
                {new Date(thread.last_refreshed_at).toLocaleDateString("pl-PL", {
                  day: "numeric", month: "short", year: "numeric",
                })}
              </span>
            )}
            {thread.new_events_count > 0 && (
              <span style={{ fontSize: 11, color: "#e06060", fontWeight: 700, background: "rgba(224,96,96,0.12)", border: "1px solid rgba(224,96,96,0.3)", borderRadius: 999, padding: "2px 8px" }}>
                {thread.new_events_count} nowe
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ padding: "8px 16px", borderRadius: 999, border: "1px solid rgba(161,187,224,0.22)", background: "transparent", color: "#6a90bc", cursor: "pointer", fontSize: 13, flexShrink: 0 }}
        >
          ← Wróć
        </button>
      </div>

      {/* BODY — single scroll */}
      <div style={{ padding: "24px 28px 36px", display: "grid", gap: 26 }}>

        {!snap && (
          <div style={{ color: "#6a90bc", fontSize: 14 }}>
            {thread.status === "initializing"
              ? "⏳ Wątek jest inicjalizowany — trwa głęboki research..."
              : "Brak danych. Odśwież wątek."}
          </div>
        )}
        {snap?.error && (
          <div style={{ ...CARD, borderColor: "rgba(224,96,96,0.3)", color: "#ffd7d7", fontSize: 14 }}>
            {snap.error}
          </div>
        )}

        {snap && !snap.error && (
          <>
            {/* 1 ── STAN BIEŻĄCY */}
            {snap.current_state && (
              <div>
                <Divider label="Stan bieżący" />
                <div style={{ marginTop: 12, background: "rgba(80,120,180,0.08)", border: "1px solid rgba(80,120,180,0.22)", borderLeft: "3px solid rgba(80,120,180,0.7)", borderRadius: 12, padding: "16px 20px" }}>
                  <p style={{ margin: 0, color: "#d6e8ff", fontSize: 15, lineHeight: 1.75 }}>{snap.current_state}</p>
                </div>
              </div>
            )}

            {/* 2 ── GENEZA KONFLIKTU */}
            {snap.background && (
              <div>
                <Divider label="Geneza konfliktu" />
                <div style={{ ...CARD, marginTop: 12 }}>
                  <p style={{ margin: 0, color: "#c6d8f4", fontSize: 14, lineHeight: 1.75 }}>{snap.background}</p>
                </div>
              </div>
            )}

            {/* 3 ── OŚ CZASU */}
            {(snap.timeline ?? []).length > 0 && (
              <div>
                <Divider label="Oś czasu" />
                <div style={{ marginTop: 14, paddingLeft: 12 }}>
                  {snap.timeline!.map((ev, i) => {
                    const sigColor = ev.significance === "wysokie" ? "#e06060" : ev.significance === "srednie" ? "#d4a830" : "#4a6a8c";
                    const isLast = i === snap.timeline!.length - 1;
                    return (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "14px 100px 1fr", gap: "0 12px", paddingBottom: isLast ? 0 : 16 }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 3 }}>
                          <div style={{ width: 10, height: 10, borderRadius: "50%", background: sigColor, flexShrink: 0 }} />
                          {!isLast && <div style={{ flex: 1, width: 2, background: "rgba(186,205,231,0.12)", marginTop: 4 }} />}
                        </div>
                        <div style={{ color: "#5a7a9c", fontSize: 12, paddingTop: 1 }}>{ev.date}</div>
                        <div style={{ color: "#c6d8f4", fontSize: 13, lineHeight: 1.5 }}>{ev.event}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 4 ── KLUCZOWI AKTORZY */}
            {(snap.key_actors ?? []).length > 0 && (
              <div>
                <Divider label="Kluczowi aktorzy" />
                <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
                  {snap.key_actors!.map((actor, i) => (
                    <div key={i} style={{ ...CARD, display: "grid", gridTemplateColumns: "160px 1fr", gap: 12, padding: "10px 16px" }}>
                      <div style={{ color: "#dce9ff", fontSize: 13, fontWeight: 700 }}>
                        {actor.name}
                        <div style={{ color: "#5a7a9c", fontSize: 11, fontWeight: 400, marginTop: 2 }}>{actor.role}</div>
                      </div>
                      <div style={{ color: "#9fb6d8", fontSize: 13 }}>{actor.position}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 5 ── OSTATNIE ZDARZENIA */}
            {(snap.latest_developments ?? []).length > 0 && (
              <div>
                <Divider label="Ostatnie zdarzenia" />
                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  {(snap.latest_developments as ThreadDevelopment[]).map((dev, i) => (
                    <div key={i} style={CARD}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
                        <span style={{ color: "#4a6a8c", fontSize: 11, fontWeight: 600, background: "rgba(74,106,140,0.15)", borderRadius: 6, padding: "2px 8px" }}>
                          {dev.date}
                        </span>
                      </div>
                      <div style={{ color: "#dce9ff", fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{dev.title}</div>
                      <p style={{ margin: 0, color: "#9fb6d8", fontSize: 13, lineHeight: 1.65 }}>{dev.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 6 ── SCENARIUSZE */}
            {(snap.scenarios ?? []).length > 0 && (
              <div>
                <Divider label="Scenariusze" />
                <div style={{ marginTop: 12, display: "grid", gap: 14 }}>
                  {(snap.scenarios as ThreadScenario[]).map((sc, i) => {
                    const sectors = sc.sector_impacts ?? [];
                    return (
                      <div key={i} style={{ ...CARD, display: "grid", gap: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ color: "#dce9ff", fontSize: 15, fontWeight: 700 }}>{sc.name}</span>
                          <ProbBadge prob={sc.probability} />
                        </div>
                        <div>
                          <div style={SECTION_LABEL}>Trigger</div>
                          <p style={{ margin: 0, color: "#9fb6d8", fontSize: 13, lineHeight: 1.6 }}>{sc.trigger}</p>
                        </div>
                        {sectors.length > 0 && (
                          <div>
                            <div style={SECTION_LABEL}>Wpływ na sektory w tym scenariuszu</div>
                            <SectorGrid items={sectors} />
                          </div>
                        )}
                        {sectors.length === 0 && sc.market_impact && (
                          <div>
                            <div style={SECTION_LABEL}>Wpływ rynkowy</div>
                            <p style={{ margin: 0, color: "#9fb6d8", fontSize: 13 }}>{sc.market_impact}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 7 ── MECHANIZM TRANSMISJI */}
            {snap.market_implications?.correlation_map && (
              <div>
                <Divider label="Mechanizm transmisji rynkowej" />
                <div style={{ ...CARD, marginTop: 12, borderLeft: "3px solid rgba(186,205,231,0.3)" }}>
                  <p style={{ margin: 0, color: "#c6d8f4", fontSize: 14, lineHeight: 1.75, fontStyle: "italic" }}>
                    {snap.market_implications.correlation_map}
                  </p>
                </div>
              </div>
            )}

            {/* 8 ── WPŁYW NA SEKTORY baseline */}
            {(() => {
              const sectors = snap.market_implications?.sector_impacts ?? [];
              const legacyAssets = snap.market_implications?.assets ?? [];
              const legacySectors: ThreadSectorImpact[] = legacyAssets.map((a) => ({
                sector: a.asset,
                direction: (a.direction ?? "mixed") as "up" | "down" | "mixed",
                why: a.why,
              }));
              const all = sectors.length > 0 ? sectors : legacySectors;
              if (!all.length) return null;
              return (
                <div>
                  <Divider label="Wpływ na sektory — stan bazowy" />
                  <div style={{ marginTop: 12 }}>
                    <SectorGrid items={all} />
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>
    </article>
  );
}
