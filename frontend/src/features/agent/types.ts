export type AgentSessionStatus = "active" | "paused" | "completed" | "failed";

export type MessageRole = "user" | "agent" | "system";

export type WorkflowStepStatus = "pending" | "running" | "completed" | "failed";

export type ToolType = "circuits" | "pharma" | "finance" | "risk";

export type ApprovalMode = "auto" | "interactive";

export type TechnicalDetailLevel = "domain" | "balanced" | "full";

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  metadata?: {
    thinking?: string;
    actions?: string[];
    approval_required?: boolean;
  };
}

export interface WorkflowStep {
  id: string;
  tool: ToolType;
  name: string;
  status: WorkflowStepStatus;
  job_id?: string;
  started_at?: string;
  completed_at?: string;
  progress_percent?: number;
  result?: unknown;
}

export interface Workflow {
  plan_id: string;
  steps: readonly WorkflowStep[];
  current_step: number;
  current_step_name?: string;
  approval_pending: boolean;
  approval_data?: ApprovalData;
  progress_percent: number;
  completed_steps: number;
  total_steps: number;
}

export interface ApprovalData {
  cost: number;
  time_minutes: number;
  description?: string;
  technical?: {
    nodes?: string[];
    qubits?: number;
    circuit_depth?: number;
  };
}

export interface CostBreakdown {
  compute: number;
  storage: number;
  network: number;
}

export interface SessionCost {
  estimated: number;
  actual: number;
  breakdown: CostBreakdown;
}

export interface SessionTime {
  estimated_minutes: number;
  elapsed_seconds: number;
}

export interface SessionSettings {
  approval_mode: ApprovalMode;
  auto_approval_threshold: number;
  technical_detail_level: TechnicalDetailLevel;
}

export interface AgentSession {
  _id: string;
  user_id: string;
  session_id: string;
  title: string;
  status: AgentSessionStatus;
  created_at: string;
  updated_at: string;
  messages: Message[];
  workflow?: Workflow;
  cost: SessionCost;
  time: SessionTime;
  settings: SessionSettings;
  results?: unknown;
  logs?: LogEntry[];
}

export interface LogEntry {
  timestamp: string;
  level: "info" | "warning" | "error" | "debug";
  message: string;
  source?: string;
}

export interface BudgetLimits {
  daily_usd: number;
  monthly_usd: number;
  per_session_usd: number;
}

export interface BudgetAlerts {
  email_on_budget_reached: boolean;
  warn_at_percentage: number;
}

export interface SpentTracking {
  daily_spent: number;
  monthly_spent: number;
  last_reset_daily: string;
  last_reset_monthly: string;
}

export interface BudgetStatus {
  daily_limit: number;
  daily_spent: number;
  monthly_limit: number;
  monthly_spent: number;
}

export interface AgentSettings {
  approval_mode: ApprovalMode;
  auto_approval_threshold: number;
  technical_detail_level: TechnicalDetailLevel;
  budget_limits: BudgetLimits;
  alerts: BudgetAlerts;
}

export interface CreateSessionRequest {
  title?: string;
}

export interface SendMessageRequest {
  content: string;
}

export interface ApprovalRequest {
  approved: boolean;
}
