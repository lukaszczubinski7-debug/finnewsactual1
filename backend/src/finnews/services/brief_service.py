from __future__ import annotations

import asyncio
from copy import deepcopy
from datetime import UTC, datetime, timedelta
import json
import logging
from math import ceil
from pathlib import Path
import re
import time
from typing import Any

from finnews.clients.axesso import AxessoClient
from finnews.clients.llm import LLMClient
from finnews.errors import NewsDataParsingError, UpstreamNewsProviderError
from finnews.services.news_details_service import NewsDetailsService
from finnews.services.news_list_service import NewsListService
from finnews.services.selection_service import pick_top
from finnews.services.web_search_service import WebSearchService
from finnews.settings import settings
from finnews.utils.region import normalize_region
from finnews.utils.text import normalize_text

logger = logging.getLogger(__name__)

ALIASES: dict[str, list[str]] = {
    "LPP.WA": ["LPP", "LPP SA", "LPP S.A.", "Reserved", "Sinsay", "Cropp", "House", "Mohito"],
    "KGH.WA": ["KGHM", "KGHM Polska Miedz", "Polska Miedz", "miedz", "copper"],
    "PKO.WA": ["PKO", "PKO BP", "PKO Bank Polski"],
    "PZU.WA": ["PZU"],
    "CDR.WA": ["CD Projekt", "CDPROJEKT", "Cyberpunk", "Wiedzmin", "The Witcher"],
    "NVDA": ["NVDA", "Nvidia"],
    "TSLA": ["TSLA", "Tesla"],
}

CONTEXT_GEOPOLITICS = "Geopolityka"
CONTEXT_MACRO = "Makro"
CONTEXT_EARNINGS = "Wyniki spolek (earnings)"
CONTEXT_RATES = "Stopy / banki centralne"
CONTEXT_COMMODITIES = "Surowce / energia"
CONTEXT_CRYPTO = "Crypto"
CONTEXT_POLAND = "Polska / GPW"

DEFAULT_CONTEXT = CONTEXT_GEOPOLITICS
DEFAULT_CONTINENTS = ["NA"]
GEOPOLITICS_EXTRA_CONTINENTS = ["NA", "ME", "EU"]
MAX_CONTINENTS_PER_REQUEST = 7
HARD_LIST_LIMIT = 30
FETCH_LIMIT_PER_REGION = 80
# Per-continent fetch quotas for parallel news collection.
# NA (US) gets the largest share — Yahoo Finance US carries Reuters/AP/Bloomberg globally.
# Other regions supplement with local/regional sources.
REGION_FETCH_QUOTAS: dict[str, int] = {
    "NA": 30,
    "EU": 20,
    "ME": 15,
    "AS": 15,
    "SA": 8,
    "AF": 6,
    "OC": 6,
}
MAX_ITEMS_FOR_SCORING = 400
MAX_CONCURRENT_REGION_FETCHES = 3
CACHE_TTL_SECONDS = 300
INTERNAL_SELECT_K = settings.llm_top_k
SELECT_K_MIN = 5
SELECT_K_MAX = 30
SUMMARY_K_MIN = 3
SUMMARY_K_MAX = 10
PROMPTS_DIR = Path(__file__).resolve().parents[1] / "prompts"
PROMPT_SHORT = "short.md"
PROMPT_SHORT_ANALYST = "short_analyst.md"
PROMPT_SHORT_TRADER = "short_trader.md"
PROMPT_SHORT_RISK = "short_risk.md"
PROMPT_MID = "brief.md"
PROMPT_LONG = "extended.md"
PROMPT_SYSTEM = "system.md"
PROMPT_SCHEMA = "json_schema.md"
PROMPT_FALLBACK = "fallback.md"
PROMPT_CRITIC = "critic.md"
QUALITY_SCORE_THRESHOLD = 75
MAX_CRITIC_LOOPS = 2
DEBUG_WORDING_BLOCKLIST = (
    "fallback",
    "upstream",
    "axesso",
    "debug",
    "payload",
    "no news list found",
)
EMPTY_GENERALITIES = (
    "sytuacja pozostaje dynamiczna",
    "nalezy obserwowac rozwoj sytuacji",
    "ocena skupia sie na najbardziej prawdopodobnych implikacjach rynkowych",
    "scenariusz bazowy:",
    "pewnosc oceny:",
    "ryzyko w gore:",
    "ryzyko w dol:",
    "fokus analizy:",
    "skala reakcji aktywow zalezy od tego",
    "skala reakcji zalezy od potwierdzenia",
    "kluczowe dla inwestorow pozostaje tempo potwierdzania informacji",
)
QUICK_META_PHRASES = (
    "na podstawie dostepnych informacji",
    "gdy dane sa ograniczone",
    "zakres analizy obejmuje",
    "system wybral",
    "na ten moment dominuje ostrozna ocena ryzyka",
    "ponizej przedstawiono",
    "brief zawiera",
)
QUICK_META_BLOCKLIST = (
    "pytanie inwestycyjne",
    "w centrum uwagi",
    "horyzont decyzyjny",
    "horyzont",
    "zakres analizy",
    "priorytet",
    "profil uzytkownika",
    "wybrane regiony",
    "na podstawie preferencji",
    "brief",
    "podany temat",
    "fokus geopolityczny",
    "regiony:",
)
QUICK_INTERPRETATION_PHRASES = (
    "moze spowodowac",
    "moze wplynac",
    "moze reagowac",
    "rynek moze",
    "inwestorzy moga",
    "to moze",
    "moze zwiekszyc",
    "moze obnizyc",
    "moze podniesc",
    "moze oznaczac",
    "to oznacza",
    "wplyw na",
    "implikacja",
    "implikacje",
    "scenariusz",
)
QUICK_INTERPRETATION_PATTERNS = (
    r"\bmoze\b",
    r"\bmoga\b",
    r"\bmogl\w*\b",
    r"\bprawdopodob\w*\b",
    r"\bpotencjal\w*\b",
    r"\bpowin\w*\b",
    r"\bwydaje sie\b",
    r"\bsuger\w*\b",
    r"\bzaklad\w*\b",
    r"\bspowod\w*\b",
    r"\bdoprowadz\w*\b",
    r"\bprzeloz\w*\b",
    r"\bimplik\w*\b",
    r"\bkonsekwencj\w*\b",
)
QUICK_FACT_FALLBACK = "W najnowszych depeszach dominuja informacje o wydarzeniach geopolitycznych, komunikatach rzadowych i notowaniach energii."
GENERIC_BLOCK_TITLES = (
    "sytuacja pozostaje dynamiczna",
    "rynek obserwuje wydarzenia",
)

CONTINENT_TO_AXESSO_REGIONS: dict[str, list[str]] = {
    "NA": ["US"],
    "EU": ["GB", "PL"],
    "AS": ["SG"],
    "ME": ["AE"],
    "SA": ["BR"],
    "AF": ["ZA"],
    "OC": ["AU"],
}
CONTINENT_LABELS: dict[str, str] = {
    "NA": "Ameryka Polnocna",
    "EU": "Europa",
    "AS": "Azja",
    "ME": "Bliski Wschod",
    "SA": "Ameryka Poludniowa",
    "AF": "Afryka",
    "OC": "Oceania",
}

LEGACY_REGION_TO_CONTINENT: dict[str, str] = {
    "US": "NA",
    "USA": "NA",
    "NA": "NA",
    "GB": "EU",
    "UK": "EU",
    "PL": "EU",
    "POLSKA": "EU",
    "DE": "EU",
    "FR": "EU",
    "EU": "EU",
    "SG": "AS",
    "AS": "AS",
    "AE": "ME",
    "ME": "ME",
    "BR": "SA",
    "SA": "SA",
    "ZA": "AF",
    "AF": "AF",
    "AU": "OC",
    "OC": "OC",
}

CONTEXT_KEYWORDS: dict[str, list[str]] = {
    CONTEXT_GEOPOLITICS: [
        "iran",
        "israel",
        "gaza",
        "ukraine",
        "russia",
        "china",
        "taiwan",
        "sanctions",
        "missile",
        "attack",
        "war",
        "conflict",
        "military",
        "nuclear",
        "strait",
        "hormuz",
        "oil supply",
    ],
    CONTEXT_MACRO: [
        "inflation",
        "cpi",
        "ppi",
        "gdp",
        "pmi",
        "labor market",
        "jobs",
        "consumer sentiment",
        "economy",
        "recession",
        "macro",
    ],
    CONTEXT_EARNINGS: [
        "earnings",
        "results",
        "revenue",
        "profit",
        "ebitda",
        "guidance",
        "quarter",
        "forecast",
    ],
    CONTEXT_RATES: [
        "rates",
        "rate cut",
        "rate hike",
        "yield",
        "fed",
        "ecb",
        "central bank",
        "nbp",
        "boj",
        "monetary policy",
    ],
    CONTEXT_COMMODITIES: [
        "oil",
        "gas",
        "lng",
        "coal",
        "gold",
        "silver",
        "copper",
        "ore",
        "commodity",
        "energy",
        "power",
    ],
    CONTEXT_CRYPTO: [
        "crypto",
        "bitcoin",
        "ethereum",
        "solana",
        "etf",
        "stablecoin",
        "token",
        "blockchain",
    ],
    CONTEXT_POLAND: [
        "gpw",
        "warsaw",
        "poland",
        "polish",
        "nbp",
        "wig20",
        "wig",
        "orlen",
        "pko",
        "pzu",
        "lpp",
        "kghm",
        "cd projekt",
    ],
}

TRUSTED_PROVIDER_MARKERS = ("reuters", "associated press", "ap", "bloomberg")

# Sources known for clickbait/filler content on Yahoo Finance feed — penalized in scoring
CLICKBAIT_PROVIDER_MARKERS = (
    "motley fool",
    "benzinga",
    "investorplace",
    "24/7 wall st",
    "247 wall st",
    "thestreet",
    "kiplinger",
    "gobankingrates",
    "moneywise",
    "fool.com",
    "stockanalysis",
    "smarteranalyst",
    "zacks",
)

# Clickbait title patterns — engagement bait without substance
_CLICKBAIT_TITLE_RE = re.compile(
    r"\b(should you|here'?s why|need to know|you need to|top \d+ stocks|best \d+ "
    r"etf|why you should|why you shouldn'?t|this is why|is it too late|will it "
    r"crash|could soar|could surge|could skyrocket|don'?t miss|massive gains|"
    r"hidden gem|secret|must.?buy|must.?own)\b",
    re.IGNORECASE,
)
LEGACY_QUERY_TO_CONTEXT = {
    "earnings": CONTEXT_EARNINGS,
    "dividend": CONTEXT_EARNINGS,
    "buyback": CONTEXT_EARNINGS,
    "guidance": CONTEXT_EARNINGS,
    "acquisition": CONTEXT_EARNINGS,
    "regulation": CONTEXT_GEOPOLITICS,
    "inflation": CONTEXT_MACRO,
    "rates": CONTEXT_RATES,
    "crypto": CONTEXT_CRYPTO,
}

_STYLE_MAP = {
    "krotko": "short",
    "krótko": "short",
    "krĂłtko": "short",
    "short": "short",
    "normalnie": "mid",
    "normal": "mid",
    "mid": "mid",
    "dlugo": "long",
    "długo": "long",
    "dĹ‚ugo": "long",
    "long": "long",
    "analitycznie": "long",
}

_QUERY_ALL_VALUES = {"", "wszystko", "all"}
_WATCH_ENTITY_PATTERNS: dict[str, tuple[str, ...]] = {
    "Iran": ("iran",),
    "Israel": ("israel",),
    "oil": ("oil", "oil supply"),
    "strait": ("strait",),
    "Hormuz": ("hormuz",),
}
_GEO_IMPLICATION_RULES: list[tuple[tuple[str, ...], str]] = [
    (
        ("oil", "oil supply", "strait", "hormuz"),
        "Wzmianki o ropie lub szlakach przesylowych podtrzymuja ryzyko wyzszej premii za ryzyko w cenach energii.",
    ),
    (
        ("sanctions",),
        "Pojawiajace sie odniesienia do sankcji zwiekszaja ryzyko zaklocen handlu i presji na lancuchy dostaw.",
    ),
    (
        ("missile", "missiles", "attack"),
        "Doniesienia o atakach lub pociskach zwiekszaja ryzyko dalszej eskalacji militarnej i reakcji odwetowych.",
    ),
    (
        ("iran", "israel"),
        "Jednoczesne wzmianki o Iranie i Izraelu podbijaja ryzyko dalszego rozszerzania sie napiec regionalnych.",
    ),
]

_THEME_KEYWORDS = {
    "political": ("iran", "israel", "gaza", "ukraine", "russia", "china", "taiwan", "military", "sanctions", "government", "minister"),
    "economic": ("oil", "gas", "energy", "shipping", "supply", "market", "price", "trade", "export", "import", "inflation"),
    "international": ("un", "united states", "us", "europe", "eu", "nato", "allies", "international", "diplomatic", "sanctions"),
}
_SECTOR_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("Energia", ("oil", "gas", "lng", "energy", "power", "hormuz", "strait")),
    ("Transport i logistyka", ("shipping", "freight", "port", "strait", "hormuz", "route")),
    ("Linie lotnicze", ("airline", "aviation", "flight", "jet fuel")),
    ("Obrona", ("military", "missile", "defense", "defence", "weapon")),
    ("Przemysl", ("supply chain", "commodity", "copper", "factory", "manufacturing")),
]
_GEO_IMPACT_KEYWORDS = (
    "sanction",
    "sanctions",
    "attack",
    "attacks",
    "oil",
    "hormuz",
    "nuclear",
    "shipping",
    "missile",
    "strait",
    "supply",
)


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _normalize_ticker_pairs(tickers: list[str] | None) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    seen: set[str] = set()
    for ticker in tickers or []:
        value = normalize_text(ticker).upper().strip()
        if not value or value in seen:
            continue
        seen.add(value)
        pairs.append((ticker, value))
    return pairs


def _normalize_tickers(tickers: list[str] | None) -> list[str]:
    return [normalized for _, normalized in _normalize_ticker_pairs(tickers)]


def normalize_style(style: str | None) -> str:
    cleaned = normalize_text(style or "").strip().casefold()
    return _STYLE_MAP.get(cleaned, "short")


def normalize_query(query: str | None) -> str | None:
    cleaned = normalize_text(query or "").strip()
    if cleaned.casefold() in _QUERY_ALL_VALUES:
        return None
    return cleaned or None


def normalize_context(context: str | None, query: str | None, geo_focus: str | None) -> str:
    normalized_context = normalize_text(context or "").strip()
    if normalized_context:
        if normalized_context in CONTEXT_KEYWORDS:
            return normalized_context
        lowered = normalized_context.casefold()
        for known in CONTEXT_KEYWORDS:
            if known.casefold() == lowered:
                return known

    normalized_query = normalize_query(query)
    if geo_focus and normalize_text(geo_focus).strip():
        return CONTEXT_GEOPOLITICS
    if normalized_query:
        mapped = LEGACY_QUERY_TO_CONTEXT.get(normalized_query.casefold())
        if mapped:
            return mapped
    return DEFAULT_CONTEXT


def normalize_continents(continents: list[str] | None, *, region: str | None = None) -> list[str]:
    raw_values = list(continents or [])
    if not raw_values and region:
        raw_values.append(region)

    deduped: list[str] = []
    seen: set[str] = set()

    for raw_value in raw_values:
        cleaned = normalize_text(str(raw_value or "")).strip().upper()
        if not cleaned:
            continue

        if cleaned not in CONTINENT_TO_AXESSO_REGIONS:
            normalized_region = normalize_region(cleaned)
            cleaned = LEGACY_REGION_TO_CONTINENT.get(cleaned) or LEGACY_REGION_TO_CONTINENT.get(normalized_region, "")
        if cleaned not in CONTINENT_TO_AXESSO_REGIONS or cleaned in seen:
            continue
        seen.add(cleaned)
        deduped.append(cleaned)

    return (deduped or list(DEFAULT_CONTINENTS))[:MAX_CONTINENTS_PER_REQUEST]


def normalize_requested_continents(continents: list[str] | None, *, region: str | None = None) -> list[str]:
    if not (continents or region):
        return []
    return normalize_continents(continents, region=region)


def _normalize_select_k(select_k: int) -> int:
    return max(SELECT_K_MIN, min(SELECT_K_MAX, int(select_k or SELECT_K_MIN)))


def _select_entries_by_items(
    ranked_entries: list[dict[str, Any]],
    selected_items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not selected_items:
        return []

    remaining = list(ranked_entries)
    picked_entries: list[dict[str, Any]] = []

    for item in selected_items:
        item_id = str(item.get("id") or "")
        match_index = next(
            (
                index
                for index, entry in enumerate(remaining)
                if entry["item"] is item or str(entry["item"].get("id") or "") == item_id
            ),
            None,
        )
        if match_index is None:
            continue
        picked_entries.append(remaining.pop(match_index))

    return picked_entries


def _normalize_summary_k(summary_k: int, *, select_k: int) -> int:
    return max(SUMMARY_K_MIN, min(SUMMARY_K_MAX, select_k, int(summary_k or SUMMARY_K_MIN)))


def _clamp_list_limit(list_limit: int | None) -> int:
    if list_limit is None:
        return HARD_LIST_LIMIT
    return max(0, min(int(list_limit), HARD_LIST_LIMIT))


def _monotonic_now() -> float:
    return time.monotonic()


def _parse_pub_date(pub_date: Any) -> datetime | None:
    if not pub_date:
        return None

    normalized = normalize_text(str(pub_date)).strip()
    if not normalized:
        return None

    candidates = [normalized]
    if normalized.endswith("Z"):
        candidates.append(f"{normalized[:-1]}+00:00")

    for candidate in candidates:
        try:
            parsed = datetime.fromisoformat(candidate)
            if parsed.tzinfo is None:
                return parsed.replace(tzinfo=UTC)
            return parsed.astimezone(UTC)
        except (TypeError, ValueError):
            continue

    try:
        parsed = datetime.strptime(normalized, "%Y-%m-%d")
        return parsed.replace(tzinfo=UTC)
    except (TypeError, ValueError):
        return None


def _filter_items_by_window(items: list[dict[str, Any]], *, window_hours: int, now: datetime | None = None) -> list[dict[str, Any]]:
    reference = now or _utc_now()
    cutoff = reference - timedelta(hours=window_hours)
    filtered: list[dict[str, Any]] = []

    for item in items:
        published_at = _parse_pub_date(item.get("pubDate"))
        if published_at is None or published_at >= cutoff:
            filtered.append(item)

    return filtered


def _limit_items_for_scoring(items: list[dict[str, Any]], *, max_items: int = MAX_ITEMS_FOR_SCORING) -> list[dict[str, Any]]:
    if len(items) <= max_items:
        return items

    return sorted(
        items,
        key=lambda item: _parse_pub_date(item.get("pubDate")) or datetime.min.replace(tzinfo=UTC),
        reverse=True,
    )[:max_items]


def _ticker_variants(ticker: str) -> list[str]:
    normalized_ticker = normalize_text(ticker).upper().strip()
    variants = [normalized_ticker]
    if "." in normalized_ticker:
        variants.append(normalized_ticker.split(".", 1)[0])
    variants.extend(normalize_text(alias).upper().strip() for alias in ALIASES.get(normalized_ticker, []))

    deduped: list[str] = []
    seen: set[str] = set()
    for variant in variants:
        if not variant:
            continue
        if variant in seen:
            continue
        seen.add(variant)
        deduped.append(variant)
    return deduped


def _text_matches_variant(text: str, variant: str) -> bool:
    normalized_text_value = normalize_text(text).casefold()
    normalized_variant = normalize_text(variant).casefold()
    compact_variant = re.sub(r"[^0-9A-Za-z]+", "", normalized_variant)
    if len(compact_variant) <= 4:
        return re.search(rf"(?<!\w){re.escape(normalized_variant)}(?!\w)", normalized_text_value) is not None
    return normalized_variant in normalized_text_value


def _field_matches_variants(text: str, variants: list[str]) -> bool:
    normalized = normalize_text(text or "")
    if not normalized:
        return False
    return any(_text_matches_variant(normalized, variant) for variant in variants)


def _matched_variants(text: str, variants: list[str]) -> list[str]:
    normalized = normalize_text(text or "")
    if not normalized:
        return []

    matches: list[str] = []
    seen: set[str] = set()
    for variant in variants:
        if not _text_matches_variant(normalized, variant):
            continue
        key = normalize_text(variant).casefold()
        if key in seen:
            continue
        seen.add(key)
        matches.append(variant)
    return matches


def _item_matches_stock_tickers(item: dict[str, Any], requested_tickers: set[str]) -> bool:
    if not requested_tickers:
        return True
    item_tickers = {normalize_text(ticker).upper() for ticker in (item.get("tickers") or []) if ticker}
    return bool(item_tickers & requested_tickers)


def _item_matches_text_fields(item: dict[str, Any], ticker: str, *, include_body_text: bool) -> bool:
    variants = _ticker_variants(ticker)
    values = [item.get("title") or "", item.get("summary") or ""]
    if include_body_text:
        values.append(item.get("bodyText") or "")
    haystack = " ".join(normalize_text(value) for value in values if value)
    if not haystack:
        return False
    return any(_text_matches_variant(haystack, variant) for variant in variants)


def _item_matches_text(item: dict[str, Any], ticker: str) -> bool:
    return _item_matches_text_fields(item, ticker, include_body_text=True)


def match_items_to_tickers(items: list[dict[str, Any]], tickers: list[str]) -> list[dict[str, Any]]:
    normalized_tickers = _normalize_tickers(tickers)
    if not normalized_tickers:
        return items

    requested = set(normalized_tickers)
    metadata_matches = [item for item in items if _item_matches_stock_tickers(item, requested)]
    if metadata_matches:
        return metadata_matches

    return [
        item
        for item in items
        if any(_item_matches_text(item, ticker) for ticker in normalized_tickers)
    ]


def _freshness_hours(item: dict[str, Any], *, now: datetime | None = None) -> float | None:
    published_at = _parse_pub_date(item.get("pubDate"))
    if published_at is None:
        return None
    reference = now or _utc_now()
    delta = reference - published_at
    return max(0.0, delta.total_seconds() / 3600)


def _freshness_boost(item: dict[str, Any], *, now: datetime | None = None) -> tuple[float, str | None]:
    age_hours = _freshness_hours(item, now=now)
    if age_hours is None:
        return -0.5, "freshness unknown"
    if age_hours < 6:
        return 1.5, "fresh <6h"
    if age_hours < 24:
        return 0.75, "fresh <24h"
    if age_hours < 72:
        return 0.25, "fresh <72h"
    return 0.0, None


def _provider_boost(item: dict[str, Any]) -> tuple[int, str | None]:
    provider = normalize_text(item.get("provider") or "").casefold()
    if not provider:
        return 0, None
    for marker in CLICKBAIT_PROVIDER_MARKERS:
        if marker in provider:
            return -3, f"clickbait source: {normalize_text(item.get('provider') or '')}"
    for marker in TRUSTED_PROVIDER_MARKERS:
        if marker in provider:
            return 2, normalize_text(item.get("provider") or "")
    return 0, None


def _title_quality_penalty(item: dict[str, Any]) -> tuple[int, str | None]:
    """Penalize titles that are engagement bait without hard data."""
    title = item.get("title") or ""
    if _CLICKBAIT_TITLE_RE.search(title):
        return -2, "clickbait title pattern"
    # Penalize question-only titles (no number, no proper noun signal)
    stripped = title.strip()
    if stripped.endswith("?") and not re.search(r"\d", stripped):
        return -1, "rhetorical question title"
    return 0, None


def _context_query_variants(context: str, query: str | None, geo_focus: str | None) -> list[str]:
    variants = list(CONTEXT_KEYWORDS.get(context, []))
    if query and normalize_query(query):
        normalized_query = normalize_query(query) or ""
        variants.extend(part.strip() for part in re.split(r"[,\s/|]+", normalized_query) if part.strip())
        variants.append(normalized_query)
    if geo_focus and normalize_text(geo_focus).strip():
        variants.extend(part.strip() for part in re.split(r"[,/|]+", normalize_text(geo_focus)) if part.strip())

    deduped: list[str] = []
    seen: set[str] = set()
    for variant in variants:
        normalized = normalize_text(variant).strip()
        if not normalized:
            continue
        key = normalized.casefold()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(normalized)
    return deduped


def _ensure_sentence(text: str) -> str:
    compact = " ".join(normalize_text(text).split()).strip(" -")
    if not compact:
        return ""
    if compact[-1] not in ".!?":
        return f"{compact}."
    return compact


def _split_sentences(*parts: str) -> list[str]:
    sentences: list[str] = []
    seen: set[str] = set()
    for part in parts:
        normalized = normalize_text(part or "").strip()
        if not normalized:
            continue
        segments = re.split(r"(?<=[.!?])\s+|\n+", normalized)
        for segment in segments:
            sentence = _ensure_sentence(segment)
            key = sentence.casefold()
            if not sentence or key in seen:
                continue
            seen.add(key)
            sentences.append(sentence)
    return sentences


def _key_points_from_text(detail: dict[str, Any] | None, fallback_item: dict[str, Any]) -> list[str]:
    source = detail or fallback_item
    points = _split_sentences(
        detail.get("title") if detail else fallback_item.get("title") or "",
        source.get("summary") or fallback_item.get("summary") or "",
        source.get("bodyText") or "",
    )
    return points[:4]


def _combine_source_text(item: dict[str, Any], detail: dict[str, Any] | None, reasons: list[str]) -> str:
    return " ".join(
        normalize_text(part)
        for part in [
            item.get("title") or "",
            item.get("summary") or "",
            (detail or {}).get("summary") or "",
            (detail or {}).get("bodyText") or "",
            " ".join(reasons),
        ]
        if part
    ).casefold()


def _build_implication_points(
    selected_entries: list[dict[str, Any]],
    *,
    details_by_id: dict[str, dict[str, Any]],
    context: str,
) -> list[str]:
    if context != CONTEXT_GEOPOLITICS:
        return []

    corpus = [
        _combine_source_text(
            entry["item"],
            details_by_id.get(str(entry["item"].get("id") or "")),
            entry["scores"]["why_selected"],
        )
        for entry in selected_entries
    ]
    full_text = " ".join(corpus)
    points: list[str] = []

    for keywords, text in _GEO_IMPLICATION_RULES:
        if set(keywords) == {"iran", "israel"}:
            matched = all(keyword in full_text for keyword in keywords)
        else:
            matched = any(keyword in full_text for keyword in keywords)
        if matched:
            points.append(_ensure_sentence(text))

    return points


def _build_watch_points(
    selected_entries: list[dict[str, Any]],
    *,
    details_by_id: dict[str, dict[str, Any]],
) -> list[str]:
    counts: dict[str, int] = {label: 0 for label in _WATCH_ENTITY_PATTERNS}

    for entry in selected_entries:
        item = entry["item"]
        detail = details_by_id.get(str(item.get("id") or ""))
        blob = _combine_source_text(item, detail, entry["scores"]["why_selected"])
        for label, patterns in _WATCH_ENTITY_PATTERNS.items():
            if any(pattern in blob for pattern in patterns):
                counts[label] += 1

    templates = {
        "Iran": "Iran: kolejne komunikaty o retorsjach, odpowiedzi lub zmianie tonu.",
        "Israel": "Israel: nowe ruchy militarne lub polityczne w kolejnych depeszach.",
        "oil": "oil: czy kolejne publikacje lacza napiecia z cenami lub podaza ropy.",
        "strait": "strait: wzmianki o zakloceniach zeglugi i dostepnosci szlakow.",
        "Hormuz": "Hormuz: informacje o przepustowosci i bezpieczenstwie transportu.",
    }
    return [_ensure_sentence(templates[label]) for label, count in counts.items() if count >= 1]


def _context_signals(item: dict[str, Any], *, context: str, geo_focus: str | None, query: str | None, now: datetime) -> dict[str, Any]:
    title = item.get("title") or ""
    summary = item.get("summary") or ""
    reasons: list[str] = []
    score = 0.0
    geo_score = 0.0

    context_keywords = CONTEXT_KEYWORDS.get(context, [])
    title_matches = _matched_variants(title, context_keywords)
    summary_matches = _matched_variants(summary, context_keywords)

    if context == CONTEXT_GEOPOLITICS:
        if title_matches:
            geo_score += 3
            score += 3
        if summary_matches:
            geo_score += 1
            score += 1
    else:
        if title_matches:
            score += 3
        if summary_matches:
            score += 1

    if title_matches or summary_matches:
        keyword_list = ", ".join(title_matches[:2] + [match for match in summary_matches if match not in title_matches][:2])
        if keyword_list:
            reasons.append(f"keywords: {keyword_list}")

    normalized_geo_focus = normalize_text(geo_focus or "").strip()
    if normalized_geo_focus:
        geo_variants = [variant.strip() for variant in re.split(r"[/|,]+", normalized_geo_focus) if variant.strip()]
        if _field_matches_variants(title, geo_variants) or _field_matches_variants(summary, geo_variants):
            score += 5
            geo_score += 5
            reasons.append(f"geo_focus match: {normalized_geo_focus}")

    normalized_query = normalize_query(query)
    if normalized_query and normalized_query.casefold() not in {keyword.casefold() for keyword in context_keywords}:
        query_variants = _context_query_variants(context, normalized_query, None)
        query_title_matches = _matched_variants(title, query_variants)
        query_summary_matches = _matched_variants(summary, query_variants)
        if query_title_matches:
            score += 2
            reasons.append(f"query match: {query_title_matches[0]}")
        elif query_summary_matches:
            score += 1
            reasons.append(f"query match: {query_summary_matches[0]}")

    provider_score, provider_reason = _provider_boost(item)
    if provider_score:
        score += provider_score
        if provider_reason:
            reasons.append(provider_reason)

    title_penalty, title_reason = _title_quality_penalty(item)
    if title_penalty:
        score += title_penalty
        if title_reason:
            reasons.append(title_reason)

    freshness_score, freshness_reason = _freshness_boost(item, now=now)
    score += freshness_score
    if freshness_reason:
        reasons.append(freshness_reason)

    return {
        "context_score": score,
        "geo_score": geo_score,
        "why_selected": reasons,
    }


def _ticker_signals(item: dict[str, Any], tickers: list[str]) -> dict[str, Any]:
    score = 0.0
    reasons: list[str] = []
    title = item.get("title") or ""
    summary = item.get("summary") or ""

    for ticker in tickers:
        if _item_matches_stock_tickers(item, {ticker}):
            score += 5
            reasons.append(f"ticker metadata: {ticker}")
        variants = _ticker_variants(ticker)
        if _matched_variants(title, variants):
            score += 3
            reasons.append(f"ticker/title match: {ticker}")
        if _matched_variants(summary, variants):
            score += 1
            reasons.append(f"ticker/summary match: {ticker}")

    return {
        "ticker_score": score,
        "why_selected": reasons,
    }


def score_item(
    item: dict[str, Any],
    *,
    context: str,
    geo_focus: str | None,
    tickers: list[str],
    query: str | None,
    now: datetime,
) -> dict[str, Any]:
    context_signals = _context_signals(item, context=context, geo_focus=geo_focus, query=query, now=now)
    ticker_signals = _ticker_signals(item, tickers)
    why_selected = context_signals["why_selected"] + ticker_signals["why_selected"]
    deduped_why: list[str] = []
    seen: set[str] = set()
    for reason in why_selected:
        key = reason.casefold()
        if key in seen:
            continue
        seen.add(key)
        deduped_why.append(reason)

    return {
        "total_score": context_signals["context_score"] + ticker_signals["ticker_score"],
        "geo_score": context_signals["geo_score"],
        "context_score": context_signals["context_score"],
        "ticker_score": ticker_signals["ticker_score"],
        "why_selected": deduped_why,
    }


def _sort_ranked_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        entries,
        key=lambda entry: (
            -float(entry["scores"]["total_score"]),
            -float(entry["scores"]["geo_score"]),
            -float(entry["freshness_sort"]),
            int(entry["index"]),
        ),
    )


def _apply_geo_quota(ranked_entries: list[dict[str, Any]], *, list_limit: int) -> list[dict[str, Any]]:
    if list_limit <= 0:
        return []

    required_geo = min(len(ranked_entries), ceil(list_limit * 0.6))
    geo_ranked = [entry for entry in ranked_entries if float(entry["scores"]["geo_score"]) > 0]
    geo_ranked = sorted(
        geo_ranked,
        key=lambda entry: (
            -float(entry["scores"]["geo_score"]),
            -float(entry["scores"]["total_score"]),
            -float(entry["freshness_sort"]),
            int(entry["index"]),
        ),
    )

    selected: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for entry in geo_ranked[:required_geo]:
        item_id = str(entry["item"].get("id") or "")
        if item_id and item_id in seen_ids:
            continue
        if item_id:
            seen_ids.add(item_id)
        selected.append(entry)

    for entry in ranked_entries:
        if len(selected) >= list_limit:
            break
        item_id = str(entry["item"].get("id") or "")
        if item_id and item_id in seen_ids:
            continue
        if item_id:
            seen_ids.add(item_id)
        selected.append(entry)

    return selected[:list_limit]


def _entry_sentences(item: dict[str, Any], detail: dict[str, Any] | None) -> list[str]:
    return _split_sentences(
        detail.get("title") if detail else item.get("title") or "",
        detail.get("summary") if detail else item.get("summary") or "",
        item.get("summary") or "",
        detail.get("bodyText") if detail else "",
    )


def _collect_sentence_records(
    selected_entries: list[dict[str, Any]],
    *,
    details_by_id: dict[str, dict[str, Any]],
) -> list[dict[str, str]]:
    records: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()

    for entry in selected_entries:
        item = entry["item"]
        item_id = str(item.get("id") or "")
        detail = details_by_id.get(item_id)
        for sentence in _entry_sentences(item, detail)[:6]:
            key = (item_id, sentence.casefold())
            if key in seen:
                continue
            seen.add(key)
            records.append({"item_id": item_id, "text": sentence, "blob": normalize_text(sentence).casefold()})

    return records


def _pick_sentences(
    records: list[dict[str, str]],
    *,
    keywords: tuple[str, ...] | None = None,
    limit: int = 3,
    exclude: set[str] | None = None,
) -> list[str]:
    picked: list[str] = []
    seen = set(exclude or set())

    for record in records:
        if len(picked) >= limit:
            break
        text = record["text"]
        key = text.casefold()
        if key in seen:
            continue
        if keywords and not any(keyword in record["blob"] for keyword in keywords):
            continue
        seen.add(key)
        picked.append(text)

    return picked


def _compose_paragraph(
    preferred: list[str],
    fallback: list[str],
    *,
    min_sentences: int = 3,
    max_sentences: int = 4,
) -> str:
    sentences: list[str] = []
    seen: set[str] = set()

    for source in [preferred, fallback]:
        for sentence in source:
            key = sentence.casefold()
            if key in seen:
                continue
            seen.add(key)
            sentences.append(sentence)
            if len(sentences) >= max_sentences:
                return " ".join(sentences)

    if len(sentences) >= min_sentences:
        return " ".join(sentences)
    return " ".join(sentences)


def _entry_blob(entry: dict[str, Any], details_by_id: dict[str, dict[str, Any]]) -> str:
    item = entry["item"]
    item_id = str(item.get("id") or "")
    detail = details_by_id.get(item_id)
    return _combine_source_text(item, detail, entry["scores"]["why_selected"])


def _entry_importance(entry: dict[str, Any], details_by_id: dict[str, dict[str, Any]]) -> tuple[float, str]:
    score = float(entry["scores"]["total_score"])
    blob = _entry_blob(entry, details_by_id)
    score += min(4, sum(1 for keyword in _GEO_IMPACT_KEYWORDS if keyword in blob))
    if "reuters" in blob:
        score += 1.5

    if score >= 12:
        return score, "wysoka"
    if score >= 7:
        return score, "srednia"
    return score, "niska"


def _waznosc_sort_key(waznosc: str) -> int:
    return {"wysoka": 0, "srednia": 1, "niska": 2}.get(waznosc, 3)


def _match_market_sentence(records: list[dict[str, str]], keywords: tuple[str, ...], *, limit: int = 1) -> list[str]:
    return _pick_sentences(records, keywords=keywords, limit=limit)


def _build_tldr(
    *,
    co_sie_stalo: str,
    reakcja: str,
    konsekwencja_rynkowa: str,
    co_obserwowac: str,
) -> str:
    first = _ensure_sentence(co_sie_stalo)
    second = _ensure_sentence(konsekwencja_rynkowa or reakcja or co_obserwowac)
    return " ".join(part for part in [first, second] if part).strip()


def _build_short_summary(
    selected_entries: list[dict[str, Any]],
    *,
    details_by_id: dict[str, dict[str, Any]],
    context: str,
) -> dict[str, str]:
    if not selected_entries:
        return {
            "co_sie_stalo": "",
            "reakcja": "",
            "konsekwencja_rynkowa": "",
            "co_obserwowac": "",
        }

    records = _collect_sentence_records(selected_entries, details_by_id=details_by_id)
    implications = _build_implication_points(selected_entries, details_by_id=details_by_id, context=context)
    watch_points = _build_watch_points(selected_entries, details_by_id=details_by_id)
    general = [record["text"] for record in records]
    reaction = _pick_sentences(
        records,
        keywords=("retali", "response", "sanction", "warn", "market", "price", "military", "decision"),
        limit=1,
    )
    impact = _pick_sentences(records, keywords=("oil", "gas", "shipping", "supply", "trade", "market", "energy"), limit=1)

    return {
        "co_sie_stalo": general[0] if general else "",
        "reakcja": reaction[0] if reaction else (general[1] if len(general) > 1 else ""),
        "konsekwencja_rynkowa": implications[0] if implications else (impact[0] if impact else ""),
        "co_obserwowac": watch_points[0] if watch_points else "",
    }


def _build_mid_summary(
    selected_entries: list[dict[str, Any]],
    *,
    details_by_id: dict[str, dict[str, Any]],
    context: str,
) -> dict[str, Any]:
    implications = _build_implication_points(selected_entries, details_by_id=details_by_id, context=context)
    watch_points = _build_watch_points(selected_entries, details_by_id=details_by_id)
    short_summary = _build_short_summary(selected_entries, details_by_id=details_by_id, context=context)

    watki: list[dict[str, str]] = []
    for entry in selected_entries[:5]:
        item = entry["item"]
        item_id = str(item.get("id") or "")
        detail = details_by_id.get(item_id)
        sentences = _entry_sentences(item, detail)
        if not sentences:
            continue

        importance_score, waznosc = _entry_importance(entry, details_by_id)
        blob = _entry_blob(entry, details_by_id)
        local_implications = [
            point
            for point in implications
            if any(keyword in blob for keyword in ("oil", "shipping", "sanction", "attack", "hormuz", "nuclear"))
        ]
        fallback = local_implications + watch_points + sentences
        text = _compose_paragraph(sentences[:3], fallback, min_sentences=3, max_sentences=4)
        if not text:
            continue
        watki.append(
            {
                "tytul": normalize_text((detail or {}).get("title") or item.get("title") or ""),
                "waznosc": waznosc,
                "tekst": text,
                "_score": str(importance_score),
            }
        )

    watki.sort(key=lambda item: (_waznosc_sort_key(item["waznosc"]), -float(item["_score"])))
    for watek in watki:
        watek.pop("_score", None)

    return {
        "watki": watki[:5],
        "tl_dr": _build_tldr(
            co_sie_stalo=short_summary.get("co_sie_stalo", ""),
            reakcja=short_summary.get("reakcja", ""),
            konsekwencja_rynkowa=short_summary.get("konsekwencja_rynkowa", ""),
            co_obserwowac=short_summary.get("co_obserwowac", ""),
        ),
    }


def _shorten_clause(text: str) -> str:
    sentence = _ensure_sentence(text)
    if not sentence:
        return ""
    return sentence.rstrip(".!?")[:140].strip()


def _build_market_implications(records: list[dict[str, str]]) -> list[dict[str, str]]:
    impacts: list[dict[str, str]] = []
    mapping = [
        ("Ropa/energia", ("oil", "gas", "lng", "energy", "power", "hormuz", "strait", "shipping")),
        ("Inflacja/stopy", ("inflation", "price", "prices", "energy", "supply", "shipping", "trade")),
        ("Ryzyko rynkowe", ("sanction", "sanctions", "attack", "war", "conflict", "military", "nuclear")),
    ]
    for obszar, keywords in mapping:
        matches = _pick_sentences(records, keywords=keywords, limit=2)
        mechanism = _compose_paragraph(matches, [], min_sentences=1, max_sentences=2)
        if mechanism:
            impacts.append({"obszar": obszar, "mechanizm": mechanism})
    return impacts


def _build_scenarios(
    *,
    short_summary: dict[str, str],
    watch_points: list[str],
    aktywa_wrazliwe: list[str],
) -> list[dict[str, Any]]:
    if not any(short_summary.values()) and not watch_points:
        return []

    return [
        {
            "nazwa": "Bazowy",
            "trigger": short_summary.get("co_sie_stalo", ""),
            "mechanizm": short_summary.get("konsekwencja_rynkowa", "") or short_summary.get("reakcja", ""),
            "aktywa_wrazliwe": aktywa_wrazliwe,
            "horyzont": "",
        },
        {
            "nazwa": "Eskalacyjny",
            "trigger": watch_points[0] if watch_points else short_summary.get("reakcja", ""),
            "mechanizm": short_summary.get("konsekwencja_rynkowa", ""),
            "aktywa_wrazliwe": aktywa_wrazliwe,
            "horyzont": "",
        },
        {
            "nazwa": "Deeskalacyjny",
            "trigger": short_summary.get("reakcja", ""),
            "mechanizm": "",
            "aktywa_wrazliwe": aktywa_wrazliwe,
            "horyzont": "",
        },
    ]


def _build_long_summary(
    selected_entries: list[dict[str, Any]],
    *,
    details_by_id: dict[str, dict[str, Any]],
    context: str,
) -> dict[str, Any]:
    records = _collect_sentence_records(selected_entries, details_by_id=details_by_id)
    implications = _build_implication_points(selected_entries, details_by_id=details_by_id, context=context)
    watch_points = _build_watch_points(selected_entries, details_by_id=details_by_id)
    short_summary = _build_short_summary(selected_entries, details_by_id=details_by_id, context=context)
    ryzyka_globalne = list(dict.fromkeys(implications + watch_points))

    tematy: list[dict[str, Any]] = []
    for entry in selected_entries[:3]:
        item = entry["item"]
        item_id = str(item.get("id") or "")
        detail = details_by_id.get(item_id)
        sentences = _entry_sentences(item, detail)
        if not sentences:
            continue
        blob = _entry_blob(entry, details_by_id)
        mechanizm_wplywu = ""
        if any(keyword in blob for keyword in _GEO_IMPACT_KEYWORDS):
            mechanizm_wplywu = implications[0] if implications else (sentences[1] if len(sentences) > 1 else "")

        tematy.append(
            {
                "tytul": normalize_text((detail or {}).get("title") or item.get("title") or ""),
                "stan_obecny": sentences[0] if len(sentences) > 0 else "",
                "mechanizm_wplywu": mechanizm_wplywu,
                "konsekwencje": implications[0] if implications else (sentences[2] if len(sentences) > 2 else ""),
                "ryzyka": ryzyka_globalne[:2],
            }
        )

    implikacje_rynkowe = _build_market_implications(records)
    aktywa_wrazliwe = [item["obszar"] for item in implikacje_rynkowe[:3]]

    lancuch_przyczynowy: list[str] = []
    clauses = [
        _shorten_clause(short_summary.get("co_sie_stalo", "")),
        _shorten_clause(short_summary.get("reakcja", "")),
        _shorten_clause(short_summary.get("konsekwencja_rynkowa", "")),
    ]
    clauses = [clause for clause in clauses if clause]
    if clauses:
        lancuch_przyczynowy.append(" -> ".join(clauses))

    return {
        "tematy": tematy,
        "lancuch_przyczynowy": lancuch_przyczynowy,
        "implikacje_rynkowe": implikacje_rynkowe,
        "scenariusze": _build_scenarios(
            short_summary=short_summary,
            watch_points=watch_points,
            aktywa_wrazliwe=aktywa_wrazliwe,
        ),
    }


def _build_structured_summary(
    selected_entries: list[dict[str, Any]],
    *,
    details_by_id: dict[str, dict[str, Any]],
    context: str,
    style: str,
) -> dict[str, Any]:
    if style == "long":
        return _build_long_summary(selected_entries, details_by_id=details_by_id, context=context)
    if style == "mid":
        return _build_mid_summary(selected_entries, details_by_id=details_by_id, context=context)
    return _build_short_summary(selected_entries, details_by_id=details_by_id, context=context)


def _render_structured_brief(style: str, summary: dict[str, Any]) -> str:
    if style == "short":
        return normalize_text(str(summary.get("summary") or "")).strip()

    items = summary.get("items") if isinstance(summary.get("items"), list) else []
    lines: list[str] = []
    if summary.get("headline"):
        lines.append(str(summary.get("headline")))
    for item in items[:5]:
        if not isinstance(item, dict):
            continue
        title = normalize_text(str(item.get("title") or "")).strip()
        body = normalize_text(str(item.get("body") or "")).strip()
        if title:
            lines.append(title)
        if body:
            lines.append(body)
    return "\n\n".join(line for line in lines if line)


def _build_debug_metrics(
    *,
    list_fetch_status: str,
    ticker_pairs: list[tuple[str, str]],
    items: list[dict[str, Any]],
    selected_ids_by_ticker: dict[str, list[str]],
) -> dict[str, Any]:
    per_ticker: list[dict[str, Any]] = []
    for ticker_input, ticker in ticker_pairs:
        finance_matches = [item for item in items if _item_matches_stock_tickers(item, {ticker})]
        text_matches = [item for item in items if _item_matches_text_fields(item, ticker, include_body_text=False)]
        per_ticker.append(
            {
                "ticker_input": ticker_input,
                "ticker_normalized": ticker,
                "filtered_by_finance_count": len(finance_matches),
                "filtered_by_text_count": len(text_matches),
                "selected_ids": selected_ids_by_ticker.get(ticker, [])[:5],
            }
        )
    return {
        "list_fetch_status": list_fetch_status,
        "list_items_total": len(items),
        "per_ticker": per_ticker,
    }


def _item_matches_requested_tickers(item: dict[str, Any], tickers: list[str]) -> bool:
    if not tickers:
        return True
    return any(
        _item_matches_stock_tickers(item, {ticker}) or _item_matches_text(item, ticker)
        for ticker in tickers
    )


def _item_dedupe_key(item: dict[str, Any]) -> str:
    url = normalize_text(item.get("clickUrl") or "").strip().casefold()
    item_id = normalize_text(str(item.get("id") or "")).strip().casefold()
    if url:
        return f"url:{url}"
    if item_id:
        return f"id:{item_id}"
    fallback = "|".join(
        normalize_text(part).strip().casefold()
        for part in [item.get("title") or "", item.get("provider") or "", item.get("pubDate") or ""]
    )
    return f"fallback:{fallback}"


def _dedupe_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: dict[str, dict[str, Any]] = {}
    for item in items:
        key = _item_dedupe_key(item)
        current = deduped.get(key)
        if current is None:
            deduped[key] = item
            continue
        current_summary_len = len(normalize_text(current.get("summary") or ""))
        incoming_summary_len = len(normalize_text(item.get("summary") or ""))
        if incoming_summary_len > current_summary_len:
            deduped[key] = item
    return list(deduped.values())


def _build_sources(
    selected_entries: list[dict[str, Any]],
    *,
    details_by_id: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    sources: list[dict[str, Any]] = []
    for entry in selected_entries:
        item = entry["item"]
        item_id = str(item.get("id") or "")
        detail = details_by_id.get(item_id)
        sources.append(
            {
                "id": item_id,
                "title": normalize_text((detail or {}).get("title") or item.get("title") or ""),
                "provider": normalize_text((detail or {}).get("provider") or item.get("provider") or ""),
                "published_at": (detail or {}).get("pubDate") or item.get("pubDate"),
                "url": (detail or {}).get("url") or item.get("clickUrl"),
            }
        )
    return sources


def _load_prompt(name: str) -> str:
    prompt_path = PROMPTS_DIR / name
    return prompt_path.read_text(encoding="utf-8").strip()


def _pick_internal_short_template(preference_context: str | None) -> str:
    hint = normalize_text(preference_context or "").casefold()
    if any(token in hint for token in ("risk", "ryzy", "uncertainty", "niepewnosc")):
        return PROMPT_SHORT_RISK
    if any(token in hint for token in ("trader", "trading", "market impact", "fx", "intraday")):
        return PROMPT_SHORT_TRADER
    return PROMPT_SHORT_ANALYST


def _prompt_template_name_for_style(style: str, *, preference_context: str | None = None) -> str:
    if style == "short":
        return _pick_internal_short_template(preference_context)
    if style == "mid":
        return PROMPT_MID
    return PROMPT_LONG


def _non_empty_text(value: Any, fallback: str) -> str:
    text = normalize_text(str(value or "")).strip()
    return text or fallback


def _normalize_sources_payload(sources: Any) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    if not isinstance(sources, list):
        return normalized
    for src in sources:
        if not isinstance(src, dict):
            continue
        normalized.append(
            {
                "title": _non_empty_text(src.get("title"), "Brak tytulu zrodla"),
                "url": normalize_text(str(src.get("url") or "")).strip(),
                "publisher": _non_empty_text(src.get("publisher"), "Nieznany wydawca"),
                "published_at": _non_empty_text(src.get("published_at"), "Brak daty publikacji"),
            }
        )
    return normalized


def _normalize_market_impact(items: Any) -> list[dict[str, str]]:
    output: list[dict[str, str]] = []
    if not isinstance(items, list):
        return output
    valid_directions = {"positive", "negative", "mixed", "unclear"}
    for item in items[:6]:
        if not isinstance(item, dict):
            continue
        asset = _non_empty_text(item.get("asset"), "")
        why = _non_empty_text(item.get("why"), "")
        direction = normalize_text(str(item.get("direction") or "")).strip().lower()
        if not asset or not why:
            continue
        output.append(
            {
                "asset": asset,
                "direction": direction if direction in valid_directions else "unclear",
                "why": why,
            }
        )
    return output


def _normalize_watchlist(items: Any) -> list[str]:
    if not isinstance(items, list):
        return []
    output = [_non_empty_text(item, "") for item in items]
    output = [item for item in output if item]
    return output[:5]


def _mode_from_style(style: str) -> str:
    if style == "short":
        return "quick"
    if style == "long":
        return "extended"
    return "standard"


def _item_bounds_for_style(style: str) -> tuple[int, int]:
    if style == "short":
        return (1, 3)
    if style == "long":
        return (4, 5)
    return (3, 4)


def _theme_from_continents(continents: list[str]) -> str:
    themes: list[str] = []
    if "ME" in continents:
        themes.append("energii, szlakow transportowych i premii za ryzyko")
    if "EU" in continents:
        themes.append("europejskich aktywow wrazliwych na energie i inflacje")
    if "NA" in continents:
        themes.append("USD, rentownosci i globalnego sentymentu")
    if "AS" in continents:
        themes.append("lancuchow dostaw i aktywow azjatyckich")
    if "SA" in continents or "AF" in continents or "OC" in continents:
        themes.append("rynkow surowcowych i walut EM")
    if not themes:
        return "globalnych aktywow ryzykownych i defensywnych"
    return "; ".join(themes[:2])


def _looks_like_region_list(text: str) -> bool:
    lowered = normalize_text(text).casefold()
    tokens = ["ameryka", "europa", "azja", "afryka", "australia", "bliski wschod", ";", ","]
    score = sum(1 for token in tokens if token in lowered)
    return score >= 2


def _build_focus_framing(*, geo_focus: str | None, query: str | None, continents: list[str]) -> str:
    normalized_query = normalize_text(query or "").strip()
    normalized_focus = normalize_text(geo_focus or "").strip()
    if normalized_query:
        return normalized_query
    if normalized_focus and not _looks_like_region_list(normalized_focus):
        return normalized_focus
    return f"wplywu geopolityki na { _theme_from_continents(continents) }"


def _compress_to_paragraph(text: str, *, min_sentences: int = 2, max_sentences: int = 3) -> str:
    sentences = _split_sentences(text)
    if not sentences:
        return ""
    selected = sentences[:max_sentences]
    while len(selected) < min_sentences:
        selected.append("Skala reakcji zalezy od potwierdzenia kolejnych informacji.")
    return " ".join(selected)


def _safe_block_title(title: str, fallback: str) -> str:
    normalized = normalize_text(title).strip()
    if not normalized:
        return fallback
    lowered = normalized.casefold()
    if any(token in lowered for token in GENERIC_BLOCK_TITLES):
        return fallback
    return normalized


def _parse_preference_context(preference_context: str | None) -> dict[str, Any]:
    parsed = {
        "assets": [],
        "regions": [],
        "topics": [],
        "search_profile_text": "",
        "response_style": "",
        "notes": "",
    }
    if not preference_context:
        return parsed

    list_label_map = {
        "Interesujace aktywa:": "assets",
        "Interesujace regiony:": "regions",
        "Interesujace tematy:": "topics",
    }
    text_label_map = {
        "Profil wyszukiwania:": "search_profile_text",
        "Preferowany styl odpowiedzi:": "response_style",
        "Dodatkowe notatki:": "notes",
    }
    for raw_line in preference_context.splitlines():
        line = normalize_text(raw_line).strip()
        if not line:
            continue
        for label, field in list_label_map.items():
            if line.lower().startswith(label.lower()):
                tail = line[len(label):].strip()
                parsed[field] = [item.strip() for item in tail.split(",") if item.strip()][:5]
                break
        for label, field in text_label_map.items():
            if line.lower().startswith(label.lower()):
                parsed[field] = line[len(label):].strip()
                break
    return parsed


def _derived_focus_from_regions(continents: list[str]) -> str:
    labels = [CONTINENT_LABELS.get(code, code) for code in continents if code]
    if not labels:
        return ""
    return f"Regiony: {', '.join(labels[:3])}"


def build_brief_context(
    user_question: str | None,
    user_preferences: str | None,
    selected_regions: list[str],
    mode: str,
    geo_focus: str | None = None,
) -> dict[str, Any]:
    normalized_question = normalize_query(user_question)
    normalized_geo_focus = normalize_text(geo_focus or "").strip()
    preference = _parse_preference_context(user_preferences)

    profile_focus_candidates = [
        normalize_text(str(preference.get("search_profile_text") or "")).strip(),
        normalize_text(str(preference.get("notes") or "")).strip(),
        ", ".join(preference.get("topics", [])[:3]),
        ", ".join(preference.get("assets", [])[:3]),
    ]
    profile_focus = next((candidate for candidate in profile_focus_candidates if candidate), "")
    region_focus = _derived_focus_from_regions(selected_regions)

    if normalized_question:
        main_focus = normalized_question
    elif profile_focus:
        main_focus = profile_focus
    elif normalized_geo_focus:
        main_focus = normalized_geo_focus
    elif region_focus:
        main_focus = region_focus
    else:
        main_focus = ""

    ranking_hints = [
        *preference.get("assets", [])[:4],
        *preference.get("topics", [])[:4],
        *preference.get("regions", [])[:3],
    ]
    deduped_hints: list[str] = []
    seen: set[str] = set()
    for hint in ranking_hints:
        normalized = normalize_text(str(hint or "")).strip()
        if not normalized:
            continue
        key = normalized.casefold()
        if key in seen:
            continue
        seen.add(key)
        deduped_hints.append(normalized)

    return {
        "primary_question": normalized_question or "",
        "profile_context": normalize_text(user_preferences or "").strip(),
        "profile_focus": profile_focus,
        "region_context": region_focus,
        "response_style": normalize_text(str(preference.get("response_style") or "")).strip(),
        "template_mode": mode,
        "main_focus": main_focus,
        "ranking_hints": deduped_hints,
    }


def _clean_quick_summary_text(text: str) -> str:
    cleaned = normalize_text(text or "")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    cleaned = re.sub(r"^\s*[-*•\d.)]+\s*", "", cleaned)
    cleaned = re.sub(
        r"^(teza|fakty|analiza|wplyw na rynki|scenariusze|co monitorowac|podsumowanie)\s*[:\-]\s*",
        "",
        cleaned,
        flags=re.IGNORECASE,
    ).strip()
    return cleaned


def _is_quick_interpretive_sentence(sentence: str) -> bool:
    lowered = normalize_text(sentence).casefold()
    if any(phrase in lowered for phrase in QUICK_INTERPRETATION_PHRASES):
        return True
    return any(re.search(pattern, lowered) for pattern in QUICK_INTERPRETATION_PATTERNS)


def _quick_meta_phrase_present(text: str) -> bool:
    lowered = normalize_text(text).casefold()
    if any(phrase in lowered for phrase in QUICK_META_BLOCKLIST):
        return True
    return bool(re.search(r"\b(pytanie inwestycyjne|horyzont|profil|zakres analizy)\s*:", lowered))


def _quick_tokens(text: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[A-Za-z0-9]{4,}", normalize_text(text).casefold())
        if token not in {"oraz", "ktore", "ktory", "brief", "profil", "regiony", "pytanie"}
    }


def _jaccard_similarity(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    union = left | right
    if not union:
        return 0.0
    return len(left & right) / len(union)


def _quick_summary_mentions_news(summary: str, sources: list[dict[str, str]]) -> bool:
    if not sources:
        return True
    summary_tokens = _quick_tokens(summary)
    if not summary_tokens:
        return False
    source_blob = " ".join(
        f"{source.get('title', '')} {source.get('summary', '')}"
        for source in sources
        if isinstance(source, dict)
    )
    source_tokens = _quick_tokens(source_blob)
    return _jaccard_similarity(summary_tokens, source_tokens) >= 0.12


def _looks_like_user_input_paraphrase(summary: str, user_inputs: list[str], sources: list[dict[str, str]]) -> bool:
    summary_tokens = _quick_tokens(summary)
    if not summary_tokens:
        return False
    input_blob = " ".join(normalize_text(text) for text in user_inputs if normalize_text(text).strip())
    input_tokens = _quick_tokens(input_blob)
    if not input_tokens:
        return False
    input_overlap = _jaccard_similarity(summary_tokens, input_tokens)
    source_blob = " ".join(
        f"{source.get('title', '')} {source.get('summary', '')}"
        for source in sources
        if isinstance(source, dict)
    )
    source_overlap = _jaccard_similarity(summary_tokens, _quick_tokens(source_blob))
    return input_overlap >= 0.55 and source_overlap < 0.2


def _validate_quick_summary(
    summary: str,
    *,
    sources: list[dict[str, str]],
    user_inputs: list[str],
) -> bool:
    cleaned = _clean_quick_summary_text(summary)
    if not cleaned:
        return False
    if _quick_meta_phrase_present(cleaned):
        return False
    sentences = [sentence for sentence in _split_sentences(cleaned) if _is_quick_fact_sentence(sentence)]
    if not sentences:
        return False
    if len(sentences) > 6:
        return False
    compact = " ".join(sentences[:6])
    if _looks_like_user_input_paraphrase(compact, user_inputs, sources):
        return False
    # NOTE: _quick_summary_mentions_news Jaccard check removed — it rejects valid Polish
    # LLM output because source titles are in English (low token overlap by design).
    return True


def _is_quick_fact_sentence(sentence: str) -> bool:
    lowered = normalize_text(sentence).casefold()
    if not lowered:
        return False
    if _quick_meta_phrase_present(lowered):
        return False
    if any(marker in lowered for marker in QUICK_META_PHRASES):
        return False
    if any(marker in lowered for marker in DEBUG_WORDING_BLOCKLIST):
        return False
    if re.search(r"\b(teza|fakty|analiza|scenariusze|watchlist)\b", lowered):
        return False
    if _is_quick_interpretive_sentence(lowered):
        return False
    words = re.findall(r"\b\w+\b", lowered)
    return len(words) >= 4


def _compress_quick_summary_text(text: str, *, min_sentences: int = 1, max_sentences: int = 6) -> str:
    candidates: list[str] = []
    for sentence in _split_sentences(_clean_quick_summary_text(text)):
        if not _is_quick_fact_sentence(sentence):
            continue
        candidates.append(sentence)

    selected = candidates[:max_sentences]
    if not selected:
        return ""
    if len(selected) < min_sentences:
        return ""
    return " ".join(selected)


def _build_quick_summary(
    *,
    base: dict[str, Any],
    sources: list[dict[str, str]],
    preference_context: str | None,
    user_inputs: list[str] | None = None,
) -> str:
    inputs = user_inputs or []
    provided_summary = _compress_quick_summary_text(str(base.get("summary") or ""))
    if provided_summary and _validate_quick_summary(provided_summary, sources=sources, user_inputs=inputs):
        return provided_summary

    preference = _parse_preference_context(preference_context)
    preferred_tokens = [
        normalize_text(token).strip().casefold()
        for token in preference.get("assets", []) + preference.get("regions", []) + preference.get("topics", [])
        if normalize_text(token).strip()
    ]

    ranked_candidates: list[tuple[int, int, str]] = []
    seen: set[str] = set()
    order = 0

    def add_candidate(text: str, base_score: int) -> None:
        nonlocal order
        for sentence in _split_sentences(_clean_quick_summary_text(text)):
            candidate = _ensure_sentence(sentence)
            key = candidate.casefold()
            if not _is_quick_fact_sentence(candidate) or key in seen:
                continue
            seen.add(key)
            score = base_score
            if preferred_tokens:
                score += sum(2 for token in preferred_tokens[:8] if token in key)
            ranked_candidates.append((score, order, candidate))
            order += 1

    add_candidate(str(base.get("summary") or ""), 40)
    for fact in base.get("facts") if isinstance(base.get("facts"), list) else []:
        add_candidate(str(fact), 35)

    if isinstance(base.get("items"), list):
        for item in base.get("items"):
            if isinstance(item, dict):
                add_candidate(str(item.get("body") or ""), 30)

    for source in sources:
        add_candidate(str(source.get("title") or ""), 32)

    if ranked_candidates:
        ranked_candidates.sort(key=lambda row: (-row[0], row[1]))
        candidate_summary = " ".join(sentence for _, _, sentence in ranked_candidates[:6])
        if _validate_quick_summary(candidate_summary, sources=sources, user_inputs=inputs):
            return candidate_summary

    fallback_from_sources = _compress_quick_summary_text(
        " ".join(str(source.get("title") or "") for source in sources[:6]),
        min_sentences=1,
        max_sentences=6,
    )
    if fallback_from_sources and _validate_quick_summary(fallback_from_sources, sources=sources, user_inputs=inputs):
        return fallback_from_sources
    return QUICK_FACT_FALLBACK


def _to_brief_items(summary: dict[str, Any], *, style: str, framing: str) -> list[dict[str, str]]:
    min_items, max_items = _item_bounds_for_style(style)
    has_items_key = isinstance(summary.get("items"), list)
    incoming = summary.get("items") if has_items_key else summary.get("blocks")
    if isinstance(incoming, list):
        items: list[dict[str, str]] = []
        for idx, item in enumerate(incoming[:max_items]):
            if not isinstance(item, dict):
                continue
            title = _safe_block_title(str(item.get("title") or "").strip(), f"Temat {idx + 1}")
            body = _compress_to_paragraph(str(item.get("body") or ""), min_sentences=2, max_sentences=3)
            if body:
                items.append({"title": title, "body": body})
        # If LLM returned new-format items key, never fall through to old-format fallback
        # (which fills bodies with placeholder text). Return whatever we have (including empty).
        if has_items_key:
            return items[:max_items]
        if len(items) >= min_items:
            return items[:max_items]

    facts = summary.get("facts") if isinstance(summary.get("facts"), list) else []
    market_impact = summary.get("market_impact") if isinstance(summary.get("market_impact"), list) else []
    scenarios = summary.get("scenarios") if isinstance(summary.get("scenarios"), dict) else {}
    confidence = summary.get("confidence") if isinstance(summary.get("confidence"), dict) else {}
    watchlist = summary.get("watchlist") if isinstance(summary.get("watchlist"), list) else []

    item1 = {
        "title": _safe_block_title(
            str(summary.get("headline") or "Ryzyko geopolityczne pozostaje kluczowym sygnalem dla rynku"),
            "Ryzyko geopolityczne pozostaje kluczowym sygnalem dla rynku",
        ),
        "body": _compress_to_paragraph(
            f"{summary.get('thesis', '')} {' '.join(str(item) for item in facts[:2])} Fokus analizy: {framing}.",
            min_sentences=2 if style == "short" else 3 if style == "long" else 2,
            max_sentences=2 if style == "short" else 3,
        ),
    }
    impact_text = " ".join(
        f"{item.get('asset', '')} ({item.get('direction', 'unclear')}): {item.get('why', '')}"
        for item in market_impact[:3]
        if isinstance(item, dict)
    )
    item2 = {
        "title": "Skala reakcji aktywow zalezy od tego, czy napiecie przejdzie w realne zaklocenia",
        "body": _compress_to_paragraph(
            f"{summary.get('analysis', '')} {impact_text} Scenariusz bazowy: {scenarios.get('base', '')}.",
            min_sentences=2,
            max_sentences=3,
        ),
    }
    item3 = {
        "title": "Kluczowe dla inwestorow pozostaje tempo potwierdzania informacji",
        "body": _compress_to_paragraph(
            f"Pewnosc oceny: {confidence.get('level', 'medium')} ({confidence.get('reason', '')}). "
            f"Ryzyko w gore: {scenarios.get('upside_risk', '')}. Ryzyko w dol: {scenarios.get('downside_risk', '')}. "
            f"Najwazniejsze sygnaly do monitorowania: {'; '.join(str(item) for item in watchlist[:3])}.",
            min_sentences=2,
            max_sentences=3,
        ),
    }
    generated = [item1, item2, item3]
    if style == "long":
        generated.append(
            {
                "title": "Rynek wycenia przede wszystkim ryzyko przeniesienia do inflacji i polityki pienieznej",
                "body": _compress_to_paragraph(
                    "Jesli impuls geopolityczny utrzyma presje na energie i logistyke, rynek moze podniesc prawdopodobienstwo bardziej restrykcyjnej sciezki stop. To kanal, ktory najczesciej decyduje o trwalosci reakcji na indeksach i walutach.",
                    min_sentences=2,
                    max_sentences=3,
                ),
            }
        )
    min_items, max_items = _item_bounds_for_style(style)
    return generated[:max_items] if len(generated) >= min_items else generated[:1]


def _normalize_analytical_summary(
    summary: Any,
    *,
    fallback_message: str,
    sources: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    base = summary if isinstance(summary, dict) else {}
    output_sources = _normalize_sources_payload(base.get("sources"))
    if not output_sources and sources:
        output_sources = [
            {
                "title": _non_empty_text(source.get("title"), "Brak tytulu zrodla"),
                "url": normalize_text(str(source.get("url") or "")).strip(),
                "publisher": _non_empty_text(source.get("provider"), "Nieznany wydawca"),
                "published_at": _non_empty_text(source.get("published_at"), "Brak daty publikacji"),
            }
            for source in sources
        ]
    confidence = base.get("confidence") if isinstance(base.get("confidence"), dict) else {}
    confidence_level = normalize_text(str(confidence.get("level") or "")).strip().lower()
    if confidence_level not in {"high", "medium", "low"}:
        confidence_level = "low"

    scenarios = base.get("scenarios") if isinstance(base.get("scenarios"), dict) else {}
    facts = base.get("facts") if isinstance(base.get("facts"), list) else []
    normalized_facts = [_non_empty_text(item, "") for item in facts]
    normalized_facts = [item for item in normalized_facts if item][:6]
    if len(normalized_facts) < 2:
        normalized_facts = normalized_facts + [fallback_message]

    market_impact = _normalize_market_impact(base.get("market_impact"))
    if not market_impact:
        market_impact = [{"asset": "Rynek szeroki", "direction": "unclear", "why": fallback_message}]

    watchlist = _normalize_watchlist(base.get("watchlist"))
    if len(watchlist) < 3:
        watchlist.extend(
            [
                "Oficjalne komunikaty rzadowe i regulatorow.",
                "Zachowanie kluczowych aktywow i zmiennosci implied.",
                "Potwierdzenia z wiarygodnych zrodel wysokiego priorytetu.",
            ]
        )
    watchlist = watchlist[:5]

    normalized = {
        "headline": _non_empty_text(base.get("headline"), "Krotki briefing geopolityczno-rynkowy"),
        "thesis": _non_empty_text(base.get("thesis"), fallback_message),
        "facts": normalized_facts,
        "analysis": _non_empty_text(base.get("analysis"), fallback_message),
        "confidence": {
            "level": confidence_level,
            "reason": _non_empty_text(confidence.get("reason"), fallback_message),
        },
        "scenarios": {
            "base": _non_empty_text(scenarios.get("base"), fallback_message),
            "upside_risk": _non_empty_text(scenarios.get("upside_risk"), fallback_message),
            "downside_risk": _non_empty_text(scenarios.get("downside_risk"), fallback_message),
        },
        "market_impact": market_impact,
        "watchlist": watchlist,
        "geopolitical_context": _non_empty_text(base.get("geopolitical_context"), ""),
        "sources": output_sources,
    }
    # Preserve items from LLM response for standard/extended mode
    if isinstance(base.get("items"), list):
        normalized["items"] = base["items"]
    return normalized


def score_brief_quality(output: dict[str, Any], preference_context: str | None = None) -> int:
    score = 0
    headline = normalize_text(str(output.get("headline") or "")).strip()
    items = output.get("items") if isinstance(output.get("items"), list) else []
    mode = normalize_text(str(output.get("mode") or "")).strip().lower()
    if mode == "quick":
        quick_summary = normalize_text(str(output.get("summary") or "")).strip()
        if quick_summary:
            score += 40
        sentence_count = len(_split_sentences(quick_summary))
        if 1 <= sentence_count <= 3:
            score += 30
        if not any(marker in quick_summary for marker in ("â€˘", "- ", "\n- ", "1.", "2.")):
            score += 5
        lowered = quick_summary.casefold()
        if any(token in lowered for token in QUICK_META_PHRASES):
            score -= 25
        if _quick_meta_phrase_present(lowered):
            score -= 35
        if _is_quick_interpretive_sentence(lowered):
            score -= 25
        for token in DEBUG_WORDING_BLOCKLIST:
            if token in lowered:
                score -= 12
        return max(0, min(100, score))

    normalized_items = [item for item in items if isinstance(item, dict)]
    if headline:
        score += 12
    if mode in {"quick", "standard", "extended"}:
        score += 8
    if 1 <= len(normalized_items) <= 5:
        score += 24

    non_empty_bodies = 0
    joined_text_parts = [headline]
    for item in normalized_items:
        title = normalize_text(str(item.get("title") or "")).strip()
        body = normalize_text(str(item.get("body") or "")).strip()
        if title:
            score += 6
        if body:
            non_empty_bodies += 1
            joined_text_parts.append(body)
            sentence_count = len(_split_sentences(body))
            if 2 <= sentence_count <= 3:
                score += 6
            if not any(marker in body for marker in ("•", "- ", "\n- ", "1.", "2.")):
                score += 3
    if non_empty_bodies == 3:
        score += 15

    joined_text = " ".join(joined_text_parts).casefold()
    for token in DEBUG_WORDING_BLOCKLIST:
        if token in joined_text:
            score -= 12
    for token in EMPTY_GENERALITIES:
        if token in joined_text:
            score -= 8

    pref = normalize_text(preference_context or "").strip().casefold()
    if pref:
        pref_tokens = [part.strip() for part in re.split(r"[\n,;|]+", pref) if part.strip()]
        if pref_tokens:
            matches = sum(1 for token in pref_tokens[:8] if token and token in joined_text)
            score += min(14, matches * 2)

    return max(0, min(100, score))


def _normalize_unified_summary(
    summary: Any,
    *,
    fallback_message: str,
    style: str,
    geo_focus: str | None,
    continents: list[str],
    query: str | None,
    sources: list[dict[str, Any]] | None = None,
    preference_context: str | None = None,
) -> dict[str, Any]:
    base = summary if isinstance(summary, dict) else {}
    output_sources = _normalize_sources_payload(base.get("sources"))
    if not output_sources and sources:
        output_sources = [
            {
                "title": _non_empty_text(source.get("title"), "Brak tytulu zrodla"),
                "url": normalize_text(str(source.get("url") or "")).strip(),
                "publisher": _non_empty_text(source.get("provider"), "Nieznany wydawca"),
                "published_at": _non_empty_text(source.get("published_at"), "Brak daty publikacji"),
            }
            for source in sources
        ]

    framing = _build_focus_framing(geo_focus=geo_focus, query=query, continents=continents)
    enriched = _normalize_analytical_summary(
        base,
        fallback_message=fallback_message,
        sources=sources,
    )
    if not normalize_text(str(enriched.get("headline") or "")).strip():
        enriched["headline"] = "Krotki briefing geopolityczno-rynkowy"

    # If LLM returned items directly (factual brief template), use them in _to_brief_items.
    # Treat both populated and empty lists as "LLM used new-format" to avoid falling through
    # to the old-format fallback path that fills item bodies with dummy placeholder text.
    raw_items = base.get("items")
    if isinstance(raw_items, list):
        enriched["items"] = raw_items

    if style == "short":
        quick_user_inputs = [
            normalize_text(query or "").strip(),
            normalize_text(geo_focus or "").strip(),
            normalize_text(preference_context or "").strip(),
            _derived_focus_from_regions(continents),
        ]
        quick_summary = _build_quick_summary(
            base=base,
            sources=output_sources,
            preference_context=preference_context,
            user_inputs=quick_user_inputs,
        )
        return {
            "mode": "quick",
            "summary": quick_summary,
        }

    items = _to_brief_items(enriched, style=style, framing=framing)
    if len(items) < 1:
        items.append(
            {
                "title": "Brak danych spelniajacych kryteria jakosciowe",
                "body": "Dostepne zrodla nie zawieraly informacji z wystarczajaca liczba konkretow (nazwa wlasna, liczba, data, miejsce). Brief nie zostal wygenerowany.",
            }
        )
    _, max_items = _item_bounds_for_style(style)
    return {
        "headline": _non_empty_text(enriched.get("headline"), "Krotki briefing geopolityczno-rynkowy"),
        "mode": _mode_from_style(style),
        "items": items[:max_items],
        "sources": output_sources,
    }


def _build_prompt_sources(
    selected_entries: list[dict[str, Any]],
    *,
    details_by_id: dict[str, dict[str, Any]],
) -> list[dict[str, str]]:
    prompt_sources: list[dict[str, str]] = []
    for entry in selected_entries:
        item = entry["item"]
        item_id = str(item.get("id") or "")
        detail = details_by_id.get(item_id) or {}
        prompt_sources.append(
            {
                "title": normalize_text(str(detail.get("title") or item.get("title") or "")).strip(),
                "summary": normalize_text(str(detail.get("summary") or item.get("summary") or "")).strip(),
                "publisher": normalize_text(str(detail.get("provider") or item.get("provider") or "")).strip(),
                "published_at": normalize_text(str(detail.get("pubDate") or item.get("pubDate") or "")).strip(),
                "url": normalize_text(str(detail.get("url") or item.get("clickUrl") or "")).strip(),
            }
        )
    return prompt_sources


def _build_fallback_summary(
    *,
    style: str,
    geo_focus: str | None,
    query: str | None,
    continents: list[str],
    window_hours: int,
    reason: str,
) -> dict[str, Any]:
    _ = reason
    regions = ", ".join(continents) if continents else "wybranych regionach"
    focus_label = geo_focus or regions
    return {
        "headline": f"Brak istotnych zdarzen z konkretami w ostatnich {window_hours}h",
        "mode": _mode_from_style(style),
        "items": [
            {
                "title": "Brak danych spelniajacych kryteria istotnosci",
                "body": (
                    f"Zrodla wiadomosci z ostatnich {window_hours} godzin nie zawieraly wydarzen "
                    f"z wystarczajaca liczba konkretow (nazwy wlasne, liczby, daty, miejsca) "
                    f"dla regionow: {focus_label}. "
                    f"Brief nie zostal wygenerowany z powodu braku kwalifikujacych sie informacji."
                ),
            }
        ],
        "sources": [],
    }


async def _critic_review(
    brief: dict[str, Any],
    *,
    style: str,
) -> tuple[bool, list[str]]:
    """LLM krytyk sprawdza brief pod katem zasad konstrukcyjnych.
    Zwraca (is_valid, lista_problemow)."""
    llm = LLMClient()
    critic_system = _load_prompt(PROMPT_CRITIC)
    payload = {
        "brief": brief,
        "style": style,
    }
    messages = [
        {"role": "system", "content": critic_system},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]
    raw = await llm.complete(messages, temperature=0.0)
    try:
        result = json.loads(raw)
        valid = bool(result.get("valid", True))
        issues = [str(issue) for issue in result.get("issues", []) if issue]
        logger.debug("Critic review: valid=%s, issues=%d", valid, len(issues))
        return valid, issues
    except Exception:
        logger.warning("Critic LLM returned unparseable JSON — skipping correction")
        return True, []


async def _fix_with_critic_feedback(
    brief: dict[str, Any],
    issues: list[str],
    *,
    base_messages: list[dict[str, str]],
) -> dict[str, Any]:
    """LLM fixer poprawia brief na podstawie listy problemow od krytyka.
    Zwraca poprawiony dict lub oryginalny brief przy bledzie parsowania."""
    llm = LLMClient()
    issues_text = "\n".join(f"- {issue}" for issue in issues)
    fix_instruction = (
        f"Krytyk wykryl nastepujace problemy w breifie:\n{issues_text}\n\n"
        "Popraw brief eliminujac WSZYSTKIE wymienione problemy.\n"
        "Zachowaj te same zrodla i fakty — nie dodawaj ani nie zmyslaj nowych informacji.\n"
        "Zwroc wylacznie poprawiony JSON, bez markdown."
    )
    fix_messages = base_messages + [
        {"role": "assistant", "content": json.dumps(brief, ensure_ascii=False)},
        {"role": "user", "content": fix_instruction},
    ]
    raw = await llm.complete(fix_messages, temperature=0.0)
    try:
        fixed = json.loads(raw)
        logger.debug("Fixer LLM returned corrected brief")
        return fixed
    except Exception:
        logger.warning("Fixer LLM returned unparseable JSON — keeping previous brief")
        return brief


async def _generate_summary_via_llm(
    *,
    style: str,
    geo_focus: str | None,
    query: str | None,
    context: str,
    window_hours: int,
    continents: list[str],
    sources_for_prompt: list[dict[str, str]],
    preference_context: str | None = None,
    stylistic_instruction: str | None = None,
) -> dict[str, Any]:
    template_name = _prompt_template_name_for_style(style, preference_context=preference_context)
    system_prompt = "\n\n".join(
        [
            _load_prompt(PROMPT_SYSTEM),
            _load_prompt(template_name),
            _load_prompt(PROMPT_SCHEMA),
            "Zwroc wylacznie JSON, bez markdown.",
        ]
    )
    user_payload = {
        "context": context,
        "mode": style,
        "geo_focus": geo_focus or "",
        "question": query or "",
        "window_hours": window_hours,
        "continents": continents,
        "user_preference_context": preference_context or "",
        "stylistic_instruction": stylistic_instruction or "",
        "sources": sources_for_prompt,
    }

    llm = LLMClient()
    base_messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
    ]
    first = await llm.complete(base_messages, temperature=0.15)
    try:
        parsed = json.loads(first)
    except Exception as exc:
        repair_messages = base_messages + [
            {"role": "assistant", "content": first},
            {
                "role": "user",
                "content": f"Oto blad parsowania JSON: {exc}. Zwroc poprawny JSON zgodny ze schematem.",
            },
        ]
        second = await llm.complete(repair_messages, temperature=0.0)
        parsed = json.loads(second)

    normalized = _normalize_unified_summary(
        parsed,
        fallback_message="Ocena skupia sie na najbardziej prawdopodobnych implikacjach rynkowych.",
        style=style,
        geo_focus=geo_focus,
        continents=continents,
        query=query,
        preference_context=preference_context,
    )
    quick_sources = [
        {"title": source.get("title", ""), "summary": source.get("summary", "")}
        for source in sources_for_prompt
    ]
    quick_user_inputs = [
        normalize_text(query or "").strip(),
        normalize_text(geo_focus or "").strip(),
        normalize_text(preference_context or "").strip(),
        _derived_focus_from_regions(continents),
    ]
    # Petla krytyk/fixer: LLM krytyk sprawdza brief, LLM fixer poprawia na podstawie wytkniectych problemow.
    for attempt in range(MAX_CRITIC_LOOPS):
        is_valid, issues = await _critic_review(normalized, style=style)
        if is_valid or not issues:
            logger.debug("Critic approved brief on attempt %d", attempt + 1)
            break
        logger.info(
            "Critic rejected brief (attempt %d/%d), %d issue(s): %s",
            attempt + 1,
            MAX_CRITIC_LOOPS,
            len(issues),
            issues,
        )
        fixed_raw = await _fix_with_critic_feedback(normalized, issues, base_messages=base_messages)
        normalized = _normalize_unified_summary(
            fixed_raw,
            fallback_message="Ocena skupia sie na najbardziej prawdopodobnych implikacjach rynkowych.",
            style=style,
            geo_focus=geo_focus,
            continents=continents,
            query=query,
            preference_context=preference_context,
        )

    # Fallback dla trybu quick: jesli po petli summary nadal nie przechodzi walidacji,
    # generujemy deterministyczne podsumowanie z tytulów zrodel.
    if style == "short":
        quick_valid = _validate_quick_summary(
            str(normalized.get("summary") or ""),
            sources=quick_sources,
            user_inputs=quick_user_inputs,
        )
        if not quick_valid:
            normalized = {
                "mode": "quick",
                "summary": _build_quick_summary(
                    base=normalized if isinstance(normalized, dict) else {},
                    sources=quick_sources,
                    preference_context=preference_context,
                    user_inputs=quick_user_inputs,
                ),
            }

    return normalized


class BriefService:
    def __init__(self) -> None:
        self.client = AxessoClient()
        self.list_service = NewsListService(self.client)
        self.details_service = NewsDetailsService(self.client)
        self.web_search_service = WebSearchService()
        self.llm_client = LLMClient()
        self._brief_cache: dict[tuple[Any, ...], tuple[float, dict[str, Any]]] = {}

    def _cache_key(
        self,
        *,
        continents: list[str],
        window_hours: int,
        geo_focus: str | None,
        custom_query: str | None,
        style: str,
        context: str,
        tickers: list[str],
        list_limit: int,
        select_k: int,
        summary_k: int,
        debug: bool,
        preference_context: str | None,
    ) -> tuple[Any, ...]:
        return (
            tuple(continents),
            int(window_hours),
            geo_focus or "",
            custom_query or "",
            style,
            context,
            tuple(tickers),
            list_limit,
            select_k,
            summary_k,
            debug,
            preference_context or "",
        )

    def _get_cached_result(self, cache_key: tuple[Any, ...]) -> dict[str, Any] | None:
        cached = self._brief_cache.get(cache_key)
        if cached is None:
            return None

        expires_at, payload = cached
        if expires_at <= _monotonic_now():
            self._brief_cache.pop(cache_key, None)
            return None

        return deepcopy(payload)

    def _store_cached_result(self, cache_key: tuple[Any, ...], result: dict[str, Any]) -> None:
        self._brief_cache[cache_key] = (_monotonic_now() + CACHE_TTL_SECONDS, deepcopy(result))

    async def _fetch_merged_items(
        self,
        *,
        continents: list[str],
        query: str | None,
        user_query: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        # Fetch from all regions in parallel using per-continent quotas.
        # NA (US) gets the largest quota as it carries most global financial news (Reuters/AP/Bloomberg).
        # Other regions add local/regional coverage. Failures are skipped gracefully.
        # Web search (Bing) runs in parallel when BING_SEARCH_API_KEY is configured.
        axesso_tasks: list[tuple[str, asyncio.Task[list[dict[str, Any]]]]] = []
        for continent, axesso_regions in CONTINENT_TO_AXESSO_REGIONS.items():
            quota = REGION_FETCH_QUOTAS.get(continent, 10)
            primary_region = axesso_regions[0]
            task = asyncio.create_task(
                self.list_service.fetch_normalized(s=query, region=primary_region, limit=quota)
            )
            axesso_tasks.append((continent, task))

        web_task: asyncio.Task[list[dict[str, Any]]] = asyncio.create_task(
            self.web_search_service.fetch_items(user_query)
        )

        axesso_results = await asyncio.gather(*[t for _, t in axesso_tasks], return_exceptions=True)
        web_results: list[dict[str, Any]] | Exception = await web_task

        all_items: list[dict[str, Any]] = []
        total_raw = 0
        for (continent, _), result in zip(axesso_tasks, axesso_results):
            if isinstance(result, Exception):
                logger.warning("Failed to fetch news for continent %s: %s", continent, result)
                continue
            total_raw += len(result)
            all_items.extend(result)

        if isinstance(web_results, Exception):
            logger.warning("web_search fetch error: %s", web_results)
        elif web_results:
            logger.info("web_search enrichment adding %d items", len(web_results))
            total_raw += len(web_results)
            all_items.extend(web_results)

        return _dedupe_items(all_items), total_raw

    async def run(
        self,
        region: str | None,
        tickers: list[str] | None,
        query: str | None,
        list_limit: int | None,
        summary_k: int,
        style: str,
        select_k: int = INTERNAL_SELECT_K,
        debug: bool = False,
        window_hours: int = 72,
        context: str | None = None,
        geo_focus: str | None = None,
        request_id: str | None = None,
        continents: list[str] | None = None,
        preference_context: str | None = None,
    ) -> dict[str, Any]:
        normalized_style = normalize_style(style)
        normalized_preference_context = normalize_text(preference_context or "").strip() or None
        requested_continents = normalize_requested_continents(continents, region=region)
        normalized_continents = normalize_continents(continents, region=region)
        brief_context = build_brief_context(
            user_question=query,
            user_preferences=normalized_preference_context,
            selected_regions=requested_continents,
            mode=normalized_style,
            geo_focus=geo_focus,
        )
        normalized_query = normalize_query(brief_context.get("main_focus"))
        # axesso_query is always None: Axesso does not support free-text search via s= parameter
        # (returns 0 results for any query). Region-only fetches work correctly.
        # Filtering/selection by user query is handled by LLM downstream.
        axesso_query: str | None = None
        normalized_geo_focus = normalize_text(geo_focus or "").strip() or None
        if not normalized_geo_focus and not brief_context.get("primary_question") and not brief_context.get("profile_focus"):
            normalized_geo_focus = normalize_text(str(brief_context.get("region_context") or "")).strip() or None
        normalized_context = normalize_context(context, normalized_query, normalized_geo_focus)
        ticker_pairs = _normalize_ticker_pairs(tickers)
        normalized_tickers = [normalized for _, normalized in ticker_pairs]
        effective_list_limit = _clamp_list_limit(list_limit)
        effective_select_k = min(_normalize_select_k(select_k), effective_list_limit or HARD_LIST_LIMIT)
        effective_summary_k = _normalize_summary_k(summary_k, select_k=max(effective_select_k, SUMMARY_K_MIN))
        now = _utc_now()
        fetched_count = 0
        after_time_filter_count = 0
        selected_count = 0
        list_fetch_status = "ok"
        fetch_error_reason = ""

        # For geopolitical context, always include NA+ME+EU to capture global events.
        # Without this, users selecting only NA get no Middle East / European war news.
        if normalized_context == CONTEXT_GEOPOLITICS:
            extra = [c for c in GEOPOLITICS_EXTRA_CONTINENTS if c not in normalized_continents]
            fetch_continents = normalized_continents + extra
        else:
            fetch_continents = normalized_continents

        cache_key = self._cache_key(
            continents=fetch_continents,
            window_hours=window_hours,
            geo_focus=normalized_geo_focus,
            custom_query=normalized_query,
            style=normalized_style,
            context=normalized_context,
            tickers=normalized_tickers,
            list_limit=effective_list_limit,
            select_k=effective_select_k,
            summary_k=effective_summary_k,
            debug=debug,
            preference_context=normalized_preference_context,
        )

        scoring_query = normalized_query
        ranking_hints = brief_context.get("ranking_hints") if isinstance(brief_context.get("ranking_hints"), list) else []
        if ranking_hints:
            hints_blob = ", ".join(str(item) for item in ranking_hints[:6])
            scoring_query = (normalized_query + " | " if normalized_query else "") + hints_blob
        elif normalized_preference_context:
            scoring_query = (normalized_query + " | " if normalized_query else "") + normalized_preference_context

        cached_result = self._get_cached_result(cache_key)
        if cached_result is not None:
            return cached_result

        # Extract geo focuses via LLM in parallel with news fetch (adds ~0 latency).
        # gpt-4.1-nano interprets query + profile → list of concrete geographic/entity terms.
        geo_focus_task: asyncio.Task[list[str]] = asyncio.create_task(
            self.llm_client.extract_geo_focuses(
                query=normalized_query or query,
                preference_context=normalized_preference_context,
            )
        )

        try:
            items: list[dict[str, Any]] = []
            try:
                items, fetched_count = await self._fetch_merged_items(
                    continents=fetch_continents,
                    query=axesso_query,
                    user_query=normalized_query or query,
                )
            except (NewsDataParsingError, UpstreamNewsProviderError) as exc:
                list_fetch_status = "failed"
                fetch_error_reason = str(exc) or type(exc).__name__
                logger.warning(
                    "brief_pipeline request_id=%s upstream_list_fallback reason=%s",
                    request_id or "-",
                    fetch_error_reason,
                )
            # Merge LLM-extracted geo focuses into normalized_geo_focus for scoring.
            try:
                llm_focuses = await geo_focus_task
            except Exception as exc:
                logger.warning("geo_focus_task error: %s", exc)
                llm_focuses = []
            if llm_focuses:
                existing = [normalized_geo_focus] if normalized_geo_focus else []
                merged = existing + [f for f in llm_focuses if f not in existing]
                normalized_geo_focus = ", ".join(merged)
                logger.info("geo_focus llm_extracted=%s final=%r", llm_focuses, normalized_geo_focus)

            time_filtered_items = _filter_items_by_window(items, window_hours=window_hours, now=now)
            time_filtered_items = _limit_items_for_scoring(time_filtered_items)
            after_time_filter_count = len(time_filtered_items)

            ranked_entries: list[dict[str, Any]] = []
            for index, item in enumerate(time_filtered_items):
                scores = score_item(
                    item,
                    context=normalized_context,
                    geo_focus=normalized_geo_focus,
                    tickers=normalized_tickers,
                    query=scoring_query,
                    now=now,
                )
                published_at = _parse_pub_date(item.get("pubDate"))
                ranked_entries.append(
                    {
                        "item": item,
                        "scores": scores,
                        "freshness_sort": published_at.timestamp() if published_at else float("-inf"),
                        "index": index,
                    }
                )

            ranked_entries = _sort_ranked_entries(ranked_entries)
            use_geo_quota = normalized_context == CONTEXT_GEOPOLITICS or normalized_geo_focus is not None
            selected_entries = (
                _apply_geo_quota(ranked_entries, list_limit=effective_list_limit)
                if use_geo_quota
                else ranked_entries[: max(0, min(effective_list_limit, len(ranked_entries)))]
            )
            selected_count = len(selected_entries)
            analysis_items = await pick_top(
                [entry["item"] for entry in selected_entries],
                min(effective_select_k, len(selected_entries)),
                style=normalized_style,
            )
            analysis_entries = _select_entries_by_items(selected_entries, analysis_items)
            if not analysis_entries:
                analysis_entries = selected_entries[: min(effective_select_k, len(selected_entries))]
            summary_entries = analysis_entries[: min(effective_summary_k, len(analysis_entries))]
            if normalized_tickers:
                filtered_summary_entries = [
                    entry for entry in summary_entries
                    if _item_matches_requested_tickers(entry["item"], normalized_tickers)
                ]
                if filtered_summary_entries:
                    summary_entries = filtered_summary_entries

            picked = [entry["item"] for entry in selected_entries]
            detail_ids = [str(entry["item"]["id"]) for entry in summary_entries if entry["item"].get("id")]
            details_by_id: dict[str, dict[str, Any]] = {}
            if detail_ids:
                details = await self.details_service.fetch_normalized_many(detail_ids)
                details_by_id = {str(detail.get("id")): detail for detail in details if detail.get("id")}
            sources = _build_sources(selected_entries, details_by_id=details_by_id)

            summary_status = "ok"
            if not summary_entries:
                summary_status = "fallback"
                fallback_reason = fetch_error_reason or "No news items selected after filtering/scoring."
                structured_summary = _build_fallback_summary(
                    style=normalized_style,
                    geo_focus=normalized_geo_focus,
                    query=normalized_query,
                    continents=normalized_continents,
                    window_hours=window_hours,
                    reason=fallback_reason,
                )
                prompt_sources: list[dict[str, str]] = []
            else:
                prompt_sources = _build_prompt_sources(summary_entries, details_by_id=details_by_id)
                try:
                    if settings.openai_api_key:
                        llm_summary = await _generate_summary_via_llm(
                            style=normalized_style,
                            geo_focus=normalized_geo_focus,
                            query=normalized_query,
                            context=normalized_context,
                            window_hours=window_hours,
                            continents=normalized_continents,
                            sources_for_prompt=prompt_sources,
                            preference_context=normalized_preference_context,
                            stylistic_instruction=str(brief_context.get("response_style") or ""),
                        )
                        structured_summary = _normalize_unified_summary(
                            llm_summary,
                            fallback_message="Ocena skupia sie na najbardziej prawdopodobnych implikacjach rynkowych.",
                            style=normalized_style,
                            geo_focus=normalized_geo_focus,
                            continents=normalized_continents,
                            query=normalized_query,
                            sources=sources,
                            preference_context=normalized_preference_context,
                        )
                    else:
                        short_summary = _build_short_summary(summary_entries, details_by_id=details_by_id, context=normalized_context)
                        structured_summary = _normalize_unified_summary(
                            {
                                "headline": "Krotki briefing geopolityczno-rynkowy",
                                "thesis": short_summary.get("co_sie_stalo", ""),
                                "facts": [
                                    short_summary.get("co_sie_stalo", ""),
                                    short_summary.get("reakcja", ""),
                                ],
                                "analysis": short_summary.get("konsekwencja_rynkowa", ""),
                                "confidence": {
                                    "level": "medium",
                                    "reason": "Ocena oparta na dostepnych zrodlach i regule scoringu.",
                                },
                                "scenarios": {
                                    "base": short_summary.get("reakcja", ""),
                                    "upside_risk": "Eskalacja moze podbic premie za ryzyko i zmiennosc.",
                                    "downside_risk": "Deeskalacja moze obnizyc presje risk-off.",
                                },
                                "market_impact": [
                                    {
                                        "asset": "Aktywa wrazliwe na ryzyko geopolityczne",
                                        "direction": "mixed",
                                        "why": short_summary.get("konsekwencja_rynkowa", ""),
                                    }
                                ],
                                "watchlist": [
                                    short_summary.get("co_obserwowac", ""),
                                    "Oficjalne komunikaty i decyzje regulacyjne.",
                                    "Ruchy cen energii, FX i indeksow ryzyka.",
                                ],
                                "sources": [
                                    {
                                        "title": source.get("title", ""),
                                        "url": source.get("url", ""),
                                        "publisher": source.get("provider", ""),
                                        "published_at": source.get("published_at", ""),
                                    }
                                    for source in sources
                                ],
                            },
                            fallback_message="Ocena skupia sie na najbardziej prawdopodobnych implikacjach rynkowych.",
                            style=normalized_style,
                            geo_focus=normalized_geo_focus,
                            continents=normalized_continents,
                            query=normalized_query,
                            sources=sources,
                            preference_context=normalized_preference_context,
                        )
                except Exception as exc:
                    summary_status = "fallback"
                    structured_summary = _build_fallback_summary(
                        style=normalized_style,
                        geo_focus=normalized_geo_focus,
                        query=normalized_query,
                        continents=normalized_continents,
                        window_hours=window_hours,
                        reason=f"LLM parse/generation failed: {type(exc).__name__}",
                    )

            quality_score = score_brief_quality(structured_summary, preference_context=normalized_preference_context)
            if quality_score < QUALITY_SCORE_THRESHOLD:
                structured_summary = _normalize_unified_summary(
                    structured_summary,
                    fallback_message="Ocena skupia sie na najbardziej prawdopodobnych implikacjach rynkowych.",
                    style=normalized_style,
                    geo_focus=normalized_geo_focus,
                    continents=normalized_continents,
                    query=normalized_query,
                    sources=sources,
                    preference_context=normalized_preference_context,
                )
                quality_score = score_brief_quality(structured_summary, preference_context=normalized_preference_context)
            if normalized_style == "short":
                quick_sources_runtime = [
                    {
                        "title": source.get("title", ""),
                        "summary": source.get("summary", ""),
                    }
                    for source in (prompt_sources if "prompt_sources" in locals() else [])
                ]
                if not quick_sources_runtime:
                    quick_sources_runtime = [{"title": source.get("title", ""), "summary": ""} for source in sources]
                quick_user_inputs_runtime = [
                    normalize_text(normalized_query or "").strip(),
                    normalize_text(normalized_geo_focus or "").strip(),
                    normalize_text(normalized_preference_context or "").strip(),
                    _derived_focus_from_regions(requested_continents),
                ]
                if not _validate_quick_summary(
                    str(structured_summary.get("summary") or ""),
                    sources=quick_sources_runtime,
                    user_inputs=quick_user_inputs_runtime,
                ):
                    structured_summary = {
                        "mode": "quick",
                        "summary": _build_quick_summary(
                            base=structured_summary if isinstance(structured_summary, dict) else {},
                            sources=quick_sources_runtime,
                            preference_context=normalized_preference_context,
                            user_inputs=quick_user_inputs_runtime,
                        ),
                    }
                    quality_score = score_brief_quality(structured_summary, preference_context=normalized_preference_context)

            result = {
                "status": summary_status,
                "style": normalized_style,
                "context": normalized_context,
                "window_hours": window_hours,
                "continents": normalized_continents,
                "focus": {
                    "geo_focus": normalized_geo_focus or "",
                    "custom_query": normalize_text(str(brief_context.get("main_focus") or "")).strip(),
                },
                "summary": structured_summary,
                "sources": sources,
                "brief": _render_structured_brief(normalized_style, structured_summary),
                "picked": picked,
                "details": [details_by_id[item_id] for item_id in detail_ids if item_id in details_by_id],
            }

            if debug:
                result["debug"] = _build_debug_metrics(
                    list_fetch_status=list_fetch_status,
                    ticker_pairs=ticker_pairs,
                    items=time_filtered_items,
                    selected_ids_by_ticker={},
                )
                if fetch_error_reason:
                    result["debug"]["fallback_reason"] = fetch_error_reason
                result["debug"]["quality_score"] = quality_score

            self._store_cached_result(cache_key, result)
            return result
        finally:
            logger.info(
                "brief_pipeline request_id=%s context=%s window_hours=%s fetched=%s after_time_filter=%s selected=%s continents=%s",
                request_id or "-",
                normalized_context,
                window_hours,
                fetched_count,
                after_time_filter_count,
                selected_count,
                ",".join(normalized_continents),
            )
