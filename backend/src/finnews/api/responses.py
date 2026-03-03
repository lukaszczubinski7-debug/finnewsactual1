from __future__ import annotations

from typing import Any

from fastapi.responses import JSONResponse


class UTF8JSONResponse(JSONResponse):
    media_type = "application/json; charset=utf-8"


def utf8_json(content: Any, status_code: int = 200) -> UTF8JSONResponse:
    return UTF8JSONResponse(content=content, status_code=status_code)
