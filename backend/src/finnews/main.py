from __future__ import annotations

import sys

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError

from finnews.api.responses import UTF8JSONResponse
from finnews.api.routes import router

sys.stdout.reconfigure(encoding="utf-8")

app = FastAPI(title="Fin News Agent MVP", default_response_class=UTF8JSONResponse)
app.include_router(router)


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException) -> UTF8JSONResponse:
    return UTF8JSONResponse(content={"detail": exc.detail}, status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError) -> UTF8JSONResponse:
    return UTF8JSONResponse(content={"detail": exc.errors()}, status_code=422)


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception) -> UTF8JSONResponse:
    return UTF8JSONResponse(content={"detail": str(exc)}, status_code=500)
