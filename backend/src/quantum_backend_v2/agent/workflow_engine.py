from typing import Dict, Any, List, Optional
from enum import Enum
from datetime import datetime
import uuid

from .models import Workflow, WorkflowStep


class StepStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class WorkflowEngine:
    def __init__(self):
        self.workflows: Dict[str, Workflow] = {}

    def create_workflow(self, tool_types: List[str], parameters: Dict[str, Any]) -> Workflow:
        """Create a new workflow from tool types"""
        steps = []
        for i, tool in enumerate(tool_types):
            step = WorkflowStep(
                id=str(uuid.uuid4()),
                tool=tool,
                name=self._generate_step_name(tool, parameters),
                status="pending"
            )
            steps.append(step)

        workflow = Workflow(
            plan_id=str(uuid.uuid4()),
            steps=steps,
            current_step=0,
            total_steps=len(steps),
            progress_percent=0,
            completed_steps=0
        )

        self.workflows[workflow.plan_id] = workflow
        return workflow

    def _generate_step_name(self, tool: str, parameters: Dict[str, Any]) -> str:
        """Generate human-readable step names"""
        names = {
            "finance": "Portfolio Optimization",
            "pharma": "Molecular Docking",
            "risk": "Risk Analysis",
            "circuits": "Quantum Circuit Execution"
        }
        return names.get(tool, f"Execute {tool}")

    async def execute_step(self, plan_id: str, step_id: str) -> Dict[str, Any]:
        """Execute a workflow step"""
        workflow = self.workflows.get(plan_id)
        if not workflow:
            raise ValueError(f"Workflow {plan_id} not found")

        step = next((s for s in workflow.steps if s.id == step_id), None)
        if not step:
            raise ValueError(f"Step {step_id} not found")

        # Update step status
        step.status = "running"
        step.started_at = datetime.utcnow()

        # TODO: Actual tool execution will be implemented in orchestrator
        # For now, return placeholder
        return {"status": "running", "step_id": step_id}

    async def complete_step(self, plan_id: str, step_id: str, result: Any) -> None:
        """Mark a step as completed"""
        workflow = self.workflows.get(plan_id)
        if not workflow:
            raise ValueError(f"Workflow {plan_id} not found")

        step = next((s for s in workflow.steps if s.id == step_id), None)
        if not step:
            raise ValueError(f"Step {step_id} not found")

        step.status = "completed"
        step.completed_at = datetime.utcnow()
        step.result = result
        step.progress_percent = 100

        # Update workflow progress
        workflow.completed_steps += 1
        workflow.progress_percent = int((workflow.completed_steps / workflow.total_steps) * 100)

        if workflow.completed_steps < workflow.total_steps:
            workflow.current_step += 1

    def get_workflow(self, plan_id: str) -> Optional[Workflow]:
        """Get workflow by ID"""
        return self.workflows.get(plan_id)
