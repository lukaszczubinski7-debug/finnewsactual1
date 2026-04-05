"use client";

import { useCallback, useEffect, useState } from "react";
import { getPreGeneratedBriefs } from "../lib/api";
import type { BriefContext, BriefResponse, PreGeneratedBriefEntry } from "../lib/types";
import BriefResult from "./BriefResult";

type BriefConfig = {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  context: BriefContext;
};

const BRIEF_CONFIGS: BriefConfig[] = [
  { id: "tech", icon: "💻", title: "Technologia", subtitle: "Nowe produkty, startupy, hardware, software, funding", context: "Technologia" },
  { id: "macro", icon: "📊", title: "Makro", subtitle: "Dane instytucji, banki centralne, stopy, inflacja", context: "Makro" },
  { id: "geopolitical", icon: "🌍", title: "Geopolityka", subtitle: "Konflikty, sankcje, bezpieczenstwo, think tanki", context: "Geopolityka" },
];

function timeAgo(isoDate: string | null): string {
  if (!isoDate) return "";
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "przed chwila";
  if (mins < 60) return `${mins} min temu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h temu`;
  return `${Math.floor(hours / 24)}d temu`;
}

type Props = {
  onGenerate: (id: string, context: BriefContext) => void;
  loadingId: string | null;
  disabled: boolean;
  isMobile?: boolean;
};

export default function StructuredBriefsPanel({ onGenerate, loadingId, disabled, isMobile }: Props) {
  const [briefs, setBriefs] = useState<Map<string, PreGeneratedBriefEntry>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>("tech");

  const fetchBriefs = useCallback(async () => {
    try {
      const resp = await getPreGeneratedBriefs();
      const map = new Map<string, PreGeneratedBriefEntry>();
      for (const entry of resp.briefs) {
        map.set(entry.context, entry);
      }
      setBriefs(map);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchBriefs(); }, [fetchBriefs]);

  useEffect(() => {
    const interval = setInterval(() => void fetchBriefs(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchBriefs]);

  // Find the selected brief's data
  const selectedCfg = BRIEF_CONFIGS.find((c) => c.id === selectedId);
  const selectedEntry = selectedCfg ? briefs.get(selectedCfg.context) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <span style={{
        fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase",
        color: "rgba(100,140,190,0.4)",
      }}>
        Briefy strukturalne
        {loading && " — ladowanie..."}
      </span>

      {/* Brief selector cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
        gap: isMobile ? 6 : 8,
      }}>
        {BRIEF_CONFIGS.map((cfg) => {
          const entry = briefs.get(cfg.context);
          const hasBrief = !!entry?.brief;
          const isSelected = selectedId === cfg.id;
          const isThisLoading = loadingId === cfg.id;
          const isAnyLoading = loadingId !== null || disabled;
          const ago = entry?.generated_at ? timeAgo(entry.generated_at) : null;

          return (
            <button
              key={cfg.id}
              onClick={() => setSelectedId(cfg.id)}
              disabled={false}
              style={{
                display: "flex", flexDirection: "column", alignItems: "flex-start",
                gap: 5, padding: "12px 14px", minWidth: 0, overflow: "hidden",
                background: isSelected
                  ? "rgba(36,58,100,0.6)"
                  : "rgba(18,28,48,0.7)",
                border: isSelected
                  ? "1px solid rgba(80,130,210,0.5)"
                  : "1px solid rgba(50,100,160,0.2)",
                borderRadius: 10,
                cursor: "pointer",
                opacity: 1,
                transition: "all 0.15s", textAlign: "left", width: "100%", boxSizing: "border-box",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
                <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{cfg.icon}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: isSelected ? "#90c4f8" : "#c0d8f8",
                  letterSpacing: "0.02em", lineHeight: 1.3, flex: 1,
                }}>
                  {cfg.title}
                </span>
                {hasBrief && (
                  <span style={{
                    fontSize: 8, padding: "2px 7px", borderRadius: 8,
                    background: isSelected ? "rgba(60,130,210,0.3)" : "rgba(50,130,80,0.3)",
                    color: isSelected ? "#90c4f8" : "#60c080",
                    fontWeight: 600, flexShrink: 0,
                  }}>
                    {isSelected ? "WYBRANY" : "GOTOWY"}
                  </span>
                )}
              </div>

              <div style={{
                fontSize: 10, color: "rgba(100,140,185,0.5)", lineHeight: 1.4,
                paddingLeft: 26,
              }}>
                {cfg.subtitle}
              </div>

              {ago && (
                <div style={{
                  paddingLeft: 26, fontSize: 9, color: "rgba(90,130,190,0.5)", marginTop: 2,
                }}>
                  {ago}
                </div>
              )}
              {!hasBrief && loading && (
                <div style={{
                  paddingLeft: 26, fontSize: 9, color: "rgba(90,130,190,0.4)", marginTop: 2,
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  <span style={{ display: "inline-flex", gap: 2 }}>
                    {[0,1,2].map(i => <span key={i} style={{ width: 3, height: 3, borderRadius: "50%", background: "#5a80b0", animation: `briefPulse 1.2s ease-in-out ${i*0.2}s infinite` }} />)}
                  </span>
                  <style>{`@keyframes briefPulse{0%,80%,100%{opacity:0.2}40%{opacity:1}}`}</style>
                  Ladowanie...
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Full-width brief display below cards */}
      {selectedEntry?.brief && (
        <BriefResult result={selectedEntry.brief} />
      )}
    </div>
  );
}
