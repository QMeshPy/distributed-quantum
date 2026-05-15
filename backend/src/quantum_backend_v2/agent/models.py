from datetime import datetime
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field
from bson import ObjectId


class Message(BaseModel):
    id: str
    role: Literal["user", "agent", "system"]
    content: str
    timestamp: datetime
    metadata: Optional[Dict[str, Any]] = None

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


class WorkflowStep(BaseModel):
    id: str
    tool: Literal["circuits", "pharma", "finance", "risk"]
    name: str
    status: Literal["pending", "running", "completed", "failed"]
    job_id: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    progress_percent: Optional[int] = None
    result: Optional[Dict[str, Any]] = None

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


class Workflow(BaseModel):
    plan_id: str
    steps: List[WorkflowStep]
    current_step: int = 0
    current_step_name: Optional[str] = None
    approval_pending: bool = False
    approval_data: Optional[Dict[str, Any]] = None
    progress_percent: int = 0
    completed_steps: int = 0
    total_steps: int


class CostBreakdown(BaseModel):
    compute: float = 0.0
    storage: float = 0.0
    network: float = 0.0


class SessionCost(BaseModel):
    estimated: float = 0.0
    actual: float = 0.0
    breakdown: CostBreakdown = Field(default_factory=CostBreakdown)


class SessionTime(BaseModel):
    estimated_minutes: int = 0
    elapsed_seconds: int = 0


class SessionSettings(BaseModel):
    approval_mode: Literal["auto", "interactive"] = "auto"
    auto_approval_threshold: float = 5.0
    technical_detail_level: Literal["domain", "balanced", "full"] = "domain"


class LogEntry(BaseModel):
    timestamp: str
    level: Literal["info", "warning", "error", "debug"]
    message: str
    source: Optional[str] = None


class AgentSession(BaseModel):
    id: Optional[str] = Field(default=None, alias="_id")
    user_id: str
    session_id: str
    title: str = "New Session"
    status: Literal["active", "paused", "completed", "failed"] = "active"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    messages: List[Message] = Field(default_factory=list)
    workflow: Optional[Workflow] = None
    cost: SessionCost = Field(default_factory=SessionCost)
    time: SessionTime = Field(default_factory=SessionTime)
    settings: SessionSettings = Field(default_factory=SessionSettings)
    results: Optional[Dict[str, Any]] = None
    logs: List[LogEntry] = Field(default_factory=list)

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            ObjectId: lambda v: str(v),
        }
        populate_by_name = True


class BudgetLimits(BaseModel):
    daily_usd: float = 50.0
    monthly_usd: float = 500.0
    per_session_usd: float = 100.0


class BudgetAlerts(BaseModel):
    email_on_budget_reached: bool = False
    warn_at_percentage: int = 80


class SpentTracking(BaseModel):
    daily_spent: float = 0.0
    monthly_spent: float = 0.0
    last_reset_daily: datetime = Field(default_factory=datetime.utcnow)
    last_reset_monthly: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


class AgentSettings(BaseModel):
    approval_mode: Literal["auto", "interactive"] = "auto"
    auto_approval_threshold: float = 5.0
    technical_detail_level: Literal["domain", "balanced", "full"] = "domain"
    budget_limits: BudgetLimits = Field(default_factory=BudgetLimits)
    alerts: BudgetAlerts = Field(default_factory=BudgetAlerts)
    spent_tracking: SpentTracking = Field(default_factory=SpentTracking)


class BudgetStatus(BaseModel):
    daily_limit: float
    daily_spent: float
    monthly_limit: float
    monthly_spent: float
