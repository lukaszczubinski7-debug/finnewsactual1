from __future__ import annotations

import sys

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from finnews.api.responses import UTF8JSONResponse
from finnews.api.routes import router
from finnews.api.routes_auth import router as auth_router
from finnews.api.routes_profile import router as profile_router
from finnews.api.routes_market import router as market_router
from finnews.api.routes_threads import router as threads_router
from finnews.api.routes_youtube import router as youtube_router
from finnews.api.routes_research import router as research_router
from finnews.api.routes_earnings import router as earnings_router
from finnews.scheduler import start_scheduler, stop_scheduler, generate_pregenerated_if_empty
from finnews.settings import settings

sys.stdout.reconfigure(encoding="utf-8")

app = FastAPI(title="Fin News Agent MVP", default_response_class=UTF8JSONResponse)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.allowed_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(market_router)
app.include_router(auth_router)
app.include_router(profile_router)
app.include_router(threads_router)
app.include_router(youtube_router)
app.include_router(research_router)
app.include_router(earnings_router)


@app.on_event("startup")
async def on_startup() -> None:
    import asyncio
    start_scheduler()
    # Generate pre-gen briefs in background if DB is empty
    asyncio.create_task(generate_pregenerated_if_empty())


@app.on_event("shutdown")
async def on_shutdown() -> None:
    stop_scheduler()


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException) -> UTF8JSONResponse:
    return UTF8JSONResponse(content={"detail": exc.detail}, status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError) -> UTF8JSONResponse:
    return UTF8JSONResponse(content={"detail": exc.errors()}, status_code=422)


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception) -> UTF8JSONResponse:
    return UTF8JSONResponse(content={"detail": str(exc)}, status_code=500)
