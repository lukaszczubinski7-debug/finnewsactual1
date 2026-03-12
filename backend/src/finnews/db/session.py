from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from finnews.settings import settings


_BACKEND_DIR = Path(__file__).resolve().parents[3]


def _is_sqlite(url: str) -> bool:
    return url.startswith("sqlite")


def _resolve_database_url(url: str) -> str:
    if not _is_sqlite(url):
        return url
    sqlite_prefix = "sqlite:///"
    if not url.startswith(sqlite_prefix):
        return url

    database_path = url[len(sqlite_prefix) :]
    if not database_path or database_path == ":memory:":
        return url

    candidate_path = Path(database_path)
    if candidate_path.is_absolute():
        return url

    resolved_path = (_BACKEND_DIR / candidate_path).resolve()
    return f"{sqlite_prefix}{resolved_path.as_posix()}"


engine = create_engine(
    _resolve_database_url(settings.database_url),
    connect_args={"check_same_thread": False} if _is_sqlite(settings.database_url) else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, class_=Session)
