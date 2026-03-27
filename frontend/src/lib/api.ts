import { HARD_LIST_LIMIT, ensureContinents } from "./briefDefaults";
import type {
  APIError,
  AuthUser,
  BriefRequest,
  BriefResponse,
  LoginRequest,
  LoginResponse,
  MarketInstrumentsResponse,
  MarketQuote,
  RegisterRequest,
  Thread,
  ThreadCreateRequest,
  ThreadSuggestion,
  UserPreference,
  UserPreferenceUpdate,
} from "./types";

const BRIEF_ENDPOINT = "/api/brief";
const AUTH_REGISTER_ENDPOINT = "/api/auth/register";
const AUTH_LOGIN_ENDPOINT = "/api/auth/login";
const AUTH_ME_ENDPOINT = "/api/auth/me";
const PROFILE_PREFERENCES_ENDPOINT = "/api/profile/preferences";
const THREADS_ENDPOINT = "/api/threads";
const MARKET_QUOTES_ENDPOINT = "/api/market/quotes";
const MARKET_INSTRUMENTS_ENDPOINT = "/api/market/instruments";

function parseTickers(tickers: string): string[] {
  return tickers
    .split(",")
    .map((ticker) => ticker.trim())
    .filter(Boolean);
}

function createApiError(message: string, status: number): APIError {
  return { message, status };
}

function parseApiError(payload: unknown, status: number): APIError {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return createApiError(payload.message, status);
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    "detail" in payload &&
    typeof payload.detail === "string"
  ) {
    return createApiError(payload.detail, status);
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
    const detail = payload.detail as { message: string; debug?: unknown };
    return {
      message: detail.message,
      status,
      debug: detail.debug,
    };
  }

  return createApiError(`Zapytanie nie powiodlo sie (status ${status})`, status);
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function authHeaders(token?: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function postBrief(req: BriefRequest, token?: string): Promise<BriefResponse> {
  const requestPayload = {
    continents: ensureContinents(req.continents),
    tickers: parseTickers(req.tickers),
    query: req.query.trim() || null,
    context: "Geopolityka" as const,
    geo_focus: req.geo_focus.trim() || null,
    debug: req.debug,
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
        ...authHeaders(token),
      },
      body: JSON.stringify(requestPayload),
    });

    const responsePayload = await parseJsonSafe(response);

    if (!response.ok) {
      throw parseApiError(responsePayload, response.status);
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

export async function register(payload: RegisterRequest): Promise<AuthUser> {
  const response = await fetch(AUTH_REGISTER_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });

  const responsePayload = await parseJsonSafe(response);
  if (!response.ok) {
    throw parseApiError(responsePayload, response.status);
  }
  return responsePayload as AuthUser;
}

export async function login(payload: LoginRequest): Promise<LoginResponse> {
  const response = await fetch(AUTH_LOGIN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });

  const responsePayload = await parseJsonSafe(response);
  if (!response.ok) {
    throw parseApiError(responsePayload, response.status);
  }
  return responsePayload as LoginResponse;
}

export async function getMe(token: string): Promise<AuthUser> {
  const response = await fetch(AUTH_ME_ENDPOINT, {
    method: "GET",
    headers: authHeaders(token),
    cache: "no-store",
  });

  const responsePayload = await parseJsonSafe(response);
  if (!response.ok) {
    throw parseApiError(responsePayload, response.status);
  }
  return responsePayload as AuthUser;
}

export async function deleteMe(token: string): Promise<void> {
  const response = await fetch(AUTH_ME_ENDPOINT, {
    method: "DELETE",
    headers: authHeaders(token),
  });

  if (!response.ok) {
    const responsePayload = await parseJsonSafe(response);
    throw parseApiError(responsePayload, response.status);
  }
}

export async function getPreferences(token: string): Promise<UserPreference> {
  const response = await fetch(PROFILE_PREFERENCES_ENDPOINT, {
    method: "GET",
    headers: authHeaders(token),
    cache: "no-store",
  });

  const responsePayload = await parseJsonSafe(response);
  if (!response.ok) {
    throw parseApiError(responsePayload, response.status);
  }
  return responsePayload as UserPreference;
}

export async function putPreferences(token: string, payload: UserPreferenceUpdate): Promise<UserPreference> {
  const response = await fetch(PROFILE_PREFERENCES_ENDPOINT, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...authHeaders(token),
    },
    body: JSON.stringify(payload),
  });

  const responsePayload = await parseJsonSafe(response);
  if (!response.ok) {
    throw parseApiError(responsePayload, response.status);
  }
  return responsePayload as UserPreference;
}

export async function patchPreferences(token: string, payload: UserPreferenceUpdate): Promise<UserPreference> {
  const response = await fetch(PROFILE_PREFERENCES_ENDPOINT, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...authHeaders(token),
    },
    body: JSON.stringify(payload),
  });

  const responsePayload = await parseJsonSafe(response);
  if (!response.ok) {
    throw parseApiError(responsePayload, response.status);
  }
  return responsePayload as UserPreference;
}

export async function getThreads(token: string): Promise<Thread[]> {
  const response = await fetch(THREADS_ENDPOINT, {
    method: "GET",
    headers: authHeaders(token),
    cache: "no-store",
  });
  const payload = await parseJsonSafe(response);
  if (!response.ok) throw parseApiError(payload, response.status);
  return (payload as Thread[]) ?? [];
}

export async function createThread(token: string, req: ThreadCreateRequest): Promise<Thread> {
  const response = await fetch(THREADS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", ...authHeaders(token) },
    body: JSON.stringify(req),
  });
  const payload = await parseJsonSafe(response);
  if (!response.ok) throw parseApiError(payload, response.status);
  return payload as Thread;
}

export async function refreshThread(token: string, threadId: number): Promise<Thread> {
  const response = await fetch(`${THREADS_ENDPOINT}/${threadId}/refresh`, {
    method: "POST",
    headers: authHeaders(token),
  });
  const payload = await parseJsonSafe(response);
  if (!response.ok) throw parseApiError(payload, response.status);
  return payload as Thread;
}

export async function refreshAllThreads(token: string): Promise<{ refreshed: number }> {
  const response = await fetch(`${THREADS_ENDPOINT}/refresh-all`, {
    method: "POST",
    headers: authHeaders(token),
  });
  const payload = await parseJsonSafe(response);
  if (!response.ok) throw parseApiError(payload, response.status);
  return payload as { refreshed: number };
}

export async function deleteThread(token: string, threadId: number): Promise<void> {
  const response = await fetch(`${THREADS_ENDPOINT}/${threadId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!response.ok) {
    const payload = await parseJsonSafe(response);
    throw parseApiError(payload, response.status);
  }
}

export async function suggestThread(token: string, brief: BriefResponse): Promise<ThreadSuggestion> {
  const response = await fetch(`${THREADS_ENDPOINT}/suggest`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", ...authHeaders(token) },
    body: JSON.stringify(brief),
  });
  const payload = await parseJsonSafe(response);
  if (!response.ok) throw parseApiError(payload, response.status);
  return payload as ThreadSuggestion;
}

export async function getMarketQuotes(tickers?: string[]): Promise<MarketQuote[]> {
  const url = tickers && tickers.length > 0
    ? `${MARKET_QUOTES_ENDPOINT}?tickers=${encodeURIComponent(tickers.join(","))}`
    : MARKET_QUOTES_ENDPOINT;
  const response = await fetch(url, { cache: "no-store" });
  const payload = await parseJsonSafe(response);
  if (!response.ok) throw parseApiError(payload, response.status);
  return payload as MarketQuote[];
}

export async function getMarketInstruments(): Promise<MarketInstrumentsResponse> {
  const response = await fetch(MARKET_INSTRUMENTS_ENDPOINT, { cache: "no-store" });
  const payload = await parseJsonSafe(response);
  if (!response.ok) throw parseApiError(payload, response.status);
  return payload as MarketInstrumentsResponse;
}
