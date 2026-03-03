from __future__ import annotations

from finnews.clients.axesso import AxessoClient
from finnews.errors import NewsDataParsingError
from finnews.normalizers.details_normalizer import normalize_details


class NewsDetailsService:
    def __init__(self, client: AxessoClient) -> None:
        self.client = client

    async def fetch_normalized_many(self, ids: list[str]) -> list[dict]:
        out: list[dict] = []
        for news_id in ids:
            raw = await self.client.get_details(news_id)
            try:
                norm = normalize_details(raw)
            except Exception as exc:
                raise NewsDataParsingError("Could not parse upstream news details") from exc
            if norm and norm.get("id"):
                out.append(norm)
        return out
