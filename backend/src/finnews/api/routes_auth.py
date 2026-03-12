from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from finnews.db.dependencies import get_db
from finnews.models import User
from finnews.schemas.auth import LoginRequest, LoginResponse, RegisterRequest, UserResponse
from finnews.security import get_current_user
from finnews.services.auth_service import AuthService


router = APIRouter(prefix="/auth", tags=["auth"])
svc = AuthService()


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> UserResponse:
    user = svc.register(db=db, email=payload.email, password=payload.password)
    return UserResponse(id=user.id, email=user.email, is_active=user.is_active)


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    token, user = svc.login(db=db, email=payload.email, password=payload.password)
    return LoginResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse(id=user.id, email=user.email, is_active=user.is_active),
    )


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse(id=current_user.id, email=current_user.email, is_active=current_user.is_active)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> None:
    svc.delete_account(db=db, user=current_user)
