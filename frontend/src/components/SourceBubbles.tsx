"use client";

import { useState, useRef, useEffect } from "react";

export type SourceBubbleItem = {
  title: string;
  url?: string | null;
  provider?: string | null;
};

const PALETTES = [
  { bg: "rgba(15,50,100,0.9)", border: "#2a7ad0", text: "#90c8ff" },
  { bg: "rgba(15,65,35,0.9)", border: "#2a9050", text: "#70d090" },
  { bg: "rgba(70,20,100,0.9)", border: "#9030d0", text: "#c880ff" },
  { bg: "rgba(90,35,10,0.9)", border: "#c05020", text: "#ff9060" },
  { bg: "rgba(10,55,75,0.9)", border: "#1a90b0", text: "#60d0f0" },
  { bg: "rgba(55,65,10,0.9)", border: "#7a9020", text: "#c0d840" },
  { bg: "rgba(80,20,40,0.9)", border: "#c02060", text: "#ff70a0" },
  { bg: "rgba(20,55,55,0.9)", border: "#2a9090", text: "#60e0e0" },
];

function palette(str: string) {
  let hash = 0;
  for (const c of str || "?") hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return PALETTES[hash % PALETTES.length];
}

function initials(provider: string | null | undefined): string {
  if (!provider) return "?";
  const words = provider.trim().split(/[\s\-_.]+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return provider.slice(0, 2).toUpperCase();
}

type Props = {
  sources: SourceBubbleItem[];
  maxVisible?: number;
  label?: string;
};

export function SourceBubbles({ sources, maxVisible = 8, label }: Props) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenIdx(null);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  if (!sources || sources.length === 0) return null;

  const visible = sources.slice(0, maxVisible);
  const overflow = sources.length - maxVisible;

  return (
    <div
      ref={containerRef}
      style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}
    >
      {label && (
        <span style={{ fontSize: 9, color: "#1e3555", letterSpacing: "0.1em", textTransform: "uppercase", marginRight: 2 }}>
          {label}
        </span>
      )}

      {visible.map((s, i) => {
        const key = s.provider || s.title || "?";
        const p = palette(key);
        const isOpen = openIdx === i;

        return (
          <div key={i} style={{ position: "relative" }}>
            <button
              onClick={() => setOpenIdx(isOpen ? null : i)}
              title={s.provider || s.title}
              style={{
                width: 26, height: 26, borderRadius: "50%",
                background: isOpen ? p.border : p.bg,
                border: `1.5px solid ${p.border}`,
                color: isOpen ? "#fff" : p.text,
                fontSize: 8, fontWeight: 800,
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                letterSpacing: "0.03em",
                transition: "background 0.15s, color 0.15s",
                flexShrink: 0,
                padding: 0,
              }}
            >
              {initials(s.provider)}
            </button>

            {isOpen && (
              <div
                style={{
                  position: "absolute",
                  bottom: "calc(100% + 8px)",
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "rgba(6,12,24,0.98)",
                  border: `1px solid ${p.border}`,
                  borderRadius: 10,
                  padding: "10px 13px",
                  minWidth: 210,
                  maxWidth: 290,
                  boxShadow: `0 8px 32px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)`,
                  zIndex: 200,
                  pointerEvents: "auto",
                }}
              >
                {/* Triangle */}
                <div style={{
                  position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%)",
                  width: 10, height: 6, overflow: "hidden",
                }}>
                  <div style={{
                    width: 10, height: 10, background: p.border,
                    transform: "rotate(45deg)", transformOrigin: "center",
                    marginTop: -5, marginLeft: 0,
                  }} />
                </div>

                <div style={{ fontSize: 10, color: p.text, fontWeight: 700, marginBottom: 5 }}>
                  {s.provider || "Źródło"}
                </div>
                <div style={{ fontSize: 11, color: "#a0bcd8", lineHeight: 1.45, marginBottom: 8 }}>
                  {s.title}
                </div>
                {s.url ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 10, color: "#3a90e0", fontWeight: 700, textDecoration: "none" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#70b8ff")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#3a90e0")}
                  >
                    Otwórz źródło ↗
                  </a>
                ) : (
                  <span style={{ fontSize: 10, color: "#2a4060" }}>Brak URL</span>
                )}
              </div>
            )}
          </div>
        );
      })}

      {overflow > 0 && (
        <div
          style={{
            width: 26, height: 26, borderRadius: "50%",
            background: "rgba(20,30,50,0.7)",
            border: "1.5px solid rgba(60,100,160,0.25)",
            color: "#3a6090", fontSize: 8, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
