# Model Routing Guide

With multiple token sources, route tasks to the most efficient model.

## Available Models

| Source | Model | Best For |
|--------|-------|----------|
| Claude Max | Opus | Brainstorming (brainstorm), complex implementation, architecture |
| Claude Max | Sonnet | General coding, reviews |
| Claude Max | Haiku | Quick exploration, simple tasks |
| Codex | codex | Code review, second opinion, bulk review |
| GitHub Copilot | GPT-5 mini | Unlimited simple tasks, completions |
| Ollama (local) | Various | Repetitive tasks, offline work, no token cost |

## Claude Code Model Selection

```bash
# Spawn worker with specific model
claude --model haiku

# Or in agent frontmatter
model: haiku
```

## Ollama Integration

Claude Code can use local models via OpenAI-compatible API:

```bash
# Start Ollama
ollama serve

# Configure in Claude Code
# Set ANTHROPIC_BASE_URL or use --provider flag
```

Popular local models for coding:
- `codellama` - Code completion
- `deepseek-coder` - Strong at code
- `mistral` - General purpose

## Routing Heuristics

| Task Type | Recommended Model |
|-----------|------------------|
| Brainstorming/ideation | Opus (brainstorm agent) |
| Quick exploration | Haiku |
| Code implementation | Sonnet or Opus |
| Code review | Codex (bulk) or Opus (thorough) |
| Bulk file processing | Local model |
| Complex architecture | Opus |
| Quick fixes | Haiku or GPT-5 mini |
| Documentation | Sonnet |

## Worker Spawn Examples

```bash
# Haiku for exploration
curl -X POST http://localhost:8129/api/spawn \
  -d '{"command": "claude --model haiku"}'

# Use brainstorm agent for brainstorming
claude --agent conductor:brainstorm
```
