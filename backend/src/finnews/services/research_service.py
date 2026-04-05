from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from openai import AsyncOpenAI

import xml.etree.ElementTree as ET

import httpx

from finnews.clients.scraper import scrape_article
from finnews.clients.serper import SerperClient
from finnews.clients.twitter import TwitterClient, _MAX_CALLS_PER_SESSION
from finnews.clients.youtube import extract_video_id, get_transcript
from finnews.clients.market import get_quotes
from finnews.settings import settings
from finnews.trusted_sources import apply_trust_to_query, get_sources_context_for_prompt

logger = logging.getLogger(__name__)

_BASE_TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "search_web",
            "description": (
                "Wyszukaj aktualne wiadomości i informacje w internecie (Google News). "
                "Używaj do pytań o aktualne wydarzenia, spółki, gospodarkę, politykę, rynki."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Zapytanie wyszukiwania — po angielsku dla globalnych newsów lub po polsku dla polskich.",
                    },
                    "lang": {
                        "type": "string",
                        "enum": ["en-US", "pl-PL"],
                        "description": "Język wyszukiwania (en-US domyślnie).",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_market_data",
            "description": (
                "Pobierz aktualne kursy giełdowe dla podanych tickerów "
                "(np. AAPL, TSLA, BTC-USD, ^GSPC, EURUSD=X, ^TNX)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "tickers": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": 'Lista tickerów, np. ["AAPL", "BTC-USD", "EURUSD=X"].',
                    }
                },
                "required": ["tickers"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_youtube_transcript",
            "description": (
                "Pobierz transkrypcję z filmu YouTube podając jego URL. "
                "Użyj gdy pytanie dotyczy konkretnego wideo lub po wywołaniu get_channel_videos — "
                "zawsze pobierz transkrypcję najnowszego filmu z listy."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "video_url": {
                        "type": "string",
                        "description": "URL do filmu YouTube (np. https://www.youtube.com/watch?v=abc123).",
                    }
                },
                "required": ["video_url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_channel_videos",
            "description": (
                "Pobierz listę ostatnich filmów z kanału YouTube. "
                "Zwraca tytuły, URL i daty publikacji. "
                "ZAWSZE po wywołaniu tego narzędzia użyj get_youtube_transcript na 1-2 NAJNOWSZYCH filmach z listy — "
                "niezależnie od daty publikacji. Jeśli użytkownik prosi o 'ostatni tydzień' a filmy są sprzed 2-3 tygodni, "
                "i tak pobierz transkrypcję najnowszych dostępnych i poinformuj o ich dacie."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "channel_id": {
                        "type": "string",
                        "description": "ID kanału YouTube (np. UCTTzMDoVCbaX6K1CwKsRJsQ) lub pełny URL kanału.",
                    },
                    "channel_name": {
                        "type": "string",
                        "description": "Nazwa kanału (np. 'Good Times Bad Times PL') — pomaga w wyszukiwaniu.",
                    },
                    "max_videos": {
                        "type": "integer",
                        "description": "Maksymalna liczba filmów do zwrócenia (domyślnie 5, max 10).",
                    },
                },
                "required": ["channel_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_webpage",
            "description": (
                "Pobierz treść strony internetowej lub artykułu. "
                "Używaj gdy masz konkretny URL do przeczytania."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "URL strony do pobrania.",
                    }
                },
                "required": ["url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_twitter",
            "description": (
                "Przeszukaj Twitter/X w poszukiwaniu aktualnych tweetów, opinii inwestorów i analityków. "
                "Używaj do pytań o nastroje rynkowe, opinie ekspertów, spekulacje giełdowe, "
                "bieżące komentarze do wydarzeń finansowych. "
                "Limit: max 2 wywołania na zapytanie, max 10 tweetów na wywołanie."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Zapytanie wyszukiwania po angielsku lub polsku. Możesz użyć operatorów: from:handle, #hashtag.",
                    },
                    "query_type": {
                        "type": "string",
                        "enum": ["Latest", "Top"],
                        "description": "Latest = najnowsze tweety, Top = najpopularniejsze. Domyślnie Latest.",
                    },
                },
                "required": ["query"],
            },
        },
    },
]

_BASE_SYSTEM_PROMPT = (
    "Jesteś asystentem badawczym dla analityków finansowych i inwestorów. "
    "Korzystaj z dostępnych narzędzi żeby odpowiedzieć na pytanie użytkownika. "
    "Możesz wywołać kilka narzędzi jednocześnie. "
    "Na końcu sformułuj odpowiedź po polsku — konkretnie, rzeczowo i użytecznie. "
    "Jeśli masz dane rynkowe, podaj aktualne kursy z kontekstem. "
    "Jeśli masz wyniki wyszukiwania, powołaj się na źródła. "
    "Jeśli masz tweety, cytuj autorów (@handle) i daty. "
    "Nie wymyślaj faktów — opieraj się tylko na danych z narzędzi."
)


def _build_tools(twitter_available: bool) -> list[dict[str, Any]]:
    """Zwraca listę narzędzi — search_twitter tylko jeśli Twitter API jest dostępne."""
    if twitter_available:
        return _BASE_TOOLS
    return [t for t in _BASE_TOOLS if t["function"]["name"] != "search_twitter"]


def _build_system_prompt(
    trust_level: float,
    source_weights: dict[str, float] | None = None,
    custom_x_handles: list[dict] | None = None,
) -> str:
    """Buduje system prompt z aktualną datą i opcjonalną sekcją zweryfikowanych źródeł."""
    from datetime import UTC, datetime
    today = datetime.now(UTC).strftime("%Y-%m-%d")
    date_line = f"Dzisiaj jest {today} (UTC). Traktuj daty z narzędzi jako wiarygodne — dane mogą być nowsze niż Twoja wiedza treningowa."

    sources_context = get_sources_context_for_prompt(trust_level, source_weights, custom_x_handles)
    parts = [_BASE_SYSTEM_PROMPT, date_line]
    if sources_context:
        parts.append(sources_context)
    return "\n\n".join(parts)


class ResearchService:
    def __init__(self) -> None:
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.model = settings.openai_model
        self.serper = SerperClient()
        self.twitter = TwitterClient()

    async def _execute_tool(
        self,
        name: str,
        args: dict[str, Any],
        trust_level: float,
        twitter_calls: list[int],
        source_weights: dict[str, float] | None = None,
        custom_x_handles: list[dict] | None = None,
    ) -> str:
        try:
            if name == "search_web":
                results = await self.serper.search(
                    args["query"],
                    count=8,
                    lang=args.get("lang", "en-US"),
                )
                return json.dumps(results, ensure_ascii=False)

            elif name == "get_market_data":
                tickers = [str(t) for t in args.get("tickers", [])]
                loop = asyncio.get_event_loop()
                quotes = await loop.run_in_executor(None, lambda: get_quotes(tickers))
                return json.dumps(quotes, ensure_ascii=False)

            elif name == "get_youtube_transcript":
                video_url = args["video_url"]
                video_id = extract_video_id(video_url)
                if not video_id:
                    return json.dumps({"error": "Nie można wyciągnąć ID wideo z URL."})
                loop = asyncio.get_event_loop()
                try:
                    text, lang = await loop.run_in_executor(None, lambda: get_transcript(video_id))
                    return json.dumps({"transcript": text[:20000], "language": lang})
                except ValueError as e:
                    return json.dumps({"error": str(e)})

            elif name == "get_channel_videos":
                raw = args["channel_id"].strip()
                channel_name = args.get("channel_name", "").strip()
                max_videos = min(int(args.get("max_videos", 5)), 10)

                # Wyciągnij channel_id z URL jeśli podano pełny URL
                if "youtube.com/channel/" in raw:
                    channel_id = raw.split("youtube.com/channel/")[-1].split("/")[0].split("?")[0]
                elif "youtube.com/@" in raw:
                    channel_id = raw.split("youtube.com/@")[-1].split("/")[0].split("?")[0]
                else:
                    channel_id = raw

                # Spróbuj RSS (szybkie, bez API)
                videos: list[dict] = []
                rss_ok = False
                rss_url = f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
                try:
                    async with httpx.AsyncClient(timeout=8.0) as client:
                        resp = await client.get(rss_url, headers={"User-Agent": "Mozilla/5.0"})
                    if resp.status_code == 200:
                        ns = {
                            "atom": "http://www.w3.org/2005/Atom",
                            "yt": "http://www.youtube.com/xml/schemas/2015",
                        }
                        root = ET.fromstring(resp.text)
                        channel_title = root.findtext("atom:title", default=channel_name, namespaces=ns)
                        for entry in root.findall("atom:entry", ns)[:max_videos]:
                            vid_id = entry.findtext("yt:videoId", default="", namespaces=ns)
                            title = entry.findtext("atom:title", default="", namespaces=ns)
                            published = entry.findtext("atom:published", default="", namespaces=ns)
                            videos.append({
                                "title": title,
                                "url": f"https://www.youtube.com/watch?v={vid_id}",
                                "published": published[:10] if published else "",
                            })
                        rss_ok = bool(videos)
                except Exception:
                    pass

                # Fallback: Serper organic search — szuka filmów po nazwie kanału
                # Bez cudzysłowów + słowo "youtube" → lepsze wyniki i aktualne daty
                if not rss_ok and self.serper.enabled:
                    name_q = channel_name or channel_id
                    search_q = f'{name_q} youtube site:youtube.com/watch'
                    try:
                        async with httpx.AsyncClient(timeout=8.0) as client:
                            r = await client.post(
                                "https://google.serper.dev/search",
                                json={"q": search_q, "num": max_videos * 2},
                                headers={"X-API-KEY": settings.serper_api_key, "Content-Type": "application/json"},
                            )
                            r.raise_for_status()
                            data = r.json()
                        for item in (data.get("organic") or []):
                            link = item.get("link", "")
                            if "youtube.com/watch" in link or "youtu.be/" in link:
                                videos.append({
                                    "title": item.get("title", ""),
                                    "url": link,
                                    "published": item.get("date", ""),
                                })
                            if len(videos) >= max_videos:
                                break
                    except Exception as e:
                        logger.warning("get_channel_videos serper fallback error: %s", e)

                if not videos:
                    return json.dumps({"error": f"Nie znaleziono filmów dla kanału {channel_id}. Spróbuj podać channel_name."})

                return json.dumps({
                    "channel": channel_name or channel_id,
                    "videos": videos,
                }, ensure_ascii=False)

            elif name == "fetch_webpage":
                text = await scrape_article(args["url"])
                return json.dumps({"content": text[:5000] if text else ""})

            elif name == "search_twitter":
                # Limit wywołań
                if twitter_calls[0] >= _MAX_CALLS_PER_SESSION:
                    return json.dumps({
                        "error": f"Limit wywołań search_twitter ({_MAX_CALLS_PER_SESSION}/sesję) osiągnięty."
                    })

                if not self.twitter.available:
                    return json.dumps({"error": "Twitter API niedostępne (brak klucza)."})

                twitter_calls[0] += 1

                # Zastosuj trust level + aktywne źródła
                raw_query = args["query"]
                query = apply_trust_to_query(
                    raw_query, trust_level,
                    source_weights=source_weights,
                    custom_x_handles=custom_x_handles,
                )
                query_type = args.get("query_type", "Latest")

                tweets = await self.twitter.search(query, query_type=query_type)

                if not tweets:
                    return json.dumps({"tweets": [], "note": "Brak wyników dla zapytania."})

                return json.dumps({"tweets": tweets}, ensure_ascii=False)

            else:
                return json.dumps({"error": f"Unknown tool: {name}"})

        except Exception as e:
            logger.warning("research tool %s error: %s", name, e)
            return json.dumps({"error": str(e)})

    async def run(
        self,
        query: str,
        sources_trust_level: float = 0.5,
        source_weights: dict[str, float] | None = None,
        custom_x_handles: list[dict] | None = None,
    ) -> dict[str, Any]:
        """
        Run a research query using LLM tool calling.
        Returns {"report": str, "tools_used": list[str], "sources": list[dict]}.

        sources_trust_level (0.0-1.0): ogólny tryb preferencji źródeł.
        source_weights: dict[handle, 0.0-1.0] — indywidualna waga każdego źródła.
        custom_x_handles: lista [{handle, name, weight?}] własnych kont X.
        """
        system_prompt = _build_system_prompt(
            sources_trust_level,
            source_weights=source_weights,
            custom_x_handles=custom_x_handles,
        )
        tools = _build_tools(self.twitter.available)

        messages: list[dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": query},
        ]

        tools_used: list[str] = []
        sources: list[dict[str, str]] = []
        twitter_calls: list[int] = [0]
        _weights = source_weights or {}
        _custom_x = custom_x_handles or []

        _MAX_ROUNDS = 6  # max rund tool-calling (każda runda = jeden LLM call)

        for _round in range(_MAX_ROUNDS):
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,  # type: ignore[arg-type]
                tools=tools,  # type: ignore[arg-type]
                tool_choice="auto",
                temperature=0.3,
            )

            msg = response.choices[0].message

            # LLM nie wywołał narzędzi — gotowa odpowiedź
            if not msg.tool_calls:
                return {
                    "report": (msg.content or "").strip(),
                    "tools_used": list(set(tools_used)),
                    "sources": sources,
                }

            # Dodaj odpowiedź asystenta do historii
            tool_call_dicts = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                }
                for tc in msg.tool_calls
            ]
            messages.append({
                "role": "assistant",
                "content": msg.content,
                "tool_calls": tool_call_dicts,
            })

            # Zbierz i wykonaj narzędzia równolegle
            tool_tasks: list[tuple[str, str, dict[str, Any]]] = []
            for tc in msg.tool_calls:
                tools_used.append(tc.function.name)
                try:
                    args = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    args = {}
                tool_tasks.append((tc.id, tc.function.name, args))

            results = await asyncio.gather(*[
                self._execute_tool(name, args, sources_trust_level, twitter_calls, _weights, _custom_x)
                for _, name, args in tool_tasks
            ])

            # Dodaj wyniki narzędzi do historii i zbierz źródła
            for (tool_call_id, name, _args), result_str in zip(tool_tasks, results):
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call_id,
                    "content": result_str,
                })

                if name == "search_web":
                    try:
                        items = json.loads(result_str)
                        if isinstance(items, list):
                            for item in items[:6]:
                                if item.get("link") and item.get("title"):
                                    sources.append({
                                        "title": item["title"],
                                        "url": item["link"],
                                        "provider": item.get("source", ""),
                                    })
                    except Exception:
                        pass

                elif name == "search_twitter":
                    try:
                        data = json.loads(result_str)
                        for tweet in data.get("tweets", [])[:5]:
                            if tweet.get("url"):
                                sources.append({
                                    "title": f"@{tweet.get('author_handle', '?')}: {tweet.get('text', '')[:80]}...",
                                    "url": tweet["url"],
                                    "provider": "X (Twitter)",
                                })
                    except Exception:
                        pass

                elif name == "get_youtube_transcript":
                    try:
                        data = json.loads(result_str)
                        if data.get("transcript") and _args.get("video_url"):
                            sources.append({
                                "title": f"Transkrypcja YT ({data.get('language', '')})",
                                "url": _args["video_url"],
                                "provider": "YouTube",
                            })
                    except Exception:
                        pass

                elif name == "get_channel_videos":
                    try:
                        data = json.loads(result_str)
                        for v in data.get("videos", [])[:3]:
                            if v.get("url"):
                                sources.append({
                                    "title": v.get("title", "Film YT"),
                                    "url": v["url"],
                                    "provider": data.get("channel", "YouTube"),
                                })
                    except Exception:
                        pass

        # Jeśli osiągnięto limit rund — wymuś syntezę bez narzędzi
        final = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,  # type: ignore[arg-type]
            temperature=0.3,
        )
        return {
            "report": (final.choices[0].message.content or "").strip(),
            "tools_used": list(set(tools_used)),
            "sources": sources,
        }
