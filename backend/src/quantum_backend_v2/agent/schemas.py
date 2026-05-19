from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime


# Request Schemas
class CreateSessionRequest(BaseModel):
    title: Optional[str] = None


class SendMessageRequest(BaseModel):
    content: str = Field(..., max_length=4000)


class ApprovalRequest(BaseModel):
    approved: bool


# Response Schemas
class MessageResponse(BaseModel):
    id: str
    role: Literal["user", "agent", "system"]
    content: str
    timestamp: datetime

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


class SessionListResponse(BaseModel):
    sessions: list
    total: int


class BudgetStatusResponse(BaseModel):
    daily_limit: float
    daily_spent: float
    monthly_limit: float
    monthly_spent: float


class ErrorResponse(BaseModel):
    detail: str
    code: Optional[str] = None
