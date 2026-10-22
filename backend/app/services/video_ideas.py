import json
import logging
from typing import Any, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.user import User
from app.models.video_idea import VideoIdea
from app.schemas.video_idea import (
    GenerateIdeasRequest,
    GenerateIdeasResponse,
    GeneratedIdeaItem,
    GenerateSeoRequest,
    GenerateSeoResponse,
    TitleVariation,
    VideoIdeaCreate,
    VideoIdeaUpdate,
)
from app.services.script_studio import _extract_json_from_response, get_gemini_client

logger = logging.getLogger(__name__)


def generate_ideas_ai(request: GenerateIdeasRequest) -> GenerateIdeasResponse:
    """
    Generates diverse, high-appeal YouTube video concepts using Gemini AI.
    """
    settings = get_settings()
    client = get_gemini_client()

    system_prompt = (
        "You are an expert YouTube content strategist, creative director, and retention analyst. "
        "Your task is to generate distinct, high-appeal video concepts for the creator's topic and audience. "
        "You MUST return strictly valid JSON matching this schema:\n"
        "{\n"
        '  "ideas": [\n'
        '    {\n'
        '      "title": "Compelling, clear, human-phrased YouTube title under 80 characters",\n'
        '      "summary": "2-3 sentence concept breakdown explaining the core premise and value",\n'
        '      "target_audience": "Specific viewer segment who will find this valuable",\n'
        '      "hook": "Verbatim 5-second opening spoken line designed to capture immediate attention",\n'
        '      "primary_keyword": "Primary search/discovery topic phrase",\n'
        '      "related_keywords": ["keyword 1", "keyword 2", "keyword 3"],\n'
        '      "content_format": "long_form",\n'
        '      "call_to_action": "Engaging, viewer-centric call to action",\n'
        '      "angle": "Unique narrative angle or format (e.g. Counter-intuitive breakdown, Benchmark shootout)",\n'
        '      "estimated_score": 89.5,\n'
        '      "score_explanation": "Why this concept scores high on novelty, clarity, and curiosity"\n'
        '    }\n'
        '  ]\n'
        "}\n"
        "Rules:\n"
        "- Generate exactly the requested number of distinct ideas (diverse angles: contrarian, benchmark, storytelling, workflow).\n"
        "- Do not use clickbait promises that cannot be delivered.\n"
        "- estimated_score must be a float between 70.0 and 96.0 reflecting an estimated heuristic score of concept appeal.\n"
        "- content_format must be either 'long_form' or 'shorts'.\n"
        "- TARGET AUDIENCE ADAPTATION:\n"
        "  * Every single idea MUST have a specific, realistic 'target_audience' description tailored strictly to the video's specific topic, angle, and niche.\n"
        "  * If the user provided an explicit target audience constraint, you MUST preserve it and target that specific demographic or relevant segment.\n"
        "  * If NO target audience was supplied by the user (or it is blank/automatic), you MUST infer an authentic audience matching the topic and niche. NEVER use generic or unrelated defaults such as 'Software engineers and tech leads' for non-technical topics (e.g. cooking topics must target home cooks, bakers, or culinary enthusiasts; fitness topics must target runners or gym goers; finance topics must target personal investors).\n"
        "  * Different ideas within the same generation CAN and SHOULD target nuanced, distinct audience segments where appropriate (e.g. beginners vs intermediate hobbyists vs professionals).\n"
        "- Never return conversational filler or text outside the JSON structure."
    )

    audience_clause = ""
    if request.target_audience and request.target_audience.strip():
        audience_clause = (
            f"Explicit Target Audience Constraint: \"{request.target_audience.strip()}\"\n"
            f"(Instruction: Adhere to this user-specified audience constraint across all generated concepts).\n"
        )
    else:
        audience_clause = (
            "Target Audience Constraint: None provided by user (Auto-infer).\n"
            "Instruction: Dynamically infer and generate a specific, highly relevant target audience tailored directly to the current topic and niche for each idea. DO NOT use generic or unrelated software engineering personas for non-software topics.\n"
        )

    user_prompt = (
        f"Topic / Seed Keyword: {request.topic}\n"
        f"Channel Niche: {request.niche or 'Infer from topic'}\n"
        f"{audience_clause}"
        f"Language: {request.language}\n"
        f"Platform: {request.platform}\n"
        f"Format: {request.content_format}\n"
        f"Tone: {request.tone or 'Conversational & Insightful'}\n"
        f"Content Goals: {request.content_goals or 'Audience Growth & Engagement'}\n"
        f"Number of Ideas: {request.count}\n"
    )

    try:
        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=user_prompt,
            config={
                "system_instruction": system_prompt,
                "temperature": 0.75,
                "response_mime_type": "application/json",
            },
        )
        data = _extract_json_from_response(response.text)
        raw_ideas = data.get("ideas", [])

        ideas: list[GeneratedIdeaItem] = []
        for item in raw_ideas:
            title = str(item.get("title", "")).strip()
            if not title:
                continue

            score = float(item.get("estimated_score", 85.0))
            score = max(0.0, min(100.0, round(score, 1)))

            related = item.get("related_keywords", [])
            if not isinstance(related, list):
                related = [str(related)]

            item_audience = str(item.get("target_audience", "")).strip()
            if not item_audience:
                if request.target_audience and request.target_audience.strip():
                    item_audience = request.target_audience.strip()
                elif request.niche and request.niche.strip():
                    item_audience = f"{request.niche.strip()} Enthusiasts"
                else:
                    item_audience = f"Viewers interested in {request.topic.strip()}"

            ideas.append(
                GeneratedIdeaItem(
                    title=title,
                    summary=str(item.get("summary", "")).strip() or "Comprehensive breakdown of the topic.",
                    target_audience=item_audience,
                    hook=str(item.get("hook", "")).strip() or f"Here is the truth about {request.topic}.",
                    primary_keyword=str(item.get("primary_keyword", "")).strip() or request.topic,
                    related_keywords=[str(k).strip() for k in related if str(k).strip()],
                    content_format=str(item.get("content_format", request.content_format)).strip() or "long_form",
                    call_to_action=str(item.get("call_to_action", "")).strip() or "Subscribe for more in-depth breakdowns.",
                    angle=str(item.get("angle", "")).strip() or "Core Breakdown",
                    estimated_score=score,
                    score_explanation=str(item.get("score_explanation", "")).strip() or "Strong balance of topic curiosity and audience relevance.",
                )
            )

        if not ideas:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Provider returned empty ideas list.",
            )

        return GenerateIdeasResponse(
            topic=request.topic,
            ideas=ideas,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Gemini API call failed for generate_ideas: %s", type(e).__name__)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI generation failed: {type(e).__name__}",
        )


def generate_seo_ai(request: GenerateSeoRequest) -> GenerateSeoResponse:
    """
    Generates YouTube SEO optimization metadata using Gemini AI.
    """
    settings = get_settings()
    client = get_gemini_client()

    system_prompt = (
        "You are an elite YouTube SEO strategist and video metadata specialist. "
        "Your task is to generate a comprehensive, search-optimized metadata kit for a video. "
        "You MUST return strictly valid JSON matching this schema:\n"
        "{\n"
        '  "title_variations": [\n'
        '    {\n'
        '      "title": "Alternative title option 1",\n'
        '      "style": "curiosity / contrarian / how_to / high_urgency",\n'
        '      "rationale": "Why this title angle captures viewer clicks"\n'
        '    }\n'
        '  ],\n'
        '  "description": "Full structured YouTube video description with hook in first 2 lines, overview, key chapter timestamps placeholders, links placeholder, and bottom keywords",\n'
        '  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8"],\n'
        '  "hashtags": ["#tag1", "#tag2", "#tag3"],\n'
        '  "primary_keyword": "main keyword phrase",\n'
        '  "secondary_keywords": ["keyword 1", "keyword 2", "keyword 3", "keyword 4"],\n'
        '  "thumbnail_text_suggestions": ["3-4 word punchy phrase 1", "phrase 2", "phrase 3"],\n'
        '  "estimated_seo_score": 88.5,\n'
        '  "score_explanation": "Explanation of how title clarity, keyword density, and description structure were evaluated",\n'
        '  "optimization_rationale": "High-level summary of the search discovery and CTR strategy for this metadata kit"\n'
        "}\n"
        "Rules:\n"
        "- Provide 4 distinct title variations (covering curiosity, how-to, contrarian, and high-impact styles).\n"
        "- Provide 8-12 relevant, focused tags.\n"
        "- Provide 3-5 hashtags starting with #.\n"
        "- Provide 3-4 punchy thumbnail text suggestions (2 to 4 words max each).\n"
        "- estimated_seo_score must be a float between 75.0 and 97.0 based on structural heuristic rules.\n"
        "- In the description, keep the first 2 lines (before the fold) compelling with keywords front-loaded.\n"
        "- Never return conversational filler or markdown fences outside the JSON structure."
    )

    user_prompt = (
        f"Video Title: {request.title}\n"
        f"Topic / Seed: {request.topic or request.title}\n"
        f"Concept Summary: {request.summary or 'N/A'}\n"
        f"Target Audience: {request.target_audience or 'YouTube Viewers'}\n"
        f"Format: {request.content_format or 'long_form'}\n"
        f"Language: {request.language}\n"
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

        raw_variations = data.get("title_variations", [])
        variations: list[TitleVariation] = []
        for v in raw_variations:
            vt = str(v.get("title", "")).strip()
            if vt:
                variations.append(
                    TitleVariation(
                        title=vt,
                        style=str(v.get("style", "curiosity")).strip(),
                        rationale=str(v.get("rationale", "")).strip(),
                    )
                )

        if not variations:
            variations = [
                TitleVariation(
                    title=request.title,
                    style="core",
                    rationale="Direct descriptive title focusing on core search query.",
                )
            ]

        raw_tags = data.get("tags", [])
        if not isinstance(raw_tags, list):
            raw_tags = [str(raw_tags)]
        tags = [str(t).strip() for t in raw_tags if str(t).strip()]

        raw_hashtags = data.get("hashtags", [])
        if not isinstance(raw_hashtags, list):
            raw_hashtags = [str(raw_hashtags)]
        hashtags = [
            f"#{str(h).lstrip('#').strip()}"
            for h in raw_hashtags
            if str(h).strip()
        ]

        raw_sec = data.get("secondary_keywords", [])
        if not isinstance(raw_sec, list):
            raw_sec = [str(raw_sec)]
        secondary_keywords = [str(k).strip() for k in raw_sec if str(k).strip()]

        raw_thumb = data.get("thumbnail_text_suggestions", [])
        if not isinstance(raw_thumb, list):
            raw_thumb = [str(raw_thumb)]
        thumbnail_suggestions = [str(t).strip() for t in raw_thumb if str(t).strip()]

        score = float(data.get("estimated_seo_score", 86.0))
        score = max(0.0, min(100.0, round(score, 1)))

        description = str(data.get("description", "")).strip()
        if not description:
            description = (
                f"{request.title}\n\n"
                f"In this video, we explore {request.topic or request.title}.\n\n"
                f"Timestamps:\n0:00 - Introduction\n1:00 - Deep Dive\n3:00 - Key Takeaways\n\n"
                f"Subscribe for more content!"
            )

        return GenerateSeoResponse(
            title=request.title,
            title_variations=variations,
            description=description,
            tags=tags,
            hashtags=hashtags,
            primary_keyword=str(data.get("primary_keyword", request.title)).strip(),
            secondary_keywords=secondary_keywords,
            thumbnail_text_suggestions=thumbnail_suggestions,
            estimated_seo_score=score,
            score_explanation=str(
                data.get(
                    "score_explanation",
                    "Calculated heuristic based on title length, keyword position, and metadata completeness.",
                )
            ).strip(),
            optimization_rationale=str(
                data.get(
                    "optimization_rationale",
                    "Structured to maximize browse and search discovery while setting clear viewer expectations.",
                )
            ).strip(),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Gemini API call failed for generate_seo: %s", type(e).__name__)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI generation failed: {type(e).__name__}",
        )


# --- Database Persistence Service Methods ---

def create_saved_idea(db: Session, user: User, idea_in: VideoIdeaCreate) -> VideoIdea:
    """
    Creates and persists a new video idea for the authenticated user.
    """
    related_json = None
    if idea_in.related_keywords is not None:
        related_json = json.dumps(idea_in.related_keywords)

    seo_json = None
    if idea_in.seo_data is not None:
        seo_json = json.dumps(idea_in.seo_data)

    idea = VideoIdea(
        user_id=user.id,
        channel_id=idea_in.channel_id,
        title=idea_in.title,
        summary=idea_in.summary,
        topic=idea_in.topic,
        niche=idea_in.niche,
        target_audience=idea_in.target_audience,
        language=idea_in.language,
        platform=idea_in.platform,
        content_format=idea_in.content_format,
        tone=idea_in.tone,
        content_goals=idea_in.content_goals,
        hook=idea_in.hook,
        primary_keyword=idea_in.primary_keyword,
        related_keywords=related_json,
        call_to_action=idea_in.call_to_action,
        estimated_score=idea_in.estimated_score,
        angle=idea_in.angle,
        is_favorite=idea_in.is_favorite,
        status=idea_in.status,
        seo_data=seo_json,
        notes=idea_in.notes,
    )
    db.add(idea)
    db.commit()
    db.refresh(idea)
    return idea


def list_saved_ideas(
    db: Session,
    user: User,
    channel_id: Optional[str] = None,
    is_favorite: Optional[bool] = None,
    search: Optional[str] = None,
) -> list[VideoIdea]:
    """
    Lists saved ideas belonging to the authenticated user with optional filtering.
    """
    query = db.query(VideoIdea).filter(VideoIdea.user_id == user.id)

    if channel_id:
        query = query.filter(VideoIdea.channel_id == channel_id)

    if is_favorite is not None:
        query = query.filter(VideoIdea.is_favorite == is_favorite)

    if search:
        search_pattern = f"%{search.strip()}%"
        query = query.filter(
            (VideoIdea.title.ilike(search_pattern))
            | (VideoIdea.topic.ilike(search_pattern))
            | (VideoIdea.primary_keyword.ilike(search_pattern))
        )

    return query.order_by(VideoIdea.created_at.desc()).all()


def get_saved_idea_by_id(db: Session, user: User, idea_id: str) -> VideoIdea:
    """
    Retrieves a single saved idea enforcing user ownership (tenant isolation).
    """
    idea = db.query(VideoIdea).filter(
        VideoIdea.id == idea_id,
        VideoIdea.user_id == user.id,
    ).first()

    if not idea:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video idea not found",
        )
    return idea


def update_saved_idea(
    db: Session,
    user: User,
    idea_id: str,
    idea_in: VideoIdeaUpdate,
) -> VideoIdea:
    """
    Updates editable fields of a saved idea with strict tenant isolation.
    """
    idea = get_saved_idea_by_id(db=db, user=user, idea_id=idea_id)

    update_data = idea_in.model_dump(exclude_unset=True)

    if "related_keywords" in update_data:
        val = update_data["related_keywords"]
        idea.related_keywords = json.dumps(val) if val is not None else None
        del update_data["related_keywords"]

    if "seo_data" in update_data:
        val = update_data["seo_data"]
        idea.seo_data = json.dumps(val) if val is not None else None
        del update_data["seo_data"]

    for field, value in update_data.items():
        if hasattr(idea, field):
            setattr(idea, field, value)

    db.add(idea)
    db.commit()
    db.refresh(idea)
    return idea


def delete_saved_idea(db: Session, user: User, idea_id: str) -> None:
    """
    Deletes a saved idea with strict tenant isolation.
    """
    idea = get_saved_idea_by_id(db=db, user=user, idea_id=idea_id)
    db.delete(idea)
    db.commit()
