from __future__ import annotations

from pydantic import BaseModel


class ResearchRequest(BaseModel):
    query: str


class ResearchSource(BaseModel):
    title: str
    url: str
    provider: str = ""


class ResearchResponse(BaseModel):
    report: str
    tools_used: list[str]
    sources: list[ResearchSource]
