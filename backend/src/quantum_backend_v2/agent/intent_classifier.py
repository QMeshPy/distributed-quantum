import os
from anthropic import Anthropic
from typing import Dict, Any, List
from enum import Enum


class IntentType(Enum):
    PORTFOLIO_OPTIMIZATION = "portfolio_optimization"
    DRUG_DISCOVERY = "drug_discovery"
    RISK_ANALYSIS = "risk_analysis"
    CIRCUIT_EXECUTION = "circuit_execution"
    COMPARATIVE_STUDY = "comparative_study"
    UNKNOWN = "unknown"


class ToolType(Enum):
    FINANCE = "finance"
    PHARMA = "pharma"
    RISK = "risk"
    CIRCUITS = "circuits"


class IntentClassifier:
    def __init__(self):
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable not set")
        self.client = Anthropic(api_key=api_key)

    async def classify_intent(self, user_message: str) -> Dict[str, Any]:
        """
        Classify user intent and determine required tools.

        Returns:
            {
                "intent": IntentType,
                "tools": List[ToolType],
                "parameters": Dict[str, Any],
                "description": str,
                "estimated_cost": float,
                "estimated_time_minutes": int
            }
        """

        system_prompt = """You are an intent classifier for a quantum lab platform.

Analyze the user's message and determine:
1. What they want to accomplish (intent)
2. Which computational tools are needed (circuits, pharma, finance, risk)
3. Key parameters extracted from their message
4. A brief description of what will be executed
5. Estimated cost in USD and time in minutes

Available intents:
- portfolio_optimization: Optimize investment portfolios (use finance tool)
- drug_discovery: Find drug candidates, molecular docking, ADMET analysis (use pharma tool)
- risk_analysis: Financial risk analysis (use risk tool)
- circuit_execution: Run quantum circuits (use circuits tool)
- comparative_study: Compare quantum vs classical approaches

Respond in JSON format:
{
  "intent": "portfolio_optimization",
  "tools": ["finance"],
  "parameters": {"assets": 50, "constraint": "sector_15_percent"},
  "description": "Optimize 50-asset portfolio with 15% sector constraint",
  "estimated_cost": 15.0,
  "estimated_time_minutes": 45
}"""

        response = self.client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=1024,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}]
        )

        import json
        result = json.loads(response.content[0].text)

        return {
            "intent": IntentType(result.get("intent", "unknown")),
            "tools": [ToolType(t) for t in result.get("tools", [])],
            "parameters": result.get("parameters", {}),
            "description": result.get("description", ""),
            "estimated_cost": result.get("estimated_cost", 0.0),
            "estimated_time_minutes": result.get("estimated_time_minutes", 0)
        }
