from __future__ import annotations

import asyncio
import hashlib
import logging
import re
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse

import httpx

from finnews.clients.scraper import scrape_article
from finnews.clients.serper import SerperClient
from finnews.clients.twitter import TwitterClient
from finnews.clients.youtube import fetch_channel_videos, get_transcript, resolve_channel_id
from finnews.settings import settings
from finnews.utils.text import normalize_text

logger = logging.getLogger(__name__)

_WORD_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9.+/#_-]{1,}")

CONTEXT_GEOPOLITICS = "Geopolityka"
CONTEXT_MACRO = "Makro"
CONTEXT_TECHNOLOGY = "Technologia"


@dataclass(frozen=True)
class VerifiedSource:
    name: str
    handle: str
    url: str
    category: str  # X | YT | Instytucja
    topics: list[str] = field(default_factory=list)
    description: str = ""
    group: str = ""
    is_default: bool = True


VERIFIED_SOURCES: list[VerifiedSource] = [
    VerifiedSource("Jurek Tomaszewski", "JJTomaszewski", "https://x.com/JJTomaszewski", "X", ["Gielda PL", "Gielda US", "Makro"], "GPW + US, makro, portfel, opinie o spolkach", "Gielda PL"),
    VerifiedSource("Agrippa Investment", "Agrippa_Inv", "https://x.com/Agrippa_Inv", "X", ["Gielda US", "Makro", "Sentyment"], "Ogolny komentarz rynkowy US, sentyment, makro", "Gielda US"),
    VerifiedSource("AiBreakfast", "AiBreakfast", "https://x.com/AiBreakfast", "X", ["AI", "Technologia"], "Daily AI news digest po polsku", "AI / Tech"),
    VerifiedSource("Anthropic", "AnthropicAI", "https://x.com/AnthropicAI", "X", ["AI", "Claude", "Bezpieczenstwo AI"], "Ogloszenia Anthropic, Claude, bezpieczenstwo AI", "AI / Tech"),
    VerifiedSource("Bielik LLM", "bielikllm", "https://x.com/bielikllm", "X", ["AI", "Polskie AI"], "Polski LLM, polskie AI R&D", "AI / Tech"),
    VerifiedSource("Gemini App", "GeminiApp", "https://x.com/GeminiApp", "X", ["AI", "Google"], "Produkty Google Gemini", "AI / Tech"),
    VerifiedSource("Google", "Google", "https://x.com/Google", "X", ["AI", "Technologia"], "Produkty, badania, AI Google", "AI / Tech"),
    VerifiedSource("Google Labs", "GoogleLabs", "https://x.com/GoogleLabs", "X", ["AI", "R&D"], "Eksperymenty i innowacje Google", "AI / Tech"),
    VerifiedSource("Google Research", "GoogleResearch", "https://x.com/GoogleResearch", "X", ["AI", "R&D"], "Badania Google AI/ML", "AI / Tech"),
    VerifiedSource("Grok", "grok", "https://x.com/grok", "X", ["AI", "xAI"], "xAI / Grok updates", "AI / Tech"),
    VerifiedSource("jxmnop", "jxmnop", "https://x.com/jxmnop", "X", ["AI", "LLM", "Tooling"], "Insiderskie AI, modele, tooling", "AI / Tech"),
    VerifiedSource("Andrej Karpathy", "karpathy", "https://x.com/karpathy", "X", ["AI", "Deep Learning", "LLM"], "Gleboka technika AI, edukacja, LLM internals", "AI / Tech"),
    VerifiedSource("NotebookLM", "NotebookLM", "https://x.com/NotebookLM", "X", ["AI", "Produktywnosc"], "NotebookLM updates, produktywnosc AI", "AI / Tech"),
    VerifiedSource("Perplexity AI", "perplexity_ai", "https://x.com/perplexity_ai", "X", ["AI", "Search", "Produktywnosc"], "AI search, produktywnosc", "AI / Tech"),
    VerifiedSource("Hubert Walas", "hubertwalas_", "https://x.com/hubertwalas_", "X", ["Geopolityka", "Bezpieczenstwo", "Polska", "Europa"], "Geopolityka, bezpieczenstwo, Polska/Europa", "Geopolityka"),
    VerifiedSource("Good Times Bad Times PL", "GoodTimesBadTimesPL", "https://www.youtube.com/@GoodTimesBadTimesPL", "YT", ["Geopolityka", "Stosunki miedzynarodowe", "Konflikty"], "Geopolityka, stosunki miedzynarodowe, konflikty"),
    VerifiedSource("Strefa Inwestorow", "StrefaInwestorow", "https://www.youtube.com/@StrefaInwestorow", "YT", ["GPW", "Makro PL", "Wywiady"], "Wywiady, wyniki spolek GPW, makro PL"),
    VerifiedSource("DC-Economics", "DC-Economics", "https://www.youtube.com/@DC-Economics", "YT", ["Obligacje", "Makro", "Geopolityka ekonomiczna", "Stopy procentowe"], "Obligacje, makro, geopolityka ekonomiczna, stopy procentowe"),
    VerifiedSource("NBP", "nbp", "https://nbp.pl", "Instytucja", ["Stopy procentowe", "Inflacja", "PKB", "Waluty"], "Stopy procentowe, raporty o inflacji, kursy walut, projekcje PKB", "Polska"),
    VerifiedSource("GUS", "gus", "https://new.stat.gov.pl", "Instytucja", ["CPI", "PPI", "PKB", "Rynek pracy", "Sprzedaz"], "CPI/PPI, PKB, rynek pracy, produkcja przemyslowa, sprzedaz detaliczna", "Polska"),
    VerifiedSource("Ministerstwo Finansow", "mf", "https://www.gov.pl/web/finanse", "Instytucja", ["Budzet", "Dlug publiczny", "Obligacje skarbowe"], "Wykonanie budzetu, dlug publiczny, deficyt, emisje obligacji", "Polska"),
    VerifiedSource("Eurostat", "eurostat", "https://ec.europa.eu/eurostat", "Instytucja", ["PKB UE", "Inflacja HICP", "Rynek pracy UE"], "Statystyki UE: PKB, inflacja, rynek pracy, handel, dlug i deficyt", "Europa / UE"),
    VerifiedSource("ECB / EBC", "ecb", "https://ecb.europa.eu", "Instytucja", ["Stopy EBC", "Projekcje makro", "Stabilnosc finansowa"], "Decyzje o stopach EBC, projekcje makro strefy euro, statystyki monetarne", "Europa / UE"),
    VerifiedSource("Federal Reserve", "federalreserve", "https://federalreserve.gov", "Instytucja", ["FOMC", "Stopy USD", "Beige Book", "Dot-plot"], "Decyzje FOMC o stopach, Beige Book, projekcje dot-plot", "USA"),
    VerifiedSource("BLS", "bls", "https://bls.gov", "Instytucja", ["NFP", "Bezrobocie US", "CPI", "PPI"], "NFP, stopa bezrobocia, CPI, PPI, indeks wynagrodzen", "USA"),
    VerifiedSource("BEA", "bea", "https://bea.gov", "Instytucja", ["PKB US", "PCE", "Dochody osobiste"], "PKB USA, PCE/Core PCE, dochody i wydatki osobiste", "USA"),
    VerifiedSource("US Treasury", "treasury", "https://home.treasury.gov", "Instytucja", ["Obligacje US", "Budzet", "Dlug publiczny"], "Emisje obligacji, saldo budzetowe, dlug publiczny, krzywa rentownosci", "USA"),
    VerifiedSource("SEC", "sec", "https://sec.gov", "Instytucja", ["10-K", "10-Q", "8-K", "IPO"], "Raporty spolek, insider transactions, proxy statements", "USA"),
    VerifiedSource("EIA", "eia", "https://eia.gov", "Instytucja", ["Ropa", "Gaz", "Zapasy energii"], "Zapasy ropy i gazu, produkcja energii USA, prognozy STEO", "USA"),
]

_CONTEXT_TERMS: dict[str, list[str]] = {
    CONTEXT_GEOPOLITICS: [
        "geopolityka", "bezpieczenstwo", "wojna", "konflikty", "iran", "izrael",
        "ukraina", "rosja", "sankcje", "obrona", "military", "middle east",
    ],
    CONTEXT_MACRO: [
        "makro", "inflacja", "cpi", "ppi", "pce", "pkb", "gdp", "rynek pracy",
        "bezrobocie", "stopy", "fomc", "ecb", "fed", "yield", "obligacje", "budzet",
    ],
    CONTEXT_TECHNOLOGY: [
        "technologia", "ai", "llm", "cloud", "chips", "semiconductor", "nvidia",
        "google", "microsoft", "meta", "amazon", "oracle", "anthropic", "cybersecurity",
    ],
}


def _norm(text: str) -> str:
    return normalize_text(str(text or "")).strip().casefold()


def _tokens(*parts: str) -> set[str]:
    tokens: set[str] = set()
    for part in parts:
        for token in _WORD_RE.findall(_norm(part)):
            if len(token) >= 2:
                tokens.add(token)
    return tokens


def _weight_for(handle: str, source_weights: dict[str, float] | None) -> float:
    if not source_weights:
        return 1.0
    try:
        return float(source_weights.get(handle, 1.0))
    except (TypeError, ValueError):
        return 1.0


def resolve_active_sources(
    source_weights: dict[str, float] | None = None,
    custom_x_handles: list[dict[str, Any]] | None = None,
) -> list[tuple[VerifiedSource, float]]:
    active: list[tuple[VerifiedSource, float]] = []
    for source in VERIFIED_SOURCES:
        weight = _weight_for(source.handle, source_weights)
        if weight > 0:
            active.append((source, weight))

    for item in custom_x_handles or []:
        handle = str(item.get("handle") or "").strip().lstrip("@")
        if not handle:
            continue
        try:
            weight = float(item.get("weight", _weight_for(handle, source_weights)))
        except (TypeError, ValueError):
            weight = _weight_for(handle, source_weights)
        if weight <= 0:
            continue
        active.append(
            (
                VerifiedSource(
                    name=str(item.get("name") or f"@{handle}"),
                    handle=handle,
                    url=f"https://x.com/{handle}",
                    category="X",
                    topics=[str(topic) for topic in item.get("topics", []) if str(topic).strip()],
                    description=str(item.get("description") or "Konto dodane przez uzytkownika"),
                    is_default=False,
                ),
                weight,
            )
        )

    deduped: dict[str, tuple[VerifiedSource, float]] = {}
    for source, weight in active:
        current = deduped.get(source.handle)
        if current is None or weight > current[1]:
            deduped[source.handle] = (source, weight)
    return list(deduped.values())


def _desired_terms(context: str, query: str | None, geo_focus: str | None, preference_context: str | None) -> set[str]:
    return _tokens(
        " ".join(_CONTEXT_TERMS.get(context, [])),
        query or "",
        geo_focus or "",
        preference_context or "",
    )


def _source_relevance(source: VerifiedSource, *, context: str, desired_terms: set[str]) -> float:
    haystack = _tokens(source.name, source.description, " ".join(source.topics), source.group)
    matches = len(haystack & desired_terms)
    category_bonus = 0.0

    # Group-based matching: strongly prefer sources whose group matches the context
    group = getattr(source, "group", "")
    if context == CONTEXT_MACRO and group == "macro":
        category_bonus = 3.0
    elif context == CONTEXT_MACRO and source.category == "Instytucja":
        category_bonus = 2.0
    elif context == CONTEXT_TECHNOLOGY and group in ("ai", "tech"):
        category_bonus = 3.0
    elif context == CONTEXT_TECHNOLOGY and source.category == "X":
        category_bonus = 1.0
    elif context == CONTEXT_GEOPOLITICS and group == "geo":
        category_bonus = 3.0
    elif context == CONTEXT_GEOPOLITICS and source.category in {"X", "YT"}:
        category_bonus = 1.0
    elif group == "gpw" and context in {"Polska / GPW"}:
        category_bonus = 3.0

    return float(matches) + category_bonus


def _category_limits(trust_level: float, context: str) -> dict[str, int]:
    if trust_level >= 0.8:
        limits = {"X": 3, "YT": 2, "Instytucja": 3}
    elif trust_level >= 0.4:
        limits = {"X": 2, "YT": 1, "Instytucja": 2}
    else:
        limits = {"X": 1, "YT": 1, "Instytucja": 1}

    if context == CONTEXT_TECHNOLOGY:
        limits["X"] += 1
    if context == CONTEXT_MACRO:
        limits["Instytucja"] += 1
    return limits


def select_sources_for_brief(
    *,
    context: str,
    query: str | None,
    geo_focus: str | None,
    preference_context: str | None,
    trust_level: float,
    source_weights: dict[str, float] | None = None,
    custom_x_handles: list[dict[str, Any]] | None = None,
) -> list[tuple[VerifiedSource, float]]:
    if trust_level <= 0:
        return []

    desired = _desired_terms(context, query, geo_focus, preference_context)
    active = resolve_active_sources(source_weights=source_weights, custom_x_handles=custom_x_handles)
    ranked: list[tuple[VerifiedSource, float, float]] = []
    for source, weight in active:
        relevance = _source_relevance(source, context=context, desired_terms=desired)
        if relevance <= 0:
            continue
        ranked.append((source, weight, relevance * max(weight, 0.1)))

    ranked.sort(key=lambda item: item[2], reverse=True)
    limits = _category_limits(trust_level, context)
    picked: list[tuple[VerifiedSource, float]] = []
    per_category = {key: 0 for key in limits}
    for source, weight, _score in ranked:
        current = per_category.get(source.category, 0)
        if current >= limits.get(source.category, 0):
            continue
        picked.append((source, weight))
        per_category[source.category] = current + 1
    return picked


class VerifiedSourceService:
    def __init__(self) -> None:
        self.twitter = TwitterClient()
        self.serper = SerperClient()

    async def _search_web(self, query: str, *, lang: str = "en-US", count: int = 3) -> list[dict[str, str]]:
        if not settings.serper_api_key:
            return []

        payload = {"q": query, "num": count, "gl": "pl" if lang == "pl-PL" else "us", "hl": "pl" if lang == "pl-PL" else "en"}
        headers = {"X-API-KEY": settings.serper_api_key, "Content-Type": "application/json"}
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.post("https://google.serper.dev/search", json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
        except Exception as exc:
            logger.warning("verified web search error query=%r err=%s", query, exc)
            return []

        results: list[dict[str, str]] = []
        for item in (data.get("organic") or [])[:count]:
            results.append(
                {
                    "title": str(item.get("title") or ""),
                    "link": str(item.get("link") or ""),
                    "snippet": str(item.get("snippet") or ""),
                    "date": str(item.get("date") or ""),
                    "source": str(item.get("source") or ""),
                }
            )
        return results

    def _query_blob(
        self,
        *,
        source: VerifiedSource,
        context: str,
        query: str | None,
        geo_focus: str | None,
        preference_context: str | None,
    ) -> str:
        parts: list[str] = []
        if query:
            parts.append(query)
        if geo_focus and context == CONTEXT_GEOPOLITICS:
            parts.append(geo_focus)
        if not parts:
            parts.extend(source.topics[:2])
        if preference_context:
            parts.extend(list(_tokens(preference_context))[:4])
        if not parts:
            parts.extend(_CONTEXT_TERMS.get(context, [])[:3])
        return " ".join(str(part).strip() for part in parts if str(part).strip())

    async def _fetch_x_batch(
        self,
        sources: list[tuple[VerifiedSource, float]],
        *,
        context: str,
        query: str | None,
        geo_focus: str | None,
        preference_context: str | None,
    ) -> list[dict[str, str]]:
        if not self.twitter.available or not sources:
            return []

        source = sources[0][0]
        blob = self._query_blob(
            source=source,
            context=context,
            query=query,
            geo_focus=geo_focus,
            preference_context=preference_context,
        )
        handles = [source.handle for source, _weight in sources[:4]]
        from_filter = " OR ".join(f"from:{handle}" for handle in handles)
        search_query = f"({from_filter}) {blob}".strip()
        tweets = await self.twitter.search(search_query, max_results=6, query_type="Latest")
        if not tweets:
            tweets = await self.twitter.search(f"({from_filter})", max_results=4, query_type="Latest")

        snippets: list[dict[str, str]] = []
        for tweet in tweets[:3]:
            text = normalize_text(str(tweet.get("text") or "")).strip()
            if not text:
                continue
            author_handle = str(tweet.get("author_handle") or "").strip()
            author = next((src for src, _weight in sources if src.handle == author_handle), None)
            provider_name = author.name if author is not None else author_handle
            snippets.append(
                {
                    "id": hashlib.md5(f"x:{author_handle}:{tweet.get('id','')}".encode()).hexdigest()[:16],
                    "title": f"@{author_handle}: {text[:110]}",
                    "summary": text[:700],
                    "provider": f"X / {provider_name}",
                    "published_at": str(tweet.get("created_at") or ""),
                    "url": str(tweet.get("url") or next((src.url for src, _weight in sources if src.handle == author_handle), source.url)),
                    "category": "verified_x",
                    "weight": f"{max((w for src, w in sources if src.handle == author_handle), default=1.0):.2f}",
                    "verified": "true",
                    "topics": ", ".join(next((src.topics for src, _weight in sources if src.handle == author_handle), [])),
                }
            )
        return snippets

    async def _fetch_youtube_snippets(
        self,
        source: VerifiedSource,
        *,
        context: str,
        query: str | None,
        geo_focus: str | None,
        preference_context: str | None,
        weight: float,
    ) -> list[dict[str, str]]:
        channel_id, channel_name = await resolve_channel_id(source.url)
        if not channel_id:
            return []

        videos = await fetch_channel_videos(channel_id, max_results=2)
        if not videos:
            return []

        desired = _desired_terms(context, query, geo_focus, preference_context)
        ranked_videos = sorted(
            videos,
            key=lambda item: len(_tokens(item.get("title") or "") & desired),
            reverse=True,
        )
        best = ranked_videos[0]
        video_id = str(best.get("video_id") or "")
        summary = normalize_text(str(best.get("title") or "")).strip()

        if video_id:
            loop = asyncio.get_event_loop()
            try:
                transcript, _lang = await loop.run_in_executor(None, lambda: get_transcript(video_id))
                if transcript.strip():
                    summary = normalize_text(transcript[:1000]).strip()
            except Exception:
                pass

        if not summary:
            return []

        return [
            {
                "id": hashlib.md5(f"yt:{source.handle}:{video_id}".encode()).hexdigest()[:16],
                "title": normalize_text(str(best.get("title") or source.name)).strip(),
                "summary": summary,
                "provider": f"YouTube / {channel_name or source.name}",
                "published_at": normalize_text(str(best.get("published") or "")).strip(),
                "url": f"https://www.youtube.com/watch?v={video_id}" if video_id else source.url,
                "category": "verified_youtube",
                "weight": f"{weight:.2f}",
                "verified": "true",
                "topics": ", ".join(source.topics),
            }
        ]

    async def _fetch_institution_snippets(
        self,
        source: VerifiedSource,
        *,
        context: str,
        query: str | None,
        geo_focus: str | None,
        preference_context: str | None,
        weight: float,
    ) -> list[dict[str, str]]:
        if not self.serper.enabled:
            return []

        domain = urlparse(source.url).netloc.replace("www.", "")
        blob = self._query_blob(
            source=source,
            context=context,
            query=query,
            geo_focus=geo_focus,
            preference_context=preference_context,
        )
        search_query = f"site:{domain} {blob}".strip()
        lang = "pl-PL" if domain.endswith(".pl") or "gov.pl" in domain else "en-US"
        results = await self.serper.search(search_query, count=2, lang=lang)
        if not results:
            results = await self._search_web(search_query, lang=lang, count=2)
        if not results:
            return []

        best = results[0]
        summary = normalize_text(str(best.get("snippet") or "")).strip()
        url = str(best.get("link") or source.url)
        scraped = await scrape_article(url)
        if scraped.strip():
            summary = normalize_text(scraped[:900]).strip()
        if not summary:
            return []

        return [
            {
                "id": hashlib.md5(f"inst:{source.handle}:{url}".encode()).hexdigest()[:16],
                "title": normalize_text(str(best.get("title") or source.name)).strip(),
                "summary": summary,
                "provider": source.name,
                "published_at": normalize_text(str(best.get("date") or "")).strip(),
                "url": url,
                "category": "verified_institution",
                "weight": f"{weight:.2f}",
                "verified": "true",
                "topics": ", ".join(source.topics),
            }
        ]

    async def fetch_for_brief(
        self,
        *,
        context: str,
        query: str | None,
        geo_focus: str | None,
        preference_context: str | None,
        trust_level: float,
        source_weights: dict[str, float] | None = None,
        custom_x_handles: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, str]]:
        selected = select_sources_for_brief(
            context=context,
            query=query,
            geo_focus=geo_focus,
            preference_context=preference_context,
            trust_level=trust_level,
            source_weights=source_weights,
            custom_x_handles=custom_x_handles,
        )
        if not selected:
            return []

        tasks = []
        x_selected = [(source, weight) for source, weight in selected if source.category == "X"]
        if x_selected:
            tasks.append(
                self._fetch_x_batch(
                    x_selected,
                    context=context,
                    query=query,
                    geo_focus=geo_focus,
                    preference_context=preference_context,
                )
            )

        for source, weight in selected:
            if source.category == "X":
                continue
            elif source.category == "YT":
                tasks.append(
                    self._fetch_youtube_snippets(
                        source,
                        context=context,
                        query=query,
                        geo_focus=geo_focus,
                        preference_context=preference_context,
                        weight=weight,
                    )
                )
            elif source.category == "Instytucja":
                tasks.append(
                    self._fetch_institution_snippets(
                        source,
                        context=context,
                        query=query,
                        geo_focus=geo_focus,
                        preference_context=preference_context,
                        weight=weight,
                    )
                )

        gathered = await asyncio.gather(*tasks, return_exceptions=True)
        snippets: list[dict[str, str]] = []
        seen: set[str] = set()
        for batch in gathered:
            if isinstance(batch, Exception):
                logger.warning("verified source fetch error: %s", batch)
                continue
            for item in batch:
                key = str(item.get("url") or item.get("title") or "")
                if not key or key in seen:
                    continue
                seen.add(key)
                snippets.append(item)

        snippets.sort(key=lambda item: float(item.get("weight") or 0.0), reverse=True)
        return snippets[:8]
