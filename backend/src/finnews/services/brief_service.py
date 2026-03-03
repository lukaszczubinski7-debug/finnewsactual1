from __future__ import annotations

import asyncio
from copy import deepcopy
from datetime import UTC, datetime, timedelta
import logging
from math import ceil
import re
import time
from typing import Any

from finnews.clients.axesso import AxessoClient
from finnews.services.news_details_service import NewsDetailsService
from finnews.services.news_list_service import NewsListService
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
MAX_CONTINENTS_PER_REQUEST = 3
HARD_LIST_LIMIT = 20
FETCH_LIMIT_PER_REGION = 60
MAX_ITEMS_FOR_SCORING = 300
MAX_CONCURRENT_REGION_FETCHES = 2
CACHE_TTL_SECONDS = 300
INTERNAL_SELECT_K = 10
SELECT_K_MIN = 5
SELECT_K_MAX = 30
SUMMARY_K_MIN = 3
SUMMARY_K_MAX = 10

CONTINENT_TO_AXESSO_REGIONS: dict[str, list[str]] = {
    "NA": ["US"],
    "EU": ["GB"],
    "AS": ["SG"],
    "ME": ["AE"],
    "SA": ["BR"],
    "AF": ["ZA"],
    "OC": ["AU"],
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


def _normalize_select_k(select_k: int) -> int:
    return max(SELECT_K_MIN, min(SELECT_K_MAX, int(select_k or SELECT_K_MIN)))


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
        return 3.0, "fresh <6h"
    if age_hours < 24:
        return 2.0, "fresh <24h"
    if age_hours < 72:
        return 1.0, "fresh <72h"
    return 0.0, None


def _provider_boost(item: dict[str, Any]) -> tuple[int, str | None]:
    provider = normalize_text(item.get("provider") or "").casefold()
    if not provider:
        return 0, None
    for marker in TRUSTED_PROVIDER_MARKERS:
        if marker in provider:
            return 2, normalize_text(item.get("provider") or "")
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
        reasons.append(provider_reason or "trusted provider")

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
        return "\n".join(
            line
            for line in [
                summary.get("co_sie_stalo", ""),
                summary.get("reakcja", ""),
                summary.get("konsekwencja_rynkowa", ""),
                summary.get("co_obserwowac", ""),
            ]
            if line
        )

    if style == "mid":
        watki = summary.get("watki", [])
        lines: list[str] = []
        if summary.get("tl_dr"):
            lines.append(f"TL;DR\n{summary['tl_dr']}")
        lines.extend(
            f"{watek.get('tytul', '')}\n{watek.get('tekst', '')}".strip()
            for watek in watki
            if isinstance(watek, dict) and (watek.get("tytul") or watek.get("tekst"))
        )
        return "\n\n".join(line for line in lines if line)

    lines: list[str] = []
    for temat in summary.get("tematy", []):
        if not isinstance(temat, dict):
            continue
        title = temat.get("tytul", "")
        body = "\n".join(
            line
            for line in [
                temat.get("stan_obecny", ""),
                temat.get("mechanizm_wplywu", ""),
                temat.get("konsekwencje", ""),
            ]
            if line
        )
        if title or body:
            lines.append(f"{title}\n{body}".strip())
    if summary.get("lancuch_przyczynowy"):
        lines.append("Lancuch przyczynowy\n" + "\n".join(summary["lancuch_przyczynowy"]))
    if summary.get("implikacje_rynkowe"):
        lines.append(
            "Implikacje rynkowe\n"
            + "\n".join(
                f"{item.get('obszar', '')}: {item.get('mechanizm', '')}".strip(": ")
                for item in summary["implikacje_rynkowe"]
                if isinstance(item, dict)
            )
        )
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


class BriefService:
    def __init__(self) -> None:
        self.client = AxessoClient()
        self.list_service = NewsListService(self.client)
        self.details_service = NewsDetailsService(self.client)
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
    ) -> tuple[list[dict[str, Any]], int]:
        raw_items: list[dict[str, Any]] = []
        region_codes = [
            region
            for continent in continents
            for region in CONTINENT_TO_AXESSO_REGIONS.get(continent, [])
        ]
        semaphore = asyncio.Semaphore(MAX_CONCURRENT_REGION_FETCHES)

        async def fetch_region(region: str) -> list[dict[str, Any]]:
            async with semaphore:
                return await self.list_service.fetch_normalized(
                    s=query,
                    region=region,
                    limit=FETCH_LIMIT_PER_REGION,
                )

        batches = await asyncio.gather(*(fetch_region(region) for region in region_codes))
        fetched_total = 0
        for batch in batches:
            fetched_total += len(batch)
            raw_items.extend(batch)
        return _dedupe_items(raw_items), fetched_total

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
    ) -> dict[str, Any]:
        normalized_style = normalize_style(style)
        normalized_query = normalize_query(query)
        normalized_context = normalize_context(context, normalized_query, geo_focus)
        normalized_geo_focus = normalize_text(geo_focus or "").strip() or None
        normalized_continents = normalize_continents(continents, region=region)
        ticker_pairs = _normalize_ticker_pairs(tickers)
        normalized_tickers = [normalized for _, normalized in ticker_pairs]
        effective_list_limit = _clamp_list_limit(list_limit)
        effective_select_k = min(_normalize_select_k(select_k), effective_list_limit or HARD_LIST_LIMIT)
        effective_summary_k = _normalize_summary_k(summary_k, select_k=max(effective_select_k, SUMMARY_K_MIN))
        now = _utc_now()
        fetched_count = 0
        after_time_filter_count = 0
        selected_count = 0
        cache_key = self._cache_key(
            continents=normalized_continents,
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
        )

        cached_result = self._get_cached_result(cache_key)
        if cached_result is not None:
            return cached_result

        try:
            items, fetched_count = await self._fetch_merged_items(
                continents=normalized_continents,
                query=normalized_query,
            )
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
                    query=normalized_query,
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
            details = await self.details_service.fetch_normalized_many(detail_ids)
            details_by_id = {str(detail.get("id")): detail for detail in details if detail.get("id")}

            selected_ids_by_ticker: dict[str, list[str]] = {ticker: [] for ticker in normalized_tickers}
            for entry in selected_entries:
                item = entry["item"]
                item_id = str(item.get("id") or "")
                for ticker in normalized_tickers:
                    if _item_matches_stock_tickers(item, {ticker}) or _item_matches_text(item, ticker):
                        selected_ids_by_ticker.setdefault(ticker, [])
                        if item_id and item_id not in selected_ids_by_ticker[ticker]:
                            selected_ids_by_ticker[ticker].append(item_id)

            structured_summary = _build_structured_summary(
                summary_entries,
                details_by_id=details_by_id,
                context=normalized_context,
                style=normalized_style,
            )
            sources = _build_sources(selected_entries, details_by_id=details_by_id)

            result = {
                "style": normalized_style,
                "context": normalized_context,
                "window_hours": window_hours,
                "continents": normalized_continents,
                "focus": {
                    "geo_focus": normalized_geo_focus or "",
                    "custom_query": normalized_query or "",
                },
                "summary": structured_summary,
                "sources": sources,
                "brief": _render_structured_brief(normalized_style, structured_summary),
                "picked": picked,
                "details": [details_by_id[item_id] for item_id in detail_ids if item_id in details_by_id],
            }

            if debug:
                result["debug"] = _build_debug_metrics(
                    list_fetch_status="ok",
                    ticker_pairs=ticker_pairs,
                    items=time_filtered_items,
                    selected_ids_by_ticker=selected_ids_by_ticker,
                )

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
