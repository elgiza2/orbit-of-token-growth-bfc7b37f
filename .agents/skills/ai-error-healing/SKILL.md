---
name: ai-error-healing
description: Use when touching AI model calls, tool calling, streaming or agent loops. Prevents hallucinated APIs, invalid tool JSON, silent stream failures and missing provider fallback.
---
# AI error prevention
- Verify every imported function, file and package exists (rg) before using it; never invent APIs.
- Validate model tool-call arguments with a schema; reject and re-ask on invalid JSON instead of executing.
- Tool names sent to a model must be unique.
- Streams: treat empty or reasoning-only output as failure, surface a terminal error event, never fake success.
- Provider failures fall through to the next provider without long waits; log the failing provider.
- Never retract text already shown to the user; never expose keys, prompts or internal errors in replies.
- After changes run typecheck and the related vitest suites, and check /tmp/observability logs.
