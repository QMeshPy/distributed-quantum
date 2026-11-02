import asyncio
import json
from types import SimpleNamespace

import httpx
import pytest
from nearai_inference_sdk.utils.errors import verification_failure

from services.groq_agent import complete


@pytest.fixture(autouse=True)
def default_provider(monkeypatch):
    monkeypatch.setenv("AGENT_LLM_PROVIDER", "groq")


def test_tool_results_are_returned_to_model_and_executed_once():
    requests, executed = [], []
    def respond(request):
        body = json.loads(request.content)
        requests.append(body)
        if len(requests) == 1:
            message = {"role": "assistant", "content": None, "tool_calls": [{"id": "call1", "type": "function", "function": {"name": "lookup", "arguments": '{"id":"run1"}'}}]}
        else:
            assert body["messages"][-1]["role"] == "tool"
            assert json.loads(body["messages"][-1]["content"]) == {"result": 42}
            message = {"role": "assistant", "content": "The result is 42."}
        return httpx.Response(200, json={"choices": [{"message": message}]})
    async def invoke(name, args):
        executed.append((name, args))
        return {"result": 42}
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            return await complete([{"role": "user", "content": "Lookup"}], tools=[{"type":"function","function":{"name":"lookup","parameters":{"type":"object"}}}], invoke=invoke, client=client, api_key="test")
    assert asyncio.run(run()) == "The result is 42."
    assert executed == [("lookup", {"id": "run1"})]


def test_rate_limit_is_reported_without_retry():
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(429, headers={"retry-after":"37"}))) as client:
            with pytest.raises(ValueError, match="Wait about 37 seconds"):
                await complete([{"role":"user","content":"hello"}], client=client, api_key="test")
    asyncio.run(run())


def test_missing_key_fails_without_provider_fallback(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    with pytest.raises(ValueError, match="GROQ_API_KEY"):
        asyncio.run(complete([{"role":"user","content":"hello"}]))


def test_chat_uses_existing_platform_tools_without_coinbase_x402(monkeypatch):
    from unittest.mock import AsyncMock, MagicMock
    from services.ai_agent_service import AIAgentService

    completion = AsyncMock(return_value="Draft ready for review.")
    monkeypatch.setattr("services.groq_agent.complete", completion)
    service = AIAgentService.__new__(AIAgentService)
    service.db = MagicMock()
    reply = asyncio.run(service.chat("agent1", "Researcher", "Draft a report", owner_id="user1"))
    assert reply == "Draft ready for review."
    tools = completion.call_args.kwargs["tools"]
    names = {tool["function"]["name"] for tool in tools}
    assert "list_proposals" in names
    assert "get_wallet" in names
    assert not any("x402" in name.lower() for name in names)


def test_storage_proposal_pauses_for_user_without_second_inference():
    def respond(request):
        return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "tool_calls": [{"id": "s1", "type": "function", "function": {"name": "prepare_storage_export", "arguments": "{}"}}]}}]})
    async def invoke(name, args):
        return {"status": "pending", "title": "Draft", "usdc": "0.000001"}
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            return await complete([], tools=[{"function": {"name": "prepare_storage_export"}}], invoke=invoke, client=client, api_key="test")
    assert "Nothing has been uploaded or paid" in asyncio.run(run())


def test_explicit_provider_overrides_env(monkeypatch):
    monkeypatch.setenv("AGENT_LLM_PROVIDER", "groq")
    monkeypatch.setenv("OPENROUTER_MODEL", "nvidia/nemotron-3.5-lightning:free")
    def respond(request):
        assert str(request.url) == "https://openrouter.ai/api/v1/chat/completions"
        return httpx.Response(200, json={"choices": [{"message": {"content": "OpenRouter response"}}]})
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            return await complete([], client=client, api_key="test", provider="openrouter")
    assert asyncio.run(run()) == "OpenRouter response"


def test_invalid_provider_raises_immediately():
    with pytest.raises(ValueError, match="Invalid llm_provider"):
        asyncio.run(complete([], api_key="test", provider="invalid"))


def test_openrouter_uses_only_zero_price_tool_capable_routes(monkeypatch):
    monkeypatch.setenv("AGENT_LLM_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_MODEL", "nvidia/nemotron-3.5-lightning:free")
    def respond(request):
        assert str(request.url) == "https://openrouter.ai/api/v1/chat/completions"
        body = json.loads(request.content)
        assert body["provider"] == {"require_parameters": True, "max_price": {"prompt": 0, "completion": 0}}
        assert "parallel_tool_calls" not in body
        assert body["max_tokens"] == 2048
        return httpx.Response(200, json={"choices": [{"message": {"content": "Draft ready"}}]})
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            return await complete([], client=client, api_key="test")
    assert asyncio.run(run()) == "Draft ready"


def test_openrouter_refuses_paid_model_before_network(monkeypatch):
    monkeypatch.setenv("AGENT_LLM_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_MODEL", "paid/model")
    with pytest.raises(ValueError, match="Only free"):
        asyncio.run(complete([], api_key="test"))


def test_near_missing_model_or_key_fails_closed(monkeypatch):
    monkeypatch.setenv("AGENT_LLM_PROVIDER", "near")
    monkeypatch.delenv("NEAR_MODEL", raising=False)
    monkeypatch.setenv("NEARAI_API_KEY", "test-key")
    with pytest.raises(ValueError, match="NEAR_MODEL"):
        asyncio.run(complete([{"role": "user", "content": "hi"}]))

    monkeypatch.setenv("NEAR_MODEL", "zai-org/GLM-5.1-FP8")
    monkeypatch.delenv("NEARAI_API_KEY", raising=False)
    with pytest.raises(ValueError, match="NEARAI_API_KEY"):
        asyncio.run(complete([{"role": "user", "content": "hi"}]))


def test_near_verifies_every_tool_round_and_populates_attestation_meta(monkeypatch):
    monkeypatch.setenv("AGENT_LLM_PROVIDER", "near")
    monkeypatch.setenv("NEAR_MODEL", "zai-org/GLM-5.1-FP8")
    verified_ids: list[str] = []

    class FakeVerifier:
        async def verify_response(self, completion_id: str):
            verified_ids.append(completion_id)
            return SimpleNamespace(
                id=completion_id,
                signature_kind="provider_tee",
                signature=SimpleNamespace(kind="provider_tee"),
            )

    rounds = 0
    def respond(request: httpx.Request):
        nonlocal rounds
        rounds += 1
        assert str(request.url) == "https://cloud-api.near.ai/v1/chat/completions"
        assert request.headers.get("x-no-aliasing") == "true"
        body = json.loads(request.content)
        if rounds == 1:
            msg = {
                "role": "assistant",
                "content": None,
                "reasoning_content": "internal chain of thought",
                "tool_calls": [{"id": "c1", "type": "function", "function": {"name": "lookup", "arguments": '{"q":"bell"}'}}],
            }
            return httpx.Response(200, headers={"x-request-id": "req-round-1"}, json={"id": "chatcmpl-r1", "choices": [{"message": msg}]})
        # Ensure reasoning_content was not replayed in history
        assert all("reasoning_content" not in m for m in body["messages"])
        msg = {"role": "assistant", "content": "Verified TEE answer."}
        return httpx.Response(200, headers={"x-request-id": "req-round-2"}, json={"id": "chatcmpl-r2", "choices": [{"message": msg}]})

    async def invoke(name, args):
        return {"ok": True, "query": args["q"]}

    meta: dict = {}
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            return await complete(
                [{"role": "user", "content": "Run lookup"}],
                tools=[{"type": "function", "function": {"name": "lookup", "parameters": {"type": "object"}}}],
                invoke=invoke,
                client=client,
                api_key="near-test",
                meta=meta,
                inference_client=FakeVerifier(),  # type: ignore[arg-type]
            )

    reply = asyncio.run(run())
    assert reply == "Verified TEE answer."
    assert verified_ids == ["chatcmpl-r1", "chatcmpl-r2"]
    assert meta == {
        "provider": "near",
        "status": "model_tee_verified",
        "signature_kind": "provider_tee",
        "model": "zai-org/GLM-5.1-FP8",
        "request_id": "req-round-2",
        "rounds": 2,
    }


def test_near_failed_signature_marks_chat_unverified_and_raises_for_non_chat(monkeypatch):
    monkeypatch.setenv("AGENT_LLM_PROVIDER", "near")
    monkeypatch.setenv("NEAR_MODEL", "zai-org/GLM-5.1-FP8")

    class FailingVerifier:
        async def verify_response(self, completion_id: str):
            raise verification_failure("signature.invalid")

    def respond(_request: httpx.Request):
        return httpx.Response(
            200,
            headers={"x-request-id": "req-unverified"},
            json={"id": "chatcmpl-bad", "choices": [{"message": {"role": "assistant", "content": "Reply text"}}]},
        )

    meta: dict = {}
    async def run_chat():
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            return await complete(
                [{"role": "user", "content": "hello"}],
                client=client,
                api_key="near-test",
                meta=meta,
                inference_client=FailingVerifier(),  # type: ignore[arg-type]
            )

    assert asyncio.run(run_chat()) == "Reply text"
    assert meta["status"] == "unverified"
    assert meta["signature_kind"] == "none"

    async def run_headless():
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            await complete(
                [{"role": "user", "content": "analyze"}],
                client=client,
                api_key="near-test",
                meta=None,
                inference_client=FailingVerifier(),  # type: ignore[arg-type]
            )

    with pytest.raises(ValueError, match="verification failed"):
        asyncio.run(run_headless())


def test_near_non_tee_model_rejected_without_fallback(monkeypatch):
    monkeypatch.setenv("AGENT_LLM_PROVIDER", "near")
    monkeypatch.setenv("NEAR_MODEL", "incognito/non-tee")

    def respond(_request: httpx.Request):
        raise verification_failure("policy.model_attestation_required")

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            await complete([{"role": "user", "content": "hello"}], client=client, api_key="near-test")

    with pytest.raises(ValueError, match="not a Confidential TEE model"):
        asyncio.run(run())
