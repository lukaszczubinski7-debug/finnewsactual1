from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from finnews.db.dependencies import get_db
from finnews.models import User
from finnews.schemas.profile import UserPreferenceResponse, UserPreferenceUpdateRequest
from finnews.security import get_current_user
from finnews.services.profile_service import ProfileService


router = APIRouter(prefix="/profile", tags=["profile"])
svc = ProfileService()


def _to_response(preference) -> UserPreferenceResponse:
    raw_tickers = preference.market_tickers
    market_tickers = [t.strip() for t in raw_tickers.split(",") if t.strip()] if raw_tickers else None
    return UserPreferenceResponse(
        search_profile_text=preference.search_profile_text,
        response_style=preference.response_style,
        interested_assets=preference.interested_assets or [],
        interested_regions=preference.interested_regions or [],
        interested_topics=preference.interested_topics or [],
        notes=preference.notes,
        market_tickers=market_tickers,
        sources_trust_level=preference.sources_trust_level or 0.5,
        custom_sources=preference.custom_sources,
    )


@router.get("/preferences", response_model=UserPreferenceResponse)
def get_preferences(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> UserPreferenceResponse:
    preference = svc.get_or_create_preferences(db=db, user=current_user)
    return _to_response(preference)


@router.put("/preferences", response_model=UserPreferenceResponse)
def put_preferences(
    payload: UserPreferenceUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserPreferenceResponse:
    preference = svc.update_preferences(db=db, user=current_user, payload=payload)
    return _to_response(preference)


@router.patch("/preferences", response_model=UserPreferenceResponse)
def patch_preferences(
    payload: UserPreferenceUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserPreferenceResponse:
    preference = svc.update_preferences(db=db, user=current_user, payload=payload)
    return _to_response(preference)
