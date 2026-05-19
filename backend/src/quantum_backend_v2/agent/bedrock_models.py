"""AWS Bedrock model management."""
import os
import boto3
from typing import List, Dict, Any, Optional
from pydantic import BaseModel


class BedrockModel(BaseModel):
    """Represents an available Bedrock model."""
    model_id: str
    model_name: str
    provider: str
    input_modalities: List[str]
    output_modalities: List[str]
    supports_streaming: bool
    is_available: bool


class BedrockModelService:
    """Service for interacting with AWS Bedrock models."""

    def __init__(self):
        """Initialize Bedrock client."""
        self.enabled = os.getenv("AWS_BEDROCK_ENABLED", "true").lower() == "true"

        if self.enabled:
            self.client = boto3.client(
                service_name='bedrock',
                region_name=os.getenv('AWS_REGION', 'us-east-1'),
                aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
                aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY')
            )
        else:
            self.client = None

    def list_foundation_models(
        self,
        provider: Optional[str] = None,
        output_modality: Optional[str] = "TEXT"
    ) -> List[BedrockModel]:
        """
        List available foundation models in Bedrock.

        Args:
            provider: Filter by provider (e.g., "Anthropic", "AI21", "Amazon", "Cohere")
            output_modality: Filter by output type (TEXT, IMAGE, EMBEDDING)

        Returns:
            List of available models
        """
        if not self.enabled or not self.client:
            return []

        try:
            # Build filter parameters
            params = {}
            if provider:
                params['byProvider'] = provider
            if output_modality:
                params['byOutputModality'] = output_modality

            # Call Bedrock API
            response = self.client.list_foundation_models(**params)

            models = []
            for model_summary in response.get('modelSummaries', []):
                models.append(BedrockModel(
                    model_id=model_summary['modelId'],
                    model_name=model_summary.get('modelName', model_summary['modelId']),
                    provider=model_summary.get('providerName', 'Unknown'),
                    input_modalities=model_summary.get('inputModalities', []),
                    output_modalities=model_summary.get('outputModalities', []),
                    supports_streaming=model_summary.get('responseStreamingSupported', False),
                    is_available=True
                ))

            return models

        except Exception as e:
            print(f"Error listing Bedrock models: {e}")
            return []

    def get_claude_models(self) -> List[BedrockModel]:
        """Get all available Claude models from Bedrock."""
        return self.list_foundation_models(provider="Anthropic")

    def get_model_details(self, model_id: str) -> Optional[Dict[str, Any]]:
        """
        Get detailed information about a specific model.

        Args:
            model_id: The model ID to query

        Returns:
            Model details or None if not found
        """
        if not self.enabled or not self.client:
            return None

        try:
            response = self.client.get_foundation_model(modelIdentifier=model_id)
            return response.get('modelDetails', {})
        except Exception as e:
            print(f"Error getting model details for {model_id}: {e}")
            return None

    def validate_model_access(self, model_id: str) -> bool:
        """
        Check if a model is accessible with current credentials.

        Args:
            model_id: The model ID to validate

        Returns:
            True if accessible, False otherwise
        """
        if not self.enabled:
            return False

        try:
            # Try to get model details as access check
            details = self.get_model_details(model_id)
            return details is not None
        except Exception:
            return False

    @staticmethod
    def get_default_model() -> str:
        """
        Get the default model ID from environment or fallback.

        Returns:
            Default Bedrock model ID
        """
        return os.getenv(
            "AWS_BEDROCK_DEFAULT_MODEL",
            "anthropic.claude-3-5-sonnet-20241022-v2:0"
        )

    @staticmethod
    def get_available_claude_models() -> List[Dict[str, str]]:
        """
        Get a curated list of Claude models with descriptions.

        Returns:
            List of Claude models with metadata
        """
        return [
            {
                "model_id": "anthropic.claude-3-5-sonnet-20241022-v2:0",
                "name": "Claude 3.5 Sonnet v2",
                "description": "Most intelligent model, best for complex tasks",
                "context_window": "200K tokens",
                "cost_tier": "premium"
            },
            {
                "model_id": "anthropic.claude-3-5-sonnet-20240620-v1:0",
                "name": "Claude 3.5 Sonnet v1",
                "description": "Previous generation Sonnet",
                "context_window": "200K tokens",
                "cost_tier": "premium"
            },
            {
                "model_id": "anthropic.claude-3-sonnet-20240229-v1:0",
                "name": "Claude 3 Sonnet",
                "description": "Balanced performance and speed",
                "context_window": "200K tokens",
                "cost_tier": "standard"
            },
            {
                "model_id": "anthropic.claude-3-haiku-20240307-v1:0",
                "name": "Claude 3 Haiku",
                "description": "Fastest and most compact",
                "context_window": "200K tokens",
                "cost_tier": "budget"
            },
            {
                "model_id": "anthropic.claude-3-opus-20240229-v1:0",
                "name": "Claude 3 Opus",
                "description": "Most powerful for complex analysis",
                "context_window": "200K tokens",
                "cost_tier": "enterprise"
            }
        ]
