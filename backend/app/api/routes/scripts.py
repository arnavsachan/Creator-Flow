from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.script import (
    AuditRetentionRequest,
    GenerateHooksRequest,
    GenerateHooksResponse,
    GenerateScriptRequest,
    GenerateScriptResponse,
    RetentionAuditResponse,
    ScriptCreateRequest,
    ScriptResponse,
)
from app.services.script_studio import (
    audit_script_retention,
    create_saved_script,
    generate_full_script,
    generate_hook_variations,
    get_user_script_by_id,
    list_user_scripts,
)

router = APIRouter(prefix="/scripts", tags=["Script Studio"])


@router.post(
    "/generate-hooks",
    response_model=GenerateHooksResponse,
    summary="Generate 5-Second Hook Variations",
    description="Uses Gemini AI to generate 3 high-retention hook variations (negative, curiosity, story) with predicted retention.",
)
def generate_hooks_endpoint(
    request: GenerateHooksRequest,
    current_user: User = Depends(get_current_user),
) -> GenerateHooksResponse:
    return generate_hook_variations(request=request)


@router.post(
    "/generate",
    response_model=GenerateScriptResponse,
    summary="Generate Full Video Script",
    description="Uses Gemini AI to generate a complete structured video script with timecodes, pacing cues, and retention locks.",
)
def generate_script_endpoint(
    request: GenerateScriptRequest,
    current_user: User = Depends(get_current_user),
) -> GenerateScriptResponse:
    return generate_full_script(request=request)


@router.post(
    "/audit-retention",
    response_model=RetentionAuditResponse,
    summary="Audit Script Retention & Pacing",
    description="Analyzes script text for pacing, opening hook effectiveness, and attention drop-off risks with AI structural scoring.",
)
def audit_retention_endpoint(
    request: AuditRetentionRequest,
    current_user: User = Depends(get_current_user),
) -> RetentionAuditResponse:
    return audit_script_retention(request=request)


@router.post(
    "",
    response_model=ScriptResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Save Script",
    description="Saves a video script to the database associated with the authenticated user.",
)
def save_script_endpoint(
    script_in: ScriptCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ScriptResponse:
    saved = create_saved_script(db=db, user=current_user, script_in=script_in)
    return ScriptResponse.model_validate(saved)


@router.get(
    "",
    response_model=list[ScriptResponse],
    summary="List Saved Scripts",
    description="Retrieves all saved video scripts belonging to the authenticated user, isolated by tenant.",
)
def list_scripts_endpoint(
    channel_id: Optional[str] = Query(default=None, description="Optional channel ID filter"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ScriptResponse]:
    scripts = list_user_scripts(db=db, user=current_user, channel_id=channel_id)
    return [ScriptResponse.model_validate(s) for s in scripts]


@router.get(
    "/{script_id}",
    response_model=ScriptResponse,
    summary="Get Saved Script",
    description="Retrieves a single saved script by ID with tenant isolation.",
)
def get_script_endpoint(
    script_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ScriptResponse:
    script = get_user_script_by_id(db=db, user=current_user, script_id=script_id)
    return ScriptResponse.model_validate(script)
