# CELESTIAL CATALOG — the complete, real-data hierarchy (source of truth for jarvis_live.html)

Tier order (confirmed): **Apex Core > PLANET (feature) > MOON (contained thing) > SATELLITE (flow page/control) > METEORITE (live info item) > DUST (records — smallest, count-true)**.
Every entry below is real (DOCK, APP_MOONS, WORLD_MANIFEST, /metrics, /agent/tools, /suggestions, /library). Nothing invented, nothing left out. Every body carries its name label on top.

## P1 Mini Apps (lane ui, I=0.96) — THE app menu planet
| Moon (= real mini app, click opens it) | Satellites (= its flow pages/controls, click runs the real fn) |
|---|---|
| 🎤 Talk (`$('say').focus()`) | Voice Input (`micToggle()`), Chat |
| 📚 Library (`setMode('library')`) | Gallery, Refresh Media (`loadLib()`) |
| ✨ Create | Image (`quick('image')`), 3D Model (`quick('gen3d')`) |
| 🎨 Image (`quick('image')`) | Generate Image |
| 🧊 3D (`quick('3d')`) | Generate 3D |
| 🛡 Guardian → gateway to planet P8 | Live Monitor, Talk to Room |
| 🌡 Climate → gateway to planet P10 | Zones |
| 🛰 Live Tasks (`setMode('worklist')`) | Active Tasks, Approvals |
| 🤖 Agent OS → gateway to planet P5 | Tool Palette (`openAgentTools()`) |
| 🩺 Vitals (`openVitals()`) | Alerts, Services, Gauges |
| ⚙ Upgrades → gateway to planet P6 | Proposals, Build Next (`openUpgrades()`) |

Meteorites: live health alerts (orbit Vitals), latest suggestion (orbits Upgrades gateway). Dust: none structural.

## P2 Knowledge / Ontology (knowledge, I=0.92)
Moons = the 16 existing domain GALAXIES re-parented into orbit (GLBs + recursive ⏎Enter-system children kept intact): Measurement 111,558 · DataSource 92,000 · Document 34,331 · DomainSubject 10,000 · Topic 7,031 · SpeciesOccurrence 3,136 · ScientificPublication 3,100 · Vulnerability 1,260 · AcquisitionPoint 1,000 · Place 544 · Asset 430 · Concept 309 · EarthquakeEvent 269 · Event 86 · Sensor 25 · AppPage 17.
Satellites: each domain's existing recursive entity systems (already built by buildGalaxySystem). Meteorites: live KPI counters absorbed — Build % (kpi:Topic), Notes (kpi:Note), Ontology objects (kpi:Ontology), Measurements counter (kpi:Measurement). Dust: per-domain clouds, density ∝ log10(true count), card shows the true count.

## P3 Automation / Runners (automation, I=0.93)
Moons = the 6 real runners: 🧠 Knowledge Builder · 🔗 Cross-Correlator · 📰 Document Ingestor · 🌍 Live Data Producer · 🤖 Self-Learning Loop · ⚙ Heavy Worker (absorbs `pipe:*` bodies — live on/off colour + labels keep flowing).
Satellites: per-runner Detail/Logs (drill `runner:` actions on card). Meteorites: stopped/crashed workers, idle-pipeline warning. Dust: lessons/feedback records.

## P4 Infrastructure (infrastructure, I=0.88)
Moons: VPS Server (absorbs `infra:vps`) · Vast GPU Box (absorbs `infra:vast`) · PM2 Processes · Storage · Network · Docker/Swarm.
Satellites of PM2 = the 11 real services: jarvis-backend, jarvis-dashboard, jarvis-tasks, jarvis-voiceclone, jarvis-watchdog, underworld-backend, apex-orchestrator, kgik-python, laravel-reverb, laravel-web, pm2-logrotate. Meteorites: live `health.alerts` (now: "GPU brain offline" critical, "Knowledge pipeline idle" warn). Dust: metric history.

## P5 Agent OS (intelligence, I=0.84)
Moons: Tool Registry · Planner/Executor · Approvals.
Satellites of Tool Registry = the 23 REAL agent tools (risk-coloured): accessibility.captions/.read_screen/.set_mode/.speak/.status/.text_scale, agent.memory.search/.write, docker.prune.safe/.usage.inspect, file.read/.search/.write, gpu.status.inspect, knowledge.stats, server.cpu.inspect/.disk.audit/.logs.read, storage.duplicates.find/.folder.compress/.large_files.find/.manifest.create/.restore. Meteorites: recent runs. Dust: run history. (Absorbs `agentos` body.)

## P6 Self-Development (intelligence, I=0.80) — absorbs `selfdev`
Moons: Suggestions · Proposals · Upgrade Builder · Rollback/Scheduler. Satellites: Generate, Open proposal, Build next, Approve. Meteorites: latest live suggestions. Dust: FEATURES history.

## P7 Media / GLB Studio (media, I=0.70)
Moons: GLB Library (1,638, absorbs `kpi:GLBs`) · Generated Models · Image Studio · Model Loader. Satellites: Open Studio, Open Library, Refresh. Meteorites: the 6 newest GLBs (live: street light, speed bump, solar farm array, sewage treatment, sea wall, roundabout). Dust: 1,638-asset cloud.

## P8 Guardian (guardian, I=0.68) — absorbs `guardian`
Moons: Live Monitor · Life-Safety Rules. Satellites: Open Guardian, Talk to Room. Meteorites: active guardian alerts. Dust: event history.

## P9 Voice / TTS (voice, I=0.58)
Moons: TTS Engine · Voice Modulator. Satellites: Speak Test (`readStatus()`), Voice Input. Meteorites: recent TTS errors. Dust: audio cache records.

## P10 Climate (guardian lane, I=0.60) — absorbs `climate`
Moons: Zones · Climate Intent. Satellites: zone actions. Meteorites: active climate events.

## P11 Budget / Token Governor (budget, I=0.56)
Moons: Budget State ($ spent/cap live) · Economy Mode. Satellites: Toggle Archon. Meteorites: budget warnings. Dust: spend records.

## P12 Inference Fabric (intelligence, I=0.82)
Moons: LLM Router (85,173 routed, absorbs `sys:router`) · Tiered Models · GPU Fallback.
Satellites of Tiered Models = the 7 real tiers (absorb `tier:*`): base/llama3.1:8b 153,470 · strong/qwen2.5:32b 63,344 · kimi-k2.6 113 · claude-sonnet-4-5 22 · heavy→strong 1 · micro 1 · openai 1. Meteorites: routing/feed warnings. Dust: routed-call records.

## P13 Correlation / Graph (knowledge, I=0.72) — absorbs `sys:corr`
Moons: Knowledge Graph · Graph Stream · Layout Engine · Entity Dedupe. Satellites: Open graph, Focus node. Meteorites: ingest spikes. Dust: ont_link records.

## P14 Documents / Ingestion (knowledge, I=0.74)
Moons: Document Vault (34,331, absorbs `kpi:Document`) · OCR/Scrape Ingest · Source Chunks. Satellites: Open, Summarise, Re-run. Meteorites: latest batches. Dust: the 34k-document cloud (largest single dust cloud).

## P15 Underworld (underworld, I=0.50)
Moons: Underworld Web · Backend · Scene Components. Satellites: Open Underworld. Dust: scene assets.

## Absorption map (old body → new home; no duplicates remain)
`app:*`+`feature:*` ring → retired (Mini Apps planet) · `kpi:Topic/Note/Ontology/Measurement` → P2 · `kpi:Document` → P14 · `kpi:GLBs` → P7 · `infra:vast/vps` → P4 · `sys:corr` → P13 · `sys:router` → P12 · `pipe:*` → P3 · `tier:*` → P12 · `guardian/selfdev/climate/agentos` → P8/P6/P10/P5 · `dom:*` galaxies → P2 moons (systems intact) · topic nebulae → backdrop (kept) · Apex core, dock bar, panels, swarm, voice bar → untouched.

## Spatial law
Planet D(I)=220+(1−I)^1.35·630 spec-units ×30 (forward of the POV, semantic lane angles, golden spacing, apex clear zone 165×30, collision relax). Moon orbit = planetR+moonR+(18+4√children)×30. Satellite ring = moon×2.2. Meteorite belt outside satellites, faster + pulsing. Dust shell outermost. Sizes: planet lerp(10,34,I^.72) > moon ×lerp(.26,.42) > satellite ×lerp(.12,.22) > meteorite ×lerp(.55,.85) > dust .08–.45 — all ×30, strict ordering. Everything always visible (dots + LOD); every body labelled with its name on top.
