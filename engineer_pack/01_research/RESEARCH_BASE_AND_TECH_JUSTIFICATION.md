# Research Base and Tech Justification

The pack uses official/current docs for the final choices.

- OpenAI Image Generation API: use GPT Image models including gpt-image-2 for text-to-image and image editing. Use these assets for backgrounds, textures, icons, visual references, and panel art. Do not bake dynamic dashboard text into images.
- Tripo3D-style 3D generation: use text-to-3D and image-to-3D for GLB models, with PBR textures where available. Use this for floating props, neural brain pieces, map objects, GPU/server props, pipeline nodes, and Asset Forge outputs.
- Three.js GLTFLoader / React Three Fiber: load GLB/glTF into the browser scene. Add explicit disposal for textures/geometry and quality modes to avoid memory leaks.
- React Postprocessing Bloom: use selective bloom/HDR emissive materials for the holographic look.
- LiteLLM Proxy: central LLM gateway for routing, load balancing, fallbacks, retries, budgets, and model aliases.
- vLLM Production Stack / KV-cache-aware routing: future/scale path for cache-aware production inference; immediate local implementation can still use vLLM per model.
- RouteLLM: weak-vs-strong model routing, useful for deciding 8B vs Qwen 32B after hard policy gates.
- BullMQ / Temporal: BullMQ is enough for near-term queue pause/resume/progress; Temporal is better for durable long-running coding and overnight workflows.
- OpenTelemetry: use for metrics/traces/logs across API, workers, queues, and frontend.

See research_sources.csv for source URLs and why each source was used.
