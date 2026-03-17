"use client";

import { useState } from "react";
import type { Thread, ThreadDevelopment, ThreadScenario, ThreadSectorImpact } from "../lib/types";

/* ─── design tokens ─────────────────────────────────────────── */
const BG     = "rgba(14,22,34,0.96)";
const BORDER = "1px solid rgba(186,205,231,0.13)";
const LABEL: React.CSSProperties = {
  color: "#6a90bc", fontSize: 10, fontWeight: 800,
  letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8,
};
const CARD: React.CSSProperties = { background: BG, border: BORDER, borderRadius: 12, padding: "16px 20px" };

/* ─── tabs ───────────────────────────────────────────────────── */
type Tab = "teraz" | "geneza" | "os_czasu" | "aktorzy" | "scenariusze" | "rynki";
const TABS: { key: Tab; label: string }[] = [
  { key: "teraz",       label: "Teraz" },
  { key: "geneza",      label: "Geneza" },
  { key: "os_czasu",    label: "Historia konfliktu" },
  { key: "aktorzy",     label: "Kluczowi gracze" },
  { key: "scenariusze", label: "Scenariusze" },
  { key: "rynki",       label: "Rynki" },
];

/* ─── small helpers ──────────────────────────────────────────── */
function ProbBadge({ prob }: { prob: string }) {
  const p = prob?.toLowerCase() ?? "";
  const color = p === "wysoka" ? "#e06060" : p === "srednia" ? "#d4a830" : "#50b878";
  const bg    = p === "wysoka" ? "rgba(224,96,96,0.15)" : p === "srednia" ? "rgba(212,168,48,0.15)" : "rgba(80,184,120,0.12)";
  return (
    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" as const,
      color, background: bg, border: `1px solid ${color}44`, borderRadius: 999, padding: "3px 10px" }}>
      {prob ?? "—"}
    </span>
  );
}

function HorizonBadge({ horizon }: { horizon?: string }) {
  if (!horizon) return null;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
      color: "#7a9abc", background: "rgba(74,106,140,0.15)",
      border: "1px solid rgba(74,106,140,0.3)", borderRadius: 999, padding: "3px 10px" }}>
      ⏱ {horizon}
    </span>
  );
}

function ConfBadge({ level }: { level?: string }) {
  if (!level) return null;
  const map: Record<string, { label: string; color: string }> = {
    high:   { label: "Wysoka pewność",  color: "#50b878" },
    medium: { label: "Średnia pewność", color: "#d4a830" },
    low:    { label: "Niska pewność",   color: "#e06060" },
  };
  const info = map[level] ?? { label: level, color: "#7a9abc" };
  return <span style={{ fontSize: 11, color: info.color, fontWeight: 600 }}>● {info.label}</span>;
}

function SectionBlock({ title, text, accent }: { title: string; text: string; accent?: string }) {
  const borderColor = accent ?? "rgba(80,120,180,0.4)";
  return (
    <div style={{ borderLeft: `3px solid ${borderColor}`, paddingLeft: 16 }}>
      <div style={{ ...LABEL, marginBottom: 6 }}>{title}</div>
      <p style={{ margin: 0, color: "#c6d8f4", fontSize: 14, lineHeight: 1.75 }}>{text}</p>
    </div>
  );
}

function SectorRow({ s }: { s: ThreadSectorImpact }) {
  const up = s.direction === "up", down = s.direction === "down";
  const col = up ? "#50b878" : down ? "#e06060" : "#d4a830";
  const bg  = up ? "rgba(80,184,120,0.06)" : down ? "rgba(224,96,96,0.06)" : "rgba(212,168,48,0.06)";
  return (
    <div style={{ background: bg, border: `1px solid ${col}28`, borderRadius: 10, padding: "12px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 18, color: col, fontWeight: 900, lineHeight: 1 }}>
          {up ? "↑" : down ? "↓" : "↔"}
        </span>
        <span style={{ color: "#dce9ff", fontSize: 13, fontWeight: 700 }}>{s.sector}</span>
      </div>
      <p style={{ margin: 0, color: "#8aabcc", fontSize: 12, lineHeight: 1.6 }}>{s.why}</p>
    </div>
  );
}

function SectorGrid({ items }: { items: ThreadSectorImpact[] }) {
  if (!items?.length) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
      {items.map((s, i) => <SectorRow key={i} s={s} />)}
    </div>
  );
}

/* ─── main ──────────────────────────────────────────────────── */
export default function ThreadDetail({ thread, onClose }: { thread: Thread; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>("teraz");
  const snap = thread.context_snapshot;

  return (
    <article style={{ borderRadius: 20, border: "1px solid rgba(186,205,231,0.2)",
      background: "linear-gradient(180deg,rgba(16,24,36,0.99) 0%,rgba(8,14,22,0.99) 100%)", overflow: "hidden" }}>

      {/* HEADER */}
      <div style={{ padding: "22px 28px 18px", borderBottom: BORDER,
        display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: "#4a6a8c", fontSize: 10, fontWeight: 800, letterSpacing: "0.14em",
            textTransform: "uppercase", marginBottom: 6 }}>Wątek geopolityczny</div>
          <h2 style={{ margin: "0 0 8px", color: "#e5f0ff", fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>
            📌 {thread.name}
          </h2>
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <ConfBadge level={snap?.confidence_level} />
            {thread.last_refreshed_at && (
              <span style={{ color: "#4a6a8c", fontSize: 11 }}>
                Aktualizacja: {new Date(thread.last_refreshed_at).toLocaleDateString("pl-PL",
                  { day: "numeric", month: "short", year: "numeric" })}
              </span>
            )}
            {thread.new_events_count > 0 && (
              <span style={{ fontSize: 11, color: "#e06060", fontWeight: 700,
                background: "rgba(224,96,96,0.12)", border: "1px solid rgba(224,96,96,0.3)",
                borderRadius: 999, padding: "2px 8px" }}>
                {thread.new_events_count} nowe
              </span>
            )}
          </div>
        </div>
        <button type="button" onClick={onClose}
          style={{ padding: "8px 16px", borderRadius: 999, border: "1px solid rgba(161,187,224,0.22)",
            background: "transparent", color: "#6a90bc", cursor: "pointer", fontSize: 13, flexShrink: 0 }}>
          ← Wróć
        </button>
      </div>

      {/* TABS */}
      <div style={{ display: "flex", gap: 4, padding: "12px 28px 0", flexWrap: "wrap",
        borderBottom: "1px solid rgba(186,205,231,0.08)" }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setActiveTab(t.key)}
            style={{
              padding: "7px 16px", borderRadius: "10px 10px 0 0",
              border: activeTab === t.key ? "1px solid rgba(80,120,180,0.5)" : "1px solid transparent",
              borderBottom: activeTab === t.key ? "1px solid rgba(16,24,36,0.99)" : "1px solid transparent",
              background: activeTab === t.key ? "rgba(80,120,180,0.18)" : "transparent",
              color: activeTab === t.key ? "#c6d8f4" : "#5a7a9c",
              cursor: "pointer", fontSize: 13,
              fontWeight: activeTab === t.key ? 700 : 400,
              marginBottom: -1,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* BODY */}
      <div style={{ padding: "22px 28px 36px", display: "grid", gap: 18 }}>

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
            {/* ── TERAZ ── */}
            {activeTab === "teraz" && (
              <div style={{ display: "grid", gap: 18 }}>

                {/* summary box */}
                {snap.current_state && (
                  <div style={{ background: "rgba(80,120,180,0.08)", border: "1px solid rgba(80,120,180,0.22)",
                    borderLeft: "3px solid rgba(80,120,180,0.7)", borderRadius: 12, padding: "18px 20px" }}>
                    <div style={{ ...LABEL, marginBottom: 10 }}>Sytuacja bieżąca</div>
                    <p style={{ margin: 0, color: "#d6e8ff", fontSize: 15, lineHeight: 1.8 }}>
                      {snap.current_state}
                    </p>
                  </div>
                )}

                {/* last 7 days */}
                {(snap.latest_developments ?? []).length > 0 && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                      <div style={LABEL}>Ostatnie zdarzenia</div>
                      <span style={{ fontSize: 10, color: "#4a6a8c", fontWeight: 600,
                        background: "rgba(74,106,140,0.12)", borderRadius: 6, padding: "2px 8px", marginBottom: 8 }}>
                        ostatnie 7 dni
                      </span>
                    </div>
                    <div style={{ display: "grid", gap: 10 }}>
                      {(snap.latest_developments as ThreadDevelopment[]).map((dev, i) => (
                        <div key={i} style={CARD}>
                          <span style={{ color: "#4a6a8c", fontSize: 11, fontWeight: 600,
                            background: "rgba(74,106,140,0.15)", borderRadius: 6, padding: "2px 8px" }}>
                            {dev.date}
                          </span>
                          <div style={{ color: "#dce9ff", fontSize: 14, fontWeight: 700, margin: "8px 0 6px" }}>
                            {dev.title}
                          </div>
                          <p style={{ margin: 0, color: "#9fb6d8", fontSize: 13, lineHeight: 1.65 }}>{dev.body}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── GENEZA ── */}
            {activeTab === "geneza" && (
              <div style={{ display: "grid", gap: 20 }}>
                {snap.background_sections ? (
                  <>
                    {snap.background_sections.origins && (
                      <SectionBlock
                        title="Korzenie konfliktu"
                        text={snap.background_sections.origins}
                        accent="rgba(74,106,180,0.5)"
                      />
                    )}
                    {snap.background_sections.structural_causes && (
                      <SectionBlock
                        title="Przyczyny strukturalne"
                        text={snap.background_sections.structural_causes}
                        accent="rgba(212,168,48,0.5)"
                      />
                    )}
                    {snap.background_sections.trigger && (
                      <SectionBlock
                        title="Bezpośredni trigger eskalacji"
                        text={snap.background_sections.trigger}
                        accent="rgba(224,96,96,0.5)"
                      />
                    )}
                  </>
                ) : snap.background ? (
                  <div style={CARD}>
                    <p style={{ margin: 0, color: "#c6d8f4", fontSize: 14, lineHeight: 1.8 }}>{snap.background}</p>
                  </div>
                ) : (
                  <div style={{ color: "#5a7a9c", fontSize: 14 }}>Brak danych o genezie.</div>
                )}
              </div>
            )}

            {/* ── HISTORIA KONFLIKTU ── */}
            {activeTab === "os_czasu" && (
              <div>
                {(snap.timeline ?? []).length === 0
                  ? <div style={{ color: "#5a7a9c", fontSize: 14 }}>Brak historii konfliktu.</div>
                  : (
                    <div style={{ paddingLeft: 8 }}>
                      {snap.timeline!.map((ev, i) => {
                        const sigCol = ev.significance === "wysokie" ? "#e06060"
                          : ev.significance === "srednie" ? "#d4a830" : "#4a6a8c";
                        const isLast = i === snap.timeline!.length - 1;
                        return (
                          <div key={i} style={{ display: "grid", gridTemplateColumns: "14px 110px 1fr",
                            gap: "0 14px", paddingBottom: isLast ? 0 : 22 }}>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 4 }}>
                              <div style={{ width: 11, height: 11, borderRadius: "50%", background: sigCol,
                                flexShrink: 0, boxShadow: `0 0 6px ${sigCol}66` }} />
                              {!isLast && <div style={{ flex: 1, width: 2, background: "rgba(186,205,231,0.1)", marginTop: 5 }} />}
                            </div>
                            <div style={{ color: "#5a7a9c", fontSize: 12, paddingTop: 2 }}>{ev.date}</div>
                            <div>
                              <div style={{ color: "#c6d8f4", fontSize: 13, fontWeight: 600, lineHeight: 1.5 }}>{ev.event}</div>
                              {ev.detail && (
                                <div style={{ color: "#7a9abc", fontSize: 12, marginTop: 5, lineHeight: 1.65 }}>
                                  {ev.detail}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                }
              </div>
            )}

            {/* ── KLUCZOWI GRACZE ── */}
            {activeTab === "aktorzy" && (
              <div>
                {(snap.key_actors ?? []).length === 0
                  ? <div style={{ color: "#5a7a9c", fontSize: 14 }}>Brak danych o kluczowych graczach.</div>
                  : (
                    <div style={{ display: "grid", gap: 8 }}>
                      {snap.key_actors!.map((actor, i) => (
                        <div key={i} style={{ ...CARD, display: "grid",
                          gridTemplateColumns: "190px 1fr", gap: 16, padding: "14px 18px" }}>
                          <div>
                            <div style={{ color: "#dce9ff", fontSize: 14, fontWeight: 700 }}>{actor.name}</div>
                            <div style={{ color: "#4a7aac", fontSize: 11, fontWeight: 600, marginTop: 4,
                              background: "rgba(74,122,172,0.12)", borderRadius: 6,
                              padding: "2px 8px", display: "inline-block" }}>
                              {actor.role}
                            </div>
                          </div>
                          <div style={{ color: "#9fb6d8", fontSize: 13, lineHeight: 1.65, paddingTop: 2 }}>
                            {actor.position}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                }
              </div>
            )}

            {/* ── SCENARIUSZE ── */}
            {activeTab === "scenariusze" && (
              <div style={{ display: "grid", gap: 16 }}>
                {(snap.scenarios ?? []).length === 0 && (
                  <div style={{ color: "#5a7a9c", fontSize: 14 }}>Brak scenariuszy.</div>
                )}
                {(snap.scenarios as ThreadScenario[]).map((sc, i) => {
                  const sectors = sc.sector_impacts ?? [];
                  return (
                    <div key={i} style={{ ...CARD, display: "grid", gap: 14 }}>

                      {/* header row */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ color: "#dce9ff", fontSize: 15, fontWeight: 700 }}>{sc.name}</span>
                        <ProbBadge prob={sc.probability} />
                        <HorizonBadge horizon={sc.horizon} />
                      </div>

                      {/* probability rationale — CoT reasoning */}
                      {sc.probability_rationale && (
                        <div style={{ background: "rgba(74,106,140,0.08)", borderRadius: 8,
                          padding: "10px 14px", borderLeft: "3px solid rgba(74,106,140,0.35)" }}>
                          <div style={{ ...LABEL, color: "#5a7a9c" }}>Uzasadnienie oceny</div>
                          <p style={{ margin: 0, color: "#7a9abc", fontSize: 12, lineHeight: 1.7, fontStyle: "italic" }}>
                            {sc.probability_rationale}
                          </p>
                        </div>
                      )}

                      {/* trigger */}
                      <div style={{ background: "rgba(74,106,140,0.1)", borderRadius: 8, padding: "10px 14px" }}>
                        <div style={LABEL}>Trigger</div>
                        <p style={{ margin: 0, color: "#9fb6d8", fontSize: 13, lineHeight: 1.65 }}>{sc.trigger}</p>
                      </div>

                      {/* outcome */}
                      {sc.outcome && (
                        <div style={{ background: "rgba(80,120,180,0.07)", borderRadius: 8, padding: "10px 14px",
                          borderLeft: "3px solid rgba(80,120,180,0.4)" }}>
                          <div style={LABEL}>Konsekwencje</div>
                          <p style={{ margin: 0, color: "#c6d8f4", fontSize: 13, lineHeight: 1.65 }}>{sc.outcome}</p>
                        </div>
                      )}

                      {/* signal to watch */}
                      {sc.signal && (
                        <div style={{ background: "rgba(212,168,48,0.06)", borderRadius: 8, padding: "10px 14px",
                          borderLeft: "3px solid rgba(212,168,48,0.4)" }}>
                          <div style={{ ...LABEL, color: "#d4a830" }}>Co obserwować</div>
                          <p style={{ margin: 0, color: "#c8aa60", fontSize: 13, lineHeight: 1.65 }}>{sc.signal}</p>
                        </div>
                      )}

                      {/* sector impacts */}
                      {sectors.length > 0 && (
                        <div>
                          <div style={LABEL}>Wpływ na sektory</div>
                          <SectorGrid items={sectors} />
                        </div>
                      )}
                      {sectors.length === 0 && sc.market_impact && (
                        <div>
                          <div style={LABEL}>Wpływ rynkowy</div>
                          <p style={{ margin: 0, color: "#9fb6d8", fontSize: 13 }}>{sc.market_impact}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── RYNKI ── */}
            {activeTab === "rynki" && (
              <div style={{ display: "grid", gap: 20 }}>

                {/* info chip */}
                <div style={{ display: "flex", alignItems: "center", gap: 8,
                  background: "rgba(74,106,140,0.1)", borderRadius: 8, padding: "8px 14px" }}>
                  <span style={{ fontSize: 13 }}>📊</span>
                  <span style={{ color: "#5a7a9c", fontSize: 12, lineHeight: 1.5 }}>
                    Wpływ konfliktu na poszczególne rynki geograficzne i sektory —
                    <strong style={{ color: "#7a9abc" }}> nie prognoza cen aktywów</strong>,
                    lecz analiza mechanizmów transmisji geopolitycznej.
                  </span>
                </div>

                {snap.market_implications?.correlation_map && (
                  <div style={{ ...CARD, borderLeft: "3px solid rgba(186,205,231,0.35)" }}>
                    <div style={LABEL}>Mechanizm transmisji</div>
                    <p style={{ margin: 0, color: "#c6d8f4", fontSize: 14, lineHeight: 1.8, fontStyle: "italic" }}>
                      {snap.market_implications.correlation_map}
                    </p>
                  </div>
                )}

                {(() => {
                  const sectors = snap.market_implications?.sector_impacts ?? [];
                  const legacy = (snap.market_implications?.assets ?? []).map((a) => ({
                    sector: a.asset,
                    direction: (a.direction ?? "mixed") as "up" | "down" | "mixed",
                    why: a.why,
                  }));
                  const all = sectors.length > 0 ? sectors : legacy;
                  if (!all.length) return null;
                  return (
                    <div>
                      <div style={LABEL}>Wpływ na rynki i sektory</div>
                      <SectorGrid items={all} />
                    </div>
                  );
                })()}
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}
