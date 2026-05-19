from datetime import datetime
from typing import Optional, List
import uuid

from .models import AgentSession, Message


class AgentService:
    """Service for managing agent sessions with MongoDB/Beanie persistence."""

    async def create_session(self, user_id: str, title: Optional[str] = None) -> AgentSession:
        """Create a new agent session"""
        session = AgentSession(
            user_id=user_id,
            session_id=str(uuid.uuid4()),
            title=title or "New Session",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )

        await session.insert()
        return session

    async def get_session(self, session_id: str, user_id: str) -> Optional[AgentSession]:
        """Get a session by ID (user-scoped)"""
        return await AgentSession.find_one(
            AgentSession.session_id == session_id,
            AgentSession.user_id == user_id
        )

    async def list_sessions(self, user_id: str) -> List[AgentSession]:
        """List all sessions for a user"""
        return await AgentSession.find(
            AgentSession.user_id == user_id
        ).sort("-updated_at").to_list(100)

    async def delete_session(self, session_id: str, user_id: str) -> bool:
        """Delete a session"""
        result = await AgentSession.find_one(
            AgentSession.session_id == session_id,
            AgentSession.user_id == user_id
        )
        if result:
            await result.delete()
            return True
        return False

    async def add_message(self, session_id: str, user_id: str, message: Message) -> bool:
        """Add a message to session"""
        session = await self.get_session(session_id, user_id)
        if not session:
            return False

        session.messages.append(message)
        session.updated_at = datetime.utcnow()
        await session.save()
        return True

    async def update_session_status(self, session_id: str, user_id: str, status: str) -> bool:
        """Update session status"""
        session = await self.get_session(session_id, user_id)
        if not session:
            return False

        session.status = status
        session.updated_at = datetime.utcnow()
        await session.save()
        return True
