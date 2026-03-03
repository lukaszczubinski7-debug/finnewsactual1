from __future__ import annotations

import logging
from urllib.error import URLError
from uuid import uuid4

import httpx
from fastapi import APIRouter, HTTPException, Query

from finnews.api.responses import utf8_json
from finnews.api.schemas import BriefFocus, BriefRequest, BriefResponse, BriefSource
from finnews.clients.axesso import mask_key
from finnews.errors import NewsDataParsingError, UpstreamNewsProviderError
from finnews.services.brief_service import BriefService, INTERNAL_SELECT_K
from finnews.settings import settings

router = APIRouter()
svc = BriefService()
logger = logging.getLogger(__name__)


def _truncate(text: str | None, limit: int = 500) -> str:
    if not text:
        return ""
    return text[:limit]


def _prefix_type(prefix: str) -> str:
    return "bearer" if prefix.strip().lower() == "bearer" else "raw"


def _header_label(header_name: str | None) -> str:
    return header_name or "(none)"


@router.get("/health")
def health():
    return utf8_json({"status": "ok"})


@router.get("/axesso/ping")
async def axesso_ping():
    try:
        await svc.client.list_news()
        return utf8_json(
            {
                "ok": True,
                "status_code": 200,
                "auth_mode": svc.client.auth_mode,
                "base_url": svc.client.base_url,
                "error": None,
            }
        )
    except httpx.HTTPStatusError as exc:
        return utf8_json(
            {
                "ok": False,
                "status_code": exc.response.status_code,
                "auth_mode": svc.client.auth_mode,
                "base_url": svc.client.base_url,
                "error": _truncate(exc.response.text, 500),
            }
        )
    except Exception as exc:
        return utf8_json(
            {
                "ok": False,
                "status_code": None,
                "auth_mode": svc.client.auth_mode,
                "base_url": svc.client.base_url,
                "error": str(exc),
            }
        )


@router.get("/axesso/diagnose")
async def axesso_diagnose(
    region: str = "US",
    s: str | None = None,
    snippet_count: int = Query(default=1, alias="snippetCount"),
):
    api_key = (settings.axesso_api_key or "").strip()
    if not api_key:
        return utf8_json(
            {
                "ok": False,
                "attempts": [],
                "hint": "Set AXESSO_API_KEY",
            }
        )

    configured_header = settings.axesso_api_key_header.strip() or "axesso-api-key"
    configured_prefix = settings.axesso_api_key_prefix
    configured_value = f"{configured_prefix}{api_key}"
    candidates: list[tuple[str | None, str, str, bool]] = [
        ("axesso-api-key", "", api_key, False),
    ]
    if settings.axesso_try_subscription_key_param:
        candidates.append((configured_header, configured_prefix, configured_value, True))
        candidates.append((None, "", api_key, True))

    candidates.extend(
        [
            (configured_header, configured_prefix, configured_value, False),
            ("apikey", "", api_key, False),
            ("x-api-key", "", api_key, False),
        ]
    )
    max_attempts = max(1, settings.axesso_diagnose_max_attempts)
    deduped_candidates: list[tuple[str | None, str, str, bool]] = []
    seen: set[tuple[str, str, bool]] = set()
    for header_name, prefix, value, used_param in candidates:
        dedupe_key = ((header_name or "").lower(), _prefix_type(prefix), used_param)
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        deduped_candidates.append((header_name, prefix, value, used_param))

    attempts: list[dict] = []

    for header_name, prefix, value, used_subscription_key_param in deduped_candidates[:max_attempts]:
        status_code, error_text = await svc.client.list_news_with_headers(
            headers=({header_name: value} if header_name else {}),
            s=s,
            region=region,
            snippet_count=snippet_count,
            subscription_key_param=(api_key if used_subscription_key_param else None),
        )
        attempt = {
            "header": _header_label(header_name),
            "value_masked": mask_key(value),
            "used_subscription_key_param": used_subscription_key_param,
            "status_code": status_code,
            "error": _truncate(error_text, 500),
        }
        attempts.append(attempt)

        if status_code == 200:
            return utf8_json(
                {
                    "ok": True,
                    "working": {
                        "header": _header_label(header_name),
                        "prefix": prefix,
                        "example_env": {
                            "AXESSO_AUTH_MODE": "direct",
                            "AXESSO_API_KEY": "<your_key>",
                            "AXESSO_API_KEY_HEADER": (header_name or configured_header),
                            "AXESSO_API_KEY_PREFIX": prefix,
                            "AXESSO_TRY_SUBSCRIPTION_KEY_PARAM": str(used_subscription_key_param).lower(),
                        },
                    },
                    "attempts": [
                        {
                            "header": item["header"],
                            "value_masked": item["value_masked"],
                            "used_subscription_key_param": item["used_subscription_key_param"],
                            "status_code": item["status_code"],
                        }
                        for item in attempts
                    ],
                }
            )

    return utf8_json(
        {
            "ok": False,
            "attempts": attempts,
            "hint": "Check if key is Direct Axesso vs RapidAPI; verify subscription; verify header from Axesso docs snippet",
        }
    )


@router.post("/brief", response_model=BriefResponse)
async def brief(req: BriefRequest):
    request_id = str(uuid4())
    try:
        result = await svc.run(
            continents=req.continents,
            region=req.region,
            tickers=req.tickers,
            query=req.query,
            context=req.context,
            geo_focus=req.geo_focus,
            list_limit=req.list_limit,
            select_k=INTERNAL_SELECT_K,
            summary_k=req.summary_k,
            style=req.style,
            debug=req.debug,
            window_hours=req.window_hours,
            request_id=request_id,
        )
        response = BriefResponse(
            style=result["style"],
            context=result["context"],
            window_hours=result["window_hours"],
            continents=result["continents"],
            focus=BriefFocus(**result["focus"]),
            summary=result["summary"],
            sources=[BriefSource(**item) for item in result.get("sources", [])],
        )
        payload = response.model_dump(mode="json")
        if req.debug and "debug" in result:
            payload["debug"] = result["debug"]
        if "brief" in result:
            payload["brief"] = result["brief"]
        return utf8_json(payload)
    except (UpstreamNewsProviderError, httpx.HTTPError, httpx.TimeoutException, URLError) as exc:
        logger.warning("brief request_id=%s upstream_error=%s", request_id, type(exc).__name__, exc_info=True)
        if isinstance(exc, UpstreamNewsProviderError) and exc.reason == "quota_exceeded":
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "quota_exceeded",
                    "provider": exc.provider,
                    "request_id": request_id,
                    "hint": "Lower snippetCount or wait for quota reset",
                },
            )
        raise HTTPException(status_code=502, detail="Upstream news provider error")
    except NewsDataParsingError as exc:
        logger.exception("brief request_id=%s parsing_error", request_id)
        raise HTTPException(status_code=500, detail=str(exc))
    except HTTPException:
        raise
    except Exception:
        logger.exception("brief request_id=%s internal_error", request_id)
        raise HTTPException(status_code=500, detail="Internal brief generation error")
