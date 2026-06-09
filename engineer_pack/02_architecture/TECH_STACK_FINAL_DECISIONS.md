# Tech Stack Final Decisions

## Use

- React/Next.js or Vite + TypeScript for frontend.
- Tailwind for UI styling.
- Framer Motion for UI transitions.
- GSAP for cinematic timelines.
- Three.js + React Three Fiber + Drei for 3D.
- React Postprocessing for bloom/depth/FX.
- Zustand for local UI state.
- TanStack Query for API data.
- Recharts/ECharts/uPlot for charts.
- WebSocket or SSE for live updates.
- Web Audio API for voice-reactive visuals and SFX.
- Redis + BullMQ for queue control; Temporal where durable long-running workflows matter.
- LiteLLM Proxy for model gateway.
- vLLM/Ollama for local inference.
- RouteLLM or trained Llama 3B router for model routing.
- OpenTelemetry + Prometheus/Grafana for observability.
- OpenAI GPT Image 2 for image assets.
- Tripo3D for GLB/PBR assets.

## Do not use

- A single huge background image for the whole UI.
- Baked-in numbers or fake charts inside images.
- GLBs for readable text.
- Unbounded bloom/particles on low-end devices.
- 70B models as hot default background workers.
