# Final System Architecture

## System shape

```text
Browser UI
  -> API Gateway / Dashboard API
  -> Pipeline Controller
  -> Resource Monitor
  -> Queue/Workflow Engine
  -> Asset Forge Service
  -> LLM Inference Control Plane
  -> Cross-Correlation Daemon
  -> DB / Asset Storage / Audit Logs
```

## Frontend layers

1. React/HTML control layer: all text, numbers, buttons, toggles, charts, and forms.
2. Motion layer: Framer Motion/GSAP for panels, toggles, transitions, progress, drawers.
3. 3D layer: Three.js/R3F for brain, map, GLBs, particles, PBR props, bloom, scanlines.
4. Audio layer: Web Audio API for waveform, voice activity, SFX cues, spoken alerts.

## Backend services

- Dashboard State API: returns all panel data.
- Resource Monitor: Hostinger + Vast + Docker + GPU process stats.
- Pipeline Controller: ON/OFF, Run, Pause, Stop, Re-run.
- Asset Forge: GPT Image 2 + Tripo3D job orchestration.
- LLM Router: hard policy gate + router model/RouteLLM + LiteLLM + validation.
- Cross-Correlation Daemon: scrape, dedupe, canonicalize, conflict score, link entities.
- Claude Agent Bridge: coding task queue, diffs, files, browser, terminal with approval.
- Voice/Alerts: voice commands, spoken updates, alert rules.
- Audit Log: every button, automation, asset generation, coding task, and inference route.

## Correct data rule

Generated images/GLBs are not the data. They visualize the data. All data remains live from APIs, DB, queue, and telemetry services.
