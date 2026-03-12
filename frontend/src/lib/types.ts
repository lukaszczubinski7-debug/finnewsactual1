export type BriefContext =
  | "Geopolityka"
  | "Makro"
  | "Wyniki spolek (earnings)"
  | "Stopy / banki centralne"
  | "Surowce / energia"
  | "Crypto"
  | "Polska / GPW";

export type ContinentCode = "NA" | "EU" | "AS" | "ME" | "SA" | "AF" | "OC";

export type RequestStyle = "krotko" | "normalnie" | "dlugo";
export type ResponseStyle = "short" | "mid" | "long";

export type BriefRequest = {
  continents: ContinentCode[];
  tickers: string;
  query: string;
  context: BriefContext;
  geo_focus: string;
  debug: boolean;
  window_hours: 24 | 72 | 168;
  list_limit: number;
  summary_k: number;
  style: RequestStyle;
};

export type BriefFocus = {
  geo_focus: string;
  custom_query: string;
};

export type ShortSummary = {
  co_sie_stalo: string;
  najwazniejsza_reakcja: string;
  bezposrednia_konsekwencja_rynkowa: string;
  co_obserwowac: string;
  sources: Array<{
    title: string;
    url: string;
    publisher: string;
    published_at: string;
  }>;
};

export type MidTheme = {
  tytul: string;
  waznosc: "wysoka" | "srednia" | "niska";
  tekst: string;
};

export type MidSummary = {
  watki: MidTheme[];
  tl_dr: string;
};

export type LongTopic = {
  tytul: string;
  stan_obecny: string;
  mechanizm_wplywu: string;
  konsekwencje: string;
  ryzyka: string[];
};

export type SectorImpact = {
  obszar: string;
  mechanizm: string;
};

export type Scenario = {
  nazwa: string;
  trigger: string;
  mechanizm: string;
  aktywa_wrazliwe: string[];
  horyzont: string;
};

export type LongSummary = {
  tematy: LongTopic[];
  lancuch_przyczynowy: string[];
  implikacje_rynkowe: SectorImpact[];
  scenariusze: Scenario[];
};

export type QuickSummary = {
  mode: "quick";
  summary: string;
};

export type BriefSummary = QuickSummary | ShortSummary | MidSummary | LongSummary;

export type BriefSource = {
  id: string;
  title: string;
  provider: string;
  published_at: string | null;
  url: string | null;
};

export type BriefResponse = {
  status: "ok" | "fallback";
  style: ResponseStyle;
  context: string;
  window_hours: number;
  continents: ContinentCode[];
  focus: BriefFocus;
  summary: BriefSummary;
  sources: BriefSource[];
  brief?: string;
  [key: string]: unknown;
};

export type APIError = {
  message: string;
  status: number;
  debug?: unknown;
};

export type AuthUser = {
  id: number;
  email: string;
  is_active: boolean;
};

export type RegisterRequest = {
  email: string;
  password: string;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type LoginResponse = {
  access_token: string;
  token_type: "bearer";
  user: AuthUser;
};

export type UserPreference = {
  search_profile_text: string | null;
  response_style: string | null;
  interested_assets: string[];
  interested_regions: string[];
  interested_topics: string[];
  notes: string | null;
};

export type UserPreferenceUpdate = {
  search_profile_text?: string | null;
  response_style?: string | null;
  interested_assets?: string[];
  interested_regions?: string[];
  interested_topics?: string[];
  notes?: string | null;
};
