from __future__ import annotations

from pathlib import Path

from finnews.db.session import _resolve_database_url


def test_resolve_database_url_makes_relative_sqlite_path_independent_of_cwd() -> None:
    resolved = _resolve_database_url("sqlite:///./finnews.db")

    backend_dir = Path(__file__).resolve().parents[1]
    expected = f"sqlite:///{(backend_dir / 'finnews.db').resolve().as_posix()}"
    assert resolved == expected


def test_resolve_database_url_keeps_absolute_sqlite_path_unchanged() -> None:
    absolute_path = (Path(__file__).resolve().parents[1] / "finnews.db").resolve().as_posix()
    url = f"sqlite:///{absolute_path}"

    assert _resolve_database_url(url) == url
