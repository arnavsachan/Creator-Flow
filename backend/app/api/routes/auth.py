from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import TokenResponse, UserLoginRequest, UserRegisterRequest, UserResponse
from app.services.auth import authenticate_user, get_or_create_demo_user, register_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register Application User",
    description="Registers a new application user account and returns a valid JWT access token.",
)
def register(
    request: UserRegisterRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    user, token = register_user(db=db, request=request)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Log In Application User",
    description="Authenticates an application user and returns a valid JWT access token.",
)
def login(
    request: UserLoginRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    user, token = authenticate_user(db=db, request=request)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get Current User Profile",
    description="Returns the profile information of the currently authenticated application user.",
)
def get_me(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    return UserResponse.model_validate(current_user)


@router.post(
    "/demo-session",
    response_model=TokenResponse,
    summary="Create or Obtain Demo Session",
    description="Provides an authenticated demo user session for seamless development and frontend testing.",
)
def demo_session(
    db: Session = Depends(get_db),
) -> TokenResponse:
    user, token = get_or_create_demo_user(db=db)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )
