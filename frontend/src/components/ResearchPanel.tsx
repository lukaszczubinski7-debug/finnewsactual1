"use client";

import type { ReactNode } from "react";
import type { ResearchResponse } from "../lib/types";

// ── Tool label map ─────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  search_web: "🔍 Web",
  get_market_data: "📈 Rynek",
  get_youtube_transcript: "▶ YouTube",
  fetch_webpage: "🌐 Strona",
};

// ── Pulsing dots ───────────────────────────────────────────────────────────

function Dots() {
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            display: "inline-block", width: 5, height: 5, borderRadius: "50%",
            background: "#3a6090",
            animation: `rspulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
      <style>{`@keyframes rspulse{0%,80%,100%{opacity:0.2}40%{opacity:1}}`}</style>
    </span>
  );
}

// ── Report renderer ────────────────────────────────────────────────────────

function ReportText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div style={{ fontSize: 13, lineHeight: 1.7, color: "#b0cce8" }}>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} style={{ height: 8 }} />;
        // Bold headers (## or **text**)
        if (trimmed.startsWith("## ")) {
          return (
            <div key={i} style={{ fontWeight: 700, color: "#d0e8ff", fontSize: 14, marginTop: 14, marginBottom: 4 }}>
              {trimmed.slice(3)}
            </div>
          );
        }
        if (trimmed.startsWith("# ")) {
          return (
            <div key={i} style={{ fontWeight: 700, color: "#e0f0ff", fontSize: 15, marginTop: 16, marginBottom: 6 }}>
              {trimmed.slice(2)}
            </div>
          );
        }
        // Bullet points
        if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
          return (
            <div key={i} style={{ paddingLeft: 16, marginBottom: 3 }}>
              <span style={{ color: "#3a6090", marginRight: 6 }}>•</span>
              <span>{renderBold(trimmed.slice(2))}</span>
            </div>
          );
        }
        if (/^\d+\.\s/.test(trimmed)) {
          const rest = trimmed.replace(/^\d+\.\s/, "");
          return (
            <div key={i} style={{ paddingLeft: 16, marginBottom: 3 }}>
              <span style={{ color: "#3a6090", marginRight: 6, fontWeight: 700 }}>
                {trimmed.match(/^\d+/)![0]}.
              </span>
              <span>{renderBold(rest)}</span>
            </div>
          );
        }
        return (
          <div key={i} style={{ marginBottom: 4 }}>
            {renderBold(trimmed)}
          </div>
        );
      })}
    </div>
  );
}

function renderBold(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} style={{ color: "#c0d8f4" }}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  query: string;
  loading: boolean;
  result: ResearchResponse | null;
  error: string | null;
  onQueryChange: (val: string) => void;
  onSubmit: (overrideQuery?: string) => void;
  onClear: () => void;
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function ResearchPanel({
  query, loading, result, error, onQueryChange, onSubmit, onClear,
}: Props) {
  const canSubmit = query.trim().length > 0 && !loading;

  return (
    <div>
      {/* Input area */}
      <div style={{ marginBottom: 16 }}>
        <textarea
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              if (canSubmit) onSubmit();
            }
          }}
          placeholder="Opisz co chcesz zbadać... np. 'Jak wygląda sytuacja rynkowa BTC w tym tygodniu?' albo 'Podsumuj sytuację geopolityczną na Bliskim Wschodzie'"
          rows={3}
          style={{
            width: "100%", padding: "11px 14px",
            background: "rgba(8,14,26,0.8)",
            border: "1px solid rgba(60,100,160,0.3)",
            borderRadius: 9, color: "#c0d8f4", fontSize: 13,
            outline: "none", resize: "vertical",
            fontFamily: "inherit", lineHeight: 1.5,
            boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => onSubmit()}
            disabled={!canSubmit}
            style={{
              padding: "8px 18px", borderRadius: 7,
              background: canSubmit ? "rgba(40,70,140,0.7)" : "rgba(15,28,50,0.4)",
              border: `1px solid ${canSubmit ? "rgba(70,120,210,0.5)" : "rgba(30,50,90,0.3)"}`,
              color: canSubmit ? "#a0c8f0" : "#1e3050",
              cursor: canSubmit ? "pointer" : "not-allowed",
              fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
            }}
          >
            {loading ? "Analizuję..." : "▶ Generuj raport"}
          </button>

          <button
            onClick={() => {
              onQueryChange("");
              onSubmit("");
            }}
            disabled={loading}
            title="Generuj brief na podstawie Twojego profilu"
            style={{
              padding: "8px 14px", borderRadius: 7,
              background: loading ? "rgba(15,28,50,0.4)" : "rgba(30,60,120,0.5)",
              border: "1px solid rgba(70,120,200,0.35)",
              color: loading ? "#1e3050" : "#90c0f0",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
            }}
          >
            ⚡ Aktualna sytuacja
          </button>

          {(result || error) && !loading && (
            <button
              onClick={onClear}
              style={{
                padding: "8px 12px", borderRadius: 7,
                background: "transparent",
                border: "1px solid rgba(60,90,140,0.3)",
                color: "#4a6890", cursor: "pointer", fontSize: 11,
                marginLeft: "auto",
              }}
            >
              ✕ Wyczyść
            </button>
          )}

          <span style={{ fontSize: 10, color: "#1e3555", marginLeft: 4 }}>
            Ctrl+Enter
          </span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          color: "#f87171", fontSize: 12, marginBottom: 14,
          padding: "10px 14px", background: "rgba(90,20,20,0.25)",
          borderRadius: 8, border: "1px solid rgba(248,113,113,0.2)",
        }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{
          padding: "20px", textAlign: "center",
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(100,140,200,0.08)",
          borderRadius: 10, marginBottom: 14,
        }}>
          <Dots />
          <div style={{ marginTop: 10, fontSize: 11, color: "#2a4870" }}>
            Analizuję zapytanie i dobieram narzędzia...
          </div>
        </div>
      )}

      {/* Result */}
      {result && !loading && (
        <div style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(100,140,200,0.1)",
          borderRadius: 10, overflow: "hidden",
        }}>
          {/* Tools used */}
          {result.tools_used.length > 0 && (
            <div style={{
              padding: "8px 14px",
              borderBottom: "1px solid rgba(100,140,200,0.07)",
              display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center",
            }}>
              <span style={{ fontSize: 9, color: "#1e3555", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Użyte narzędzia:
              </span>
              {result.tools_used.map((t) => (
                <span
                  key={t}
                  style={{
                    fontSize: 10, padding: "2px 7px",
                    background: "rgba(40,70,120,0.4)",
                    border: "1px solid rgba(70,110,180,0.2)",
                    borderRadius: 4, color: "#6090c0",
                  }}
                >
                  {TOOL_LABELS[t] ?? t}
                </span>
              ))}
            </div>
          )}

          {/* Report */}
          <div style={{ padding: "16px 18px" }}>
            <ReportText text={result.report} />
          </div>

          {/* Sources */}
          {result.sources.length > 0 && (
            <div style={{
              padding: "10px 14px",
              borderTop: "1px solid rgba(100,140,200,0.07)",
            }}>
              <div style={{ fontSize: 9, color: "#1e3555", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                Źródła
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {result.sources.map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                    <span style={{ fontSize: 9, color: "#1e3555", flexShrink: 0 }}>{i + 1}.</span>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 11, color: "#3a6090", textDecoration: "none" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#6090c0")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#3a6090")}
                    >
                      {s.title}
                    </a>
                    {s.provider && (
                      <span style={{ fontSize: 9, color: "#1e3555" }}>— {s.provider}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
