from __future__ import annotations

import logging
import time
from typing import Any

import yfinance as yf
from cachetools import TTLCache

logger = logging.getLogger(__name__)

# Cache quotes for 60 seconds
_cache: TTLCache = TTLCache(maxsize=256, ttl=60)

# Static instrument registry
INSTRUMENTS: list[dict[str, Any]] = [
    # Indeksy
    {"ticker": "^GSPC",     "name": "S&P 500",          "category": "Indeksy",   "default": True},
    {"ticker": "^IXIC",     "name": "NASDAQ Composite",  "category": "Indeksy",   "default": True},
    {"ticker": "^DJI",      "name": "Dow Jones",         "category": "Indeksy",   "default": True},
    {"ticker": "^GDAXI",    "name": "DAX",               "category": "Indeksy",   "default": True},
    {"ticker": "WIG20.WA",  "name": "WIG20",             "category": "Indeksy",   "default": True},
    {"ticker": "^FTSE",     "name": "FTSE 100",          "category": "Indeksy",   "default": False},
    {"ticker": "^N225",     "name": "Nikkei 225",        "category": "Indeksy",   "default": False},
    {"ticker": "^HSI",      "name": "Hang Seng",         "category": "Indeksy",   "default": False},
    {"ticker": "^STOXX50E", "name": "Euro Stoxx 50",     "category": "Indeksy",   "default": False},
    {"ticker": "^CAC40",    "name": "CAC 40",            "category": "Indeksy",   "default": False},
    {"ticker": "^RUT",      "name": "Russell 2000",      "category": "Indeksy",   "default": False},
    {"ticker": "^VIX",      "name": "VIX (Fear Index)",  "category": "Indeksy",   "default": False},
    # Obligacje
    {"ticker": "^TNX",      "name": "US 10Y Treasury",   "category": "Obligacje", "default": True},
    {"ticker": "^TYX",      "name": "US 30Y Treasury",   "category": "Obligacje", "default": True},
    {"ticker": "^FVX",      "name": "US 5Y Treasury",    "category": "Obligacje", "default": False},
    {"ticker": "^IRX",      "name": "US 3M T-Bill",      "category": "Obligacje", "default": False},
    # Waluty
    {"ticker": "EURUSD=X",  "name": "EUR/USD",           "category": "Waluty",    "default": True},
    {"ticker": "GBPUSD=X",  "name": "GBP/USD",           "category": "Waluty",    "default": False},
    {"ticker": "USDJPY=X",  "name": "USD/JPY",           "category": "Waluty",    "default": True},
    {"ticker": "USDPLN=X",  "name": "USD/PLN",           "category": "Waluty",    "default": True},
    {"ticker": "EURPLN=X",  "name": "EUR/PLN",           "category": "Waluty",    "default": True},
    {"ticker": "USDCHF=X",  "name": "USD/CHF",           "category": "Waluty",    "default": False},
    {"ticker": "AUDUSD=X",  "name": "AUD/USD",           "category": "Waluty",    "default": False},
    {"ticker": "USDCNH=X",  "name": "USD/CNH",           "category": "Waluty",    "default": False},
    # Krypto
    {"ticker": "BTC-USD",   "name": "Bitcoin",           "category": "Krypto",    "default": True},
    {"ticker": "ETH-USD",   "name": "Ethereum",          "category": "Krypto",    "default": True},
    {"ticker": "SOL-USD",   "name": "Solana",            "category": "Krypto",    "default": False},
    {"ticker": "BNB-USD",   "name": "BNB",               "category": "Krypto",    "default": False},
    {"ticker": "XRP-USD",   "name": "XRP",               "category": "Krypto",    "default": False},
    {"ticker": "DOGE-USD",  "name": "Dogecoin",          "category": "Krypto",    "default": False},
    # ETF
    {"ticker": "SPY",       "name": "SPDR S&P 500 ETF",  "category": "ETF",       "default": False},
    {"ticker": "QQQ",       "name": "NASDAQ 100 ETF",    "category": "ETF",       "default": False},
    {"ticker": "IWM",       "name": "Russell 2000 ETF",  "category": "ETF",       "default": False},
    {"ticker": "GLD",       "name": "Gold ETF (GLD)",    "category": "ETF",       "default": False},
    {"ticker": "TLT",       "name": "20Y Treasury ETF",  "category": "ETF",       "default": False},
    {"ticker": "EEM",       "name": "Emerging Markets ETF", "category": "ETF",    "default": False},
    {"ticker": "VNQ",       "name": "Real Estate ETF",   "category": "ETF",       "default": False},
    {"ticker": "HYG",       "name": "High Yield Bond ETF","category": "ETF",      "default": False},
]

TICKER_NAME_MAP: dict[str, str] = {i["ticker"]: i["name"] for i in INSTRUMENTS}

DEFAULT_TICKERS: list[str] = [i["ticker"] for i in INSTRUMENTS if i["default"]]


def get_instruments_by_category() -> list[dict[str, Any]]:
    categories: dict[str, list[dict]] = {}
    for inst in INSTRUMENTS:
        cat = inst["category"]
        if cat not in categories:
            categories[cat] = []
        categories[cat].append({"ticker": inst["ticker"], "name": inst["name"], "default": inst["default"]})
    return [{"name": cat, "instruments": items} for cat, items in categories.items()]


def _fetch_quotes(tickers: list[str]) -> list[dict[str, Any]]:
    if not tickers:
        return []

    results: list[dict[str, Any]] = []
    # Fetch in batch
    try:
        data = yf.Tickers(" ".join(tickers))
        for ticker in tickers:
            try:
                info = data.tickers[ticker].fast_info
                price = getattr(info, "last_price", None)
                prev_close = getattr(info, "previous_close", None)
                currency = getattr(info, "currency", "USD")
                market_state = getattr(info, "market_state", None) or "Unknown"

                change = None
                change_pct = None
                if price is not None and prev_close and prev_close != 0:
                    change = round(price - prev_close, 4)
                    change_pct = round((change / prev_close) * 100, 3)

                results.append({
                    "ticker": ticker,
                    "name": TICKER_NAME_MAP.get(ticker, ticker),
                    "price": round(price, 4) if price is not None else None,
                    "change": change,
                    "change_pct": change_pct,
                    "currency": currency,
                    "market_state": market_state,
                    "fetched_at": int(time.time()),
                })
            except Exception as exc:
                logger.warning("market: failed to fetch %s: %s", ticker, exc)
                results.append({
                    "ticker": ticker,
                    "name": TICKER_NAME_MAP.get(ticker, ticker),
                    "price": None,
                    "change": None,
                    "change_pct": None,
                    "currency": None,
                    "market_state": "Error",
                    "fetched_at": int(time.time()),
                })
    except Exception as exc:
        logger.error("market: batch fetch failed: %s", exc)
        for ticker in tickers:
            results.append({
                "ticker": ticker,
                "name": TICKER_NAME_MAP.get(ticker, ticker),
                "price": None,
                "change": None,
                "change_pct": None,
                "currency": None,
                "market_state": "Error",
                "fetched_at": int(time.time()),
            })

    return results


def get_quotes(tickers: list[str]) -> list[dict[str, Any]]:
    """Return quotes for given tickers, using 60s cache per ticker."""
    cached: list[dict] = []
    missing: list[str] = []

    for ticker in tickers:
        if ticker in _cache:
            cached.append(_cache[ticker])
        else:
            missing.append(ticker)

    if missing:
        fresh = _fetch_quotes(missing)
        for item in fresh:
            _cache[item["ticker"]] = item
        cached.extend(fresh)

    # Preserve original order
    order = {t: i for i, t in enumerate(tickers)}
    cached.sort(key=lambda x: order.get(x["ticker"], 999))
    return cached
