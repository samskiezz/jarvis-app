# Backend Service Map Final

- DashboardStateService: composes all data for first render.
- ResourceMonitorService: Vast, Hostinger, Docker, GPU process metrics.
- PipelineControllerService: toggle/run/pause/stop/rerun.
- QueueService: BullMQ/Temporal job handling.
- AssetForgeService: image/GLB generation orchestration.
- AssetLibraryService: metadata, approval, scene placement.
- LLMRouterService: policy gate, router, LiteLLM, validators.
- CrossCorrelationService: scrape/dedupe/canonicalize/link/conflict score.
- ClaudeAgentBridge: coding tasks, diffs, files, terminal/browser action audit.
- VoiceAlertService: voice input/output and alert broadcasting.
- AuditLogService: immutable event trail.
