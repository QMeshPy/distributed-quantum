"""Provider-selected inference with local tools and no paid or automatic provider fallback."""
from __future__ import annotations

import json
import logging
import math
import os
from typing import Any, Literal

import httpx
from nearai_inference_sdk import (
    DEFAULT_NEAR_AI_CLOUD_BASE_URL,
    NO_ALIASING_HEADER,
    ApiError,
    InferenceClient,
    ModelAttestationPolicy,
    ModelVerificationOptions,
    VerificationError,
)
from quantum_backend_v2.config import constants as C

AgentLlmProvider = Literal["groq", "openrouter", "near"]

PROVIDERS: dict[str, dict[str, Any]] = {
    "groq": {
        "label": "Groq",
        "key_env": "GROQ_API_KEY",
        "model_env": "GROQ_MODEL",
        "default_model": C.GROQ_MODEL,
        "endpoint": "https://api.groq.com/openai/v1/chat/completions",
        "token_field": "max_completion_tokens",
    },
    "openrouter": {
        "label": "OpenRouter",
        "key_env": "OPENROUTER_API_KEY",
        "model_env": "OPENROUTER_MODEL",
        "default_model": C.OPENROUTER_MODEL,
        "endpoint": "https://openrouter.ai/api/v1/chat/completions",
        "token_field": "max_tokens",
    },
    "near": {
        "label": "NEAR AI Cloud",
        "key_env": "NEARAI_API_KEY",
        "model_env": "NEAR_MODEL",
        "default_model": "",
        "endpoint": f"{DEFAULT_NEAR_AI_CLOUD_BASE_URL.rstrip('/')}/chat/completions",
        "token_field": "max_tokens",
    },
}


def resolve_provider(explicit: str | None) -> str:
    """Resolve provider from explicit override or AGENT_LLM_PROVIDER env."""
    if explicit is not None:
        provider = explicit.strip().lower()
        if provider not in PROVIDERS:
            raise ValueError(f"Invalid llm_provider '{explicit}'. Must be groq, openrouter, or near.")
        return provider
    return os.getenv("AGENT_LLM_PROVIDER", "groq").split("#")[0].strip().lower()


def list_agent_llm_providers() -> list[dict[str, Any]]:
    """List available LLM providers with configuration status."""
    providers = []
    for provider_id, cfg in PROVIDERS.items():
        key_env = cfg["key_env"]
        configured = bool(os.getenv(key_env, "").strip())
        providers.append({
            "id": provider_id,
            "label": cfg["label"],
            "configured": configured,
        })
    return providers


async def complete(
    messages: list[dict],
    *,
    tools: list[dict] | None = None,
    invoke=None,
    client: httpx.AsyncClient | None = None,
    api_key: str | None = None,
    meta: dict[str, Any] | None = None,
    inference_client: InferenceClient | None = None,
    provider: str | None = None,
) -> str:
    provider = resolve_provider(provider)
    if provider not in PROVIDERS:
        raise ValueError("Provider must be groq, openrouter, or near.")
    cfg = PROVIDERS[provider]
    label = cfg["label"]
    key_name = cfg["key_env"]
    model = os.getenv(cfg["model_env"], cfg["default_model"]).split("#")[0].strip()
    if provider == "openrouter" and not (model.endswith(":free") or model == "openrouter/free"):
        raise ValueError("Only free OpenRouter models are permitted for this demo.")
    if provider == "near" and not model:
        raise ValueError("NEAR_MODEL must be set to a Confidential TEE model ID when AGENT_LLM_PROVIDER=near.")
    key = api_key or os.getenv(key_name)
    if not key:
        raise ValueError(f"{key_name} is not configured on the backend.")

    if provider == "near" and client is None and inference_client is None:
        async with InferenceClient(
            api_key=key,
            model_verification=ModelVerificationOptions(policy=ModelAttestationPolicy()),
        ) as owned_near:
            async with owned_near.http_client as owned_http:
                return await complete(
                    messages,
                    tools=tools,
                    invoke=invoke,
                    client=owned_http,
                    api_key=key,
                    meta=meta,
                    inference_client=owned_near,
                    provider=provider,
                )
    if client is None:
        async with httpx.AsyncClient(timeout=60) as owned:
            return await complete(
                messages,
                tools=tools,
                invoke=invoke,
                client=owned,
                api_key=key,
                meta=meta,
                inference_client=inference_client,
                provider=provider,
            )

    endpoint = cfg["endpoint"]
    history = list(messages)
    allowed = {tool["function"]["name"] for tool in tools or []}
    round_statuses: list[str] = []
    round_signatures: list[str] = []
    last_request_id: str | None = None

    for round_index in range(1, 9):
        payload: dict[str, Any] = {
            "model": model,
            "messages": history,
            cfg["token_field"]: 2048,
        }
        if provider == "openrouter":
            payload["provider"] = {"require_parameters": True, "max_price": {"prompt": 0, "completion": 0}}
        if tools:
            payload.update(tools=tools, tool_choice="auto")
            if provider == "groq":
                payload["parallel_tool_calls"] = False

        headers = {"Authorization": f"Bearer {key}"}
        if provider == "near":
            headers[NO_ALIASING_HEADER] = "true"

        try:
            response = await client.post(endpoint, headers=headers, json=payload)
        except (ApiError, VerificationError) as exc:
            logging.getLogger(__name__).warning("%s preflight/verification failed: %s", label, exc)
            if getattr(exc, "failure", None) and exc.failure.code == "policy.model_attestation_required":
                raise ValueError(
                    f"NEAR_MODEL '{model}' is not a Confidential TEE model with attestation support. "
                    "No fallback provider was used."
                ) from exc
            if getattr(exc, "failure", None) and exc.failure.code == "api.http_status" and exc.failure.details.get("status") == 404:
                raise ValueError(
                    f"NEAR_MODEL '{model}' was not found in the NEAR AI Cloud catalog (HTTP 404). "
                    "Use a canonical Confidential TEE model ID from /v1/model/list (e.g. z-ai/glm-5.3-flash). "
                    "No fallback provider was used."
                ) from exc
            raise ValueError(f"{label} attestation verification failed ({exc}). No fallback provider was used.") from exc

        request_id = response.headers.get("x-request-id") or response.headers.get("X-Request-Id")
        if request_id:
            last_request_id = request_id
            logging.getLogger(__name__).info("%s X-Request-Id: %s (round %d)", label, request_id, round_index)

        if response.status_code == 429:
            try:
                seconds = max(1, math.ceil(float(response.headers.get("retry-after", ""))))
                wait = f"Wait about {seconds} seconds before sending another message."
            except (ValueError, OverflowError):
                wait = "Please wait before sending another message."
            raise ValueError(f"{label} rate limit reached. {wait}")
        if response.status_code == 402:
            raise ValueError(
                f"{label} returned HTTP 402 (insufficient credits or spend limit reached). "
                "No fallback provider was used."
            )
        if response.status_code != 200:
            logging.getLogger(__name__).warning("%s response: HTTP %s", label, response.status_code)
            raise ValueError(f"{label} request failed (HTTP {response.status_code}). No paid fallback was used.")

        body = response.json()
        if provider == "near":
            completion_id = body.get("id")
            if not last_request_id and isinstance(completion_id, str):
                last_request_id = completion_id
            round_status, sig_kind = await _verify_near_round(inference_client, completion_id, meta)
            round_statuses.append(round_status)
            round_signatures.append(sig_kind)

        message = body["choices"][0]["message"]
        calls = message.get("tool_calls") or []
        if not calls:
            if provider == "near" and meta is not None:
                _populate_near_meta(meta, model, round_statuses, round_signatures, last_request_id, round_index)
            return message.get("content") or "No response was returned. Please try again."
        # Replay only standard OpenAI fields; never replay reasoning_content into history.
        history.append({k: message[k] for k in ("role", "content", "tool_calls") if k in message})
        for call in calls:
            function = call["function"]
            try:
                if function["name"] not in allowed or invoke is None:
                    raise ValueError("Unknown tool")
                arguments = json.loads(function["arguments"])
                if not isinstance(arguments, dict):
                    raise ValueError("Tool arguments must be an object")
                logging.getLogger(__name__).info("Agent tool: %s", function["name"])
                result = await invoke(function["name"], arguments)
                if function["name"] == "prepare_storage_export" and isinstance(result, dict) and result.get("status") == "pending":
                    if provider == "near" and meta is not None:
                        _populate_near_meta(meta, model, round_statuses, round_signatures, last_request_id, round_index)
                    return f"I think we should store **{result['title']}**. Please review the exact content in the approval card below. It will be public on IPFS and costs {result['usdc']} test USDC on Base Sepolia. Approve the card or reply yes. Nothing has been uploaded or paid yet."
            except Exception as exc:
                logging.getLogger(__name__).warning("Agent tool failed: %s (%s)", function["name"], type(exc).__name__)
                result = {"error": "Tool execution failed. Do not claim success or repeat a payment."}
            history.append({"role": "tool", "tool_call_id": call["id"], "content": json.dumps(result, default=str)})
    raise ValueError("Agent reached its tool-call limit. Completed actions were not replayed.")


async def _verify_near_round(
    inference_client: InferenceClient | None,
    completion_id: Any,
    meta: dict[str, Any] | None,
) -> tuple[str, str]:
    """Verify a single NEAR completion round fail-closed."""
    if inference_client is None or not isinstance(completion_id, str) or not completion_id:
        if meta is None:
            raise ValueError("NEAR AI Cloud response could not be verified (missing completion ID or verifier).")
        return "unverified", "none"
    try:
        verified = await inference_client.verify_response(completion_id)
    except (ApiError, VerificationError) as exc:
        logging.getLogger(__name__).warning("NEAR AI Cloud response verification failed for %s: %s", completion_id, exc)
        if meta is None:
            raise ValueError(f"NEAR AI Cloud response verification failed ({exc}). No fallback provider was used.") from exc
        return "unverified", "none"
    sig_kind = getattr(verified, "signature_kind", None) or getattr(verified.signature, "kind", "none")
    if sig_kind == "provider_tee":
        return "model_tee_verified", "provider_tee"
    if sig_kind == "gateway":
        return "gateway_verified", "gateway"
    if meta is None:
        raise ValueError("NEAR AI Cloud response returned an unverified signature kind.")
    return "unverified", str(sig_kind)


def _populate_near_meta(
    meta: dict[str, Any],
    model: str,
    statuses: list[str],
    signatures: list[str],
    request_id: str | None,
    rounds: int,
) -> None:
    if not statuses or any(s == "unverified" for s in statuses):
        overall = "unverified"
    elif all(s == "model_tee_verified" for s in statuses):
        overall = "model_tee_verified"
    else:
        overall = "gateway_verified"
    sig_kind = (
        "provider_tee"
        if overall == "model_tee_verified"
        else ("gateway" if overall == "gateway_verified" else (signatures[-1] if signatures else "none"))
    )
    meta.update(
        provider="near",
        status=overall,
        signature_kind=sig_kind,
        model=model,
        request_id=request_id,
        rounds=rounds,
    )
