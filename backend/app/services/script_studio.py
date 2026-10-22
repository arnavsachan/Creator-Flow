import json
import logging
import re
from typing import Any, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.script import Script
from app.models.user import User
from app.schemas.script import (
    AuditRetentionRequest,
    GenerateHooksRequest,
    GenerateHooksResponse,
    GenerateScriptRequest,
    GenerateScriptResponse,
    HookVariation,
    RetentionAuditResponse,
    ScriptCreateRequest,
    ScriptSection,
)

logger = logging.getLogger(__name__)

# Constants
DEFAULT_WPM = 145  # Standard creator speaking speed (Words Per Minute)


def get_gemini_client():
    """
    Instantiates the Google GenAI client using the configured backend settings.
    Raises HTTPException 503 if the GEMINI_API_KEY is not configured or if google-genai is missing.
    """
    settings = get_settings()
    api_key = settings.GEMINI_API_KEY.strip()
    if not api_key or api_key == "your-gemini-api-key":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Gemini API key is not configured. Please configure GEMINI_API_KEY in the backend environment.",
        )

    try:
        from google import genai
        return genai.Client(api_key=api_key)
    except ImportError:
        logger.error("google-genai package is not installed.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google GenAI SDK is not available in the backend environment.",
        )
    except Exception as e:
        logger.error("Failed to initialize Google GenAI Client: %s", type(e).__name__)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to initialize AI generation client.",
        )


def _extract_json_from_response(text: str) -> dict[str, Any]:
    """
    Robustly parses JSON from LLM output, stripping markdown code fences if present.
    """
    cleaned = text.strip()
    # Match ```json ... ``` or ``` ... ```
    fence_pattern = r"^```(?:json)?\s*([\s\S]*?)\s*```$"
    match = re.search(fence_pattern, cleaned)
    if match:
        cleaned = match.group(1).strip()
    
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as err:
        # Fallback: attempt to find first '{' and last '}'
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(cleaned[start : end + 1])
            except Exception:
                pass
        logger.warning("Could not parse JSON from Gemini response: %s", str(err))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Received malformed structured response from AI provider.",
        )


def generate_hook_variations(
    request: GenerateHooksRequest,
) -> GenerateHooksResponse:
    """
    Generates 3 hook variations (negative, curiosity, story) using Gemini AI.
    """
    settings = get_settings()
    client = get_gemini_client()

    system_prompt = (
        "You are an expert YouTube content strategist and retention scriptwriter. "
        "Your task is to generate 3 high-retention 5-second video hooks for the given topic. "
        "You MUST return strictly valid JSON matching this schema:\n"
        "{\n"
        '  "hooks": [\n'
        '    {\n'
        '      "archetype": "negative",\n'
        '      "hook_text": "verbatim first 5-8 seconds spoken hook",\n'
        '      "estimated_retention_score": 78.5,\n'
        '      "rationale": "why this hooks viewer psychology"\n'
        '    },\n'
        '    {\n'
        '      "archetype": "curiosity",\n'
        '      "hook_text": "...",\n'
        '      "estimated_retention_score": 82.0,\n'
        '      "rationale": "..."\n'
        '    },\n'
        '    {\n'
        '      "archetype": "story",\n'
        '      "hook_text": "...",\n'
        '      "estimated_retention_score": 75.0,\n'
        '      "rationale": "..."\n'
        '    }\n'
        '  ]\n'
        "}\n"
        "Rules:\n"
        "- Hook Archetypes:\n"
        "  1. 'negative': Highlights a critical mistake, trap, or flaw the viewer is likely making.\n"
        "  2. 'curiosity': An unintuitive revelation or hidden pattern that defies conventional wisdom.\n"
        "  3. 'story': A dramatic moment, high-stakes turning point, or personal relatable transformation.\n"
        "- The hook must be concise (under 35 words, designed to be spoken in 5 to 7 seconds).\n"
        "- estimated_retention_score must be a float between 65.0 and 92.0 reflecting realistic top-tier YouTube drop-off rates.\n"
        "- Never return conversational filler or text outside the JSON structure."
    )

    user_prompt = (
        f"Topic: {request.topic}\n"
        f"Audience Persona: {request.audience_persona or 'General Creators & Enthusiasts'}\n"
        f"Delivery Tone: {request.tone or 'Conversational'}\n"
    )

    try:
        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=user_prompt,
            config={
                "system_instruction": system_prompt,
                "temperature": 0.7,
                "response_mime_type": "application/json",
            },
        )
        data = _extract_json_from_response(response.text)
        raw_hooks = data.get("hooks", [])
        
        hooks: list[HookVariation] = []
        for item in raw_hooks:
            arch = item.get("archetype", "curiosity").lower()
            if arch not in ("negative", "curiosity", "story"):
                arch = "curiosity"
            score = float(item.get("estimated_retention_score", 75.0))
            # Clamp between 0 and 100
            score = max(0.0, min(100.0, round(score, 1)))
            hooks.append(
                HookVariation(
                    archetype=arch,  # type: ignore
                    hook_text=str(item.get("hook_text", "")).strip(),
                    estimated_retention_score=score,
                    rationale=str(item.get("rationale", "")).strip(),
                )
            )

        if not hooks:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Provider returned empty hook list.",
            )

        return GenerateHooksResponse(
            topic=request.topic,
            hooks=hooks,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Gemini API call failed for generate_hooks: %s", type(e).__name__)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI generation failed: {type(e).__name__}",
        )


def generate_full_script(
    request: GenerateScriptRequest,
) -> GenerateScriptResponse:
    """
    Generates a full structured video script with pacing and retention markers.
    """
    settings = get_settings()
    client = get_gemini_client()

    hook_guidance = ""
    if request.selected_hook and request.selected_hook.strip():
        hook_guidance = f"Use this exact hook for the opening:\n\"{request.selected_hook.strip()}\"\n"
    else:
        hook_guidance = f"Craft an opening 5-second hook using the '{request.hook_type}' archetype.\n"

    system_prompt = (
        "You are an elite YouTube creator and video scriptwriter specializing in high average view duration (AVD). "
        "Generate a complete, production-ready video script formatted with timecodes and structural pacing cues.\n"
        "Return STRICTLY valid JSON matching this schema:\n"
        "{\n"
        '  "title": "Engaging Video Title",\n'
        '  "hook_text": "Exact 0:00 - 0:05 opening sentence",\n'
        '  "estimated_retention_score": 76.4,\n'
        '  "sections": [\n'
        '    {\n'
        '      "timecode": "[0:00 - 0:05]",\n'
        '      "section_type": "HOOK",\n'
        '      "content": "spoken dialogue...",\n'
        '      "visual_cue": "B-roll or on-screen text cue"\n'
        '    },\n'
        '    {\n'
        '      "timecode": "[0:05 - 0:25]",\n'
        '      "section_type": "RETENTION_LOCK",\n'
        '      "content": "...",\n'
        '      "visual_cue": "..."\n'
        '    }\n'
        '  ],\n'
        '  "full_script": "Complete compiled script text formatted with timecode headers..."\n'
        "}\n"
        "Rules:\n"
        "- Section 1 must be [0:00 - 0:05] HOOK.\n"
        "- Section 2 must be [0:05 - 0:25] RETENTION LOCK (promising the payoff, addressing the stakes, raising intrigue).\n"
        "- Middle sections must be Core Points with tangible examples, counter-intuitive arguments, and concrete steps.\n"
        "- Final section must be an engaging Call to Action / Retention Bridge to the next video.\n"
        "- Write naturally for spoken delivery. Avoid corporate buzzwords and cliches.\n"
        "- full_script must be the comprehensive spoken text with timecode markers formatted cleanly."
    )

    user_prompt = (
        f"Topic: {request.topic}\n"
        f"Target Duration: {request.target_duration}\n"
        f"Format: {request.format}\n"
        f"Tone: {request.tone}\n"
        f"Audience Persona: {request.audience_persona or 'General YouTube audience'}\n"
        f"Hook Archetype: {request.hook_type}\n"
        f"{hook_guidance}"
    )

    try:
        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=user_prompt,
            config={
                "system_instruction": system_prompt,
                "temperature": 0.7,
                "response_mime_type": "application/json",
            },
        )
        data = _extract_json_from_response(response.text)

        title = str(data.get("title", f"The Blueprint: {request.topic}")).strip()
        hook_text = str(data.get("hook_text", "")).strip()
        full_script = str(data.get("full_script", "")).strip()
        score = float(data.get("estimated_retention_score", 76.0))
        score = max(0.0, min(100.0, round(score, 1)))

        raw_sections = data.get("sections", [])
        sections: list[ScriptSection] = []
        for sec in raw_sections:
            sections.append(
                ScriptSection(
                    timecode=str(sec.get("timecode", "")),
                    section_type=str(sec.get("section_type", "CONTENT")),
                    content=str(sec.get("content", "")),
                    visual_cue=sec.get("visual_cue"),
                )
            )

        # If full_script is empty or too short, compile it from sections
        if not full_script and sections:
            compiled_parts = []
            for sec in sections:
                cue = f" (Visual: {sec.visual_cue})" if sec.visual_cue else ""
                compiled_parts.append(f"{sec.timecode} {sec.section_type}{cue}:\n\"{sec.content}\"")
            full_script = "\n\n".join(compiled_parts)

        if not hook_text and sections:
            hook_text = sections[0].content

        return GenerateScriptResponse(
            title=title,
            topic=request.topic,
            target_duration=request.target_duration,
            tone=request.tone,
            audience_persona=request.audience_persona,
            hook_type=request.hook_type,
            hook_text=hook_text,
            full_script=full_script,
            estimated_retention_score=score,
            sections=sections,
            pacing_breakdown={"section_count": len(sections)},
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Gemini API call failed for generate_script: %s", type(e).__name__)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI generation failed: {type(e).__name__}",
        )


def audit_script_retention(
    request: AuditRetentionRequest,
) -> RetentionAuditResponse:
    """
    Performs an automated retention and pacing diagnostic on user script text.
    Combines word count metrics and structure analysis.
    """
    text = request.script_text.strip()
    words = re.findall(r"\b\w+\b", text)
    word_count = len(words)

    # Duration estimate at 145 words per minute
    duration_seconds = int((word_count / DEFAULT_WPM) * 60) if word_count > 0 else 0
    mins = duration_seconds // 60
    secs = duration_seconds % 60
    formatted_duration = f"{mins}m {secs:02d}s"

    # Analyze first 30 seconds (~72 words)
    first_30s_words = words[: min(72, len(words))]
    first_30s_text = " ".join(first_30s_words).lower()

    # Heuristic checks
    has_question = "?" in text[: min(300, len(text))]
    has_mistake_trigger = any(
        w in first_30s_text for w in ["mistake", "wrong", "trap", "fail", "stop", "never", "ruin"]
    )
    has_curiosity_trigger = any(
        w in first_30s_text for w in ["secret", "reason", "truth", "why", "actually", "hidden", "nobody"]
    )
    has_story_trigger = any(
        w in first_30s_text for w in ["when i", "years ago", "at minute", "first time", "i discovered"]
    )
    hook_detected = has_mistake_trigger or has_curiosity_trigger or has_story_trigger or has_question

    # Calculate baseline heuristic score
    base_score = 68.0
    if hook_detected:
        base_score += 6.5
    if has_question:
        base_score += 2.0
    if word_count > 300:
        base_score += 2.5
    if duration_seconds > 45:
        base_score += 1.5

    # Cap score realistically
    final_score = round(min(89.5, max(52.0, base_score)), 1)

    if final_score >= 78.0:
        tier = "Top 5%"
    elif final_score >= 74.0:
        tier = "Top 15%"
    elif final_score >= 68.0:
        tier = "Above Average"
    else:
        tier = "Average"

    strengths: list[str] = []
    drop_off_risks: list[str] = []
    pacing_recs: list[str] = []

    if hook_detected:
        strengths.append("High-urgency hook detected in the opening 5-second window.")
    else:
        drop_off_risks.append("First 15 seconds lack a clear curiosity gap or high-stakes premise.")
        pacing_recs.append("Add an upfront question or bold counter-intuitive statement in the first 10 words.")

    if word_count > 200:
        strengths.append("Sufficient structural body to establish creator authority and delivery depth.")
    else:
        pacing_recs.append("Script draft is very short; flesh out the secondary retention lock at 0:20.")

    if "[0:" in text or "[00:" in text:
        strengths.append("Structured pacing headers and timecode markers aid clean video cadence.")
    else:
        pacing_recs.append("Insert clear section markers ([0:25 Core Point 1]) to maintain video rhythm.")

    drop_off_risks.append("Attention trough typically occurs around 1:15 if visual pattern interrupts are absent.")

    first_30s_summary = (
        "Strong immediate hook with psychological tension."
        if hook_detected
        else "Opening is gradual; consider front-loading the core payoff within the first 12 words."
    )

    return RetentionAuditResponse(
        estimated_retention_score=final_score,
        retention_tier=tier,
        word_count=word_count,
        estimated_duration_seconds=duration_seconds,
        formatted_duration=formatted_duration,
        pacing_wpm=DEFAULT_WPM,
        hook_detected=hook_detected,
        first_30s_analysis=first_30s_summary,
        strengths=strengths,
        drop_off_risks=drop_off_risks,
        pacing_recommendations=pacing_recs,
    )


# Database CRUD Operations


def create_saved_script(
    db: Session,
    user: User,
    script_in: ScriptCreateRequest,
) -> Script:
    """
    Persists a generated or edited script for the authenticated user.
    """
    script = Script(
        user_id=user.id,
        channel_id=script_in.channel_id,
        title=script_in.title.strip(),
        topic=script_in.topic.strip(),
        target_duration=script_in.target_duration.strip(),
        tone=script_in.tone.strip(),
        audience_persona=script_in.audience_persona.strip() if script_in.audience_persona else None,
        hook_type=script_in.hook_type,
        hook_text=script_in.hook_text.strip() if script_in.hook_text else None,
        full_script=script_in.full_script.strip(),
        estimated_retention_score=script_in.estimated_retention_score,
        pacing_breakdown=script_in.pacing_breakdown,
    )
    db.add(script)
    db.commit()
    db.refresh(script)
    return script


def list_user_scripts(
    db: Session,
    user: User,
    channel_id: Optional[str] = None,
) -> list[Script]:
    """
    Retrieves all scripts belonging to the authenticated user, enforcing tenant isolation.
    """
    query = db.query(Script).filter(Script.user_id == user.id)
    if channel_id:
        query = query.filter((Script.channel_id == channel_id) | (Script.channel_id.is_(None)))
    return query.order_by(Script.updated_at.desc()).all()


def get_user_script_by_id(
    db: Session,
    user: User,
    script_id: str,
) -> Script:
    """
    Retrieves a single script by ID ensuring it belongs to the authenticated user.
    Raises 404 if not found or unauthorized.
    """
    script = (
        db.query(Script)
        .filter(Script.id == script_id, Script.user_id == user.id)
        .first()
    )
    if not script:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Script '{script_id}' not found.",
        )
    return script
