from __future__ import annotations

import json
import re
from typing import Any

from openai import AsyncOpenAI

from finnews.settings import settings


class LLMClient:
    def __init__(self) -> None:
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.model = settings.openai_model

    async def pick_top_ids(self, items: list[dict[str, Any]], k: int) -> list[str]:
        # items: [{id,title,provider,pubDate,tickers,isHosted}]
        k = max(1, min(k, len(items)))
        content = {
            "k": k,
            "items": items,
            "rules": [
                "Wybierz newsy o najwiekszym wplywie rynkowym/fundamentalnym.",
                "Preferuj earnings, guidance, buybacks, M&A, regulacje, makro, duze spolki.",
                "Zwroc WYLACZNIE JSON.",
            ],
            "output": {"selected_ids": ["..."]},
        }

        resp = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": "Jestes analitykiem finansowym. Zwracasz wylacznie JSON."},
                {"role": "user", "content": json.dumps(content, ensure_ascii=False)},
            ],
            temperature=0.2,
        )

        text = (resp.choices[0].message.content or "").strip()
        try:
            data = json.loads(text)
            ids = data.get("selected_ids", [])
            if isinstance(ids, list):
                ids = [str(x) for x in ids]
                return ids[:k]
        except Exception:
            pass

        # Fallback: znajdz UUID-y w tekscie
        uuids = re.findall(
            r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
            text,
        )
        return uuids[:k]

    async def summarize(
        self,
        ticker_sections: list[dict[str, Any]],
        style: str,
        query: str | None,
        requested_tickers: list[str],
        used_sector_fallback: bool,
    ) -> str:
        payload = {
            "style": style,
            "query": query or "",
            "requested_tickers": requested_tickers,
            "used_sector_fallback": used_sector_fallback,
            "instructions": [
                f"Skup sie wylacznie na podanych tickerach: {', '.join(requested_tickers) or '(brak)'}.",
                "Nie omawiaj innych spolek, chyba ze sa bezposrednio powiazane z podanym tickerem i wynikaja ze zrodel.",
                "Jesli brak bezposrednich newsow dla danego tickera, napisz dokladnie: 'Brak istotnych newsow dla {ticker}'.",
                "Nie generuj ogolnego komentarza makro, jesli nie wynika bezposrednio z dostarczonych newsow.",
                "Nie wymyslaj dodatkowych spolek ani faktow nieobecnych w zrodlach.",
                "Dla kazdego tickera korzystaj tylko ze zrodel przypisanych do tego tickera.",
                "Jesli sekcja ma znacznik general_sector=true, traktuj ja jako kontekst ogolnosektorowy i jasno zaznacz brak bezposrednich newsow dla tickera.",
            ],
            "ticker_sections": ticker_sections,
        }

        resp = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Jestes analitykiem finansowym. Piszesz konkretne podsumowania po polsku. "
                        "Nie wolno Ci generowac ogolnego komentarza makro, jesli nie wynika ze zrodel. "
                        "Nie wolno Ci dodawac ani omawiac spolek, ktorych nie ma w dostarczonych tickerach lub zrodlach."
                    ),
                },
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            temperature=0.3,
        )
        return (resp.choices[0].message.content or "").strip()
