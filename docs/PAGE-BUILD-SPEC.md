# Jarvis Palantir — page build spec

Every page is a real, wired React page in `src/pages/<Name>.jsx`, default-exported,
matching its `name` in `src/lib/pageRegistry.js`. Pages render INSIDE the global
nav dock (`src/Layout.jsx`) — do NOT add your own sidebar/topbar.

## Visual language — use the shared kit, do not re-style from scratch
Import from `@/components/PageKit`:
- `PageShell({ title, subtitle, accent, actions, children })` — page frame.
- `PanelCard({ title, accent, right, children })` — titled glass panel.
- `StatTile({ label, value, accent, sub })` — a metric.
- `Grid({ min, gap, children })` — responsive auto-fill grid.
- `Badge({ children, color })`, `DataState({ loading, error, empty, children })`.
Colors: `import { COLORS as C } from "@/domain/colors"`. Group accent via
`groupColor(groupId)` from `@/Layout`. Font is JetBrains Mono (inherited).

## Data — wire to the REAL backend, never fabricate
- Entities: `import { Investment, Task, IntelProfile, RiskSignal, SwarmJob,
  OmegaScanProgress, WorkflowMapping, Contact, WealthSnapshot, ... } from "@/api/entities"`.
  Each has `.list(filter?)`, `.get(id)`, `.create(p)`, `.update(id,p)`, `.remove(id)`.
  `.list` resolves to an array. Most buckets are EMPTY initially — that's expected;
  render an empty state via `DataState`, plus a "seed sample" affordance where it
  helps demos. Never hardcode fake records as if real.
- Functions: `import { getLiveIntel, getJarvisIntel, runOmegaScanBatch, ... }
  from "@/api/backendFunctions"`. `getLiveIntel({type:"all"})` returns
  `{ earthquakes:[{lat,lng,mag,place,time}], markets:[{display,price,change_pct}],
     corpus:{totals:{emails,timeline,facts}}, panopticon, counterstrike }`.
- LLM: POST `${appParams.apiBaseUrl}/functions/analystChat` with `{message}` returns
  an SSE stream (`data: "<json-string>"` chunks, ending `data: [DONE]`). Reuse the
  streaming pattern from `src/components/Jarvis/JarvisAssistant.jsx` if a page needs chat.
- `import { appParams } from "@/lib/app-params"` for `apiBaseUrl` / `apiKey`.

## Rules
- Default export the component. No router/sidebar inside the page.
- Loading/error/empty handled via `DataState`. Wrap fetches in try/catch.
- Keep it self-contained; reuse existing components (`Globe3D`, `LiveTactical3D`,
  `DraggablePanel`) only if it genuinely fits.
- Build must pass (`npm run build`) and lint clean (no unused vars/imports).
- Each page should feel purposeful and distinct — real controls, real data binding,
  not a placeholder card that says "coming soon".
