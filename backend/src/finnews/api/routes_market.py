from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from finnews.api.responses import utf8_json
from finnews.clients.market import DEFAULT_TICKERS, get_instruments_by_category, get_quotes

router = APIRouter(prefix="/market", tags=["market"])

MAX_TICKERS = 60


@router.get("/instruments")
def market_instruments():
    """Return full list of available instruments grouped by category."""
    return utf8_json({"categories": get_instruments_by_category()})


@router.get("/quotes")
async def market_quotes(
    tickers: Annotated[str | None, Query(description="Comma-separated ticker symbols")] = None,
):
    """Return live quotes for requested tickers (cached 60s)."""
    if tickers:
        ticker_list = [t.strip() for t in tickers.split(",") if t.strip()][:MAX_TICKERS]
    else:
        ticker_list = DEFAULT_TICKERS

    quotes = get_quotes(ticker_list)
    return utf8_json(quotes)
