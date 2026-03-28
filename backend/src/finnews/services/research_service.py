from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from openai import AsyncOpenAI

from finnews.clients.scraper import scrape_article
from finnews.clients.serper import SerperClient
from finnews.clients.youtube import extract_video_id, get_transcript
from finnews.clients.market import get_quotes
from finnews.settings import settings

logger = logging.getLogger(__name__)

_TOOLS: list[dict[str, Any]] = [
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
                "Pobierz transkrypcję z filmu YouTube. "
                "Użyj gdy pytanie dotyczy konkretnego wideo YouTube lub gdy chcesz przeanalizować jego treść."
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
]

_SYSTEM_PROMPT = (
    "Jesteś asystentem badawczym dla analityków finansowych i inwestorów. "
    "Korzystaj z dostępnych narzędzi żeby odpowiedzieć na pytanie użytkownika. "
    "Możesz wywołać kilka narzędzi jednocześnie. "
    "Na końcu sformułuj odpowiedź po polsku — konkretnie, rzeczowo i użytecznie. "
    "Jeśli masz dane rynkowe, podaj aktualne kursy z kontekstem. "
    "Jeśli masz wyniki wyszukiwania, powołaj się na źródła. "
    "Nie wymyślaj faktów — opieraj się tylko na danych z narzędzi."
)


class ResearchService:
    def __init__(self) -> None:
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.model = settings.openai_model
        self.serper = SerperClient()

    async def _execute_tool(self, name: str, args: dict[str, Any]) -> str:
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

            elif name == "fetch_webpage":
                text = await scrape_article(args["url"])
                return json.dumps({"content": text[:5000] if text else ""})

            else:
                return json.dumps({"error": f"Unknown tool: {name}"})

        except Exception as e:
            logger.warning("research tool %s error: %s", name, e)
            return json.dumps({"error": str(e)})

    async def run(self, query: str) -> dict[str, Any]:
        """
        Run a research query using LLM tool calling.
        Returns {"report": str, "tools_used": list[str], "sources": list[dict]}.
        """
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": query},
        ]

        tools_used: list[str] = []
        sources: list[dict[str, str]] = []

        # First call — LLM picks tools
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,  # type: ignore[arg-type]
            tools=_TOOLS,  # type: ignore[arg-type]
            tool_choice="auto",
            temperature=0.3,
        )

        msg = response.choices[0].message

        # No tool calls — return direct answer
        if not msg.tool_calls:
            return {
                "report": msg.content or "",
                "tools_used": [],
                "sources": [],
            }

        # Build assistant message dict for re-submission
        tool_call_dicts = []
        for tc in msg.tool_calls:
            tool_call_dicts.append({
                "id": tc.id,
                "type": "function",
                "function": {"name": tc.function.name, "arguments": tc.function.arguments},
            })

        messages.append({
            "role": "assistant",
            "content": msg.content,
            "tool_calls": tool_call_dicts,
        })

        # Collect tool tasks
        tool_tasks: list[tuple[str, str, dict[str, Any]]] = []
        for tc in msg.tool_calls:
            tools_used.append(tc.function.name)
            try:
                args = json.loads(tc.function.arguments)
            except json.JSONDecodeError:
                args = {}
            tool_tasks.append((tc.id, tc.function.name, args))

        # Execute tools in parallel
        results = await asyncio.gather(*[
            self._execute_tool(name, args)
            for _, name, args in tool_tasks
        ])

        # Append tool results and collect sources
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

        # Final synthesis call
        final = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,  # type: ignore[arg-type]
            temperature=0.3,
        )

        report = (final.choices[0].message.content or "").strip()

        return {
            "report": report,
            "tools_used": list(set(tools_used)),
            "sources": sources,
        }
