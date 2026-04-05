from __future__ import annotations

import logging
from collections import defaultdict
from datetime import date

from fastapi import APIRouter, Query

from finnews.db.session import SessionLocal
from finnews.services.earnings_service import EarningsService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/earnings", tags=["earnings"])

_svc = EarningsService()

# ── GPW index compositions (tickers WITHOUT .WA suffix) ───────────────────────

WIG20_TICKERS = frozenset([
    "ALE", "ALR", "BDX", "CDR", "DNP", "KGH", "KRU", "KTY", "LPP", "MBK",
    "MDV", "PCO", "PEO", "PGE", "PKN", "PKO", "PZU", "SPL", "TPE", "ZAB",
])

MWIG40_TICKERS = frozenset([
    "ABE", "ACP", "APR", "ASB", "ASE", "ATT", "BFT", "BHW", "BNP", "CAR",
    "CBF", "CPS", "CRI", "DIA", "DOM", "DVL", "EAT", "ENA", "EUR", "GPP",
    "GPW", "ING", "JSW", "LBW", "MBR", "MIL", "MRB", "NEU", "NWG", "OPL",
    "PEP", "PXM", "RBW", "SNT", "TEN", "TXT", "VOX", "VRC", "WPL", "XTB",
])

SWIG80_TICKERS = frozenset([
    "11B", "1AT", "ABS", "ACG", "AGO", "ALL", "AMB", "AMC", "ANR", "APT",
    "ARH", "ARL", "AST", "ATC", "BCX", "BIO", "BLO", "BMC", "BOS", "BRS",
    "CIG", "CLC", "CLN", "CMP", "COG", "CRJ", "CTX", "DAD", "DAT", "DCR",
    "DIG", "ECH", "ELT", "ENT", "ERB", "FRO", "FTE", "GRX", "HUG", "ICE",
    "KGN", "LWB", "MAB", "MCI", "MDG", "MLG", "MNC", "MRC", "MSZ", "MUR",
    "OND", "OPN", "PBX", "PCR", "PLW", "QRS", "RVU", "SCP", "SEL", "SGN",
    "SHO", "SKA", "SLV", "SNK", "STP", "STX", "SVE", "TAR", "TOA", "TOR",
    "UNI", "UNT", "VGO", "VOT", "VRG", "WLT", "WTN", "WWL", "ZEP",
])

WIG140_TICKERS = WIG20_TICKERS | MWIG40_TICKERS | SWIG80_TICKERS


def _get_indices(ticker: str) -> list[str]:
    """Return list of index names for a given ticker (e.g. 'PKO.WA' -> ['WIG20'])."""
    base = ticker.replace(".WA", "")
    indices: list[str] = []
    if base in WIG20_TICKERS:
        indices.append("WIG20")
    elif base in MWIG40_TICKERS:
        indices.append("mWIG40")
    elif base in SWIG80_TICKERS:
        indices.append("sWIG80")
    return indices


@router.get("/upcoming")
async def get_upcoming(
    market: str | None = Query(None, pattern="^(WSE|US)$"),
    days: int = Query(14, ge=1, le=90),
) -> list[dict]:
    """Return upcoming earnings events grouped by date."""
    with SessionLocal() as db:
        events = _svc.get_upcoming(db, market=market, days=days)

    grouped: dict[str, list[dict]] = defaultdict(list)
    for ev in events:
        grouped[ev.report_date.isoformat()].append(
            {
                "id": ev.id,
                "ticker": ev.ticker,
                "company_name": ev.company_name,
                "market": ev.market,
                "report_date": ev.report_date.isoformat(),
                "report_type": ev.report_type,
                "fiscal_period": ev.fiscal_period,
                "source": ev.source,
                "indices": _get_indices(ev.ticker),
            }
        )

    return [
        {"date": d, "events": grouped[d]}
        for d in sorted(grouped.keys())
    ]


@router.post("/refresh")
async def refresh_earnings() -> dict:
    """Manually trigger an earnings data refresh. Clears old data first."""
    with SessionLocal() as db:
        from finnews.models.earnings_event import EarningsEvent
        deleted = db.query(EarningsEvent).delete()
        db.commit()
        logger.info("earnings refresh: cleared %d old records", deleted)

        count = await _svc.refresh_wse(db)
    return {"refreshed": count, "cleared": deleted, "today": date.today().isoformat()}


@router.get("/debug")
async def debug_scraper() -> dict:
    """Debug endpoint: scrape and return raw data without saving to DB."""
    from finnews.clients.earnings import scrape_wse_earnings, _cache

    _cache.clear()

    rows = await scrape_wse_earnings(days_ahead=90)
    return {
        "today": date.today().isoformat(),
        "count": len(rows),
        "first_5": [
            {**r, "report_date": r["report_date"].isoformat()}
            for r in rows[:5]
        ],
        "last_5": [
            {**r, "report_date": r["report_date"].isoformat()}
            for r in rows[-5:]
        ],
    }
