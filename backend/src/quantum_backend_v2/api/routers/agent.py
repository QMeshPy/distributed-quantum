"""Agent workspace API router."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from quantum_backend_v2.agent.schemas import (
    CreateSessionRequest,
    SendMessageRequest,
    BudgetStatusResponse
)
from quantum_backend_v2.agent.service import AgentService
from quantum_backend_v2.agent.orchestrator import AgentOrchestrator
from quantum_backend_v2.agent.websocket import manager
from quantum_backend_v2.agent.models import AgentSession, Message, AgentSettings
from quantum_backend_v2.agent.cost_guard import CostGuard


router = APIRouter(prefix="/api/v1/agent", tags=["agent"])

# TODO: Replace with proper user settings storage
_USER_SETTINGS: dict[str, AgentSettings] = {}


def get_user_settings(user_id: str) -> AgentSettings:
    """Get or create user settings."""
    if user_id not in _USER_SETTINGS:
        _USER_SETTINGS[user_id] = AgentSettings()
    return _USER_SETTINGS[user_id]


# Session Management
@router.post("/sessions", response_model=AgentSession)
async def create_session(request: CreateSessionRequest):
    """
    Create new agent session.

    Creates a new conversational session where users can interact with
    the autonomous agent workspace.
    """
    # TODO: Get user_id from auth
    user_id = "default_user"
    service = AgentService()
    return await service.create_session(user_id, request.title)


@router.get("/sessions", response_model=List[AgentSession])
async def list_sessions():
    """
    List user's sessions.

    Returns all sessions for the authenticated user, sorted by most recent.
    """
    user_id = "default_user"
    service = AgentService()
    return await service.list_sessions(user_id)


@router.get("/sessions/{session_id}", response_model=AgentSession)
async def get_session(session_id: str):
    """
    Get session details.

    Retrieves complete session data including messages, workflow state,
    and execution history.
    """
    user_id = "default_user"
    service = AgentService()
    session = await service.get_session(session_id, user_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """
    Delete session.

    Permanently deletes a session and all associated data.
    """
    user_id = "default_user"
    service = AgentService()
    deleted = await service.delete_session(session_id, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"deleted": True}


# Messaging
@router.post("/sessions/{session_id}/messages")
async def send_message(session_id: str, request: SendMessageRequest):
    """
    Send message to agent.

    Sends a natural language message to the agent. The agent will:
    1. Classify the intent
    2. Create a workflow plan
    3. Return the plan for approval (if in interactive mode)

    The user must then call the /approve endpoint to execute the plan.
    """
    user_id = "default_user"
    service = AgentService()

    # Check session exists
    session = await service.get_session(session_id, user_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Add user message
    user_msg = Message(
        id=str(uuid.uuid4()),
        role="user",
        content=request.content,
        timestamp=datetime.utcnow()
    )
    await service.add_message(session_id, user_id, user_msg)

    # Process with orchestrator
    orchestrator = AgentOrchestrator(service)
    result = await orchestrator.process_message(session_id, user_id, request.content)

    # Check budget
    user_settings = get_user_settings(user_id)
    cost_guard = CostGuard()
    allowed, reason = await cost_guard.check_budget_available(
        user_settings,
        result["estimated_cost"]
    )

    if not allowed:
        agent_msg = Message(
            id=str(uuid.uuid4()),
            role="agent",
            content=f"Cannot proceed: {reason}",
            timestamp=datetime.utcnow(),
            metadata={"error": "budget_exceeded"}
        )
        await service.add_message(session_id, user_id, agent_msg)
        raise HTTPException(status_code=402, detail=reason)

    # Add agent response with plan
    agent_msg = Message(
        id=str(uuid.uuid4()),
        role="agent",
        content=result["description"],
        timestamp=datetime.utcnow(),
        metadata={
            "thinking": f"Classified as {result['intent']}",
            "workflow": result["workflow"],
            "estimated_cost": result["estimated_cost"],
            "estimated_time_minutes": result["estimated_time_minutes"]
        }
    )
    await service.add_message(session_id, user_id, agent_msg)

    # Update session with workflow
    session.workflow = result["workflow"]
    session.cost.estimated = result["estimated_cost"]
    session.time.estimated_minutes = result["estimated_time_minutes"]
    await session.save()

    # Broadcast to WebSocket clients
    await manager.broadcast_status(session_id, "plan_ready", {
        "intent": result["intent"],
        "workflow": result["workflow"],
        "estimated_cost": result["estimated_cost"],
        "estimated_time_minutes": result["estimated_time_minutes"]
    })

    return {"success": True, "plan_ready": True}


# Approval
@router.post("/sessions/{session_id}/approve")
async def approve_action(session_id: str):
    """
    Approve agent action.

    Approves the planned workflow and begins execution.
    """
    user_id = "default_user"
    service = AgentService()

    session = await service.get_session(session_id, user_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session.workflow:
        raise HTTPException(status_code=400, detail="No workflow to approve")

    # Update session status
    await service.update_session_status(session_id, user_id, "active")

    # Broadcast to WebSocket clients
    await manager.broadcast_status(session_id, "executing", {
        "plan_id": session.workflow["plan_id"]
    })

    # TODO: Implement actual execution
    # For now, just mark as approved
    return {"approved": True, "executing": True}


@router.post("/sessions/{session_id}/reject")
async def reject_action(session_id: str):
    """
    Reject agent action.

    Rejects the planned workflow and returns to chat.
    """
    user_id = "default_user"
    service = AgentService()

    session = await service.get_session(session_id, user_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Clear workflow
    session.workflow = None
    await session.save()

    # Add system message
    system_msg = Message(
        id=str(uuid.uuid4()),
        role="system",
        content="Workflow rejected by user",
        timestamp=datetime.utcnow()
    )
    await service.add_message(session_id, user_id, system_msg)

    # Broadcast to WebSocket clients
    await manager.broadcast_status(session_id, "rejected")

    return {"rejected": True}


# Budget
@router.get("/budget", response_model=BudgetStatusResponse)
async def get_budget():
    """
    Get budget status.

    Returns current spending and limits for the authenticated user.
    """
    user_id = "default_user"
    user_settings = get_user_settings(user_id)
    cost_guard = CostGuard()
    status = cost_guard.get_budget_status(user_settings)

    return BudgetStatusResponse(
        daily_limit=status["daily_limit"],
        daily_spent=status["daily_spent"],
        monthly_limit=status["monthly_limit"],
        monthly_spent=status["monthly_spent"]
    )


# WebSocket
@router.websocket("/sessions/{session_id}/stream")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """
    WebSocket stream for real-time updates.

    Provides live updates for:
    - Agent thinking/reasoning
    - Workflow execution progress
    - Log messages
    - Status changes

    Send a ping message periodically to keep the connection alive.
    """
    await manager.connect(session_id, websocket)
    try:
        while True:
            # Keep connection alive, wait for client messages (pings)
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(session_id, websocket)
