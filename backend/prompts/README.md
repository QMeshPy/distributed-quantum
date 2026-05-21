# AI Prompts for AgentKit Platform

This directory contains all Claude 3.5 Sonnet (AWS Bedrock) prompts used throughout the platform.

## Directory Structure

```
prompts/
├── README.md                           ← This file
├── proposal_analysis.txt               ← AI agent proposal analysis
├── auto_fragmentation.txt              ← GPT-powered research fragmentation
├── coalition_formation.txt             ← Multi-agent coalition decisions
└── result_summarization.txt            ← Research result summarization
```

## Usage

Prompts are loaded at runtime by the AI agent service:

```python
from pathlib import Path

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"

def load_prompt(name: str) -> str:
    return (PROMPTS_DIR / f"{name}.txt").read_text()

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
