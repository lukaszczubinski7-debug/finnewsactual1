from __future__ import annotations

from pydantic import BaseModel, Field


class ResearchRequest(BaseModel):
    query: str
    sources_trust_level: float = Field(default=0.5, ge=0.0, le=1.0)
    source_weights: dict[str, float] = Field(default_factory=dict)  # handle → 0.0–1.0
    custom_x_handles: list[dict] = Field(default_factory=list)  # [{handle, name, weight?}]


class ResearchSource(BaseModel):
    title: str
    url: str
    provider: str = ""


class ResearchResponse(BaseModel):
    report: str
    tools_used: list[str]
    sources: list[ResearchSource]
