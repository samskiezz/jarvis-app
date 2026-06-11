# UNIVERSE_SPEC — NASA-Eyes-Style 3D Data Ontology Universe (CANONICAL MASTER SPEC)

> Reference: NASA "Eyes on Asteroids" (eyes.nasa.gov/apps/asteroids) — copy the FEATURE/FUNCTION structure
> (real-time data, orbit relationships, zoom layers, object focus, timeline, missions, close approaches,
> interactive detail panels, scrollytelling), NOT the branding or source. Build it in server/jarvis_live.html
> + backend (server/dashboard.py + services). Every swarm touching the universe MUST build to THIS spec.

## CORE RULE (non-negotiable)
Nothing in the universe is decorative. Every object must answer: what real thing does it represent · what
data does it contain · what feature does it belong to · what can the user do with it · what service powers it ·
what relationships does it have · what happens when it changes. If it can't answer those, it must not exist.

## 1. CENTRE = AI BRAIN CORE (not a normal sun)
- Visual: huge black-hole / reactor hybrid with a holographic morphing FACE inside; face animates + lip-syncs
  when the AI speaks; gravitational-lensing effect; pulsing neural data streams; orbiting memory shards; voice
  waveform field; visible from almost anywhere.
- Means: main AI reasoning system, session intelligence, memory, decision engine, routing brain, NL interface,
  agent coordinator, knowledge-graph controller.
- Actions: talk_to_ai, ask_question, run_reasoning, open_system_map, inspect_memory, trigger_workflow.
- model: black_hole_holographic_reactor_face.glb (jarvis_iron_man_helmet.glb on the reactor for now).

## 2. UNIVERSE OBJECT MAPPING (every object = a real thing)
- AI CORE = brain / command intelligence.
- GALAXY = major product domain (atmosphere per domain; zoom entry point).
- PLANET = major feature/module — UNIQUE custom GLB per planet, own material language, live status, owns
  datasets/moons/satellites/workflows/events.
- MOON = sub-feature / tool inside a module.
- SATELLITE = executable action / Docker mini-app / API service / automation worker / backend function
  (run task, health, execute endpoint, logs, schema, restart, queue).
- ASTEROID = dataset / records / files / logs (hover=summary, click=dataset browser, schema, rows, export,
  filter, versions).
- METEOR = event / incident / alert / urgent item / deadline / failed workflow / risk (real-time, click→resolve,
  urgency, owner, next action).
- COMET = recurring workflow / scheduled journey / periodic review / automated loop (schedule, recurrence,
  pause, run-now, history).
- PROBE = running job / AI agent / automation / data-sync process (live animation, progress, source→dest, logs).
- WORMHOLE = integration / external API / deep link / cross-domain relationship (jump, inspect, sync, test, health).
- NEBULA = topic cluster / semantic category / knowledge area (zoom into topic, filter universe, ask AI).

## 3. ZOOM LAYERS (depth reveals detail)
- L0 Universal: AI Core + galaxies/domains + system health + urgent meteors + top workflows.
- L1 Galaxy: one domain + its planets/features + domain stats + events.
- L2 Planet: one feature + moons + satellites + asteroids + orbit-rings/workflows (end-to-end).
- L3 Moon: sub-feature detail + small datasets + action satellites + tasks + config.
- L4 Satellite: execution layer — Docker mini-app, API endpoints, inputs/outputs, logs, queues, health.
- L5 Dataset: schema, records, filters, charts, relationships, provenance, audit.
- L6 Event/Meteor: alert detail, timeline, cause, severity, affected user/feature, resolution workflow.
- L7 Workflow/Orbit: full path — start, current, blocked, completed steps + automation probes moving through.

## 4. RELATIONSHIP / DISTANCE / ORBIT RULES (data-driven, not random)
- DISTANCE from AI Core = dependency on the brain. distance = base_domain + dependency + activity + complexity.
  (close = live AI/reasoning/memory/router; far = static docs/archives/old logs).
- SIZE = importance/usage/data weight. size = base * importance * usage * criticality.
- ORBIT SPEED = activity/update-frequency/urgency. speed = activity + update_freq + urgency.
- ORBIT LAYER = hierarchy: Core → Galaxy → Planet → Moon → Satellite → Asteroid → Meteor/Event.
- ORBIT SHAPE = relationship type: circular=stable direct · elliptical=recurring · crossing=shared dependency ·
  broken=blocked/incomplete · glowing=active workflow · red=risk/failure · dotted=optional · thick=high volume.
- Layout still uses golden-angle 137.50776° / Vogel spiral / φ; this spec OVERLAYS real meaning onto it.

## 5. INTERACTION RULES
- HOVER: name · plain-language meaning · object type · status · parent · last-updated · one-line summary · primary action.
- CLICK: full panel — plain + technical explanation · real-world entity · related data/tasks · connected Docker
  service · inputs · outputs · actions · history · permissions · status · errors · audit trail.
- DOUBLE-CLICK / primary action: run workflow / open dataset / talk to AI about it / start guided journey /
  generate report / create task / resolve alert.
- RIGHT-CLICK / long-press: Ask AI about this · open details · view data · view workflows · run action · copy link ·
  pin · hide unrelated · show dependencies · show execution logs.

## 6. AI CORE BEHAVIOUR
Morphing holographic face + lip-sync/waveform + neural light streams + energy pulses when processing; sends
beams/probes to features when answering; opens portals to relevant data. Functionally: answer, explain objects,
guide, search across universe, trigger workflows, summarise datasets, generate reports, recommend next steps,
detect missing data, explain relationships, show visual paths. e.g. "What do I need to do next?" → highlight
urgent meteors, pull closest-tasks panel, send probes to relevant planets, open next workflow, explain plainly.

## 7. DATASET INTERACTOR (each asteroid)
Panel: schema · records · filters · search · linked features/workflows · owner · source · last-sync · freshness ·
privacy level · export · AI summary · visual graph · timeline. Types: profile, assessment, support-plan,
research, document, communication, task, event, audit, integration, model-output.

## 8. DOCKER MINI-APP SYSTEM (each satellite registers into the universe)
Required endpoints per service: GET /health · GET /service-info · GET /schema · GET /actions ·
POST /actions/{name} · GET /logs · GET /events. service-info returns id, name, object_type, parent_feature,
domain, description_plain, description_technical, inputs, outputs, actions.

## 9. FEATURE REGISTRY (DB-driven — no frontend-only hardcoding)
Stores per object: object_id, object_type, name, description_plain, description_technical, domain, parent_id,
service_id, dataset_ids, workflow_ids, visual_model_url, icon_url, position_mode, orbit_parent_id, orbit_radius,
orbit_speed, importance_score, activity_score, criticality_score, accessibility_label, permissions, status,
created_at, updated_at. The universe renders FROM this registry (a /registry or /worlddata endpoint).

## 10. GLB ASSIGNMENT (custom per object — no generic spheres)
Planets: AI Companion=neural-avatar · Daily Routine=clockwork-city · Communication=soundwave-crystal ·
Research=lab-archive · Documents=vault/library · Notifications=beacon-tower · Analytics=glass-data-city ·
Caregiver=command-station · Workflow=mechanical-orbital-gear · Accessibility=adaptive-sanctuary.
Moons: visual-schedule=calendar · reminder=bell/clockwork · speech=waveform · notes=notebook · assessment=scanner ·
consent=signed-scroll. Satellites: docker=orbital-server · API=antenna-array · queue=cargo-drone · AI=neural-probe ·
notify=signal-satellite · parser=scanner · report=fabricator. Datasets: profile=crystal-archive · research=glowing-asteroid ·
logs=sediment-rock · documents=sealed-vault · tasks=metallic-shards · audit=black-box-recorder.

## 11. INITIAL DOMAINS (galaxies)
AI Core (brain, memory, reasoning, router, prompt engine, conversation history, model settings, voice, safety) ·
User Support (profile, accessibility prefs, daily routine, communication support, support notes, goals, care plan) ·
Research (participants, consent, datasets, assessment, outcomes, study timeline, evidence library, report gen) ·
Workflow (builder, task queue, automation rules, approval gates, human review, completed, failed) ·
Data (database, file storage, schema registry, event store, audit logs, data quality, backup) ·
Integration (calendar, email, document, API gateway, auth, notification provider, external research) ·
Admin (user mgmt, permissions, service health, logs, billing/usage, settings, deployment).

## 12. ACCESSIBILITY (this is for disabled / cognitive-support users + caregivers + researchers)
Modes: Simple · Detailed · Caregiver · Researcher · Admin · Developer · Low-Stimulation · High-Contrast ·
Read-Aloud · Keyboard-Only · Screen-Reader. EVERY 3D interaction MUST have a 2D equivalent: 3D planet map =
feature list · orbit path = workflow checklist · meteor alert = urgent task card · AI visual speech = text transcript.
Reduced-motion mode. Plain, respectful, accessible language in public UI.

## 13. NASA-PARITY CHECKLIST
full-screen 3D, no download, real-time sim, zoomable, AI-core centre, galaxies, planets, moons, satellites,
asteroids, meteors, comets, probes, wormholes, nebulas, hover cards, detail panels, search-everything, focus
camera, follow moving job, timeline slider + play/pause + past/future playback, mission/guided mode, closest/urgent
panel, scrollytelling, live updates, Docker registration, service-health viz, dataset explorer, workflow viewer,
AI voice/face, plain-language mode, 2D equivalent for every object, reduced-motion, keyboard nav, screen reader,
high contrast, admin/developer mode.

## 14. TECH STACK (target)
Frontend: Three.js / React-Three-Fiber / Drei / Zustand / TanStack Query / WebSocket. 3D: GLB/GLTF + KTX2 +
Draco/Meshopt + instanced meshes + LOD + GPU particles + post-processing glow + camera-focus + raycast picking +
timeline engine. Backend: feature-registry, world-state-service, workflow-engine, event-engine, dataset-service,
ai-core-service, notification-service, accessibility-service, admin-service (Postgres/Redis/WebSockets/S3).
(Current app is three@0.136 UMD + stdlib http.server — evolve toward the above where it adds real value.)

## 15. DELIVERABLE PHASES
P1 Prototype: AI-core object + 3 galaxies + 10 planets + hover cards + click panels + orbit relationships +
dataset objects + timeline shell + search shell. P2 Real-data engine: feature registry DB + object schema +
Docker registration + dataset service + real loading from API + WebSocket updates. P3 Interaction: focus camera +
relationship-path view + workflow viewer + satellite action execution + dataset explorer + AI object explanation.
P4 Accessibility/modes: simple/low-stim/keyboard/screen-reader + 2D fallback + plain-language. P5 Full NASA
experience: mission mode + scrollytelling + closest/urgent panel + timeline playback + live probes + Hollywood GLB
pass + production optimisation.

## 16. COSMOLOGICAL CONTAINMENT HIERARCHY (what each celestial type is ASSIGNED to)
Astronomy nests big→small; so does the data. NOTHING is decorative — every level is a real JARVIS entity, and
SIZE strictly DESCENDS down the chain (the AI Core is the largest; the most important app/feature/shortcut is the
largest FLOATING object; everything flows down from there). The full ladder, with its real-data assignment:

| Celestial body | Assigned to (real thing) | Source of truth | Size rank |
|---|---|---|---|
| **AI Brain Core** (central super-massive black hole / reactor) | the ONE main reasoning/memory/router brain | inference seam + session memory | 1 — largest, centre |
| **Galaxy Cluster** | a top-level super-domain / product area | spec §11 groups (AI Core · User Support · Research · Workflow · Data · Integration · Admin) | 2 |
| **Galaxy** | a major domain | the 16 brain.db ontology domains (`WORLD_MANIFEST.domains`) | 3 |
| **Black hole** (galactic centre, one per galaxy) | that domain's local AI controller / routing agent / daemon | per-domain agent + the domain's hub node in ont_link | 4 (gravitational centre of its galaxy) |
| **Solar system** | a feature-module inside a domain (a star + its planets) | a feature group within a domain | grouping, not sized |
| **Star / Sun** | the PRIMARY app / feature / shortcut of a solar system (most used) | top feature by importance/usage | 5 — largest floating object below the Core |
| **Planet** | a sub-feature / module orbiting its star | feature/module entities | 6 |
| **Moon** | a sub-feature / tool / real child entity | `/children` → brain.db ont_object (REAL entities) | 7 |
| **Satellite** | a Docker mini-app / executable action / API service | running services + `/actions` registry | 8 |
| **Asteroid** | a dataset / records / files / logs | brain.db datasets + log stores | 9 |
| **Comet** | a recurring workflow / scheduled loop | scheduled jobs / daemons | 10 |
| **Meteor** | an event / alert / incident / risk | `/vitals` alerts + event store | 10 (transient) |
| **Probe** | a running job / AI agent / sync process | live swarm/daemon tasks (`/swarms`, `/tasks`) | 11 (moving) |
| **Wormhole** | an integration / external API / deep link | integration registry (calendar/email/API/auth) | link, not sized |
| **Nebula** | a topic cluster / knowledge area | the 31 master topics (pagerank) | diffuse backdrop |

ASSIGNMENT RULE (parent chain, every object carries it): `cluster → galaxy → blackhole(centre) → solar_system → star → planet → moon → satellite → asteroid`. Each object stores `orbit_parent_id`
so the universe can fly the camera up/down the chain. A black hole is ASSIGNED to its galaxy (sits at its barycentre); a
solar system is ASSIGNED to a galaxy; a star is the centre of its solar system; planets/moons/satellites inherit upward.

SIZE LAW (implements §4 SIZE): one global ladder, ceilings never overlap, importance scales within a tier — so the eye
reads the hierarchy instantly. Implemented in `jarvis_live.html` as `SIZE_TIER` + `sizeFor(tier, importance)`; the
central Core is `CORE_SIZE` (largest); a moon can never be larger than the smallest star, etc. Importance = real signal
(domain object-count, topic pagerank, feature usage, child-count), NEVER random.
