"use client";

import { useState } from "react";

import type { BriefResponse } from "../lib/types";

type BriefResultProps = {
  result: BriefResponse;
};

type BriefItem = {
  title: string;
  body: string;
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
  mode: "standard" | "extended";
  items: BriefItem[];
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
    }))
    .filter((item) => item.title && item.body)
    .slice(0, max);

  const normalizedItems = items.length >= min ? items : fallbackItems(result, mode).slice(0, min);

  return {
    kind: "items",
    headline: String(raw.headline || "Brief geopolityczny").trim(),
    mode,
    items: normalizedItems,
  };
}

export default function BriefResult({ result }: BriefResultProps) {
  const [showSources, setShowSources] = useState(false);
  const summary = normalizeSummary(result.summary, result);
  const isQuick = summary.kind === "quick";

  return (
    <section
      style={{
        padding: 30,
        borderRadius: 20,
        border: "1px solid rgba(186, 205, 231, 0.22)",
        background: "linear-gradient(180deg, rgba(19,28,40,0.97), rgba(10,16,25,0.97))",
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: 26 }}>
        {summary.kind === "quick" ? (
          <>
            <h2 style={{ margin: 0, color: "#e5f0ff", fontSize: 30 }}>Podsumowanie</h2>
            <p style={{ margin: 0, color: "#d6e6ff", fontSize: 18, lineHeight: 1.7 }}>
              {summary.invalid
                ? "Nie udalo sie wygenerowac poprawnego podsumowania. Sprobuj zawezic pytanie lub profil."
                : summary.summary}
            </p>
          </>
        ) : (
          <>
            <h2 style={{ margin: 0, color: "#e5f0ff", fontSize: 30 }}>{summary.headline || "Brief geopolityczny"}</h2>
            <div style={{ display: "grid", gap: 24 }}>
              {summary.items.map((item, index) => (
                <div key={`${item.title}-${index}`} style={{ display: "grid", gap: 10 }}>
                  <h3 style={{ margin: 0, color: "#dcecff", fontSize: 27, lineHeight: 1.25 }}>{item.title}</h3>
                  <p style={{ margin: 0, color: "#d6e6ff", fontSize: 18, lineHeight: 1.7 }}>{item.body}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {!isQuick ? (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => setShowSources((value) => !value)}
              style={{
                padding: "10px 14px",
                borderRadius: 999,
                border: "1px solid rgba(161, 187, 224, 0.36)",
                backgroundColor: "rgba(27, 39, 56, 0.9)",
                color: "#d7e6ff",
                cursor: "pointer",
              }}
            >
              {showSources ? "Ukryj zrodla" : "Pokaz zrodla"}
            </button>
          </div>
        ) : null}

        {!isQuick && showSources ? (
          <div style={{ display: "grid", gap: 10 }}>
            {result.sources.map((source) => (
              <article key={`${source.id}-${source.url ?? "brak-url"}`} style={{ borderBottom: "1px solid rgba(157, 183, 216, 0.16)", paddingBottom: 10 }}>
                <div style={{ color: "#dce9ff", fontSize: 17 }}>{source.title}</div>
                <div style={{ color: "#9fb6d8", fontSize: 14 }}>
                  {(source.provider || "Nieznane zrodlo")} | {source.published_at || "Brak czasu publikacji"}
                </div>
                {source.url ? (
                  <a href={source.url} target="_blank" rel="noreferrer" style={{ color: "#8ab4f0", fontWeight: 700 }}>
                    Otworz zrodlo
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
