# Pipeline State and Action Spec

## State fields

```ts
type PipelineState = {
  id: string;
  name: string;
  purpose: string;
  enabled: boolean;
  status: 'working' | 'paused' | 'stopped' | 'degraded' | 'failed';
  uptime_seconds: number;
  restart_count: number;
  current_job_id?: string;
  progress_percent?: number;
  cpu_percent?: number;
  memory_mb?: number;
  allowed_llm_tiers: number[];
  can_rerun: boolean;
  can_pause: boolean;
  can_stop: boolean;
  can_resume: boolean;
};
```

## Actions

- Toggle ON/OFF: enables or disables future automatic work.
- Run: starts now if allowed.
- Pause: keeps current state/checkpoint and stops picking up new work.
- Stop: terminates active job/worker.
- Re-run: starts last job or full pipeline from safe checkpoint.
