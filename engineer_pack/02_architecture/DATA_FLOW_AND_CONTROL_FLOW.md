# Data Flow and Control Flow

## Live render flow

```text
Initial page load
  -> GET /api/dashboard/state
  -> render panels
  -> connect SSE/WebSocket
  -> apply incremental updates
```

## Pipeline control flow

```text
User clicks ON/OFF / Run / Pause / Stop / Re-run
  -> API validates permission and mode
  -> command goes to pipeline controller
  -> queue/workflow updated
  -> audit event written
  -> dashboard receives event update
```

## Asset generation flow

```text
Prompt entered in Asset Forge
  -> budget/approval check
  -> GPT Image 2 or Tripo3D job queued
  -> job progress streamed
  -> output saved to asset library
  -> user previews
  -> user approves
  -> asset added to scene manifest
```

## LLM routing flow

```text
Task created
  -> hard no-LLM policy check
  -> worker tier permission
  -> resource gate
  -> router model/RouteLLM if ambiguous
  -> LiteLLM gateway
  -> vLLM/Ollama/external model
  -> validator
  -> save or escalate with recorded reason
```
