"use client";

import type { BriefContext } from "../lib/types";

type StructuredBriefConfig = {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  context: BriefContext;
};

const STRUCTURED_BRIEFS: StructuredBriefConfig[] = [
  {
    id: "geopolitical",
    icon: "🌍",
    title: "Sytuacja geopolityczna",
    subtitle: "Zdarzenia polityczne i militarne na świecie",
    context: "Geopolityka",
  },
  {
    id: "macro",
    icon: "📊",
    title: "Brief makroekonomiczny",
    subtitle: "Rynki, banki centralne, stopy procentowe",
    context: "Makro",
  },
  {
    id: "tech",
    icon: "💻",
    title: "Newsy technologiczne",
    subtitle: "AI, big tech, startupy, regulacje cyfrowe",
    context: "Technologia",
  },
];

type Props = {
  onGenerate: (id: string, context: BriefContext) => void;
  loadingId: string | null;
  disabled: boolean;
};

function Dots() {
  return (
    <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: "#7aacf0",
            display: "inline-block",
            animation: "briefPulse 1.2s ease-in-out infinite",
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes briefPulse {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.85); }
          40% { opacity: 1; transform: scale(1.15); }
        }
      `}</style>
    </span>
  );
}

export default function StructuredBriefsPanel({ onGenerate, loadingId, disabled }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <span
        style={{
          fontSize: 9,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "rgba(100,140,190,0.4)",
        }}
      >
        Briefy strukturalne
      </span>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 8,
        }}
      >
        {STRUCTURED_BRIEFS.map((brief) => {
          const isThisLoading = loadingId === brief.id;
          const isAnyLoading = loadingId !== null || disabled;

          return (
            <button
              key={brief.id}
              onClick={() => !isAnyLoading && onGenerate(brief.id, brief.context)}
              disabled={isAnyLoading}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 5,
                padding: "12px 14px",
                minWidth: 0,
                overflow: "hidden",
                background: isThisLoading
                  ? "rgba(36,58,100,0.55)"
                  : "rgba(12,20,36,0.6)",
                border: isThisLoading
                  ? "1px solid rgba(80,130,210,0.5)"
                  : "1px solid rgba(50,80,130,0.25)",
                borderRadius: 10,
                cursor: isAnyLoading ? "not-allowed" : "pointer",
                opacity: isAnyLoading && !isThisLoading ? 0.4 : 1,
                transition: "border-color 0.15s, background 0.15s, opacity 0.15s",
                textAlign: "left",
                width: "100%",
                boxSizing: "border-box",
              }}
              onMouseEnter={(e) => {
                if (!isAnyLoading) {
                  e.currentTarget.style.borderColor = "rgba(80,130,200,0.5)";
                  e.currentTarget.style.background = "rgba(20,34,60,0.75)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isAnyLoading && !isThisLoading) {
                  e.currentTarget.style.borderColor = "rgba(50,80,130,0.25)";
                  e.currentTarget.style.background = "rgba(12,20,36,0.6)";
                }
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, width: "100%", minWidth: 0 }}>
                <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>{brief.icon}</span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: isThisLoading ? "#90c4f8" : "#c0d8f8",
                    letterSpacing: "0.02em",
                    lineHeight: 1.3,
                    wordBreak: "break-word",
                    overflowWrap: "break-word",
                    minWidth: 0,
                  }}
                >
                  {brief.title}
                </span>
              </div>

              <span
                style={{
                  fontSize: 10,
                  color: "rgba(100,140,185,0.5)",
                  lineHeight: 1.4,
                  paddingLeft: 26,
                  wordBreak: "break-word",
                  overflowWrap: "break-word",
                  width: "100%",
                  boxSizing: "border-box",
                }}
              >
                {brief.subtitle}
              </span>

              <div
                style={{
                  marginTop: 4,
                  paddingLeft: 28,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  color: isThisLoading ? "#7aacf0" : "rgba(90,130,190,0.7)",
                  textTransform: "uppercase",
                }}
              >
                {isThisLoading ? (
                  <>
                    <Dots />
                    <span>Generowanie…</span>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 9 }}>▶</span>
                    <span>Generuj</span>
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
