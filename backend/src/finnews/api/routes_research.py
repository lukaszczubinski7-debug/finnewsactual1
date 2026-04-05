from __future__ import annotations

from fastapi import APIRouter

from finnews.schemas.research import ResearchRequest, ResearchResponse
from finnews.services.research_service import ResearchService

router = APIRouter(prefix="/research", tags=["research"])

_service = ResearchService()


@router.post("", response_model=ResearchResponse)
async def post_research(req: ResearchRequest) -> ResearchResponse:
    """Run a research query using LLM tool calling."""
    result = await _service.run(
        query=req.query,
        sources_trust_level=req.sources_trust_level,
        source_weights=req.source_weights or None,
        custom_x_handles=req.custom_x_handles or None,
    )
    return ResearchResponse(
        report=result["report"],
        tools_used=result["tools_used"],
        sources=result["sources"],
    )
