"""Notification-related Pydantic models for user notification system."""

from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, field_validator, ConfigDict


class NotificationResponse(BaseModel):
    """Response schema for individual notification."""

    id: str = Field(..., description="Unique notification identifier")
    type: str = Field(..., description="Notification type (e.g., proposal_funded, payment_received)")
    title: str = Field(..., description="Notification title")
    message: str = Field(..., description="Notification message content")
    read: bool = Field(..., description="Whether notification has been read")
    created_at: datetime = Field(..., description="Timestamp when notification was created")
    metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Additional metadata (e.g., proposal_id, payment_id)"
    )

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        """Validate notification type."""
        allowed_types = {
            "proposal_new",
            "proposal_funded",
            "payment_received",
            "fragment_claimed",
            "results_submitted",
            "agent_analysis",
            "system_alert"
        }
        v = v.strip().lower()
        if v not in allowed_types:
            raise ValueError(f"Notification type must be one of {allowed_types}")
        return v

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        """Validate title is not empty and has reasonable length."""
        v = v.strip()
        if not v:
            raise ValueError("Title cannot be empty")
        if len(v) > 200:
            raise ValueError("Title cannot exceed 200 characters")
        return v

    @field_validator("message")
    @classmethod
    def validate_message(cls, v: str) -> str:
        """Validate message is not empty and has reasonable length."""
        v = v.strip()
        if not v:
            raise ValueError("Message cannot be empty")
        if len(v) > 1000:
            raise ValueError("Message cannot exceed 1000 characters")
        return v

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "notif_abc123",
                "type": "proposal_funded",
                "title": "Proposal Funded",
                "message": "Your proposal 'Quantum Error Correction' has been fully funded!",
                "read": False,
                "created_at": "2026-05-20T12:00:00Z",
                "metadata": {
                    "proposal_id": "proposal_xyz789",
                    "amount": "5000.00"
                }
            }
        }
    )


class NotificationListResponse(BaseModel):
    """Response schema for list of notifications."""

    notifications: List[NotificationResponse] = Field(
        ...,
        description="Array of notifications"
    )
    total: int = Field(
        ...,
        ge=0,
        description="Total number of notifications"
    )
    unread_count: Optional[int] = Field(
        default=None,
        ge=0,
        description="Number of unread notifications"
    )

    @field_validator("total")
    @classmethod
    def validate_total_matches_notifications(cls, v: int, info) -> int:
        """Validate total matches the length of notifications array."""
        if "notifications" in info.data:
            notifications = info.data["notifications"]
            if v != len(notifications):
                raise ValueError(
                    f"Total ({v}) must match number of notifications ({len(notifications)})"
                )
        return v

    @field_validator("unread_count")
    @classmethod
    def validate_unread_count(cls, v: Optional[int], info) -> Optional[int]:
        """Validate unread_count doesn't exceed total."""
        if v is not None and "total" in info.data:
            total = info.data["total"]
            if v > total:
                raise ValueError(
                    f"Unread count ({v}) cannot exceed total ({total})"
                )
        return v

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "notifications": [
                    {
                        "id": "notif_abc123",
                        "type": "proposal_funded",
                        "title": "Proposal Funded",
                        "message": "Your proposal has been fully funded!",
                        "read": False,
                        "created_at": "2026-05-20T12:00:00Z",
                        "metadata": {"proposal_id": "proposal_xyz789"}
                    },
                    {
                        "id": "notif_def456",
                        "type": "payment_received",
                        "title": "Payment Received",
                        "message": "You received 100 USDC for job completion",
                        "read": True,
                        "created_at": "2026-05-19T10:30:00Z",
                        "metadata": {"payment_id": "payment_abc456"}
                    }
                ],
                "total": 2,
                "unread_count": 1
            }
        }
    )


class NotificationPreferences(BaseModel):
    """Schema for notification preferences."""

    email_enabled: bool = Field(
        default=True,
        description="Whether email notifications are enabled"
    )
    preferences: Dict[str, bool] = Field(
        default_factory=dict,
        description="Per-type notification preferences (e.g., proposal_funded: true)"
    )

    @field_validator("preferences")
    @classmethod
    def validate_preference_keys(cls, v: Dict[str, bool]) -> Dict[str, bool]:
        """Validate preference keys are valid notification types."""
        allowed_types = {
            "proposal_new",
            "proposal_funded",
            "payment_received",
            "fragment_claimed",
            "results_submitted",
            "agent_analysis",
            "system_alert"
        }
        for key in v.keys():
            if key not in allowed_types:
                raise ValueError(
                    f"Invalid preference key '{key}'. Must be one of {allowed_types}"
                )
        return v

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "email_enabled": True,
                "preferences": {
                    "proposal_funded": True,
                    "payment_received": True,
                    "fragment_claimed": False,
                    "system_alert": True
                }
            }
        }
    )
