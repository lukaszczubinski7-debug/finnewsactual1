from __future__ import annotations

import logging

from finnews.clients.axesso import AxessoClient
from finnews.errors import NewsDataParsingError
from finnews.normalizers.list_normalizer import find_list_and_path, normalize_items

logger = logging.getLogger(__name__)


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
        items, used_path, meta_debug = find_list_and_path(raw)
        if not items:
            raise NewsDataParsingError(
                "No news list found in upstream payload",
                detail_payload={
                    "message": "No news list found in upstream payload",
                    "debug": meta_debug,
                },
            )
        try:
            normalized = normalize_items(items, limit=limit)
        except NewsDataParsingError:
            raise
        except Exception as exc:
            raise NewsDataParsingError("Could not parse upstream news list") from exc
        if not normalized:
            raise NewsDataParsingError(
                "Upstream returned 0 normalized items",
                detail_payload={
                    "message": "Upstream returned 0 normalized items",
                    "debug": {
                        **meta_debug,
                        "used_path": used_path,
                        "raw_count": len(items),
                        "normalized_count": 0,
                    },
                },
            )
        logger.info(
            "news_list_normalized used_path=%s raw_count=%s normalized_count=%s",
            used_path or "-",
            len(items),
            len(normalized),
        )
        return normalized
