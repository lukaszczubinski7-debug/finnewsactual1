from __future__ import annotations

import logging

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError, OperationalError, SQLAlchemyError
from sqlalchemy.orm import Session

from finnews.models import User, UserPreference
from finnews.security import create_access_token, hash_password, verify_password

logger = logging.getLogger(__name__)


class AuthService:
    @staticmethod
    def _handle_database_error(db: Session, exc: SQLAlchemyError) -> None:
        db.rollback()
        logger.exception("auth database error", exc_info=exc)
        if isinstance(exc, OperationalError):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "message": "Database unavailable or not initialized",
                    "hint": "Run `uv run alembic upgrade head` in the backend directory.",
                },
            ) from exc
        if isinstance(exc, IntegrityError):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User with this email already exists",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": "Database operation failed"},
        ) from exc

    def register(self, db: Session, email: str, password: str) -> User:
        normalized_email = email.strip().lower()
        try:
            existing = db.query(User).filter(User.email == normalized_email).first()
            if existing:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User with this email already exists")

            user = User(
                email=normalized_email,
                password_hash=hash_password(password),
                is_active=True,
            )
            db.add(user)
            db.flush()

            preference = UserPreference(user_id=user.id)
            db.add(preference)
            db.commit()
            db.refresh(user)
            return user
        except HTTPException:
            db.rollback()
            raise
        except SQLAlchemyError as exc:
            self._handle_database_error(db, exc)

    def login(self, db: Session, email: str, password: str) -> tuple[str, User]:
        normalized_email = email.strip().lower()
        try:
            user = db.query(User).filter(User.email == normalized_email).first()
            if user is None or not verify_password(password, user.password_hash):
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
            if not user.is_active:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive user")

            access_token = create_access_token(user_id=user.id)
            return access_token, user
        except HTTPException:
            raise
        except SQLAlchemyError as exc:
            self._handle_database_error(db, exc)

    def delete_account(self, db: Session, user: User) -> None:
        try:
            preference = db.query(UserPreference).filter(UserPreference.user_id == user.id).first()
            if preference:
                db.delete(preference)
            db.delete(user)
            db.commit()
        except SQLAlchemyError as exc:
            self._handle_database_error(db, exc)
