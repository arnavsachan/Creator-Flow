from typing import Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.schemas.auth import UserLoginRequest, UserRegisterRequest


def register_user(db: Session, request: UserRegisterRequest) -> tuple[User, str]:
    """
    Registers a new application user and returns (user, jwt_token).
    Raises HTTPException if email is already registered.
    """
    existing = db.query(User).filter(User.email == request.email.lower().strip()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email address already exists.",
        )

    user = User(
        email=request.email.lower().strip(),
        hashed_password=hash_password(request.password),
        full_name=request.full_name,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(data={"sub": user.id, "email": user.email})
    return user, token


def authenticate_user(db: Session, request: UserLoginRequest) -> tuple[User, str]:
    """
    Authenticates an existing user and returns (user, jwt_token).
    Raises HTTPException on invalid credentials.
    """
    user = db.query(User).filter(User.email == request.email.lower().strip()).first()
    if not user or not user.hashed_password or not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive.",
        )

    token = create_access_token(data={"sub": user.id, "email": user.email})
    return user, token


def get_or_create_demo_user(db: Session) -> tuple[User, str]:
    """
    Convenience method ensuring a default demo user exists for development/demo mode,
    returning (user, jwt_token).
    """
    email = "demo@creatorflow.io"
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(
            email=email,
            full_name="Demo Creator",
            hashed_password=hash_password("demo123456"),
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    token = create_access_token(data={"sub": user.id, "email": user.email})
    return user, token
