from __future__ import annotations

from fastapi import HTTPException
import pytest
from sqlalchemy.exc import OperationalError

from finnews.services.auth_service import AuthService


class _BrokenQuery:
    def filter(self, *_: object, **__: object) -> "_BrokenQuery":
        return self

    def first(self) -> None:
        raise OperationalError("SELECT 1", {}, Exception("no such table: users"))


class _BrokenSession:
    def __init__(self) -> None:
        self.rolled_back = False

    def query(self, *_: object, **__: object) -> _BrokenQuery:
        return _BrokenQuery()

    def rollback(self) -> None:
        self.rolled_back = True


def test_login_returns_503_when_database_is_unavailable() -> None:
    service = AuthService()
    db = _BrokenSession()

    with pytest.raises(HTTPException) as exc_info:
        service.login(db=db, email="user@example.com", password="secret123")  # type: ignore[arg-type]

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail["message"] == "Database unavailable or not initialized"
    assert "alembic upgrade head" in exc_info.value.detail["hint"]
    assert db.rolled_back is True
