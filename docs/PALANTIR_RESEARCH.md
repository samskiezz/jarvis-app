# Palantir Replica — Research & Inspiration

Source research for building a 1:1-feel Gotham / Foundry / Apollo / AIP replica.
Primary video: **"Palantir Architecture Speedrun | From Integration to Application"**
([k88WbxMEvPY](https://www.youtube.com/watch?v=k88WbxMEvPY)) + Palantir's own
Workshop/Gotham docs.

## The architecture thesis (the spine everything hangs on)
> *"If it's not in production, it's not adding value."*

Palantir's flow, integration → value:
1. **Integration** — connect every source (the acquisition layer).
2. **Ontology** — model the real world as Objects / Links / Actions (the semantic layer).
3. **Application** — Workshop apps built on the ontology (the operator layer).
4. **Production / Apollo** — continuous delivery so it actually runs (the value layer).

This maps 1:1 to what we already have: Foundry (integration+ontology), Gotham
(application), Apollo (production), AIP (the AI mesh on the ontology).

## Gotham (the operator picture)
- **Common Operating Picture** — geographic metrics on a map, filter + explore.
- **Graph** — entity-resolution network (objects + links), expand/collapse.
- **Timeline** — chronological event fusion.
- **Targeting / kill-chain** — identify → pair → effect, human-in-the-loop.
- **Sensor tasking** — drones/satellites tasked by AI rules or manual control.
- **Titanium / ontology-aware interface** — remembers tabs, layouts, pinned apps;
  picks up where you left off on any workstation.
- Turns "any bunker or outpost into an instant command center" (mixed reality).

## Workshop = the UI building blocks (the real widget catalogue)
This is the literal component set to replicate.

**Display:** Object Table · Object List · Object View · Property List · Links · Object Set Title
**Visualization:** Chart XY · Map · Gantt · Pie · Pivot Table · Timeline · Metric Card · Markdown
**Filtering:** Filter List · Object Dropdown · String Selector · Date/Time Picker · Text/Numeric Input · User Select
**Events / nav:** Button Group · Inline Action · Comments · Tabs · Media Uploader
**Embedding:** Embedded Modules · Iframe

## Layout (how it pieces together)
- **Header** — persistent toolbar: title, tabs, buttons, logo, custom colour, vertical/horizontal.
- **Pages** — multi-screen; each a blank canvas of widgets; only the header persists.
- **Sections** — columns / rows / tabs / flow / toolbars; nestable; conditional visibility; drag-drop zones.
- **Overlays** — drawers (slide from an edge) + modals (centre) for context without navigating away.

## What this tells us is MISSING in our app (the gap to close)
1. A **Workshop-style app shell**: persistent header + page canvas + nestable
   sections + edge drawers / modals. (We have pages + a nav rail, not the
   section/overlay composition model.)
2. The full **widget set as first-class, reusable components** (Object Table,
   Metric Card, Filter List, Gantt, Pivot, Inline Action…), all ontology-bound.
3. **Common Operating Picture** — one screen fusing map + graph + timeline + metrics
   over the same object set, cross-filtered.
4. **Targeting / decision workflow** — the propose → approve → effect chain
   (we have approvals; not the kill-chain-style operator flow).
5. **Sensor/connector tasking** UI driving the acquisition layer from the picture.
6. **Titanium-style persistence** — remembered tabs/layouts/pins per operator.

## Render / 3D inspiration (for the holo HUD — NEW assets, not the Underworld set)
The Underworld Tripo GLBs are game props and are reserved for Underworld. The
Palantir replica needs its OWN clean, Apple-grade renders, e.g.:
- a holographic **command globe / Common Operating Picture table**
- a **graph constellation** node-network object
- a **sensor/satellite tasking** array
- a **production pipeline / Apollo delivery** rig
- a **JARVIS / Iron-Man core** avatar
These are generated via the Tripo3D pipeline (needs `TRIPO_API_KEY`) into a
dedicated `public/models/palantir/` namespace, kept separate from Underworld.

Sources: [Architecture Speedrun](https://www.youtube.com/watch?v=k88WbxMEvPY) ·
[Workshop widgets](https://www.palantir.com/docs/foundry/workshop/concepts-widgets) ·
[Workshop layouts](https://www.palantir.com/docs/foundry/workshop/concepts-layouts) ·
[Gotham](https://www.palantir.com/platforms/gotham/)
