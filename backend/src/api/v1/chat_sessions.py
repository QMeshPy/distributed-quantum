"""Chat session persistence router."""
from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, status
from pydantic import BaseModel, Field, ConfigDict

from quantum_backend_v2.api.deps.auth import CurrentUser
from quantum_backend_v2.api.errors.models import PlatformException, ErrorCode
from db.agentkit_collections import ChatSessionDocument

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/chat-sessions", tags=["chat-sessions"])


class SessionCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    agent_id: str = Field(description="Agent this session belongs to")
    title: str = Field(description="Session title (first message truncated)")


class SessionMessageIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: str = Field(description="user or agent")
    content: str = Field(description="Message text")
    rich_content: dict | None = Field(default=None, description="Optional rich content payload")


class SessionAppendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: SessionMessageIn


class SessionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    session_id: str
    agent_id: str
    title: str
    messages: list[dict]
    created_at: str
    updated_at: str


@router.post(
    "",
    response_model=SessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new chat session",
)
async def create_chat_session(
    body: SessionCreateRequest,
    current_user: CurrentUser,
) -> SessionResponse:
    """Create a persisted chat session in MongoDB."""
    from datetime import datetime, timezone
    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    doc = ChatSessionDocument(
        session_id=session_id,
        user_id=current_user.user_id,
        agent_id=body.agent_id,
        title=body.title,
        messages=[],
    )
    await doc.insert()
    return SessionResponse(
        session_id=doc.session_id,
        agent_id=doc.agent_id,
        title=doc.title,
        messages=[],
        created_at=doc.created_at.isoformat(),
        updated_at=doc.updated_at.isoformat(),
    )


@router.get(
    "",
    response_model=list[SessionResponse],
    status_code=status.HTTP_200_OK,
    summary="List user chat sessions",
)
async def list_chat_sessions(
    current_user: CurrentUser,
) -> list[SessionResponse]:
    """Return all chat sessions for the current user, newest first."""
    docs = await ChatSessionDocument.find(
        {"user_id": current_user.user_id}
    ).sort([("updated_at", -1)]).to_list()
    return [
        SessionResponse(
            session_id=d.session_id,
            agent_id=d.agent_id,
            title=d.title,
            messages=d.messages,
            created_at=d.created_at.isoformat(),
            updated_at=d.updated_at.isoformat(),
        )
        for d in docs
    ]


@router.get(
    "/{session_id}",
    response_model=SessionResponse,
    status_code=status.HTTP_200_OK,
    summary="Get a chat session",
)
async def get_chat_session(
    session_id: str,
    current_user: CurrentUser,
) -> SessionResponse:
    """Load a specific chat session including full message history."""
    doc = await ChatSessionDocument.find_one({"session_id": session_id})
    if not doc:
        raise PlatformException(
            status_code=status.HTTP_404_NOT_FOUND,
            error=ErrorCode.NOT_FOUND,
            message=f"Session not found: {session_id}",
        )
    if doc.user_id != current_user.user_id:
        raise PlatformException(
            status_code=status.HTTP_403_FORBIDDEN,
            error=ErrorCode.FORBIDDEN,
            message="Not your session",
        )
    return SessionResponse(
        session_id=doc.session_id,
        agent_id=doc.agent_id,
        title=doc.title,
        messages=doc.messages,
        created_at=doc.created_at.isoformat(),
        updated_at=doc.updated_at.isoformat(),
    )


@router.post(
    "/{session_id}/messages",
    response_model=SessionResponse,
    status_code=status.HTTP_200_OK,
    summary="Append a message to a chat session",
)
async def append_session_message(
    session_id: str,
    body: SessionAppendRequest,
    current_user: CurrentUser,
) -> SessionResponse:
    """Append a single message (user or agent) to an existing chat session."""
    from datetime import datetime, timezone
    doc = await ChatSessionDocument.find_one({"session_id": session_id})
    if not doc:
        raise PlatformException(
            status_code=status.HTTP_404_NOT_FOUND,
            error=ErrorCode.NOT_FOUND,
            message=f"Session not found: {session_id}",
        )
    if doc.user_id != current_user.user_id:
        raise PlatformException(
            status_code=status.HTTP_403_FORBIDDEN,
            error=ErrorCode.FORBIDDEN,
            message="Not your session",
        )
    msg = {"role": body.message.role, "content": body.message.content}
    if body.message.rich_content:
        msg["richContent"] = body.message.rich_content
    doc.messages.append(msg)
    doc.updated_at = datetime.now(timezone.utc)
    await doc.save()
    return SessionResponse(
        session_id=doc.session_id,
        agent_id=doc.agent_id,
        title=doc.title,
        messages=doc.messages,
        created_at=doc.created_at.isoformat(),
        updated_at=doc.updated_at.isoformat(),
    )


@router.delete(
    "/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a chat session",
)
async def delete_chat_session(
    session_id: str,
    current_user: CurrentUser,
) -> None:
    """Delete a chat session."""
    doc = await ChatSessionDocument.find_one({"session_id": session_id})
    if not doc:
        return
    if doc.user_id != current_user.user_id:
        raise PlatformException(
            status_code=status.HTTP_403_FORBIDDEN,
            error=ErrorCode.FORBIDDEN,
            message="Not your session",
        )
    await doc.delete()
