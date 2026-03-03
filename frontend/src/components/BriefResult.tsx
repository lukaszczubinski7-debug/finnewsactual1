"use client";

import { useState } from "react";

import type {
  BriefResponse,
  LongSummary,
  MidSummary,
  MidTheme,
  ShortSummary,
} from "../lib/types";

type BriefResultProps = {
  result: BriefResponse;
};

function sortWatki(watki: MidTheme[]): MidTheme[] {
  const order = { wysoka: 0, srednia: 1, niska: 2 };
  return [...watki].sort((left, right) => order[left.waznosc] - order[right.waznosc]);
}

function styleLabel(style: BriefResponse["style"]): string {
  if (style === "short") {
    return "krotko";
  }
  if (style === "mid") {
    return "normalnie";
  }
  return "dlugo";
}

function formatSummaryForClipboard(result: BriefResponse): string {
  if (result.brief) {
    return result.brief;
  }

  if (result.style === "short") {
    const summary = result.summary as ShortSummary;
    return [
      summary.co_sie_stalo,
      summary.reakcja,
      summary.konsekwencja_rynkowa,
      summary.co_obserwowac,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (result.style === "mid") {
    const summary = result.summary as MidSummary;
    return [
      summary.tl_dr ? `TL;DR\n${summary.tl_dr}` : "",
      ...sortWatki(summary.watki).map(
        (watek) => `${watek.tytul} [${watek.waznosc}]\n${watek.tekst}`,
      ),
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  const summary = result.summary as LongSummary;
  return [
    ...summary.tematy.map(
      (temat) =>
        `${temat.tytul}\n${[
          temat.stan_obecny,
          temat.mechanizm_wplywu,
          temat.konsekwencje,
        ]
          .filter(Boolean)
          .join("\n")}`,
    ),
    summary.lancuch_przyczynowy.length
      ? `Lancuch przyczynowy\n${summary.lancuch_przyczynowy.join("\n")}`
      : "",
    summary.implikacje_rynkowe.length
      ? `Implikacje rynkowe\n${summary.implikacje_rynkowe
          .map((impact) => `${impact.obszar}: ${impact.mechanizm}`)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function renderShortSummary(summary: ShortSummary) {
  const rows = [
    { label: "Co sie stalo", value: summary.co_sie_stalo },
    { label: "Najwazniejsza reakcja", value: summary.reakcja },
    { label: "Bezposrednia konsekwencja rynkowa", value: summary.konsekwencja_rynkowa },
    { label: "Co obserwowac", value: summary.co_obserwowac },
  ];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {rows.map((row) => (
        <div key={row.label} style={{ padding: "14px 16px", borderRadius: 14, backgroundColor: "#f5f8fb" }}>
          <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: "#1b6782" }}>
            {row.label}
          </div>
          <div style={{ color: "#17324d", lineHeight: 1.6 }}>{row.value || "Brak danych."}</div>
        </div>
      ))}
    </div>
  );
}

function renderMidSummary(summary: MidSummary) {
  const watki = sortWatki(summary.watki);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {summary.tl_dr ? (
        <section style={{ padding: 16, borderRadius: 16, backgroundColor: "#eef5fb", border: "1px solid #dbe3ee" }}>
          <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: "#1b6782" }}>
            TL;DR
          </div>
          <div style={{ color: "#17324d", lineHeight: 1.6 }}>{summary.tl_dr}</div>
        </section>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 14,
        }}
      >
        {watki.map((watek) => (
          <article
            key={`${watek.waznosc}-${watek.tytul}`}
            style={{
              padding: 18,
              borderRadius: 16,
              border: "1px solid #dbe3ee",
              backgroundColor: "#fbfdff",
            }}
          >
            <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: "#1b6782" }}>
              Waznosc: {watek.waznosc}
            </div>
            <h3 style={{ margin: 0, fontSize: 18, color: "#10253f" }}>{watek.tytul}</h3>
            <p style={{ margin: "10px 0 0", color: "#29425c", lineHeight: 1.7 }}>{watek.tekst}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function renderLongSummary(summary: LongSummary) {
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section>
        <h3 style={{ margin: "0 0 10px", fontSize: 18, color: "#10253f" }}>Tematy</h3>
        <div style={{ display: "grid", gap: 12 }}>
          {summary.tematy.length ? (
            summary.tematy.map((temat) => (
              <article key={temat.tytul} style={{ padding: 16, borderRadius: 16, backgroundColor: "#f5f8fb" }}>
                <h4 style={{ margin: 0, fontSize: 16, color: "#17324d" }}>{temat.tytul}</h4>
                <p style={{ margin: "10px 0 0", color: "#29425c" }}>{temat.stan_obecny || "Brak danych."}</p>
                {temat.mechanizm_wplywu ? (
                  <p style={{ margin: "8px 0 0", color: "#29425c" }}>{temat.mechanizm_wplywu}</p>
                ) : null}
                {temat.konsekwencje ? (
                  <p style={{ margin: "8px 0 0", color: "#29425c" }}>{temat.konsekwencje}</p>
                ) : null}
                {temat.ryzyka.length ? (
                  <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "#29425c" }}>
                    {temat.ryzyka.map((ryzyko) => (
                      <li key={ryzyko}>{ryzyko}</li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))
          ) : (
            <div style={{ color: "#62758a" }}>Brak danych.</div>
          )}
        </div>
      </section>

      <section>
        <h3 style={{ margin: "0 0 10px", fontSize: 18, color: "#10253f" }}>Lancuch przyczynowy</h3>
        {summary.lancuch_przyczynowy.length ? (
          <ul style={{ margin: 0, paddingLeft: 18, color: "#29425c" }}>
            {summary.lancuch_przyczynowy.map((chain) => (
              <li key={chain}>{chain}</li>
            ))}
          </ul>
        ) : (
          <div style={{ color: "#62758a" }}>Brak danych.</div>
        )}
      </section>

      <section>
        <h3 style={{ margin: "0 0 10px", fontSize: 18, color: "#10253f" }}>Implikacje rynkowe</h3>
        {summary.implikacje_rynkowe.length ? (
          <div style={{ display: "grid", gap: 10 }}>
            {summary.implikacje_rynkowe.map((impact) => (
              <article key={impact.obszar} style={{ padding: 14, borderRadius: 14, backgroundColor: "#f5f8fb" }}>
                <strong style={{ display: "block", marginBottom: 6, color: "#17324d" }}>{impact.obszar}</strong>
                <span style={{ color: "#29425c" }}>{impact.mechanizm}</span>
              </article>
            ))}
          </div>
        ) : (
          <div style={{ color: "#62758a" }}>Brak danych.</div>
        )}
      </section>

      <section>
        <h3 style={{ margin: "0 0 10px", fontSize: 18, color: "#10253f" }}>Scenariusze</h3>
        {summary.scenariusze.length ? (
          <div style={{ display: "grid", gap: 10 }}>
            {summary.scenariusze.map((scenario) => (
              <article key={scenario.nazwa} style={{ padding: 14, borderRadius: 14, backgroundColor: "#f5f8fb" }}>
                <strong style={{ display: "block", marginBottom: 6, color: "#17324d" }}>{scenario.nazwa}</strong>
                <div style={{ color: "#29425c", lineHeight: 1.6 }}>
                  <div>{scenario.trigger || "Brak triggera."}</div>
                  {scenario.mechanizm ? <div>{scenario.mechanizm}</div> : null}
                  {scenario.aktywa_wrazliwe.length ? (
                    <div>Obszary wrazliwe: {scenario.aktywa_wrazliwe.join(", ")}</div>
                  ) : null}
                  {scenario.horyzont ? <div>Horyzont: {scenario.horyzont}</div> : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div style={{ color: "#62758a" }}>Brak danych.</div>
        )}
      </section>
    </div>
  );
}

export default function BriefResult({ result }: BriefResultProps) {
  const [showRawJson, setShowRawJson] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [copyLabel, setCopyLabel] = useState("Kopiuj podsumowanie");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatSummaryForClipboard(result));
      setCopyLabel("Skopiowano");
      window.setTimeout(() => setCopyLabel("Kopiuj podsumowanie"), 1500);
    } catch {
      setCopyLabel("Blad kopiowania");
      window.setTimeout(() => setCopyLabel("Kopiuj podsumowanie"), 1500);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "podsumowanie-geopolityczne.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section
      style={{
        padding: 24,
        borderRadius: 20,
        border: "1px solid #d6dde8",
        backgroundColor: "#ffffff",
        boxShadow: "0 14px 40px rgba(16, 37, 63, 0.08)",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 12,
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 18,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 24, color: "#10253f" }}>Geopolityczne podsumowanie</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleCopy}
            style={{
              padding: "10px 14px",
              borderRadius: 999,
              border: "1px solid #c9d4e3",
              backgroundColor: "#f5f8fb",
              cursor: "pointer",
            }}
          >
            {copyLabel}
          </button>
          <button
            type="button"
            onClick={() => setShowSources((value) => !value)}
            style={{
              padding: "10px 14px",
              borderRadius: 999,
              border: "1px solid #c9d4e3",
              backgroundColor: "#f5f8fb",
              cursor: "pointer",
            }}
          >
            {showSources ? "Ukryj zrodla" : "Pokaz zrodla"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 18 }}>
        <div
          style={{
            padding: "14px 16px",
            borderRadius: 14,
            backgroundColor: "#f5f8fb",
            color: "#17324d",
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <strong>Kontekst: {result.context}</strong>
          <span>Okno: {result.window_hours}h</span>
          <span>Styl: {styleLabel(result.style)}</span>
          <span>Kontynenty: {result.continents.join(", ")}</span>
        </div>

        {result.focus.geo_focus || result.focus.custom_query ? (
          <div
            style={{
              padding: "14px 16px",
              borderRadius: 14,
              border: "1px solid #dbe3ee",
              backgroundColor: "#fbfdff",
              color: "#17324d",
              display: "grid",
              gap: 6,
            }}
          >
            {result.focus.geo_focus ? (
              <div>
                <strong>Fokus geopolityczny:</strong> {result.focus.geo_focus}
              </div>
            ) : null}
            {result.focus.custom_query ? (
              <div>
                <strong>Dodatkowe pytanie:</strong> {result.focus.custom_query}
              </div>
            ) : null}
          </div>
        ) : null}

        <article
          style={{
            padding: 22,
            borderRadius: 18,
            border: "1px solid #dbe3ee",
            background:
              "linear-gradient(180deg, rgba(245, 248, 251, 0.96) 0%, rgba(255, 255, 255, 0.98) 100%)",
          }}
        >
          <div
            style={{
              marginBottom: 10,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#1b6782",
            }}
          >
            Podsumowanie
          </div>

          {result.style === "short" ? renderShortSummary(result.summary as ShortSummary) : null}
          {result.style === "mid" ? renderMidSummary(result.summary as MidSummary) : null}
          {result.style === "long" ? renderLongSummary(result.summary as LongSummary) : null}
        </article>

        {showSources ? (
          <div style={{ display: "grid", gap: 12 }}>
            {result.sources.map((source) => (
              <article
                key={`${source.id}-${source.url ?? "brak-url"}`}
                style={{
                  padding: 16,
                  borderRadius: 16,
                  border: "1px solid #dbe3ee",
                  backgroundColor: "#fbfdff",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 18, color: "#10253f" }}>{source.title}</h3>
                    <div style={{ marginTop: 6, color: "#58708a", fontSize: 14 }}>
                      {source.provider || "Nieznane zrodlo"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", color: "#58708a", fontSize: 14 }}>
                    <div>{source.published_at || "Brak czasu publikacji"}</div>
                  </div>
                </div>

                {source.url ? (
                  <div style={{ marginTop: 12 }}>
                    <a href={source.url} target="_blank" rel="noreferrer" style={{ color: "#0d4d8b", fontWeight: 700 }}>
                      Otworz zrodlo
                    </a>
                  </div>
                ) : null}
              </article>
            ))}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleDownload}
                style={{
                  padding: "10px 14px",
                  borderRadius: 999,
                  border: "1px solid #c9d4e3",
                  backgroundColor: "#f5f8fb",
                  cursor: "pointer",
                }}
              >
                Pobierz JSON
              </button>
              <button
                type="button"
                onClick={() => setShowRawJson((value) => !value)}
                style={{
                  padding: "10px 14px",
                  borderRadius: 999,
                  border: "1px solid #c9d4e3",
                  backgroundColor: "#f5f8fb",
                  cursor: "pointer",
                }}
              >
                {showRawJson ? "Ukryj JSON" : "Pokaz JSON"}
              </button>
            </div>

            {showRawJson ? (
              <pre
                style={{
                  margin: 0,
                  padding: 20,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  borderRadius: 16,
                  backgroundColor: "#10253f",
                  color: "#edf4ff",
                  fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
                  overflowX: "auto",
                }}
              >
                {JSON.stringify(result, null, 2)}
              </pre>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
