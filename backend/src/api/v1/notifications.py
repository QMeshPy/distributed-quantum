"""Notifications API Router - User notification management.

This router handles notification management and user preferences:
- List user notifications (paginated)
- Mark notifications as read
- Update email notification preferences
- Delete notifications

Integration:
- NotificationService: Multi-channel notification system
- MongoDB: NotificationDocument collection
- Auth: get_current_user for all endpoints
"""

from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Query, status
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict

from quantum_backend_v2.api.deps.auth import CurrentUser
from quantum_backend_v2.api.errors.models import PlatformException, ErrorCode
from services.notification_service import get_notification_service

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Request/Response Models
# ---------------------------------------------------------------------------


class NotificationItem(BaseModel):
    """Single notification item."""

    model_config = ConfigDict(extra="forbid")

    notification_id: str = Field(description="Unique notification identifier")
    type: str = Field(description="Notification type")
    title: str = Field(description="Notification title")
    message: str = Field(description="Notification message")
    data: dict[str, Any] = Field(default_factory=dict, description="Extra context data")
    read: bool = Field(description="Read status")
    sent_email: bool = Field(description="Whether email was sent")
    email_sent_at: str | None = Field(default=None, description="ISO timestamp of email sent")
    created_at: str = Field(description="ISO timestamp of creation")


class NotificationListResponse(BaseModel):
    """Response containing paginated list of notifications."""

    model_config = ConfigDict(extra="forbid")

    notifications: list[NotificationItem] = Field(default_factory=list)
    total: int = Field(description="Total number of notifications")
    unread_count: int = Field(description="Number of unread notifications")
    limit: int = Field(description="Page size")
    offset: int = Field(description="Page offset")


class MarkReadResponse(BaseModel):
    """Response from marking notification as read."""

    model_config = ConfigDict(extra="forbid")

    notification_id: str = Field(description="Notification that was marked as read")
    read: bool = Field(description="Updated read status")
    message: str = Field(description="Status message")


class NotificationPreferences(BaseModel):
    """User notification preference settings."""

    model_config = ConfigDict(extra="forbid")

    new_proposals: bool = Field(default=True, description="Email for new research proposals")
    proposal_funded: bool = Field(default=True, description="Email when proposals are funded")
    payment_received: bool = Field(default=True, description="Email for payment confirmations")
    fragment_claimed: bool = Field(default=True, description="Email when fragments are claimed")
    results_published: bool = Field(default=True, description="Email when results are published")
    job_completed: bool = Field(default=True, description="Email for job completions")
    agent_actions: bool = Field(default=False, description="Email for AI agent actions")
    system_alerts: bool = Field(default=True, description="Email for system alerts")


class UpdatePreferencesRequest(BaseModel):
    """Request to update notification preferences."""

    model_config = ConfigDict(extra="forbid")

    preferences: NotificationPreferences = Field(description="Notification preference settings")


class UpdatePreferencesResponse(BaseModel):
    """Response from updating preferences."""

    model_config = ConfigDict(extra="forbid")

    user_id: str = Field(description="User whose preferences were updated")
    preferences: NotificationPreferences = Field(description="Updated preferences")
    message: str = Field(description="Status message")


class DeleteNotificationResponse(BaseModel):
    """Response from deleting a notification."""

    model_config = ConfigDict(extra="forbid")

    notification_id: str = Field(description="Notification that was deleted")
    message: str = Field(description="Status message")


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


# Initialize MongoDB connection
def get_db():
    """Get MongoDB database instance."""
    mongodb_uri = os.getenv("QB2_MONGODB_LOCAL_URI", "mongodb://127.0.0.1:27017")
    mongodb_database = os.getenv("QB2_MONGODB_DATABASE", "qds")
    client = AsyncIOMotorClient(mongodb_uri)
    return client[mongodb_database]


@router.get(
    "",
    response_model=NotificationListResponse,
    status_code=status.HTTP_200_OK,
    summary="List user notifications",
    description="Get paginated list of notifications for the authenticated user.",
)
async def list_notifications(
    current_user: CurrentUser,
    limit: int = Query(default=50, ge=1, le=100, description="Number of notifications per page"),
    offset: int = Query(default=0, ge=0, description="Number of notifications to skip"),
    unread_only: bool = Query(default=False, description="Filter to show only unread notifications"),
    notification_type: str | None = Query(default=None, description="Filter by notification type"),
) -> NotificationListResponse:
    """List notifications for the current user.

    Returns paginated list of notifications with filters for unread status and type.
    Results are ordered by creation time (newest first).

    Args:
        current_user: Authenticated user from dependency injection
        limit: Number of notifications to return (1-100)
        offset: Number of notifications to skip for pagination
        unread_only: If True, only return unread notifications
        notification_type: Optional filter by notification type

    Returns:
        NotificationListResponse with notifications and metadata

    Raises:
        PlatformException: If database query fails
    """
    try:
        db = get_db()
        user_id = current_user.user_id

        # Build query filter
        query_filter: dict[str, Any] = {"user_id": user_id}

        if unread_only:
            query_filter["read"] = False

        if notification_type:
            query_filter["type"] = notification_type

        # Get total count
        total = await db.notifications.count_documents(query_filter)

        # Get unread count
        unread_count = await db.notifications.count_documents({
            "user_id": user_id,
            "read": False
        })

        # Query notifications with pagination
        cursor = db.notifications.find(query_filter).sort("created_at", -1).skip(offset).limit(limit)

        notifications = []
        async for doc in cursor:
            notifications.append(NotificationItem(
                notification_id=str(doc.get("_id")),
                type=doc.get("type", "other"),
                title=doc.get("title", ""),
                message=doc.get("message", ""),
                data=doc.get("data", {}),
                read=doc.get("read", False),
                sent_email=doc.get("sent_email", False),
                email_sent_at=doc.get("email_sent_at").isoformat() if doc.get("email_sent_at") else None,
                created_at=doc.get("created_at").isoformat() if doc.get("created_at") else datetime.utcnow().isoformat()
            ))

        logger.info(
            f"Listed {len(notifications)} notifications for user {user_id} "
            f"(total: {total}, unread: {unread_count})"
        )

        return NotificationListResponse(
            notifications=notifications,
            total=total,
            unread_count=unread_count,
            limit=limit,
            offset=offset
        )

    except Exception as e:
        logger.error(f"Failed to list notifications: {e}", exc_info=True)
        raise PlatformException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=ErrorCode.INTERNAL_ERROR,
            message="Failed to retrieve notifications"
        )


@router.put(
    "/{notification_id}/read",
    response_model=MarkReadResponse,
    status_code=status.HTTP_200_OK,
    summary="Mark notification as read",
    description="Mark a specific notification as read for the authenticated user.",
)
async def mark_notification_read(
    notification_id: str,
    current_user: CurrentUser,
) -> MarkReadResponse:
    """Mark a notification as read.

    Updates the read status of a notification. Only the owner of the notification
    can mark it as read.

    Args:
        notification_id: ID of the notification to mark as read
        current_user: Authenticated user from dependency injection

    Returns:
        MarkReadResponse with updated status

    Raises:
        PlatformException: If notification not found or unauthorized
    """
    try:
        db = get_db()
        user_id = current_user.user_id

        # Find and update the notification
        from bson import ObjectId

        # Validate ObjectId format
        try:
            obj_id = ObjectId(notification_id)
        except Exception:
            raise PlatformException(
                status_code=status.HTTP_400_BAD_REQUEST,
                error=ErrorCode.INVALID_INPUT,
                message="Invalid notification ID format"
            )

        result = await db.notifications.update_one(
            {"_id": obj_id, "user_id": user_id},
            {"$set": {"read": True}}
        )

        if result.matched_count == 0:
            raise PlatformException(
                status_code=status.HTTP_404_NOT_FOUND,
                error=ErrorCode.NOT_FOUND,
                message="Notification not found or access denied"
            )

        logger.info(f"Marked notification {notification_id} as read for user {user_id}")

        return MarkReadResponse(
            notification_id=notification_id,
            read=True,
            message="Notification marked as read"
        )

    except PlatformException:
        raise
    except Exception as e:
        logger.error(f"Failed to mark notification as read: {e}", exc_info=True)
        raise PlatformException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=ErrorCode.INTERNAL_ERROR,
            message="Failed to update notification"
        )


@router.post(
    "/preferences",
    response_model=UpdatePreferencesResponse,
    status_code=status.HTTP_200_OK,
    summary="Update notification preferences",
    description="Update email notification preferences for the authenticated user.",
)
async def update_notification_preferences(
    body: UpdatePreferencesRequest,
    current_user: CurrentUser,
) -> UpdatePreferencesResponse:
    """Update user notification preferences.

    Updates email notification settings for different types of events.
    Preferences are stored in the platform_users collection.

    Args:
        body: Notification preference settings
        current_user: Authenticated user from dependency injection

    Returns:
        UpdatePreferencesResponse with updated preferences

    Raises:
        PlatformException: If update fails
    """
    try:
        db = get_db()
        user_id = current_user.user_id

        # Convert preferences to dict
        preferences_dict = body.preferences.model_dump()

        # Update user preferences in platform_users collection
        result = await db.platform_users.update_one(
            {"id": user_id},
            {"$set": {"notification_preferences": preferences_dict}}
        )

        if result.matched_count == 0:
            # User might not exist in platform_users yet, create minimal record
            await db.platform_users.insert_one({
                "id": user_id,
                "email": current_user.email,
                "display_name": user_id,
                "is_active": True,
                "notification_preferences": preferences_dict,
                "created_at": datetime.utcnow()
            })
            logger.info(f"Created platform_users record for user {user_id}")

        logger.info(f"Updated notification preferences for user {user_id}")

        return UpdatePreferencesResponse(
            user_id=user_id,
            preferences=body.preferences,
            message="Notification preferences updated successfully"
        )

    except Exception as e:
        logger.error(f"Failed to update notification preferences: {e}", exc_info=True)
        raise PlatformException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=ErrorCode.INTERNAL_ERROR,
            message="Failed to update preferences"
        )


@router.delete(
    "/{notification_id}",
    response_model=DeleteNotificationResponse,
    status_code=status.HTTP_200_OK,
    summary="Delete notification",
    description="Delete a specific notification for the authenticated user.",
)
async def delete_notification(
    notification_id: str,
    current_user: CurrentUser,
) -> DeleteNotificationResponse:
    """Delete a notification.

    Permanently removes a notification from the user's notification list.
    Only the owner of the notification can delete it.

    Args:
        notification_id: ID of the notification to delete
        current_user: Authenticated user from dependency injection

    Returns:
        DeleteNotificationResponse with status

    Raises:
        PlatformException: If notification not found or unauthorized
    """
    try:
        db = get_db()
        user_id = current_user.user_id

        # Validate and delete the notification
        from bson import ObjectId

        try:
            obj_id = ObjectId(notification_id)
        except Exception:
            raise PlatformException(
                status_code=status.HTTP_400_BAD_REQUEST,
                error=ErrorCode.INVALID_INPUT,
                message="Invalid notification ID format"
            )

        result = await db.notifications.delete_one(
            {"_id": obj_id, "user_id": user_id}
        )

        if result.deleted_count == 0:
            raise PlatformException(
                status_code=status.HTTP_404_NOT_FOUND,
                error=ErrorCode.NOT_FOUND,
                message="Notification not found or access denied"
            )

        logger.info(f"Deleted notification {notification_id} for user {user_id}")

        return DeleteNotificationResponse(
            notification_id=notification_id,
            message="Notification deleted successfully"
        )

    except PlatformException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete notification: {e}", exc_info=True)
        raise PlatformException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=ErrorCode.INTERNAL_ERROR,
            message="Failed to delete notification"
        )
