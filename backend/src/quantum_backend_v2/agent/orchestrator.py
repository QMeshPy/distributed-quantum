from typing import Dict, Any
from .intent_classifier import IntentClassifier
from .workflow_engine import WorkflowEngine
from .service import AgentService


class AgentOrchestrator:
    """
    Orchestrates agent workflow from user intent to execution.

    Coordinates:
    - Intent classification (what user wants)
    - Workflow creation (execution plan)
    - Tool execution (via service)
    """

    def __init__(self, service: AgentService, model_id: str = None):
        self.service = service
        self.classifier = IntentClassifier(model_id=model_id)
        self.engine = WorkflowEngine()

    async def process_message(self, session_id: str, user_id: str, message: str) -> Dict[str, Any]:
        """
        Process user message: classify intent, create workflow, execute.

        Args:
            session_id: Current session ID
            user_id: User making the request
            message: User's natural language message

        Returns:
            Dictionary with:
            - intent: Classified intent type
            - description: Human-readable description of what will happen
            - workflow: Workflow plan with steps
            - estimated_cost: Estimated cost in USD
            - estimated_time_minutes: Estimated time to complete
        """
        # 1. Classify intent
        intent_result = await self.classifier.classify_intent(message)

        # 2. Create workflow
        workflow = self.engine.create_workflow(
            tool_types=[t.value for t in intent_result["tools"]],
            parameters=intent_result["parameters"]
        )

        # 3. Return planning result (execution happens via separate endpoint)
        return {
            "intent": intent_result["intent"].value,
            "description": intent_result["description"],
            "workflow": workflow.model_dump(),
            "estimated_cost": intent_result["estimated_cost"],
            "estimated_time_minutes": intent_result["estimated_time_minutes"]
        }

    async def execute_workflow(self, session_id: str, user_id: str, plan_id: str) -> Dict[str, Any]:
        """
        Execute a planned workflow.

        Args:
            session_id: Current session ID
            user_id: User making the request
            plan_id: Workflow plan ID to execute

        Returns:
            Dictionary with execution status
        """
        workflow = self.engine.get_workflow(plan_id)
        if not workflow:
            raise ValueError(f"Workflow {plan_id} not found")

        # Execute each step in sequence
        for step in workflow.steps:
            if step.status == "completed":
                continue

            # Execute step
            await self.engine.execute_step(plan_id, step.id)

            # TODO: Actual tool execution will be implemented
            # For now, just mark as completed
            await self.engine.complete_step(plan_id, step.id, {"status": "completed"})

        return {
            "plan_id": plan_id,
            "status": "completed",
            "workflow": workflow.model_dump()
        }
