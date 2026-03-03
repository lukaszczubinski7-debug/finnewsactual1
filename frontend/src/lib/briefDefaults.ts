import type { BriefRequest, ContinentCode } from "./types";

export const DEFAULT_CONTINENTS: ContinentCode[] = ["NA"];
export const DEFAULT_SUMMARY_K = 5;
export const SUMMARY_K_MIN = 3;
export const SUMMARY_K_MAX = 10;
export const HARD_LIST_LIMIT = 20;

export function clampSummaryK(value: number): number {
  const numericValue = Number.isFinite(value) ? Math.trunc(value) : DEFAULT_SUMMARY_K;
  return Math.max(SUMMARY_K_MIN, Math.min(SUMMARY_K_MAX, numericValue));
}

export function ensureContinents(continents: string[] | undefined): ContinentCode[] {
  const deduped = Array.from(new Set((continents || []).filter(Boolean))) as ContinentCode[];
  return deduped.length ? deduped : DEFAULT_CONTINENTS;
}

export function createInitialFormState(): BriefRequest {
  return {
    continents: DEFAULT_CONTINENTS,
    tickers: "",
    query: "",
    context: "Geopolityka",
    geo_focus: "",
    window_hours: 72,
    list_limit: HARD_LIST_LIMIT,
    summary_k: DEFAULT_SUMMARY_K,
    style: "krotko",
  };
}
