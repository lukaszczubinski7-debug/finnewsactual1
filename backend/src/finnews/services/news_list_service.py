from __future__ import annotations

from finnews.clients.axesso import AxessoClient
from finnews.errors import NewsDataParsingError
from finnews.normalizers.list_normalizer import normalize_list


class NewsListService:
    def __init__(self, client: AxessoClient) -> None:
        self.client = client

    async def fetch_normalized(
        self,
        *,
        s: str | None,
        region: str | None,
        limit: int,
    ) -> list[dict]:
        raw = await self.client.list_news(
            s=s,
            region=region,
            snippet_count=limit,
        )
        try:
            return normalize_list(raw, limit=limit)
        except Exception as exc:
            raise NewsDataParsingError("Could not parse upstream news list") from exc
