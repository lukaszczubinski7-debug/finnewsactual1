"use client";

import type { CSSProperties } from "react";

import {
  SUMMARY_K_MAX,
  SUMMARY_K_MIN,
} from "../lib/briefDefaults";
import type { BriefRequest, ContinentCode } from "../lib/types";

type BriefFormProps = {
  values: BriefRequest;
  onChange: (field: keyof BriefRequest, value: string | number | string[] | boolean) => void;
  onSubmit: () => void;
  disabled?: boolean;
};

const CONTINENT_OPTIONS: Array<{ label: string; value: ContinentCode }> = [
  { label: "Ameryka Pln", value: "NA" },
  { label: "Europa", value: "EU" },
  { label: "Azja", value: "AS" },
  { label: "Bliski Wschod", value: "ME" },
  { label: "Ameryka Pld", value: "SA" },
  { label: "Afryka", value: "AF" },
  { label: "Oceania", value: "OC" },
];

const WINDOW_OPTIONS: Array<{ label: string; value: BriefRequest["window_hours"] }> = [
  { label: "24h", value: 24 },
  { label: "72h", value: 72 },
  { label: "7 dni", value: 168 },
];

const fieldStyle: CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #c9d4e3",
  backgroundColor: "#ffffff",
  fontSize: 15,
  color: "#13263b",
  boxSizing: "border-box",
};

const helperTextStyle: CSSProperties = {
  margin: "6px 0 0",
  fontSize: 13,
  lineHeight: 1.5,
  color: "#62758a",
};

export default function BriefForm({ values, onChange, onSubmit, disabled = false }: BriefFormProps) {
  const toggleContinent = (continent: ContinentCode) => {
    const selected = values.continents.includes(continent);
    const nextContinents = selected
      ? values.continents.filter((value) => value !== continent)
      : [...values.continents, continent];
    onChange("continents", nextContinents);
  };

  return (
    <section
      style={{
        padding: 24,
        borderRadius: 20,
        border: "1px solid #d6dde8",
        backgroundColor: "#f9fbfd",
        boxShadow: "0 14px 40px rgba(16, 37, 63, 0.08)",
      }}
    >
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 24, color: "#10253f" }}>Ustawienia podsumowania</h2>
        <p style={{ margin: "8px 0 0", color: "#53667b" }}>
          Wybierz kontynenty, okno czasowe i poziom szczegolowosci. Wynik ma byc krotki,
          konkretny i oparty na zrodlach.
        </p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        style={{ display: "grid", gap: 16 }}
      >
        <div>
          <span style={{ display: "block", marginBottom: 8, fontWeight: 600, color: "#17324d" }}>
            Kontynenty
          </span>
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            {CONTINENT_OPTIONS.map((continent) => {
              const selected = values.continents.includes(continent.value);
              return (
                <button
                  key={continent.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleContinent(continent.value)}
                  disabled={disabled}
                  style={{
                    padding: "11px 14px",
                    borderRadius: 999,
                    border: selected ? "1px solid #0d4d8b" : "1px solid #c9d4e3",
                    backgroundColor: selected ? "#e7f0fb" : "#ffffff",
                    color: selected ? "#0d4d8b" : "#17324d",
                    fontWeight: 700,
                    cursor: disabled ? "not-allowed" : "pointer",
                  }}
                >
                  {continent.label}
                </button>
              );
            })}
          </div>
          <p style={helperTextStyle}>
            Mozesz zaznaczyc wiele kontynentow. Gdy wszystko odznaczysz, system zostawi `NA`.
          </p>
          {values.continents.length > 1 ? (
            <p style={helperTextStyle}>Zalecane max 3 kontynenty na raz (wydajnosc).</p>
          ) : null}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
          }}
        >
          <label>
            <span style={{ display: "block", marginBottom: 6, fontWeight: 600, color: "#17324d" }}>
              Okno czasowe
            </span>
            <select
              value={values.window_hours}
              onChange={(event) => onChange("window_hours", Number(event.target.value))}
              disabled={disabled}
              style={fieldStyle}
            >
              {WINDOW_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span style={{ display: "block", marginBottom: 6, fontWeight: 600, color: "#17324d" }}>Styl</span>
            <select
              value={values.style}
              onChange={(event) => onChange("style", event.target.value)}
              disabled={disabled}
              style={fieldStyle}
            >
              <option value="krotko">krotko</option>
              <option value="normalnie">normalnie</option>
              <option value="dlugo">dlugo</option>
            </select>
          </label>
        </div>

        <label>
          <span style={{ display: "block", marginBottom: 6, fontWeight: 600, color: "#17324d" }}>
            Pytanie strategiczne
          </span>
          <input
            type="text"
            value={values.query}
            onChange={(event) => onChange("query", event.target.value)}
            disabled={disabled}
            placeholder="Wpisz glowne pytanie, ktore brief ma przeanalizowac"
            style={fieldStyle}
          />
          <p style={helperTextStyle}>
            Priorytet wejscia: pytanie -&gt; profil -&gt; regiony.
          </p>
        </label>

        <details
          style={{
            borderRadius: 16,
            border: "1px solid #d6dde8",
            backgroundColor: "#ffffff",
            padding: "14px 16px",
          }}
        >
          <summary
            style={{
              cursor: "pointer",
              fontWeight: 700,
              color: "#17324d",
              listStyle: "none",
            }}
          >
            Zaawansowane (opcjonalnie)
          </summary>

          <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
            <label>
              <span style={{ display: "block", marginBottom: 6, fontWeight: 600, color: "#17324d" }}>
                Liczba newsow w podsumowaniu
              </span>
              <input
                type="number"
                min={SUMMARY_K_MIN}
                max={SUMMARY_K_MAX}
                value={values.summary_k}
                onChange={(event) => onChange("summary_k", Number(event.target.value))}
                disabled={disabled}
                style={fieldStyle}
              />
              <p style={helperTextStyle}>
                Ile newsow finalnie wyladuje w podsumowaniu. Zakres {SUMMARY_K_MIN}-{SUMMARY_K_MAX}.
              </p>
            </label>

            <label>
              <span style={{ display: "block", marginBottom: 6, fontWeight: 600, color: "#17324d" }}>
                Tickery (opcjonalnie)
              </span>
              <input
                type="text"
                value={values.tickers}
                onChange={(event) => onChange("tickers", event.target.value)}
                disabled={disabled}
                placeholder="NVDA, TSLA lub LPP.WA"
                style={fieldStyle}
              />
            </label>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                color: "#17324d",
                fontWeight: 600,
              }}
            >
              <input
                type="checkbox"
                checked={values.debug}
                onChange={(event) => onChange("debug", event.target.checked)}
                disabled={disabled}
              />
              Zwracaj debug z backendu
            </label>
          </div>
        </details>

        <button
          type="submit"
          disabled={disabled}
          style={{
            padding: "14px 18px",
            border: "none",
            borderRadius: 999,
            background: disabled ? "#a9bbcf" : "linear-gradient(135deg, #0d4d8b 0%, #1f7a8c 100%)",
            color: "#ffffff",
            fontSize: 15,
            fontWeight: 700,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          Generuj podsumowanie
        </button>
      </form>
    </section>
  );
}
