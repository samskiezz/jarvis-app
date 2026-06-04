# Frontend Coverage — APEX (`src/`) + Underworld (`underworld/web/src/`)

Per-file read coverage. WIRED = calls a real backend / live data source. SHELL = static/mock/dead/presentational-only.

---

## APEX frontend — `src/`

### /home/user/jarvis-app/src/main.jsx (8 lines)
- purpose: React entrypoint; mounts `<App/>` into `#root`.
- exports: none (side-effect render). `ReactDOM.createRoot(...).render(<App/>)`.
- SHELL (bootstrap only; no backend).
- **PROOF-OF-READ:** L7 `  <App />`

### /home/user/jarvis-app/src/App.jsx (66 lines)
- purpose: Root router — Launcher at `/`, APEX HUD pages lazy-mounted under `/apex/*`, wrapped in Auth/QueryClient providers.
- exports: `App` (default). Builds `<Routes>` from `PAGES`; `Loading` fallback component.
- WIRED (mounts AuthGate/AuthProvider that call the backend; routes real pages).
- **PROOF-OF-READ:** L46 `                            return <Route key={p.name} path={createPageUrl(p.name).slice(1)} element={<Page />} />;`

### /home/user/jarvis-app/src/api/backendFunctions.js (14 lines)
- purpose: Re-exports named backend serverless functions off the kimiClient functions proxy.
- exports: `checkUrgentEmail`, `runOmegaScanBatch`, `getJarvisIntel`, `getLiveIntel`, etc.
- WIRED (each maps to a real `POST /functions/<name>` call).
- **PROOF-OF-READ:** L13 `export const getJarvisIntel = kimiClient.functions.getJarvisIntel;`

### /home/user/jarvis-app/src/api/entities.js (17 lines)
- purpose: Re-exports entity CRUD proxies + auth SDK off kimiClient.
- exports: `SolarProduct`, `Investment`, `Task`, `RiskSignal`, ... and `User = kimiClient.auth`.
- WIRED (each entity hits real `/entities/<Name>` REST endpoints).
- **PROOF-OF-READ:** L17 `export const User = kimiClient.auth;`

### /home/user/jarvis-app/src/api/kimiClient.js (50 lines)
- purpose: Core HTTP client — fetch wrapper + Proxy-based entity/function/auth interface against `appParams.apiBaseUrl`.
- exports: `kimiClient` (request, functions proxy, entities proxy, auth.me/logout/redirectToLogin).
- WIRED (real `fetch` with Bearer auth; auth.me hits `/auth/me`).
- **PROOF-OF-READ:** L43 `    logout() {`

### /home/user/jarvis-app/src/lib/utils.js (9 lines)
- purpose: `cn()` Tailwind class merge helper + `isIframe` flag.
- exports: `cn`, `isIframe`.
- SHELL (pure util).
- **PROOF-OF-READ:** L9 `export const isIframe = window.self !== window.top;`

### /home/user/jarvis-app/src/lib/query-client.js (10 lines)
- purpose: Shared TanStack QueryClient instance config.
- exports: `queryClientInstance` (refetchOnWindowFocus false, retry 1).
- SHELL (config; enables WIRED queries elsewhere).
- **PROOF-OF-READ:** L9 `	},`

### /home/user/jarvis-app/src/lib/app-params.js (53 lines)
- purpose: Resolves apiKey / apiBaseUrl / fromUrl from URL params, localStorage, and Vite env with fallbacks.
- exports: `appParams` (+ internal getAppParamValue/getAppParams). Defaults to `localhost:8000`.
- WIRED (supplies the real backend base URL + key used by kimiClient).
- **PROOF-OF-READ:** L45 `    apiKey: getAppParamValue('api_key', { defaultValue: defaultApiKey, removeFromUrl: true }),`

### /home/user/jarvis-app/src/lib/assetCatalog.js (18 lines)
- purpose: Resolves 3D asset sources/manifests for units and maps from env-configured CDNs.
- exports: `defaultAssetSources`, `resolveAssetForUnit`, `resolveMapAsset`.
- SHELL (pure manifest lookup; env sources default to empty strings).
- **PROOF-OF-READ:** L16 `  const perGame = manifest.games?.[gameKey] || {};`

### /home/user/jarvis-app/src/lib/pageRegistry.js (114 lines)
- purpose: Single source of truth for all APEX pages — drives router, nav dock, palette. Lazy imports per page.
- exports: `GROUPS`, `PAGES`, `HOME_PAGE`, `pagesByGroup`, `findPage`.
- WIRED (structural registry that mounts real page components; metadata only itself).
- **PROOF-OF-READ:** L99 `  { name: "War", label: "War", icon: "⚔", group: "war",`

### /home/user/jarvis-app/src/lib/PageNotFound.jsx (43 lines)
- purpose: 404 page; queries auth to show an admin note.
- exports: `PageNotFound` (default).
- WIRED (runs `kimiClient.auth.me()` via useQuery).
- **PROOF-OF-READ:** L37 `                <button onClick={() => window.location.href = '/'}`

### /home/user/jarvis-app/src/utils/index.ts (2 lines)
- purpose: `createPageUrl` — PascalCase name → `/Dashed-Path`.
- exports: `createPageUrl`.
- SHELL (pure string util).
- **PROOF-OF-READ:** L2 `    return '/' + pageName.replace(/ /g, '-');`

### /home/user/jarvis-app/src/lib/AuthContext.jsx (107 lines)
- purpose: React auth provider — checks app state + user auth on mount; exposes user/isAuthenticated/logout.
- exports: `AuthProvider`, `useAuth`.
- WIRED (calls `kimiClient.auth.me()`; handles 401/403).
- **PROOF-OF-READ:** L79 `  const navigateToLogin = () => {`

### /home/user/jarvis-app/src/lib/AuthGate.jsx (107 lines)
- purpose: Gates the app behind API-key entry; bypassed unless `VITE_REQUIRE_AUTH=true`.
- exports: `AuthGate` (default), internal `SubmitKey`/`Banner`.
- WIRED (stores key to localStorage/appParams; validates against backend `/auth/me` flow).
- **PROOF-OF-READ:** L100 `  if (!authRequired) return children;`

### /home/user/jarvis-app/src/lib/jarvisAgent.js (183 lines)
- purpose: Deterministic intent router for the JARVIS assistant — maps utterances to panel/entity/page/navigate intents.
- exports: `PANEL_ALIASES`, `interpret`, `LINES`, `pick`.
- SHELL (pure NLP routing; no backend — feeds the WIRED assistant though).
- **PROOF-OF-READ:** L138 `  if (pageHit && pageHit.len >= panelLen && (wantsOpen || !panel)) {`

### /home/user/jarvis-app/src/lib/jarvisAgent.test.js (77 lines)
- purpose: Vitest unit tests for `interpret` intent routing.
- exports: none (test suite).
- SHELL (test; uses mock ENTITIES/pages).
- **PROOF-OF-READ:** L62 `  it("navigates to registry pages, preferring specific page labels over panels", () => {`

### /home/user/jarvis-app/src/lib/jarvisVoice.js (165 lines)
- purpose: Web Speech API wrapper — TTS (British male voice) + wake-word/push-to-talk recognition with no-op fallback.
- exports: `speechSupported`, `recognitionSupported`, `createVoice`.
- WIRED (live browser SpeechSynthesis/SpeechRecognition; not a server but real runtime I/O).
- **PROOF-OF-READ:** L133 `  function setWake(on) {`

### /home/user/jarvis-app/src/domain/colors.js (88 lines)
- purpose: Color/design tokens — COLORS, SHELL token set, DOMAIN_ACCENTS, glow/risk/earthquake color helpers.
- exports: `COLORS`, `SHELL`, `DOMAIN_ACCENTS`, `domainAccent`, `glow`, `riskColor`, `earthquakeColor`.
- SHELL (static design tokens).
- **PROOF-OF-READ:** L84 `export const riskColor = (risk) =>`

### /home/user/jarvis-app/src/domain/countries.js (20 lines)
- purpose: Hardcoded country/geo dossier seed (positions, watch items, risk scores) for Sam's portfolio.
- exports: `COUNTRIES`.
- SHELL (static seed data).
- **PROOF-OF-READ:** L17 `  { code:"TH", name:"Thailand", flag:"🇹🇭", lat:15.87, lng:100.99, risk:"LOW", color:"#0096d4", riskScore:10,`

### /home/user/jarvis-app/src/domain/markets.js (10 lines)
- purpose: Fallback market quotes (XRP/BTC/etc.) used when live market data unavailable.
- exports: `MARKETS_FALLBACK`.
- SHELL (static fallback).
- **PROOF-OF-READ:** L8 `  { sym:"AED",     display:"AED/AUD", price:"0.4190", change_pct:0.0, note:"Pegged USD — zero FX risk" },`

### /home/user/jarvis-app/src/domain/ontology.js (82 lines)
- purpose: Hardcoded entity/link knowledge-graph seed (people/orgs/investments) + neighbor/link helpers.
- exports: `OBJECTS`, `LINKS`, `findObjectById`, `getNeighborIds`, `getLinkCount`.
- SHELL (static graph data + pure helpers).
- **PROOF-OF-READ:** L72 `export const getNeighborIds = (id) => {`

### /home/user/jarvis-app/src/domain/ontology.test.js (32 lines)
- purpose: Vitest tests for ontology helpers + link integrity.
- exports: none (tests).
- SHELL (test).
- **PROOF-OF-READ:** L26 `  it('getLinkCount counts both endpoints of every LINK', () => {`

### /home/user/jarvis-app/src/domain/risk.js (10 lines)
- purpose: Hardcoded risk-signal seed list.
- exports: `RISK_SIGNALS`.
- SHELL (static seed).
- **PROOF-OF-READ:** L7 `  { id:"r6", title:"Red Sea disruption", severity:40, type:"GEOPOLITICAL", country:"AE", impact:"WATCH", ...`

### /home/user/jarvis-app/src/domain/watchlist.js (7 lines)
- purpose: Initial watchlist seed entries.
- exports: `WATCHLIST_INIT`.
- SHELL (static seed).
- **PROOF-OF-READ:** L6 `  { id:"w5", obj:"target", label:"$100M target", status:"ON_TRACK", alert:"PSG net $6.24M/yr. Next: Pangani deposit.", added:"Strategic" },`

### /home/user/jarvis-app/src/hooks/use-mobile.jsx (19 lines)
- purpose: `useIsMobile` hook via matchMedia at 768px breakpoint.
- exports: `useIsMobile`.
- SHELL (UI hook).
- **PROOF-OF-READ:** L15 `    return () => mql.removeEventListener("change", onChange);`

### /home/user/jarvis-app/src/panels/registry.js (52 lines)
- purpose: Panel registry — 11 JarvisTerminal panels + `buildDefaultPanelState` layout builder.
- exports: `PANELS`, `buildDefaultPanelState`.
- SHELL (static layout config + pure builder).
- **PROOF-OF-READ:** L39 `  PANELS.forEach((p) => {`

### /home/user/jarvis-app/src/panels/registry.test.js (27 lines)
- purpose: Vitest tests for panel registry ordering + default state bounds.
- exports: none (tests).
- SHELL (test).
- **PROOF-OF-READ:** L24 `    expect(state.CS3D.visible).toBe(true);`

### /home/user/jarvis-app/src/pages.config.js (54 lines)
- purpose: Legacy auto-generated page-config stub (Base44); now an empty Pages map — dead.
- exports: `pagesConfig` ({ Pages: {} }).
- SHELL (dead/empty; real routing lives in pageRegistry).
- **PROOF-OF-READ:** L51 `export const pagesConfig = {`

### /home/user/jarvis-app/src/Layout.jsx (79 lines)
- purpose: `AppLayout` chrome — DomainRail + breadcrumb strip + CommandPalette + JARVIS assistant wrapping every /apex page.
- exports: `Layout` (default, returns null/legacy), `AppLayout`, `groupColor`.
- WIRED (wires JARVIS actions to real router navigation; passes real entities/pages/risks).
- **PROOF-OF-READ:** L73 `      <JarvisAssistant actions={jarvisActions} entities={jarvisEntities} pages={jarvisPages} risks={RISK_SIGNALS} />`

### /home/user/jarvis-app/src/components/PageKit.jsx (77 lines)
- purpose: Shared page primitives — PageShell, PanelCard, StatTile, Grid, Badge, DataState.
- exports: `PageShell`, `PanelCard`, `StatTile`, `Grid`, `Badge`, `DataState`.
- SHELL (presentational primitives).
- **PROOF-OF-READ:** L73 `  if (loading) return <div style={{ padding: 24, color: C.text, fontSize: 10, letterSpacing: 1 }}>◌ LOADING…</div>;`

### /home/user/jarvis-app/src/components/UserNotRegisteredError.jsx (31 lines)
- purpose: "Access Restricted" static error screen for unregistered users.
- exports: `UserNotRegisteredError` (default).
- SHELL (static presentational; appears unused/dead — Tailwind light theme, not wired in router).
- **PROOF-OF-READ:** L25 `        </div>`

### /home/user/jarvis-app/src/components/DomainRail.jsx (185 lines)
- purpose: Collapsed-by-default domain navigation rail with flyouts + ⌘1-6 / ⌘\ shortcuts.
- exports: `DomainRail` (default).
- WIRED (drives real react-router navigation across registry pages).
- **PROOF-OF-READ:** L126 `                <span style={{ fontSize: S.fs.xl - 3, flexShrink: 0, color: on ? g.color : S.text }}>{DOMAIN_GLYPH[g.id] || "◆"}</span>`

### /home/user/jarvis-app/src/components/DraggablePanel.jsx (160 lines)
- purpose: Draggable/resizable floating panel chrome (title bar, minimize/close, resize handle).
- exports: `DraggablePanel` (default).
- SHELL (presentational interaction component; no backend).
- **PROOF-OF-READ:** L140 `      {!minimized && <div style={{ flex: 1, overflow: "hidden" }}>{children}</div>}`

### /home/user/jarvis-app/src/components/Globe3D.jsx (215 lines)
- purpose: Three.js interactive globe with country markers + live earthquake spikes; drag-to-rotate.
- exports: `Globe3D` (default). `latLngToVec3` helper.
- WIRED (renders live `earthquakes` prop feed; consumes COUNTRIES seed for markers).
- **PROOF-OF-READ:** L194 `      <div style={{ position:"absolute", bottom:0, left:0, right:0, height:48, display:"flex", background:"rgba(1,4,8,0.95)", borderTop:\`1px solid ${C.border}\`, overflowX:"auto" }}>`

### /home/user/jarvis-app/src/components/CommandPalette.jsx (253 lines)
- purpose: ⌘K command palette (cmdk) — page nav, global actions, Predict/Ask-Jarvis fallbacks; runs jarvisAgent per keystroke.
- exports: `CommandPalette` (default), internal `Row`.
- WIRED (drives real router nav; dispatches jarvis:ask events to the live assistant).
- **PROOF-OF-READ:** L236 `function Row({ value, onSelect, icon, label, meta, accent, highlight, forceMount }) {`

### /home/user/jarvis-app/src/components/Jarvis/JarvisAssistant.jsx (323 lines)
- purpose: Omnipresent JARVIS orb/panel — wires voice + intent agent + streaming analyst backend; self-fetches live intel for briefings.
- exports: `JarvisAssistant` (default); `streamAnalyst`, `buildBriefing` helpers.
- WIRED (SSE stream from `/functions/analystChat`; fetches `/functions/getLiveIntel`; real Web Speech voice).
- **PROOF-OF-READ:** L235 `        onClick={() => (open ? setOpen(false) : activate())}`

### /home/user/jarvis-app/src/components/LiveTactical3D.jsx (489 lines)
- purpose: Three.js tactical renderer — lerps streamed unit frames into smooth motion; bombsites/bomb/objectives layers; HDRI/PBR terrain from env URLs.
- exports: `LiveTactical3D` (default).
- WIRED (renders live streamed `units`/`bomb`/`objectives` props from an SSE feed; loads GLTF/HDRI assets).
- **PROOF-OF-READ:** L356 `    (bombsites || []).forEach((s, i) => {`

### shadcn/ui primitive library — `src/components/ui/`

The following are unmodified/standard shadcn-style Radix+Tailwind UI primitives. All are SHELL (presentational; no backend). Each entry retains its own PROOF line.

### /home/user/jarvis-app/src/components/ui/accordion.jsx (41 lines)
- purpose: Radix accordion wrapper. exports: Accordion, AccordionItem, AccordionTrigger, AccordionContent.
- SHELL. **PROOF-OF-READ:** L36 `    <div className={cn("pb-4 pt-0", className)}>{children}</div>`

### /home/user/jarvis-app/src/components/ui/alert-dialog.jsx (97 lines)
- purpose: Radix alert-dialog wrapper. exports: AlertDialog* family.
- SHELL. **PROOF-OF-READ:** L77 `const AlertDialogCancel = React.forwardRef(({ className, ...props }, ref) => (`

### /home/user/jarvis-app/src/components/ui/alert.jsx (47 lines)
- purpose: Alert box with cva variants. exports: Alert, AlertTitle, AlertDescription.
- SHELL. **PROOF-OF-READ:** L39 `const AlertDescription = React.forwardRef(({ className, ...props }, ref) => (`

### /home/user/jarvis-app/src/components/ui/aspect-ratio.jsx (5 lines)
- purpose: Re-export Radix AspectRatio. exports: AspectRatio.
- SHELL. **PROOF-OF-READ:** L5 `export { AspectRatio }`

### /home/user/jarvis-app/src/components/ui/avatar.jsx (35 lines)
- purpose: Radix avatar. exports: Avatar, AvatarImage, AvatarFallback.
- SHELL. **PROOF-OF-READ:** L24 `const AvatarFallback = React.forwardRef(({ className, ...props }, ref) => (`

### /home/user/jarvis-app/src/components/ui/badge.jsx (34 lines)
- purpose: cva badge. exports: Badge, badgeVariants.
- SHELL. **PROOF-OF-READ:** L31 `  return (<div className={cn(badgeVariants({ variant }), className)} {...props} />);`

### /home/user/jarvis-app/src/components/ui/breadcrumb.jsx (92 lines)
- purpose: Breadcrumb nav primitives. exports: Breadcrumb* family.
- SHELL. **PROOF-OF-READ:** L69 `const BreadcrumbEllipsis = ({`

### /home/user/jarvis-app/src/components/ui/button.jsx (48 lines)
- purpose: cva button. exports: Button, buttonVariants.
- SHELL. **PROOF-OF-READ:** L37 `const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {`

### /home/user/jarvis-app/src/components/ui/calendar.jsx (71 lines)
- purpose: react-day-picker calendar. exports: Calendar.
- SHELL. **PROOF-OF-READ:** L59 `        IconLeft: ({ className, ...props }) => (`

### /home/user/jarvis-app/src/components/ui/card.jsx (50 lines)
- purpose: Card primitives. exports: Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent.
- SHELL. **PROOF-OF-READ:** L42 `const CardFooter = React.forwardRef(({ className, ...props }, ref) => (`

### /home/user/jarvis-app/src/components/ui/carousel.jsx (193 lines)
- purpose: embla-carousel wrapper. exports: Carousel, CarouselContent/Item/Previous/Next.
- SHELL. **PROOF-OF-READ:** L151 `const CarouselPrevious = React.forwardRef(({ className, variant = "outline", size = "icon", ...props }, ref) => {`

### /home/user/jarvis-app/src/components/ui/chart.jsx (309 lines)
- purpose: Recharts chart container/tooltip/legend wrappers + theme CSS var injection. exports: ChartContainer, ChartTooltip(Content), ChartLegend(Content), ChartStyle.
- SHELL. **PROOF-OF-READ:** L266 `function getPayloadConfigFromPayload(`

### /home/user/jarvis-app/src/components/ui/checkbox.jsx (22 lines)
- purpose: Radix checkbox. exports: Checkbox.
- SHELL. **PROOF-OF-READ:** L15 `    <CheckboxPrimitive.Indicator className={cn("flex items-center justify-center text-current")}>`

### /home/user/jarvis-app/src/components/ui/collapsible.jsx (11 lines)
- purpose: Re-export Radix collapsible. exports: Collapsible, CollapsibleTrigger, CollapsibleContent.
- SHELL. **PROOF-OF-READ:** L9 `const CollapsibleContent = CollapsiblePrimitive.CollapsibleContent`

### /home/user/jarvis-app/src/components/ui/command.jsx (116 lines)
- purpose: cmdk command menu primitives (shadcn variant; distinct from the app's CommandPalette). exports: Command* family.
- SHELL. **PROOF-OF-READ:** L82 `const CommandItem = React.forwardRef(({ className, ...props }, ref) => (`

### /home/user/jarvis-app/src/components/ui/context-menu.jsx (156 lines)
- purpose: Radix context-menu primitives. exports: ContextMenu* family.
- SHELL. **PROOF-OF-READ:** L128 `const ContextMenuShortcut = ({`

### /home/user/jarvis-app/src/components/ui/dialog.jsx (96 lines)
- purpose: Radix dialog primitives. exports: Dialog* family.
- SHELL. **PROOF-OF-READ:** L77 `const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (`

### /home/user/jarvis-app/src/components/ui/drawer.jsx (92 lines)
- purpose: vaul drawer wrapper. exports: Drawer* family.
- SHELL. **PROOF-OF-READ:** L73 `const DrawerDescription = React.forwardRef(({ className, ...props }, ref) => (`

### /home/user/jarvis-app/src/components/ui/dropdown-menu.jsx (156 lines)
- purpose: Radix dropdown-menu primitives. exports: DropdownMenu* family.
- SHELL. **PROOF-OF-READ:** L128 `const DropdownMenuShortcut = ({`

### /home/user/jarvis-app/src/components/ui/form.jsx (134 lines)
- purpose: react-hook-form context primitives. exports: Form, FormItem/Label/Control/Description/Message/Field, useFormField.
- SHELL. **PROOF-OF-READ:** L105 `const FormMessage = React.forwardRef(({ className, children, ...props }, ref) => {`

### /home/user/jarvis-app/src/components/ui/hover-card.jsx (25 lines)
- purpose: Radix hover-card. exports: HoverCard, HoverCardTrigger, HoverCardContent.
- SHELL. **PROOF-OF-READ:** L23 `HoverCardContent.displayName = HoverCardPrimitive.Content.displayName`

### /home/user/jarvis-app/src/components/ui/input-otp.jsx (53 lines)
- purpose: input-otp wrapper. exports: InputOTP, InputOTPGroup/Slot/Separator.
- SHELL. **PROOF-OF-READ:** L46 `const InputOTPSeparator = React.forwardRef(({ ...props }, ref) => (`

### /home/user/jarvis-app/src/components/ui/input.jsx (19 lines)
- purpose: Styled text input. exports: Input.
- SHELL. **PROOF-OF-READ:** L13 `      ref={ref}`

### /home/user/jarvis-app/src/components/ui/label.jsx (16 lines)
- purpose: Radix label with cva. exports: Label.
- SHELL. **PROOF-OF-READ:** L12 `  <LabelPrimitive.Root ref={ref} className={cn(labelVariants(), className)} {...props} />`

### /home/user/jarvis-app/src/components/ui/menubar.jsx (200 lines)
- purpose: Radix menubar primitives. exports: Menubar* family.
- SHELL. **PROOF-OF-READ:** L155 `const MenubarLabel = React.forwardRef(({ className, inset, ...props }, ref) => (`

### /home/user/jarvis-app/src/components/ui/navigation-menu.jsx (104 lines)
- purpose: Radix navigation-menu primitives. exports: NavigationMenu* family + navigationMenuTriggerStyle.
- SHELL. **PROOF-OF-READ:** L79 `const NavigationMenuIndicator = React.forwardRef(({ className, ...props }, ref) => (`

### /home/user/jarvis-app/src/components/ui/pagination.jsx (100 lines)
- purpose: Pagination primitives. exports: Pagination* family.
- SHELL. **PROOF-OF-READ:** L78 `const PaginationEllipsis = ({`

### /home/user/jarvis-app/src/components/ui/popover.jsx (27 lines)
- purpose: Radix popover. exports: Popover, PopoverTrigger, PopoverContent, PopoverAnchor.
- SHELL. **PROOF-OF-READ:** L25 `PopoverContent.displayName = PopoverPrimitive.Content.displayName`

### /home/user/jarvis-app/src/components/ui/progress.jsx (23 lines)
- purpose: Radix progress bar. exports: Progress.
- SHELL. **PROOF-OF-READ:** L18 `      style={{ transform: \`translateX(-${100 - (value || 0)}%)\` }} />`

### /home/user/jarvis-app/src/components/ui/radio-group.jsx (29 lines)
- purpose: Radix radio-group. exports: RadioGroup, RadioGroupItem.
- SHELL. **PROOF-OF-READ:** L21 `      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">`

### /home/user/jarvis-app/src/components/ui/resizable.jsx (42 lines)
- purpose: react-resizable-panels wrapper. exports: ResizablePanelGroup, ResizablePanel, ResizableHandle.
- SHELL. **PROOF-OF-READ:** L33 `    {withHandle && (`

### /home/user/jarvis-app/src/components/ui/scroll-area.jsx (38 lines)
- purpose: Radix scroll-area. exports: ScrollArea, ScrollBar.
- SHELL. **PROOF-OF-READ:** L33 `    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />`

### /home/user/jarvis-app/src/components/ui/select.jsx (121 lines)
- purpose: Radix select primitives. exports: Select* family.
- SHELL. **PROOF-OF-READ:** L84 `const SelectItem = React.forwardRef(({ className, children, ...props }, ref) => (`

### /home/user/jarvis-app/src/components/ui/separator.jsx (23 lines)
- purpose: Radix separator. exports: Separator.
- SHELL. **PROOF-OF-READ:** L21 `Separator.displayName = SeparatorPrimitive.Root.displayName`

### /home/user/jarvis-app/src/components/ui/sheet.jsx (109 lines)
- purpose: Radix dialog-based side sheet with cva sides. exports: Sheet* family.
- SHELL. **PROOF-OF-READ:** L82 `const SheetTitle = React.forwardRef(({ className, ...props }, ref) => (`

### /home/user/jarvis-app/src/components/ui/sidebar.jsx (626 lines)
- purpose: Full shadcn sidebar system — provider, context, menu, rail, mobile sheet, cookie persistence, ⌘B shortcut. exports: ~25 Sidebar* components + useSidebar.
- SHELL (presentational; uses cookie/localStorage state only). Note: appears unused by APEX shell (DomainRail is the real nav).
- **PROOF-OF-READ:** L444 `const SidebarMenuButton = React.forwardRef((`

### /home/user/jarvis-app/src/components/ui/skeleton.jsx (14 lines)
- purpose: Pulse skeleton placeholder. exports: Skeleton.
- SHELL. **PROOF-OF-READ:** L9 `      className={cn("animate-pulse rounded-md bg-primary/10", className)}`

### /home/user/jarvis-app/src/components/ui/slider.jsx (21 lines)
- purpose: Radix slider. exports: Slider.
- SHELL. **PROOF-OF-READ:** L16 `      className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow ...`

### /home/user/jarvis-app/src/components/ui/sonner.jsx (29 lines)
- purpose: sonner Toaster themed via next-themes. exports: Toaster.
- SHELL. **PROOF-OF-READ:** L19 `          actionButton:`

### /home/user/jarvis-app/src/components/ui/switch.jsx (22 lines)
- purpose: Radix switch. exports: Switch.
- SHELL. **PROOF-OF-READ:** L14 `    <SwitchPrimitives.Thumb`

### /home/user/jarvis-app/src/components/ui/table.jsx (86 lines)
- purpose: Table primitives. exports: Table* family.
- SHELL. **PROOF-OF-READ:** L58 `const TableCell = React.forwardRef(({ className, ...props }, ref) => (`

### /home/user/jarvis-app/src/components/ui/tabs.jsx (41 lines)
- purpose: Radix tabs. exports: Tabs, TabsList, TabsTrigger, TabsContent.
- SHELL. **PROOF-OF-READ:** L30 `const TabsContent = React.forwardRef(({ className, ...props }, ref) => (`

### /home/user/jarvis-app/src/components/ui/textarea.jsx (18 lines)
- purpose: Styled textarea. exports: Textarea.
- SHELL. **PROOF-OF-READ:** L13 `      {...props} />)`

### /home/user/jarvis-app/src/components/ui/toast.jsx (103 lines)
- purpose: Toast primitives (note: plain divs, not Radix toast). exports: Toast* family.
- SHELL. **PROOF-OF-READ:** L78 `const ToastTitle = React.forwardRef(({ className, ...props }, ref) => (`

### /home/user/jarvis-app/src/components/ui/toaster.jsx (32 lines)
- purpose: Renders toasts from useToast store. exports: Toaster.
- SHELL. **PROOF-OF-READ:** L25 `            {action}`

### /home/user/jarvis-app/src/components/ui/toggle.jsx (38 lines)
- purpose: Radix toggle with cva. exports: Toggle, toggleVariants.
- SHELL. **PROOF-OF-READ:** L30 `  <TogglePrimitive.Root`

### /home/user/jarvis-app/src/components/ui/toggle-group.jsx (44 lines)
- purpose: Radix toggle-group sharing variant via context. exports: ToggleGroup, ToggleGroupItem.
- SHELL. **PROOF-OF-READ:** L32 `      className={cn(toggleVariants({`

### /home/user/jarvis-app/src/components/ui/tooltip.jsx (28 lines)
- purpose: Radix tooltip. exports: Tooltip, TooltipTrigger, TooltipContent, TooltipProvider.
- SHELL. **PROOF-OF-READ:** L20 `        "z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs ...`

### /home/user/jarvis-app/src/components/ui/use-toast.jsx (163 lines)
- purpose: react-hot-toast-inspired toast store/reducer + useToast/toast. exports: useToast, toast, reducer.
- SHELL (in-memory store). **PROOF-OF-READ:** L113 `function toast({ ...props }) {`

### APEX feature pages — `src/pages/`

### /home/user/jarvis-app/src/pages/SystemIntel.jsx (108 lines)
- purpose: Feed-health board polling live intel every 30s; counts signals per feed (seismic/markets/corpus/panopticon/CS).
- exports: `SystemIntel` (default). `FEEDS` probe table.
- WIRED (calls real `getLiveIntel({type:"all"})`; 30s poll).
- **PROOF-OF-READ:** L88 `            {feeds.map((f) => {`

### /home/user/jarvis-app/src/pages/GlobalIntel.jsx (120 lines)
- purpose: Live world signals — seismic table + market grid + corpus stats from getLiveIntel.
- exports: `GlobalIntel` (default).
- WIRED (real `getLiveIntel` backend call).
- **PROOF-OF-READ:** L99 `                {markets.map((m, i) => {`

### /home/user/jarvis-app/src/pages/Launcher.jsx (126 lines)
- purpose: Root two-tile destination picker (APEX vs UNDERWORLD); routes to /apex pages.
- exports: `Launcher` (default), internal `Tile`.
- WIRED (real router navigation; presentational otherwise).
- **PROOF-OF-READ:** L116 `        <Tile`

### /home/user/jarvis-app/src/pages/ApexCore.jsx (128 lines)
- purpose: Apex plugin control core — 11 plugins as cards with local enable/disable + health dots.
- exports: `ApexCore` (default).
- SHELL (hardcoded PLUGINS; local toggle state, no backend).
- **PROOF-OF-READ:** L93 `          {PLUGINS.map((p) => {`

### /home/user/jarvis-app/src/pages/PluginIntegrationProof.jsx (136 lines)
- purpose: Plugin wiring test runner — simulated pass/fail via setTimeout; quantum/eval forced to fail.
- exports: `PluginIntegrationProof` (default).
- SHELL (simulated test results; no real integration calls).
- **PROOF-OF-READ:** L106 `          {PLUGINS.map((p) => {`

### /home/user/jarvis-app/src/pages/PluginControlPlane.jsx (139 lines)
- purpose: Plugin management table — filter by category, per-row enable/disable, versions.
- exports: `PluginControlPlane` (default).
- SHELL (hardcoded PLUGINS; local state).
- **PROOF-OF-READ:** L99 `              {rows.map((p) => {`

### /home/user/jarvis-app/src/pages/MLDashboard.jsx (157 lines)
- purpose: ML metrics from SwarmJob + OmegaScanProgress entities — status bars, jobs-over-time sparkline, scan gauges.
- exports: `MLDashboard` (default). `dayKey` helper.
- WIRED (real `SwarmJob.list()` / `OmegaScanProgress.list()` entity calls).
- **PROOF-OF-READ:** L135 `              {scans.slice(0, 12).map((s, i) => {`

### /home/user/jarvis-app/src/pages/AlertsNotificationCenter.jsx (158 lines)
- purpose: Risk-signal triage queue — severity-normalized, sorted, filterable, local ack state.
- exports: `AlertsNotificationCenter` (default). `normalizeSev` helper.
- WIRED (real `RiskSignal.list()` entity call).
- **PROOF-OF-READ:** L119 `              {visible.map((s) => {`

### /home/user/jarvis-app/src/pages/KGIKLedger.jsx (169 lines)
- purpose: Hash-chained append-only knowledge-event ledger built from WorkflowMapping entities + session appends.
- exports: `KGIKLedger` (default). `hashId` (FNV-1a), `mapWorkflowToEntry` helpers.
- WIRED (real `WorkflowMapping.list()`; appends are local/session-only).
- **PROOF-OF-READ:** L151 `                {ledger.map((e, i) => (`

### /home/user/jarvis-app/src/pages/CommandCenter.jsx (171 lines)
- purpose: Operations hub — live stat tiles from getLiveIntel + entities, quick-launch nav, streaming analyst console.
- exports: `CommandCenter` (default). `streamAnalyst` SSE helper.
- WIRED (real `getLiveIntel`, IntelProfile/RiskSignal/Task `.list()`, SSE `/functions/analystChat`).
- **PROOF-OF-READ:** L138 `        <PanelCard title="ANALYST CONSOLE" accent={ACCENT} right={streaming ? ...`

### /home/user/jarvis-app/src/pages/SystemHealth.jsx (174 lines)
- purpose: Live backend health probe — times getLiveIntel, checks feeds + IntelProfile entity store, 15s poll.
- exports: `SystemHealth` (default).
- WIRED (real fetch to `/functions/getLiveIntel` + `IntelProfile.list()`; measures latency).
- **PROOF-OF-READ:** L155 `            {services.map((s) => {`

### /home/user/jarvis-app/src/pages/KGIKBrain.jsx (177 lines)
- purpose: Ontology explorer — entity index (searchable) + detail panel with props/relations from the static graph.
- exports: `KGIKBrain` (default). `buildLinksFor` helper.
- SHELL (reads static OBJECTS/LINKS from domain/ontology; no backend).
- **PROOF-OF-READ:** L138 `              <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, margin: "14px 0 6px" }}>PROPERTIES</div>`

### /home/user/jarvis-app/src/pages/TechTree.jsx (183 lines)
- purpose: Capability dependency graph rendered as SVG nodes/edges; locked/unlocked local state gated by prereqs.
- exports: `TechTree` (default). `layout` helper.
- SHELL (hardcoded NODES; local unlock state, no backend).
- **PROOF-OF-READ:** L113 `              {NODES.map((n) => {`

### /home/user/jarvis-app/src/pages/MLHub.jsx (191 lines)
- purpose: Swarm job hub — lists SwarmJob, launch/cancel/delete via full entity CRUD.
- exports: `MLHub` (default). `pct` helper.
- WIRED (real `SwarmJob.list/create/update/remove`).
- **PROOF-OF-READ:** L165 `        <PanelCard title="LAUNCH JOB" accent={ACCENT}>`

### /home/user/jarvis-app/src/pages/PipelineMonitor.jsx (191 lines)
- purpose: Pipeline run monitor unifying SwarmJob + OmegaScanProgress as stages + WorkflowMapping as configured pipelines.
- exports: `PipelineMonitor` (default). `pctOf`, `StageRow` helpers.
- WIRED (real `SwarmJob/OmegaScanProgress/WorkflowMapping .list()`).
- **PROOF-OF-READ:** L159 `        <PanelCard title="CONFIGURED PIPELINES" accent={C.gold} right={<Badge color={C.gold}>{flows.length}</Badge>}>`

### /home/user/jarvis-app/src/pages/PatentsSearch.jsx (193 lines)
- purpose: Full-text patent search over Patent entities + seed-samples action + detail panel.
- exports: `PatentsSearch` (default). Uses `kimiClient.entities.Patent`.
- WIRED (real `Patent.list/create`); SAMPLES are seed fixtures.
- **PROOF-OF-READ:** L158 `        {selected && (`

### /home/user/jarvis-app/src/pages/PatentIngest.jsx (194 lines)
- purpose: Patent ingestion console — single + sample-batch ingest via Patent.create, session ingest log, recent-in-corpus list.
- exports: `PatentIngest` (default). `newId` helper.
- WIRED (real `Patent.list/create`).
- **PROOF-OF-READ:** L160 `              {log.map((l, i) => (`

### /home/user/jarvis-app/src/pages/GameLeaderboard.jsx (199 lines)
- purpose: Ranked agents leaderboard from Contact entities (or seeded sample), sortable, top-3 highlighted.
- exports: `GameLeaderboard` (default). `contactToPlayer` helper.
- WIRED (real `Contact.list()`; falls back to local SAMPLE on empty).
- **PROOF-OF-READ:** L168 `                {sorted.map((p, i) => {`

### /home/user/jarvis-app/src/pages/TCIS.jsx (215 lines)
- purpose: Temporal Causal Intelligence — unifies live quakes/markets/risks onto a timeline + ontology-derived causal hypotheses.
- exports: `TCIS` (default). `buildHypotheses`, `tms` helpers.
- WIRED (real `getLiveIntel` + `RiskSignal.list()`; hypotheses from static LINKS).
- **PROOF-OF-READ:** L190 `            {hypotheses.map((h) => (`

### /home/user/jarvis-app/src/pages/PatentRegistry.jsx (221 lines)
- purpose: Master patent register — sortable table, add-form, seed, delete; full Patent CRUD.
- exports: `PatentRegistry` (default).
- WIRED (real `Patent.list/create/remove`).
- **PROOF-OF-READ:** L197 `                {sorted.map((r) => (`

### /home/user/jarvis-app/src/pages/Underworld.jsx (226 lines)
- purpose: Underworld sim monitor — pulls maps from getLiveIntel, EventSource SSE monitor on /streams/panopticon, synthetic canvas frame.
- exports: `Underworld` (default), internal `StreamMonitor`.
- WIRED (real `getLiveIntel` + live EventSource to `${apiBaseUrl}/streams/panopticon` with reconnect/backoff); canvas is a placeholder render.
- **PROOF-OF-READ:** L167 `function StreamMonitor({ selectedMap, status, statusColor, events, lastTick }) {`

### /home/user/jarvis-app/src/pages/InvestmentTracker.jsx (308 lines)
- purpose: Portfolio tracker — Investment CRUD, WealthSnapshot trend bars, live-market-weighted 24h change, $100M target progress.
- exports: `InvestmentTracker` (default). `fmtMoney` helper.
- WIRED (real `Investment.list/create/update/remove`, `WealthSnapshot.list()`, `getLiveIntel`).
- **PROOF-OF-READ:** L264 `          <form onSubmit={submit} style={{ marginTop: 12, display: "flex", flexWrap: "wrap", ...`

### /home/user/jarvis-app/src/pages/PredictionOracle.jsx (467 lines)
- purpose: Natural-language forecast oracle — POSTs to /functions/predict, renders point/interval/probability, recharts history→forecast band, method/drivers/assumptions/caveats.
- exports: `PredictionOracle` (default). `ResultView`, `ForecastChart`, `HonestyList`, helpers.
- WIRED (real `kimiClient.functions.predict`; auto-runs from `?q=` deep link).
- **PROOF-OF-READ:** L377 `function ForecastChart({ data, unit }) {`

### /home/user/jarvis-app/src/pages/War.jsx (585 lines)
- purpose: Unified battle-sim theater — PANOPTICON vs COUNTERSTRIKE modes, shared SSE stream hook + LiveTactical3D, scoreboard/event-feed HUD, match/threat boards.
- exports: `War` (default). `useTacticalStream` hook, `jobToMatch`, `seedUnits`, helpers.
- WIRED (live EventSource `${apiBaseUrl}/streams/{mode}`, `SwarmJob.list()`, `RiskSignal.list()`; seeded units/matches/signals as fallback).
- **PROOF-OF-READ:** L392 `            <LiveTactical3D`

### /home/user/jarvis-app/src/pages/JarvisTerminal.jsx (1352 lines)
- purpose: The flagship draggable-panel HUD — 11 panels (Globe, Vertex graph, Object Explorer, Timeline, Risk, Emails, Watchlist, Markets, AI Analyst, Panopticon/CS3D live renderers) over a getLiveIntel feed + SSE analyst.
- exports: `JarvisTerminal` (default). Internal panels: `VertexGraph`, `GlobeMap`, `ObjectExplorer`, `TimelinePanel`, `RiskPanel`, `EmailCorpus`, `WatchlistPanel`, `MarketsPanel`, `AnalystPanel`, `StreamStatusPanel`, `LiveGameRenderPanel`.
- WIRED (live `getLiveIntel` 2-min poll powering Globe/Timeline/Emails/Markets; SSE `/functions/analystChat`; EventSource stream renderers). Vertex/Explorer/Risk/Watchlist read static ontology/risk/watchlist seeds (SHELL data within a WIRED page).
- **PROOF-OF-READ:** L1157 `  const factTicker = ["PSG NET $120k/wk", \`XRP×9,300=${xrpHeld}\`, "PANGANI DD ACTIVE", "IFZA FZCO PLANNING", "$100M TARGET 2033", \`${earthquakes.length} USGS QUAKES LIVE\`];`

---

## Underworld frontend — `underworld/web/src/`

### /home/user/jarvis-app/underworld/web/src/main.tsx (27 lines)
- purpose: Entrypoint — mounts App with QueryClient + BrowserRouter providers.
- exports: none (side-effect render).
- WIRED (bootstraps the wired app; staleTime 10s).
- **PROOF-OF-READ:** L20 `    <StrictMode>`

### /home/user/jarvis-app/underworld/web/src/App.tsx (37 lines)
- purpose: Router — AuthGate + GameLoader wrap; routes for CommandCentre, WorldDetail, Population, Projects, Knowledge, Inventions, Patents, Guilds, Safety under Layout.
- exports: `App` (default).
- WIRED (mounts real pages behind auth + loader).
- **PROOF-OF-READ:** L29 `          <Route path="/patents" element={<PatentScanner />} />`

### /home/user/jarvis-app/underworld/web/src/vite-env.d.ts (12 lines)
- purpose: Vite env type declarations (UNDERWORLD_API_URL/KEY) + css module decl.
- exports: ambient types only.
- SHELL (type decls).
- **PROOF-OF-READ:** L9 `  readonly env: ImportMetaEnv;`

### /home/user/jarvis-app/underworld/web/src/lib/config.ts (29 lines)
- purpose: API base URL + API-key storage (URL param → localStorage → env).
- exports: `API_BASE_URL`, `getApiKey`, `setApiKey`, `clearApiKey`.
- WIRED (supplies real backend URL + bearer key).
- **PROOF-OF-READ:** L23 `export function setApiKey(key: string): void {`

### /home/user/jarvis-app/underworld/web/src/lib/api.ts (293 lines)
- purpose: Full typed REST client for the Underworld backend — worlds, minions, patents, inventions, safety, knowledge base, projects + SSE stream URL.
- exports: `ApiError`, `api` (~60 endpoint methods).
- WIRED (every method is a real fetch with bearer auth).
- **PROOF-OF-READ:** L242 `  listSafetyReviews: (limit = 50) =>`

### /home/user/jarvis-app/underworld/web/src/lib/api.test.ts (41 lines)
- purpose: Vitest tests for the api client (bearer header, ApiError, JSON POST).
- exports: none (tests).
- SHELL (test; mocks fetch).
- **PROOF-OF-READ:** L32 `  it("serialises POST bodies as JSON", async () => {`

### /home/user/jarvis-app/underworld/web/src/lib/hooks.ts (62 lines)
- purpose: `useWorldStream` — fetch-based SSE subscription (bearer-authed) to a world's event stream.
- exports: `useWorldStream`.
- WIRED (real streaming fetch to `/worlds/:id/stream`).
- **PROOF-OF-READ:** L46 `      } catch (err) {`

### /home/user/jarvis-app/underworld/web/src/lib/types.ts (419 lines)
- purpose: TypeScript domain types mirroring the server schemas (World, Minion, Invention, KB, projects, lineage, etc.).
- exports: ~40 interfaces/types.
- SHELL (type definitions).
- **PROOF-OF-READ:** L329 `export interface WorldMap {`

### /home/user/jarvis-app/underworld/web/src/lib/assetPreloader.ts (107 lines)
- purpose: Asset preloader — discovers/loads all 3D assets from manifests/load_order with real 0→100% progress.
- exports: `AssetEntry`, `buildAssetList`, `discoverAssets`, `preloadAll`.
- WIRED (real fetches of manifest JSON + asset URLs into browser cache).
- **PROOF-OF-READ:** L83 `export async function preloadAll(`

### /home/user/jarvis-app/underworld/web/src/lib/__tests__/assetPreloader.test.ts (35 lines)
- purpose: Vitest tests for buildAssetList/preloadAll (dedupe, manifest flatten, never-hang).
- exports: none (tests).
- SHELL (test).
- **PROOF-OF-READ:** L28 `    const res = await preloadAll(`

### /home/user/jarvis-app/underworld/web/src/lib/loaderMusic.ts (119 lines)
- purpose: Generative Web Audio ambient loader music (or real /music/login track if present).
- exports: `isPlaying`, `start`, `stop`.
- WIRED (real Web Audio synthesis / HTMLAudio playback — runtime I/O).
- **PROOF-OF-READ:** L92 `function pad(ac: AudioContext, out: GainNode, freq: number, t: number, dur: number) {`

### /home/user/jarvis-app/underworld/web/src/lib/recordCanvas.ts (52 lines)
- purpose: Records a canvas via MediaRecorder + captureStream and downloads the video.
- exports: `Recorder`, `recordCanvas`.
- WIRED (real MediaRecorder capture + file download).
- **PROOF-OF-READ:** L34 `  rec.onstop = () => {`

### /home/user/jarvis-app/underworld/web/src/components/AuthGate.tsx (106 lines)
- purpose: Bearer-key gate — validates stored key against /auth/me, shows key-entry form on missing/rejected.
- exports: `AuthGate` (default).
- WIRED (real `api.me()` validation via useQuery).
- **PROOF-OF-READ:** L78 `          {meQuery.isError ? (`

### /home/user/jarvis-app/underworld/web/src/components/GameLoader.tsx (205 lines)
- purpose: RuneScape-style loader — real asset preload to 100%, generative music, optional 3D hero, canvas recording, click-to-enter gate.
- exports: `GameLoader` (default), internal `HeroBoundary`.
- WIRED (real `discoverAssets`/`preloadAll`, music, recordCanvas; HEAD-probes hero GLB).
- **PROOF-OF-READ:** L165 `      <div className="absolute bottom-[11%] z-10 w-[min(620px,82vw)]">`

### /home/user/jarvis-app/underworld/web/src/components/HeroAssembleLoader.tsx (196 lines)
- purpose: R3F hero-logo loader — GLB explodes into pieces and reassembles driven by load progress via custom shader, bloom postprocessing.
- exports: `HeroAssembleLoader` (default); `prepareExplode`, `HeroModel`, `Rig` internals.
- WIRED (loads real hero GLB via useGLTF; live progress-driven render).
- **PROOF-OF-READ:** L171 `export default function HeroAssembleLoader({ progress, onCanvas }: { progress: number; onCanvas?: (c: HTMLCanvasElement) => void }) {`

### /home/user/jarvis-app/underworld/web/src/components/Layout.tsx (187 lines)
- purpose: App shell — glass sidebar nav, live world stats (alive/total/ticks/worlds), topbar, Outlet; sign-out.
- exports: `Layout` (default).
- WIRED (real `api.listWorlds` polled every 5s; clearApiKey on sign-out).
- **PROOF-OF-READ:** L143 `          <button`

### /home/user/jarvis-app/underworld/web/src/components/MinionDrawer.tsx (521 lines)
- purpose: Minion detail drawer — polls ~11 endpoints (state/skills/memories/rels/dna/soul/lineage/beliefs/models/appearance/brain), in-character chat, fork action.
- exports: `MinionDrawer` (default); `NeedBar`, `TraitBar`, `TalkSection` internals.
- WIRED (many real `api.*` queries at 3s poll; `api.chatMinion`, `api.fork` mutations).
- **PROOF-OF-READ:** L289 `        <TalkSection minionId={m.id} name={m.name} alive={m.alive} />`

### /home/user/jarvis-app/underworld/web/src/components/MoodBar.tsx (60 lines)
- purpose: Stacked mood-distribution bar + legend from a breakdown record.
- exports: `MoodBar` (default).
- SHELL (presentational; renders passed-in data).
- **PROOF-OF-READ:** L42 `        {ORDER.map((m) => {`

### /home/user/jarvis-app/underworld/web/src/components/Sparkline.tsx (40 lines)
- purpose: SVG sparkline (line + area) from a numeric series.
- exports: `Sparkline` (default).
- SHELL (presentational).
- **PROOF-OF-READ:** L33 `  const area = \`${line} L${width} ${height} L0 ${height} Z\`;`

### /home/user/jarvis-app/underworld/web/src/components/WorldSystems.tsx (195 lines)
- purpose: World-systems dashboard — climate/environment/physics/society/discoveries/gaps/species/memes panels, refreshes per tick.
- exports: `WorldSystems` (default); `Stat`, `Bar` internals.
- WIRED (9 real `api.*` queries keyed by world+tick).
- **PROOF-OF-READ:** L175 `function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {`

### /home/user/jarvis-app/underworld/web/src/components/ui/Avatar.tsx (53 lines)
- purpose: Deterministic procedural hex avatar derived from a seed string.
- exports: `Avatar` (default).
- SHELL (presentational).
- **PROOF-OF-READ:** L44 `      <circle cx="16" cy={eyeY} r="2.4" fill={dark} />`

### /home/user/jarvis-app/underworld/web/src/components/ui/CopyButton.tsx (33 lines)
- purpose: Copy-to-clipboard button with copied state.
- exports: `CopyButton` (default).
- SHELL (uses clipboard API; presentational widget).
- **PROOF-OF-READ:** L29 `      {copied ? <Check size={size} className="text-glow-jade" /> : <Copy size={size} />}`

### /home/user/jarvis-app/underworld/web/src/components/ui/EmptyState.tsx (23 lines)
- purpose: Empty-state placeholder (icon/title/hint/action).
- exports: `EmptyState` (default).
- SHELL (presentational).
- **PROOF-OF-READ:** L19 `      {hint ? <div className="max-w-xs text-[10px] text-zinc-500">{hint}</div> : null}`

### /home/user/jarvis-app/underworld/web/src/components/ui/GuildBadge.tsx (43 lines)
- purpose: Guild badge with per-guild color/icon/label metadata.
- exports: `GUILD_META`, `GuildBadge` (default).
- SHELL (presentational).
- **PROOF-OF-READ:** L34 `    <span`

### /home/user/jarvis-app/underworld/web/src/components/ui/ProgressBar.tsx (39 lines)
- purpose: 0..1 progress bar with auto/variant color.
- exports: `ProgressBar` (default).
- SHELL (presentational).
- **PROOF-OF-READ:** L32 `        <div`

### /home/user/jarvis-app/underworld/web/src/components/ui/RoleBadge.tsx (49 lines)
- purpose: Swarm-role badge with per-role color/icon/label metadata.
- exports: `ROLE_META`, `RoleBadge` (default).
- SHELL (presentational).
- **PROOF-OF-READ:** L39 `    <span`

### /home/user/jarvis-app/underworld/web/src/components/ui/StatCard.tsx (59 lines)
- purpose: Stat card with accent glow + optional sparkline.
- exports: `StatCard` (default).
- SHELL (presentational; composes Sparkline).
- **PROOF-OF-READ:** L46 `      {series && series.length > 0 ? (`

### /home/user/jarvis-app/underworld/web/src/components/ui/Tabs.tsx (41 lines)
- purpose: Generic typed tab strip with counts.
- exports: `Tabs` (default).
- SHELL (presentational).
- **PROOF-OF-READ:** L31 `            {t.count !== undefined ? (`

### Underworld 3D scene — `underworld/web/src/components/scene/`

### /home/user/jarvis-app/underworld/web/src/components/scene/assets.ts (201 lines)
- purpose: Catalog of CC0 GLB/texture asset paths (Kenney kits, Polyhaven) + per-guild character lookup.
- exports: `characterModelFor`, `ALL_CHARACTER_MODELS`, `CITY_BUILDINGS`, `CARS`, `TEXTURE_SETS`, `HDRI_SKY`, etc.
- SHELL (static asset registry; paths consumed by WIRED loaders).
- **PROOF-OF-READ:** L178 `export const TEXTURE_SETS = {`

### /home/user/jarvis-app/underworld/web/src/components/scene/colliders.ts (58 lines)
- purpose: AABB/distance collider type + `clampToFree` push-out for avatar movement.
- exports: `Collider`, `clampToFree`.
- SHELL (pure geometry math).
- **PROOF-OF-READ:** L41 `      if (d2 < minDist * minDist) {`

### /home/user/jarvis-app/underworld/web/src/components/scene/generated.ts (27 lines)
- purpose: Loads /models/generated/manifest.json (Tripo/script-generated GLBs).
- exports: `GeneratedAsset`, `loadGeneratedManifest`.
- WIRED (real fetch of generated manifest).
- **PROOF-OF-READ:** L23 `    return Object.entries(data).map(([slug, entry]) => ({ slug, ...entry }));`

### /home/user/jarvis-app/underworld/web/src/components/scene/generatedAssets.ts (63 lines)
- purpose: Loads + groups Tripo3D scraped asset manifest into placeable GLBs.
- exports: `GenAsset`, `loadGeneratedAssets`, `groupByCategory`.
- WIRED (real fetch of scraped manifest).
- **PROOF-OF-READ:** L57 `export function groupByCategory(assets: GenAsset[]): Record<string, GenAsset[]> {`

### /home/user/jarvis-app/underworld/web/src/components/scene/navmesh.ts (147 lines)
- purpose: Coarse occupancy grid + A* pathfinding with line-of-sight string-pulling for minion routing.
- exports: `findPath`.
- SHELL (pure pathfinding algorithm).
- **PROOF-OF-READ:** L124 `  if (!came.has(gId) && sId !== gId) return [goal];  // unreachable → best effort`

### /home/user/jarvis-app/underworld/web/src/components/scene/pois.ts (261 lines)
- purpose: Poisson-disk POI placement (obelisk/huts/trees/rocks/plazas) + action→destination resolution.
- exports: `Pois`, `mulberry32`, `computePois`, `destinationForAction`.
- SHELL (pure procedural placement; seeded RNG).
- **PROOF-OF-READ:** L196 `const ACTION_DEST: Record<string, DestKind> = {`

### /home/user/jarvis-app/underworld/web/src/components/scene/usePbrTexture.ts (31 lines)
- purpose: Hook loading a Polyhaven diff/norm/rough texture triplet with tiling.
- exports: `TextureKey`, `usePbrTexture`.
- WIRED (loads real texture assets via useLoader).
- **PROOF-OF-READ:** L25 `    return {`

### /home/user/jarvis-app/underworld/web/src/components/scene/CelestialBodies.tsx (83 lines)
- purpose: Emissive sun + moon discs following the diurnal cycle.
- exports: `CelestialBodies` (default).
- SHELL (presentational R3F; derives from tick).
- **PROOF-OF-READ:** L69 `      {moonVisible && (`

### /home/user/jarvis-app/underworld/web/src/components/scene/CharacterController.tsx (80 lines)
- purpose: Third-person follow-cam + WASD forwarding for the selected minion.
- exports: `CharacterController` (default).
- SHELL (presentational R3F input/camera; no backend).
- **PROOF-OF-READ:** L67 `    const horiz = Math.cos(pitchRef.current) * followDistance;`

### /home/user/jarvis-app/underworld/web/src/components/scene/GlbModel.tsx (62 lines)
- purpose: Generic non-skinned GLB loader/cloner with emissive-glow heuristic.
- exports: `GlbModel` (default).
- WIRED (loads real GLB via useGLTF).
- **PROOF-OF-READ:** L49 `        if (emissive > 0) {`

### /home/user/jarvis-app/underworld/web/src/components/scene/Water.tsx (73 lines)
- purpose: three.js Water reflector mesh with sun-synced shader + resource disposal.
- exports: `Water` (default).
- WIRED (loads real water-normal texture; live reflection render).
- **PROOF-OF-READ:** L62 `  useEffect(() => {`

### /home/user/jarvis-app/underworld/web/src/components/scene/Vehicles.tsx (88 lines)
- purpose: Cosmetic cars driving circular loops on the road network.
- exports: `Vehicles` (default), internal `Car`.
- WIRED (loads real car GLBs; live animation).
- **PROOF-OF-READ:** L70 `  useFrame((_, dt) => {`

### /home/user/jarvis-app/underworld/web/src/components/scene/NormalizedGlb.tsx (97 lines)
- purpose: Auto-normalizes arbitrary-scale Tripo GLBs (measure/scale/recenter/ground-snap).
- exports: `NormalizedGlb` (default).
- WIRED (loads real GLB via useGLTF).
- **PROOF-OF-READ:** L86 `  const base: [number, number, number] = [`

### /home/user/jarvis-app/underworld/web/src/components/scene/PixelStreamingViewer.tsx (121 lines)
- purpose: UE5 Pixel Streaming bridge — iframe to a signaling server with input/world-id forwarding.
- exports: `PixelStreamingViewer` (default).
- WIRED-capable but currently unwired SHELL: renders a real iframe but depends on an external GPU streamer URL not provided in-repo; not mounted by any page.
- **PROOF-OF-READ:** L90 `  return (`

### /home/user/jarvis-app/underworld/web/src/components/scene/InstancedCity.tsx (123 lines)
- purpose: GPU-instanced low-poly city (buildings/roofs/trees/rocks) in ~6 draw calls.
- exports: `CityBuilding`, `CityTree`, `CityRock`, `InstancedCity` (default).
- SHELL (procedural instanced geometry; no backend).
- **PROOF-OF-READ:** L92 `            {trees.map((t, i) => {`

### /home/user/jarvis-app/underworld/web/src/components/scene/Weather.tsx (126 lines)
- purpose: Rain/snow particle fields + `weatherFor` biome/tick selector.
- exports: `WeatherKind`, `Weather` (default), `weatherFor`.
- SHELL (procedural particle FX).
- **PROOF-OF-READ:** L115 `export function weatherFor(biomeHint: string, tick: number): WeatherKind {`

### /home/user/jarvis-app/underworld/web/src/components/scene/GuildAccessory.tsx (169 lines)
- purpose: Per-guild floating procedural prop above each avatar.
- exports: `GuildAccessory` (default).
- SHELL (procedural geometry).
- **PROOF-OF-READ:** L150 `    case "maths":`

### /home/user/jarvis-app/underworld/web/src/components/scene/Lights.tsx (173 lines)
- purpose: `diurnal()` time-of-day model + three-point light rig (key/fill/rim) with shadows.
- exports: `diurnal`, `Lights` (default).
- SHELL (presentational lighting; derives from tick).
- **PROOF-OF-READ:** L138 `      <directionalLight`

### /home/user/jarvis-app/underworld/web/src/components/scene/Terrain.tsx (233 lines)
- purpose: Splat-mapped multi-PBR-layer terrain — displaced heightmap geometry + custom onBeforeCompile shader.
- exports: `elevationAt`, `Terrain` (default).
- WIRED (loads real Polyhaven textures; renders heightmap grid).
- **PROOF-OF-READ:** L180 `export default function Terrain({ grid, size, amplitude }: Props) {`

### /home/user/jarvis-app/underworld/web/src/components/scene/Environment.tsx (250 lines)
- purpose: World environment — central castle tower monument, roads, civic landmark GLBs+labels, lanterns, fountains over InstancedCity.
- exports: `WorldEnvironment` (default); `CentralTower`, `Road` internals.
- WIRED (loads real Kenney GLBs + dirt textures).
- **PROOF-OF-READ:** L202 `  return (`

### /home/user/jarvis-app/underworld/web/src/components/scene/GeneratedWorld.tsx (275 lines)
- purpose: Places account-owned Tripo3D GLBs deterministically over POIs (monument/buildings/nature/props/vehicles/weapons).
- exports: `GeneratedWorld` (default).
- WIRED (loads scraped assets + renders real GLBs via NormalizedGlb).
- **PROOF-OF-READ:** L189 `    const clutter = byCat.prop;`

### /home/user/jarvis-app/underworld/web/src/components/scene/MinionAvatar.tsx (438 lines)
- purpose: One minion avatar — skinned GLB clone, guild tint, action→animation clip mapping, navmesh walking, control mode, thought/label bubbles.
- exports: `MinionAvatar` (default).
- WIRED (renders live minion data props; loads real character GLBs; navmesh routing).
- **PROOF-OF-READ:** L320 `      const td = Math.hypot(targetPosition[0] - g.position.x, targetPosition[2] - g.position.z);`

### /home/user/jarvis-app/underworld/web/src/components/scene/WorldScene3D.tsx (524 lines)
- purpose: Top-level R3F canvas — terrain/water/environment/generated-world/vehicles/weather/minions, follow-cam + WASD override, full post-FX stack (N8AO/SSR/Bloom/SMAA/grade), LOD.
- exports: `WorldScene3D` (default); `FollowRig`, `WasdInput`, `placeMinion` internals.
- WIRED (renders live minions/tick/actions/thoughts props from backend; HDRI/textures/GLBs).
- **PROOF-OF-READ:** L390 `          {visiblePlacements.map((p) => {`

### Underworld pages — `underworld/web/src/pages/`

### /home/user/jarvis-app/underworld/web/src/pages/Safety.tsx (154 lines)
- purpose: Safety gate dashboard — recent blocks list + probe form running server-side safety checks.
- exports: `Safety` (default).
- WIRED (real `api.listSafetyReviews` poll + `api.safetyCheck` mutation).
- **PROOF-OF-READ:** L126 `        {reviews.data && reviews.data.length > 0 ? (`

### /home/user/jarvis-app/underworld/web/src/pages/PatentScanner.tsx (160 lines)
- purpose: USPTO patent search via backend — query + expired filter, results with Google Patents links.
- exports: `PatentScanner` (default).
- WIRED (real `api.searchPatents` mutation).
- **PROOF-OF-READ:** L107 `            {search.data.map((p) => (`

### /home/user/jarvis-app/underworld/web/src/pages/InventionDetail.tsx (233 lines)
- purpose: Invention detail — brief, feasibility/novelty/safety scores, operator approve/reject/veto decision, peer reviews.
- exports: `InventionDetail` (default); `BriefRow`, `ScoreBlock` internals.
- WIRED (real `api.getInvention`/`listReviews` polls + `api.decideInvention` mutation).
- **PROOF-OF-READ:** L207 `function BriefRow({ label, body }: { label: string; body: string }) {`

### /home/user/jarvis-app/underworld/web/src/pages/InventionList.tsx (280 lines)
- purpose: Cross-world invention log — aggregates inventions across all worlds, status filter, charter form.
- exports: `InventionList` (default); `CharterPanel`, `ScoreCell` internals.
- WIRED (real `api.listWorlds`/`listInventions` + `api.charterInvention` mutation).
- **PROOF-OF-READ:** L200 `    <section className="panel-elevated">`

### /home/user/jarvis-app/underworld/web/src/pages/Guilds.tsx (303 lines)
- purpose: Guild lore browser — guild cards + expandable lore drawer (myth/hero/rituals/checklist/skills).
- exports: `Guilds` (default); `LoreDrawer`, `Block` internals.
- WIRED (real `api.guilds` query).
- **PROOF-OF-READ:** L207 `          {g.rituals && g.rituals.length > 0 ? (`

### /home/user/jarvis-app/underworld/web/src/pages/KnowledgeLibrary.tsx (323 lines)
- purpose: KB browser — formulas (filter/paginate)/concepts/swarm-roles/guardrails tabs from the knowledge base.
- exports: `KnowledgeLibrary` (default).
- WIRED (real `api.kbSummary/kbConcepts/kbFormulas/kbRoles/kbGuardrails`).
- **PROOF-OF-READ:** L236 `              <div className="flex items-center justify-between border-t border-glow-purple/10 p-3 text-[10px]">`

### /home/user/jarvis-app/underworld/web/src/pages/Projects.tsx (333 lines)
- purpose: Research-project kanban — world selector, stage-grouped board, contribution drill-down.
- exports: `Projects` (default).
- WIRED (real `api.listProjects`/`projectWorldSummary`/`listProjectContributions` polls).
- **PROOF-OF-READ:** L223 `      {selectedProj && contributions.data ? (`

### /home/user/jarvis-app/underworld/web/src/pages/CommandCentre.tsx (423 lines)
- purpose: Landing — forge-world form (CPC seed chips, pop/cap/age, auto-start), aggregate stats, live worlds grid with delete.
- exports: `CommandCentre` (default).
- WIRED (real `api.listWorlds` poll + `api.createWorld`/`deleteWorld` mutations).
- **PROOF-OF-READ:** L303 `            {worlds.data.map((w) => {`

### /home/user/jarvis-app/underworld/web/src/pages/Population.tsx (458 lines)
- purpose: Demographic dashboard — population flow sparklines, mood/guild/role distribution, minion roster with kill/fork/breed.
- exports: `Population` (default); `MinionRoster` internal.
- WIRED (real `api.population`/`listMinions` polls + `api.killMinion`/`fork`/`breed` mutations).
- **PROOF-OF-READ:** L309 `function MinionRoster({`

### /home/user/jarvis-app/underworld/web/src/pages/WorldDetail.tsx (674 lines)
- purpose: Per-world cockpit — advance/auto-toggle controls, 3D WebGL scene (or UE5 pixel-stream tier), selection HUD, overview/population/systems/events tabs, MinionDrawer.
- exports: `WorldDetail` (default).
- WIRED (many real `api.*` polls: world/map/minions/events/inventions/population/actions/climate/thoughts; SSE `useWorldStream`; advance/autoToggle mutations; renders WorldScene3D with live data).
- **PROOF-OF-READ:** L422 `                  <WorldScene3D`
