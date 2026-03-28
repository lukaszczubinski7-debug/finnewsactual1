export type BriefContext =
  | "Geopolityka"
  | "Makro"
  | "Wyniki spolek (earnings)"
  | "Stopy / banki centralne"
  | "Surowce / energia"
  | "Crypto"
  | "Polska / GPW"
  | "Technologia";

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

export type ThreadCreateRequest = {
  name: string;
  assets?: string | null;
  horizon_days: 7 | 30 | 90;
  extra_context?: string | null;
};

export type ThreadScenario = {
  name: string;
  trigger: string;
  probability: string;
  market_impact: string;
};

export type ThreadDevelopment = {
  date: string;
  title: string;
  body: string;
};

export type ThreadAsset = {
  asset: string;
  direction: string;
  why: string;
  confidence: string;
};

export type ThreadSnapshot = {
  background?: string;
  key_actors?: { name: string; role: string; position: string }[];
  timeline?: { date: string; event: string; significance: string }[];
  current_state?: string;
  latest_developments?: ThreadDevelopment[];
  scenarios?: ThreadScenario[];
  market_implications?: {
    assets?: ThreadAsset[];
    sectors?: string[];
    correlation_map?: string;
  };
  sources_used?: { title: string; url: string; provider: string }[];
  confidence_level?: string;
  error?: string;
};

export type Thread = {
  id: number;
  name: string;
  assets: string | null;
  horizon_days: number;
  extra_context: string | null;
  status: "initializing" | "ready" | "refreshing";
  new_events_count: number;
  context_snapshot: ThreadSnapshot | null;
  created_at: string;
  last_refreshed_at: string | null;
};

export type ThreadSuggestion = {
  suggest: boolean;
  name?: string;
  assets?: string;
  horizon_days?: number;
  reason?: string;
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
  market_tickers?: string[] | null;
  sources_trust_level?: number;
};

export type UserPreferenceUpdate = {
  search_profile_text?: string | null;
  response_style?: string | null;
  interested_assets?: string[];
  interested_regions?: string[];
  interested_topics?: string[];
  notes?: string | null;
  market_tickers?: string[] | null;
  sources_trust_level?: number | null;
};

export type MarketQuote = {
  ticker: string;
  name: string;
  price: number | null;
  change: number | null;
  change_pct: number | null;
  currency: string | null;
  market_state: string;
  fetched_at: number;
};

export type MarketInstrument = {
  ticker: string;
  name: string;
  default: boolean;
};

export type MarketCategory = {
  name: string;
  instruments: MarketInstrument[];
};

export type MarketInstrumentsResponse = {
  categories: MarketCategory[];
};

export type ResearchRequest = {
  query: string;
  sources_trust_level?: number;
};

export type ResearchSource = {
  title: string;
  url: string;
  provider: string;
};

export type ResearchResponse = {
  report: string;
  tools_used: string[];
  sources: ResearchSource[];
};

export type YoutubeSource = {
  id: number;
  video_id: string;
  video_url: string;
  title: string | null;
  channel_name: string | null;
  language: string | null;
  summary: string | null;
  status: "pending" | "processing" | "ready" | "error";
  error_msg: string | null;
  created_at: string;
  processed_at: string | null;
  channel_db_id: number | null;
};

export type YoutubeChannel = {
  id: number;
  channel_id: string;
  channel_url: string;
  name: string | null;
  last_fetched_at: string | null;
  created_at: string;
};
