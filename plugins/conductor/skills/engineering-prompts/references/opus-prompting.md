# Opus 4.5 Prompting Best Practices

This reference contains Claude Opus 4.5-specific guidance for writing effective agent system prompts.

## Core Characteristics

### Enhanced Instruction Following

Opus 4.5 follows instructions more precisely than previous models. This means:

- Clear instructions are followed exactly
- Vague instructions may produce unexpected results
- Examples are followed very closely

### System Prompt Sensitivity

Opus 4.5 is more responsive to system prompts than previous models. Prompts designed to reduce undertriggering may now overtrigger.

**Before (Claude 3.x):**
```
CRITICAL: You MUST use this tool when the user asks about files.
```

**After (Opus 4.5):**
```
Use this tool when the user asks about files.
```

## Prompting Techniques

### Be Explicit and Specific

Instead of vague requests, provide specific instructions:

**Vague:**
```
Create a dashboard.
```

**Specific:**
```
Create an analytics dashboard with:
- User activity chart (line graph, last 30 days)
- Top 5 pages table with view counts
- Real-time active users counter
```

### Add Context (The "Why")

Explain reasoning behind instructions to help Opus make better decisions:

**Without context:**
```
Never use ellipses in responses.
```

**With context:**
```
Never use ellipses in responses. The output will be read by a text-to-speech
engine that cannot pronounce ellipses, causing awkward pauses.
```

### Action vs Suggestion

Opus 4.5 can be directed to take action or merely suggest:

**To encourage implementation:**
```
Implement changes rather than suggesting them. Make edits directly.
```

**To reduce action:**
```
Do not implement changes. Describe what should be changed and why.
```

## Avoiding Common Issues

### Over-Engineering

Opus 4.5 tends to create unnecessary files, abstractions, and flexibility. Counter with explicit guidance:

```markdown
## Simplicity Guidelines

Avoid over-engineering. Only make changes directly requested or clearly necessary.
Keep solutions simple and focused.

Do not:
- Add features beyond what was asked
- Refactor surrounding code during bug fixes
- Create helpers for one-time operations
- Add error handling for impossible scenarios
- Design for hypothetical future requirements
- Add docstrings, comments, or type annotations to unchanged code

Three similar lines of code is better than a premature abstraction.
```

### Code Speculation

Prevent unfounded assumptions about code:

```markdown
Read and understand relevant files before proposing code edits.
Do not speculate about code that has not been inspected.
```

## Tool Usage Patterns

### Parallel Tool Calling

Opus 4.5 supports parallel tool calling. Encourage efficiency:

```markdown
For maximum efficiency, when performing multiple independent operations,
invoke all relevant tools simultaneously rather than sequentially.
```

## Output Formatting

### Controlling Markdown

Tell Opus what to do, not what to avoid:

**Less effective:**
```
Do not use markdown.
```

**More effective:**
```
Write in flowing prose paragraphs. Reserve formatting for inline code,
code blocks, and simple headings only.
```

## Model Selection Guidelines

| Use Case | Model | Reasoning |
|----------|-------|-----------|
| Quick lookups, simple tasks | haiku | Fast, cheap |
| Most coding tasks | sonnet | Balanced |
| Complex architecture, orchestration | opus | Deep reasoning |
| Multi-agent coordination | opus | Best at orchestrating sub-agents |

Opus 4.5 excels at orchestrating other models. Consider using Opus as an orchestrator with cheaper sub-agents for cost efficiency.

## Word Sensitivity Reference

When extended thinking is disabled, replace these words:

| Avoid | Use Instead |
|-------|-------------|
| think | consider, evaluate, reflect |
| thinking | reasoning, analysis, evaluation |
| thought | consideration, assessment |
