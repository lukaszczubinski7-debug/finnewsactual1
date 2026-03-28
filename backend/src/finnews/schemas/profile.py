from __future__ import annotations

from pydantic import BaseModel, Field


class UserPreferenceResponse(BaseModel):
    search_profile_text: str | None = None
    response_style: str | None = None
    interested_assets: list[str] = Field(default_factory=list)
    interested_regions: list[str] = Field(default_factory=list)
    interested_topics: list[str] = Field(default_factory=list)
    notes: str | None = None
    market_tickers: list[str] | None = None
    sources_trust_level: float = Field(default=0.5, ge=0.0, le=1.0)


class UserPreferenceUpdateRequest(BaseModel):
    search_profile_text: str | None = None
    response_style: str | None = None
    interested_assets: list[str] | None = None
    interested_regions: list[str] | None = None
    interested_topics: list[str] | None = None
    notes: str | None = None
    market_tickers: list[str] | None = None
    sources_trust_level: float | None = Field(default=None, ge=0.0, le=1.0)
