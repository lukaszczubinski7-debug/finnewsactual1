"use client";

import { useState } from "react";

import type { BriefResponse } from "../lib/types";
import { SourceBubbles } from "./SourceBubbles";

type BriefResultProps = {
  result: BriefResponse;
  compact?: boolean;
};

type BriefItem = {
  title: string;
  body: string;
  source_tag?: "verified" | "official" | "media";
  source_name?: string;
};

type QuickSummaryShape = {
  kind: "quick";
  mode: "quick";
  summary: string;
  invalid: boolean;
};

type ItemsSummaryShape = {
  kind: "items";
  headline: string;
  key_takeaway?: string;
  mode: "standard" | "extended";
  items: BriefItem[];
  verified_sources_used?: string[];
};

type SummaryShape = QuickSummaryShape | ItemsSummaryShape;

function splitSentences(text: string): string[] {
  return String(text || "")
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isInterpretiveQuickSentence(sentence: string): boolean {
  const lowered = String(sentence || "").toLowerCase();
  const phrases = [
    "moze spowodowac",
    "moze wplynac",
    "to moze",
    "rynek moze",
    "inwestorzy moga",
    "wplyw na",
    "implikacj",
    "konsekwencj",
    "scenario",
    "scenariusz",
  ];
  if (phrases.some((phrase) => lowered.includes(phrase))) {
    return true;
  }
  return /\b(moze|moga|mogl\w*|prawdopodob\w*|potencjal\w*|powin\w*|suger\w*|spowod\w*|doprowadz\w*)\b/i.test(lowered);
}

function hasQuickMetaMarkers(text: string): boolean {
  const lowered = String(text || "").toLowerCase();
  const phrases = [
    "pytanie inwestycyjne",
    "w centrum uwagi",
    "horyzont decyzyjny",
    "zakres analizy",
    "priorytet",
    "profil uzytkownika",
    "wybrane regiony",
    "na podstawie preferencji",
    "podany temat",
    "fokus geopolityczny",
  ];
  if (phrases.some((phrase) => lowered.includes(phrase))) {
    return true;
  }
  return /(pytanie inwestycyjne|horyzont|profil|zakres analizy)\s*:/i.test(lowered);
}

function normalizeQuickSummary(text: string): string {
  const cleaned = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/^\s*[-*\u2022\d.)]+\s*/g, "")
    .replace(/^(teza|fakty|analiza|wplyw na rynki|scenariusze|co monitorowac|podsumowanie)\s*[:\-]\s*/i, "")
    .trim();

  const sentences = splitSentences(cleaned)
    .filter((sentence) => !isInterpretiveQuickSentence(sentence))
    .slice(0, 3);
  if (sentences.length === 0) {
    return "Brak wystarczajacych danych do wygenerowania podsumowania.";
  }
  return sentences.join(" ");
}

function normalizeBody(text: string): string {
  const cleaned = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/^\s*[-*\u2022\d.)]+\s*/g, "")
    .trim();
  const sentences = splitSentences(cleaned).slice(0, 3);
  return sentences.join(" ") || cleaned;
}

function normalizeMode(value: unknown, style: BriefResponse["style"]): "quick" | "standard" | "extended" {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "quick" || mode === "standard" || mode === "extended") {
    return mode;
  }
  if (style === "short") {
    return "quick";
  }
  if (style === "long") {
    return "extended";
  }
  return "standard";
}

function boundsForMode(mode: "standard" | "extended"): { min: number; max: number } {
  if (mode === "extended") {
    return { min: 4, max: 5 };
  }
  return { min: 3, max: 4 };
}

function fallbackQuickSummary(result: BriefResponse): string {
  const fromSources = result.sources
    .map((source) => String(source.title || "").trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");
  return normalizeQuickSummary(fromSources);
}

function fallbackItems(result: BriefResponse, mode: "standard" | "extended"): BriefItem[] {
  const geo = result.focus.geo_focus || "obserwowany region";
  const base: BriefItem[] = [
    {
      title: "Brak danych spelniajacych kryteria jakosciowe",
      body: `Zrodla wiadomosci dla regionu ${geo} nie zawieraly wystarczajacej liczby konkretow (nazwy wlasne, liczby, daty, miejsca). Brief nie zostal wygenerowany.`,
    },
    {
      title: "Sprobuj zawezic pytanie lub zmienic horyzont czasowy",
      body: "Mozesz zmienic zakres czasowy na 72h lub 168h, lub wpisac konkretny temat w polu pytania.",
    },
    {
      title: "Brak zrodel dla wybranego zakresu",
      body: "Dostepne zrodla nie zawieraly informacji pasujacych do wybranego kontekstu i regionu.",
    },
  ];

  const { min, max } = boundsForMode(mode);
  const target = mode === "extended" ? 5 : 4;
  return base.slice(0, Math.max(min, Math.min(max, target)));
}

function normalizeSummary(summary: unknown, result: BriefResponse): SummaryShape {
  const mode = normalizeMode(
    summary && typeof summary === "object" ? (summary as Record<string, unknown>).mode : undefined,
    result.style,
  );

  if (!summary || typeof summary !== "object") {
    if (mode === "quick") {
      return { kind: "quick", mode: "quick", summary: fallbackQuickSummary(result), invalid: false };
    }
    return {
      kind: "items",
      headline: "Brief geopolityczny",
      mode,
      items: fallbackItems(result, mode),
    };
  }

  const raw = summary as Record<string, unknown>;
  if (mode === "quick") {
    const fromSummary = typeof raw.summary === "string" ? raw.summary : "";
    if (fromSummary.trim()) {
      if (hasQuickMetaMarkers(fromSummary)) {
        return { kind: "quick", mode: "quick", summary: fromSummary, invalid: true };
      }
      return { kind: "quick", mode: "quick", summary: normalizeQuickSummary(fromSummary), invalid: false };
    }

    const fromItem = Array.isArray(raw.items)
      ? raw.items
          .filter((item) => item && typeof item === "object")
          .map((item) => String((item as Record<string, unknown>).body || "").trim())
          .find(Boolean) || ""
      : "";

    return {
      kind: "quick",
      mode: "quick",
      summary: normalizeQuickSummary(fromItem || fallbackQuickSummary(result)),
      invalid: false,
    };
  }

  const { min, max } = boundsForMode(mode);
  const rawItems = Array.isArray(raw.items)
    ? raw.items
    : Array.isArray(raw.blocks)
      ? raw.blocks
      : [];

  const items = rawItems
    .filter((item) => item && typeof item === "object")
    .map((item) => item as Record<string, unknown>)
    .map((item) => ({
      title: String(item.title || "").trim(),
      body: normalizeBody(String(item.body || "")),
      source_tag: (item.source_tag as BriefItem["source_tag"]) || undefined,
      source_name: item.source_name ? String(item.source_name) : undefined,
    }))
    .filter((item) => item.title && item.body)
    .slice(0, max);

  // Use real items even if below min count — real content > generic fallback
  const normalizedItems = items.length > 0 ? items : fallbackItems(result, mode).slice(0, min);

  const verifiedUsed = Array.isArray(raw.verified_sources_used)
    ? (raw.verified_sources_used as string[]).filter((s) => typeof s === "string" && s.trim())
    : [];

  return {
    kind: "items",
    headline: String(raw.headline || "Brief geopolityczny").trim(),
    key_takeaway: typeof raw.key_takeaway === "string" ? raw.key_takeaway.trim() : undefined,
    mode,
    items: normalizedItems,
    verified_sources_used: verifiedUsed.length > 0 ? verifiedUsed : undefined,
  };
}

export default function BriefResult({ result, compact }: BriefResultProps) {
  const [showSources, setShowSources] = useState(false);
  const summary = normalizeSummary(result.summary, result);
  const isQuick = summary.kind === "quick";

  const bubbleSources = result.sources.map((s) => ({
    title: s.title,
    url: s.url,
    provider: s.provider,
  }));

  // Font sizes based on compact mode
  const sz = compact
    ? { pad: 16, gap: 14, h2: 14, h3: 12, body: 12, lh: 1.6, takeaway: 11, srcTag: 8 }
    : { pad: 30, gap: 26, h2: 30, h3: 27, body: 18, lh: 1.7, takeaway: 16, srcTag: 9 };

  return (
    <section
      style={{
        padding: sz.pad,
        borderRadius: compact ? 0 : 20,
        border: compact ? "none" : "1px solid rgba(186, 205, 231, 0.22)",
        background: compact
          ? "rgba(14,22,36,0.95)"
          : "linear-gradient(180deg, rgba(19,28,40,0.97), rgba(10,16,25,0.97))",
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: sz.gap }}>
        {summary.kind === "quick" ? (
          <>
            <h2 style={{ margin: 0, color: "#e5f0ff", fontSize: sz.h2, fontWeight: 700 }}>Podsumowanie</h2>
            <p style={{ margin: 0, color: "#d6e6ff", fontSize: sz.body, lineHeight: sz.lh }}>
              {summary.invalid
                ? "Nie udalo sie wygenerowac poprawnego podsumowania. Sprobuj zawezic pytanie lub profil."
                : summary.summary}
            </p>
          </>
        ) : (
          <>
            <h2 style={{ margin: 0, color: "#e5f0ff", fontSize: sz.h2, fontWeight: 700 }}>{summary.headline || "Brief geopolityczny"}</h2>

            {/* Key takeaway */}
            {summary.key_takeaway && (
              <div style={{
                padding: compact ? "8px 12px" : "12px 16px", borderRadius: 8,
                background: "rgba(40,70,130,0.25)", border: "1px solid rgba(80,130,210,0.2)",
              }}>
                <span style={{ fontSize: compact ? 8 : 10, color: "#5a8ab8", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Kluczowy wniosek
                </span>
                <p style={{ margin: "4px 0 0", color: "#c8e0ff", fontSize: sz.takeaway, lineHeight: 1.5 }}>
                  {summary.key_takeaway}
                </p>
              </div>
            )}

            <div style={{ display: "grid", gap: compact ? 12 : 24 }}>
              {summary.items.map((item, index) => (
                <div key={`${item.title}-${index}`} style={{
                  display: "grid", gap: compact ? 4 : 10,
                  padding: compact ? "8px 10px" : 0,
                  background: compact ? "rgba(20,32,55,0.4)" : "transparent",
                  borderRadius: compact ? 8 : 0,
                  borderLeft: compact ? "3px solid rgba(80,130,210,0.3)" : "none",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <h3 style={{ margin: 0, color: "#dcecff", fontSize: sz.h3, lineHeight: 1.3, fontWeight: 700 }}>{item.title}</h3>
                    {item.source_tag && (
                      <span style={{
                        fontSize: sz.srcTag, padding: "2px 8px", borderRadius: 10, fontWeight: 700,
                        letterSpacing: "0.06em", textTransform: "uppercase", flexShrink: 0,
                        background: item.source_tag === "verified"
                          ? "rgba(40,120,70,0.35)" : item.source_tag === "official"
                          ? "rgba(50,90,160,0.35)" : "rgba(60,60,80,0.3)",
                        color: item.source_tag === "verified"
                          ? "#70c890" : item.source_tag === "official"
                          ? "#80b0e0" : "#7080a0",
                        border: `1px solid ${item.source_tag === "verified"
                          ? "rgba(80,180,120,0.3)" : item.source_tag === "official"
                          ? "rgba(100,150,220,0.3)" : "rgba(100,100,130,0.2)"}`,
                      }}>
                        {item.source_tag === "verified" ? "Zweryfikowane" : item.source_tag === "official" ? "Oficjalne" : "Media"}
                      </span>
                    )}
                  </div>
                  <p style={{ margin: 0, color: "#d6e6ff", fontSize: sz.body, lineHeight: sz.lh }}>{item.body}</p>
                  {item.source_name && (
                    <span style={{ fontSize: compact ? 9 : 11, color: "#4a7098", fontStyle: "italic" }}>
                      — {item.source_name}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Verified sources used */}
            {summary.verified_sources_used && summary.verified_sources_used.length > 0 && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                paddingTop: 12, borderTop: "1px solid rgba(60,100,60,0.15)",
              }}>
                <span style={{
                  fontSize: 9, color: "#3a6848", fontWeight: 700,
                  letterSpacing: "0.08em", textTransform: "uppercase", flexShrink: 0,
                }}>
                  Zweryfikowane zrodla
                </span>
                {summary.verified_sources_used.map((name) => (
                  <span key={name} style={{
                    fontSize: 10, padding: "3px 10px", borderRadius: 10,
                    background: "rgba(40,100,60,0.2)", color: "#70b880",
                    border: "1px solid rgba(60,140,80,0.2)",
                  }}>
                    {name}
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        {bubbleSources.length > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            paddingTop: 14,
            borderTop: "1px solid rgba(157, 183, 216, 0.1)",
            flexWrap: "wrap",
          }}>
            <span style={{ fontSize: 10, color: "#2a4560", letterSpacing: "0.08em", textTransform: "uppercase", flexShrink: 0 }}>
              Źródła
            </span>
            <SourceBubbles sources={bubbleSources} maxVisible={10} />
          </div>
        )}
      </div>
    </section>
  );
}
