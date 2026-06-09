# Panel-by-Panel Final Spec

## Command Bar
- JARVIS title, status, data updated time.
- Search.
- Run All, Pause All, Stop All, Sleep Mode.
- Quality selector: Cinematic / Balanced / Performance / Safe.

## KPI Strip
- 7 top cards with live stats and sparklines.
- Must animate changes but remain readable.

## Inference Fabric
- Shows six-tier model system.
- Shows model residency HOT/WARM/COLD/OFF.
- Shows avoided GPU calls, blocked escalations, last routing decisions.
- Every row has "Why?" detail.

## Infrastructure
- Vast GPU Box: per GPU, VRAM, processes, model memory, temp, power, disk, network.
- Hostinger VPS: CPU/RAM/disk/load, per-core bars, Docker, restart loops, IOPS, swap.

## Automation Pipelines
- Each row has Name, Purpose, Status, Uptime, Resources, ON/OFF toggle, Run, Pause, Stop, Re-run.
- Toggle changes whether service is allowed to run.
- Pause keeps state. Stop terminates. Re-run restarts from checkpoint.

## Cross-Correlation Daemon
- Scrape sources, primary jobs, confidence/conflict cards, controls.
- Must default to deterministic matching before LLM.

## Live Activity
- Newest-first feed with event type, tier/model, timestamp, and detail drawer.

## Knowledge Graph & Ontology
- Ontology count grid, newest facts, newest topics, 3D graph/lattice.

## Coding Workspace · Claude Agent
- Chat, Diff, Files, Terminal, Browser.
- Coding task queue with progress.
- Approval, Queue, Auto-Continue, Request Review.
- Terminal/browser actions require audit and guardrails.

## Voice Command & Alerts
- Voice Active mic, waveform, Speak/Mute/Listen/Broadcast.
- Spoken alerts for high-priority events.

## Asset Forge
- Text-to-image, image edit, text-to-GLB, image-to-GLB, optimize GLB, add to scene.
- Saves prompt, provider, model, outputs, thumbnails, costs, approval state.
