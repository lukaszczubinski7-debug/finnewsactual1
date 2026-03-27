from __future__ import annotations

import logging

from finnews.clients.axesso import AxessoClient
from finnews.normalizers.details_normalizer import normalize_details

logger = logging.getLogger(__name__)


class NewsDetailsService:
    def __init__(self, client: AxessoClient) -> None:
        self.client = client

    async def fetch_normalized_many(self, ids: list[str]) -> list[dict]:
        out: list[dict] = []
        for news_id in ids:
            try:
                raw = await self.client.get_details(news_id)
                norm = normalize_details(raw)
            except Exception as exc:
                logger.warning("details fetch skipped id=%s error=%s", news_id, exc)
                continue
            if norm and norm.get("id"):
                out.append(norm)
        return out
