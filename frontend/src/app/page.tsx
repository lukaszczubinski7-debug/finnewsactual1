"use client";

import { useState } from "react";

import BriefForm from "../components/BriefForm";
import BriefResult from "../components/BriefResult";
import LoadingState from "../components/LoadingState";
import { postBrief } from "../lib/api";
import {
  HARD_LIST_LIMIT,
  clampSummaryK,
  createInitialFormState,
  ensureContinents,
} from "../lib/briefDefaults";
import type { APIError, BriefRequest, BriefResponse } from "../lib/types";

const initialFormState: BriefRequest = createInitialFormState();

export default function Page() {
  const [formState, setFormState] = useState<BriefRequest>(initialFormState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<APIError | null>(null);
  const [result, setResult] = useState<BriefResponse | null>(null);

  const handleFieldChange = (
    field: keyof BriefRequest,
    value: string | number | string[],
  ) => {
    setFormState((current) => {
      if (field === "continents") {
        return {
          ...current,
          continents: ensureContinents(value as string[]),
        };
      }

      if (field === "summary_k") {
        return {
          ...current,
          summary_k: clampSummaryK(Number(value)),
        };
      }

      return {
        ...current,
        [field]: value,
        list_limit: HARD_LIST_LIMIT,
      };
    });
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await postBrief({
        ...formState,
        continents: ensureContinents(formState.continents),
        summary_k: clampSummaryK(formState.summary_k),
        list_limit: HARD_LIST_LIMIT,
      });
      setResult(response);
    } catch (submitError) {
      const apiError = submitError as APIError;
      setError({
        message: apiError.message || "Nie udalo sie wygenerowac podsumowania.",
        status: typeof apiError.status === "number" ? apiError.status : 0,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "40px 20px 64px",
        background:
          "radial-gradient(circle at top left, rgba(57, 119, 190, 0.16), transparent 30%), linear-gradient(180deg, #f5f8fc 0%, #eef4f8 100%)",
        fontFamily: "Georgia, Cambria, 'Times New Roman', Times, serif",
      }}
    >
      <div
        style={{
          maxWidth: 1040,
          margin: "0 auto",
          display: "grid",
          gap: 24,
        }}
      >
        <section style={{ color: "#10253f" }}>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#1b6782",
            }}
          >
            Fin News Agent
          </p>
          <h1 style={{ margin: "10px 0 0", fontSize: "clamp(2.4rem, 5vw, 4rem)", lineHeight: 1 }}>
            Geopolityczne podsumowania
          </h1>
          <p style={{ margin: "14px 0 0", maxWidth: 760, fontSize: 18, color: "#4d6278" }}>
            Wybierz kontynenty, zawez temat i dostan zwiezle podsumowanie oparte na zrodlach,
            bez lania wody i bez ozdobnikow.
          </p>
        </section>

        <BriefForm
          values={formState}
          onChange={handleFieldChange}
          onSubmit={handleSubmit}
          disabled={loading}
        />

        {loading ? <LoadingState isMultiRegion={formState.continents.length > 1} /> : null}

        {error ? (
          <section
            role="alert"
            style={{
              padding: "18px 20px",
              borderRadius: 16,
              border: "1px solid #efc7c7",
              backgroundColor: "#fff3f2",
              color: "#7b1f1f",
            }}
          >
            <strong style={{ display: "block", marginBottom: 6 }}>
              Nieudane zapytanie{error.status ? ` (${error.status})` : ""}
            </strong>
            <span>{error.message}</span>
          </section>
        ) : null}

        {result ? <BriefResult result={result} /> : null}
      </div>
    </main>
  );
}
