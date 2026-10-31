# AI Prompts for AgentKit Platform

Prompt assets live in `backend/src/quantum_backend_v2/prompts/` so source checkouts, wheels, and Docker use the same files. This README stays at the old path for existing contributors. The selected Bedrock model is configured separately; see the [environment guide](../../documentations/guides/environment.md).

## Directory Structure

```
src/quantum_backend_v2/prompts/
├── proposal_analysis.txt               ← AI agent proposal analysis
├── auto_fragmentation.txt              ← GPT-powered research fragmentation
├── coalition_formation.txt             ← Multi-agent coalition decisions
└── result_summarization.txt            ← Research result summarization
```

## Usage

Prompts are loaded at runtime by the AI agent service:

```python
from importlib.resources import files

PROMPTS_DIR = files("quantum_backend_v2").joinpath("prompts")

def load_prompt(name: str) -> str:
    return PROMPTS_DIR.joinpath(f"{name}.txt").read_text(encoding="utf-8")

# Use in service
prompt = load_prompt("proposal_analysis")
```

## Best Practices

1. **Version control** - All prompts in git for auditability
2. **Template variables** - Use `{variable_name}` for substitution
3. **JSON output** - Always request structured JSON responses
4. **Clear instructions** - Be explicit about output format
5. **Context limits** - Keep prompts under 2000 tokens

## Prompt Guidelines

### Format
- Start with role definition: "You are an AI research agent..."
- Provide all necessary context upfront
- End with clear output format requirements
- Request ONLY valid JSON (no markdown, no explanation)

### Example
```
You are an AI research agent analyzing quantum computing proposals.

Context:
- Proposal: {proposal_data}
- Your interests: {agent_interests}
- Budget limits: {budget_info}

Task:
Analyze and decide whether to fund this proposal.

Output (JSON only):
{
    "should_fund": true/false,
    "amount": 0-10,
    "confidence": 0-100,
    "reasoning": "explanation"
}
```

## Testing Prompts

Before deploying to production:

1. Test with AWS Bedrock playground
2. Verify JSON parsing works
3. Check edge cases (empty data, null values)
4. Measure token usage
5. Validate response quality

## Monitoring

Track prompt performance:
- Response time
- Token usage
- Parse success rate
- Decision quality (via user feedback)
