"""Klient twitterapi.io — advanced tweet search."""
from __future__ import annotations

import logging

import httpx

from finnews.settings import settings

logger = logging.getLogger(__name__)

_BASE_URL = "https://api.twitterapi.io"

# Limity bezpieczeństwa
_MAX_TWEETS_PER_CALL = 10   # max tweetów zwracanych jednorazowo
_MAX_CALLS_PER_SESSION = 2  # max wywołań search_twitter w jednym research


class TwitterClient:
    """Asynchroniczny klient do przeszukiwania tweetów."""

    def __init__(self) -> None:
        self._api_key = settings.twitterapi_io_key

    @property
    def available(self) -> bool:
        return bool(self._api_key)

    async def search(
        self,
        query: str,
        max_results: int = _MAX_TWEETS_PER_CALL,
        query_type: str = "Latest",
    ) -> list[dict]:
        """
        Przeszukuje Twitter/X i zwraca listę tweetów.

        query_type: "Latest" (domyślnie) lub "Top"
        """
        if not self.available:
            logger.warning("TwitterClient: brak TWITTERAPI_IO_KEY")
            return []

        max_results = min(max_results, _MAX_TWEETS_PER_CALL)

        params = {
            "query": query,
            "queryType": query_type,
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(
                    f"{_BASE_URL}/twitter/tweet/advanced_search",
                    params=params,
                    headers={"X-API-Key": self._api_key},
                )
                response.raise_for_status()
                data = response.json()

        except httpx.HTTPStatusError as e:
            logger.error("TwitterAPI HTTP error: %s — %s", e.response.status_code, e.response.text[:200])
            return []
        except Exception as e:
            logger.error("TwitterAPI error: %s", e)
            return []

        # Normalizuj odpowiedź — struktura twitterapi.io
        tweets_raw = data.get("tweets", [])
        if not tweets_raw and "data" in data:
            tweets_raw = data["data"]

        tweets: list[dict] = []
        for t in tweets_raw[:max_results]:
            author = t.get("author", {})
            tweets.append({
                "id": t.get("id") or t.get("tweet_id", ""),
                "text": t.get("text", ""),
                "author_name": author.get("name", "") if isinstance(author, dict) else "",
                "author_handle": author.get("userName", "") or author.get("username", "") if isinstance(author, dict) else "",
                "created_at": t.get("createdAt", "") or t.get("created_at", ""),
                "url": (
                    f"https://x.com/{author.get('userName', 'i') if isinstance(author, dict) else 'i'}/status/{t.get('id', '')}"
                ),
                "likes": t.get("likeCount", 0) or t.get("favorite_count", 0),
                "retweets": t.get("retweetCount", 0) or t.get("retweet_count", 0),
            })

        logger.info("TwitterClient: znaleziono %d tweetów dla query: %r", len(tweets), query[:60])
        return tweets
