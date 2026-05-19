import os
import json
from typing import Dict, Any, List, Optional
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
    def __init__(self, model_id: Optional[str] = None) -> None:
        """
        Initialize the intent classifier.

        Args:
            model_id: Optional model ID to use. If not provided, uses default from env.
        """
        # Check which provider is configured
        self.use_bedrock = os.getenv("AWS_BEDROCK_ENABLED", "true").lower() == "true"

        if self.use_bedrock:
            # AWS Bedrock setup
            import boto3
            self.bedrock_client = boto3.client(
                service_name='bedrock-runtime',
                region_name=os.getenv('AWS_REGION', 'us-east-1'),
                aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
                aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY')
            )
            # Use provided model or default from environment
            self.model_id = model_id or os.getenv(
                "AWS_BEDROCK_DEFAULT_MODEL",
                "anthropic.claude-3-5-sonnet-20241022-v2:0"
            )
        else:
            # Direct Anthropic API setup
            from anthropic import Anthropic
            api_key = os.getenv("ANTHROPIC_API_KEY")
            if not api_key:
                raise ValueError("ANTHROPIC_API_KEY environment variable not set")
            self.client = Anthropic(api_key=api_key)
            self.model_id = model_id or "claude-3-5-sonnet-20241022"

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

        if self.use_bedrock:
            # AWS Bedrock API call
            request_body = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 1024,
                "system": system_prompt,
                "messages": [{"role": "user", "content": user_message}]
            }

            response = self.bedrock_client.invoke_model(
                modelId=self.model_id,
                body=json.dumps(request_body)
            )

            response_body = json.loads(response['body'].read())
            result_text = response_body['content'][0]['text']
        else:
            # Direct Anthropic API call
            response = self.client.messages.create(
                model=self.model_id,
                max_tokens=1024,
                system=system_prompt,
                messages=[{"role": "user", "content": user_message}]
            )
            result_text = response.content[0].text

        result = json.loads(result_text)

        return {
            "intent": IntentType(result.get("intent", "unknown")),
            "tools": [ToolType(t) for t in result.get("tools", [])],
            "parameters": result.get("parameters", {}),
            "description": result.get("description", ""),
            "estimated_cost": result.get("estimated_cost", 0.0),
            "estimated_time_minutes": result.get("estimated_time_minutes", 0)
        }
