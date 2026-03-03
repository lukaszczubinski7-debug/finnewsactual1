import { HARD_LIST_LIMIT, ensureContinents } from "./briefDefaults";
import type { APIError, BriefRequest, BriefResponse } from "./types";

const BRIEF_ENDPOINT = "/api/brief";

function parseTickers(tickers: string): string[] {
  return tickers
    .split(",")
    .map((ticker) => ticker.trim())
    .filter(Boolean);
}

function createApiError(message: string, status: number): APIError {
  return { message, status };
}

function extractErrorMessage(payload: unknown, status: number): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    "detail" in payload &&
    typeof payload.detail === "string"
  ) {
    return payload.detail;
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    "detail" in payload &&
    typeof payload.detail === "object" &&
    payload.detail !== null &&
    "message" in payload.detail &&
    typeof payload.detail.message === "string"
  ) {
    return payload.detail.message;
  }

  return `Zapytanie nie powiodlo sie (status ${status})`;
}

export async function postBrief(req: BriefRequest): Promise<BriefResponse> {
  const requestPayload = {
    continents: ensureContinents(req.continents),
    tickers: parseTickers(req.tickers),
    query: req.query.trim() || null,
    context: "Geopolityka" as const,
    geo_focus: req.geo_focus.trim() || null,
    window_hours: req.window_hours,
    list_limit: HARD_LIST_LIMIT,
    summary_k: req.summary_k,
    style: req.style,
  };

  try {
    const response = await fetch(BRIEF_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(requestPayload),
    });

    let responsePayload: unknown = null;

    try {
      responsePayload = await response.json();
    } catch {
      responsePayload = null;
    }

    if (!response.ok) {
      throw createApiError(extractErrorMessage(responsePayload, response.status), response.status);
    }

    if (
      typeof responsePayload !== "object" ||
      responsePayload === null ||
      !("summary" in responsePayload) ||
      typeof responsePayload.summary !== "object" ||
      responsePayload.summary === null ||
      !("style" in responsePayload) ||
      typeof responsePayload.style !== "string"
    ) {
      throw createApiError("Backend zwrocil niepoprawna odpowiedz.", response.status);
    }

    return responsePayload as BriefResponse;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      "status" in error
    ) {
      throw error as APIError;
    }

    throw createApiError("Nie udalo sie polaczyc z backendem.", 0);
  }
}
