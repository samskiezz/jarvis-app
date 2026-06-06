/**
 * pageRegistry — single source of truth for every page in the Jarvis Palantir app.
 *
 * This is the spine the live Base44 app never had in code: one declarative list
 * that drives the router (App.jsx), the consolidated nav dock (Layout.jsx), and
 * page-to-page navigation. Adding a page = one entry here + the component.
 *
 * `group` clusters pages in the dock so the nav reads as a handful of sections
 * instead of a wall of links. `dest` separates the two top-level destinations:
 * APEX pages (the HUD, dest undefined/"apex") vs the Underworld sim (dest:
 * "underworld") which is reached as a peer and never shows in the APEX nav.
 */

// Lazy imports keep the initial bundle small — each page is its own chunk.
import { lazy } from "react";

const P = (loader) => lazy(loader);

// The six APEX domains. Underworld is a separate top-level destination and is
// intentionally not a GROUP here.
export const GROUPS = [
  { id: "intel",     label: "INTEL",           color: "#00c878" },
  { id: "command",   label: "COMMAND",         color: "#0096d4" },
  { id: "cognition", label: "COGNITION",       color: "#a855f7" },
  { id: "sensors",   label: "SENSORS",         color: "#0096d4" },
  { id: "apex",      label: "APEX CORE",       color: "#f07820" },
  { id: "knowledge", label: "KNOWLEDGE",       color: "#e8a800" },
  { id: "platform",  label: "PLATFORM",        color: "#0096d4" },
  { id: "war",       label: "WAR",             color: "#e8203c" },
  { id: "wealth",    label: "WEALTH & SYSTEM", color: "#566878" },
];

/**
 * Each page: { name (route + nav id), label, icon, group, component, home?,
 * dest?, aliases? }.
 * `name` is the PascalCase route segment; createPageUrl turns it into the path.
 * `dest: "underworld"` flags sim/theatre pages so they stay out of the APEX dock
 * while keeping their routes reachable by URL / from the Underworld destination.
 * `aliases` is an optional list of alternate search terms (used later by the
 * command palette) — purely metadata, no behavior change.
 */
export const PAGES = [
  // ── INTEL ──────────────────────────────────────────────────────────────
  { name: "JarvisTerminal", label: "Jarvis Terminal", icon: "◆", group: "intel", home: true,
    component: P(() => import("@/pages/JarvisTerminal")) },
  { name: "GlobalIntel", label: "Global Intel", icon: "🌐", group: "intel",
    component: P(() => import("@/pages/GlobalIntel")) },
  { name: "SystemIntel", label: "System Intel", icon: "📡", group: "intel",
    component: P(() => import("@/pages/SystemIntel")) },
  { name: "AlertsNotificationCenter", label: "Alerts & Notifications", icon: "🔔", group: "intel",
    component: P(() => import("@/pages/AlertsNotificationCenter")) },
  { name: "GeoMap", label: "Geo Map", icon: "🗺️", group: "intel",
    aliases: ["map", "geo", "geospatial", "earthquakes"],
    component: P(() => import("@/pages/GeoMap")) },
  { name: "Dashboard", label: "Dashboard", icon: "📊", group: "intel",
    aliases: ["dashboard", "metrics", "overview"],
    component: P(() => import("@/pages/Dashboard")) },

  // ── COMMAND ────────────────────────────────────────────────────────────
  { name: "CommandCenter", label: "Command Center", icon: "⌘", group: "command",
    component: P(() => import("@/pages/CommandCenter")) },
  { name: "WorldOps", label: "World OS", icon: "✨", group: "command",
    aliases: ["foundry","gotham","apollo","endpoints","points","status"],
    component: P(() => import("@/pages/WorldOps")) },
  // ── PLANES (Drive UI architecture, wired to /v1/jarvis/*) ──────────────
  { name: "CommandOverview", label: "Command Overview", icon: "▣", group: "jarvis",
    aliases: ["cockpit","overview","home"], component: P(() => import("@/pages/CommandOverview")) },
  { name: "SourceCatalogue", label: "Source Catalogue", icon: "🗜", group: "foundry",
    aliases: ["sources","endpoints","92k"], component: P(() => import("@/pages/SourceCatalogue")) },
  { name: "VectorMemory", label: "Vector Memory", icon: "🧠", group: "foundry",
    aliases: ["rag","retrieval","vectors"], component: P(() => import("@/pages/VectorMemory")) },
  { name: "FleetHealth", label: "Fleet Health", icon: "🚀", group: "apollo",
    component: P(() => import("@/pages/FleetHealth")) },
  { name: "RolloutControl", label: "Rollout Control", icon: "🎚", group: "apollo",
    component: P(() => import("@/pages/RolloutControl")) },
  { name: "DesiredState", label: "Desired State", icon: "🎯", group: "apollo",
    component: P(() => import("@/pages/DesiredState")) },
  { name: "AgentGovernance", label: "Agent Governance", icon: "🛡", group: "aip",
    component: P(() => import("@/pages/AgentGovernance")) },
  { name: "AuditReplay", label: "Audit Replay", icon: "📜", group: "audit",
    component: P(() => import("@/pages/AuditReplay")) },
  { name: "ActionApprovalQueue", label: "Action Approvals", icon: "✅", group: "gotham",
    aliases: ["approvals","queue"], component: P(() => import("@/pages/ActionApprovalQueue")) },
  { name: "PipelineMonitor", label: "Pipeline Monitor", icon: "⛓", group: "command",
    component: P(() => import("@/pages/PipelineMonitor")) },

  // ── COGNITION ──────────────────────────────────────────────────────────
  { name: "MLHub", label: "ML Hub", icon: "🧠", group: "cognition",
    component: P(() => import("@/pages/MLHub")) },
  { name: "MLDashboard", label: "ML Dashboard", icon: "📊", group: "cognition",
    component: P(() => import("@/pages/MLDashboard")) },
  { name: "TechTree", label: "Tech Tree", icon: "🌳", group: "cognition",
    component: P(() => import("@/pages/TechTree")) },
  { name: "PredictionOracle", label: "Prediction Oracle", icon: "🔮", group: "cognition",
    aliases: ["predict", "forecast", "oracle", "prediction"],
    component: P(() => import("@/pages/PredictionOracle")) },
  { name: "NeuralCore", label: "Neural Core", icon: "🧠", group: "cognition",
    aliases: ["neural", "brain", "perceptron", "neurons"],
    component: P(() => import("@/pages/NeuralCore")) },
  { name: "ScienceConsole", label: "Science Console", icon: "🔬", group: "cognition",
    aliases: ["science", "methods", "compute"],
    component: P(() => import("@/pages/ScienceConsole")) },

  // ── SENSORS (curated slices of the bridged 449-method science engine) ────
  { name: "SensorGrid", label: "Sensor Grid", icon: "🛰️", group: "sensors",
    aliases: ["sensor", "ppm", "buoy", "ocean", "air", "seismic", "hydrology"],
    component: P(() => import("@/pages/SensorGrid")) },
  { name: "SkyOrbital", label: "Sky / Orbital", icon: "☄️", group: "sensors",
    aliases: ["sky", "meteor", "flight", "orbital", "satellite", "asteroid", "aero"],
    component: P(() => import("@/pages/SkyOrbital")) },
  { name: "RFSpectrum", label: "RF / Spectrum", icon: "📡", group: "sensors",
    aliases: ["rf", "spectrum", "sonar", "frequency", "signal", "acoustics"],
    component: P(() => import("@/pages/RFSpectrum")) },

  // ── APEX CORE ──────────────────────────────────────────────────────────
  { name: "ApexCore", label: "Apex Core", icon: "◉", group: "apex",
    component: P(() => import("@/pages/ApexCore")) },
  { name: "PluginControlPlane", label: "Plugin Control Plane", icon: "🔌", group: "apex",
    component: P(() => import("@/pages/PluginControlPlane")) },
  { name: "PluginIntegrationProof", label: "Plugin Integration Proof", icon: "✓", group: "apex",
    component: P(() => import("@/pages/PluginIntegrationProof")) },

  // ── KNOWLEDGE ──────────────────────────────────────────────────────────
  { name: "PatentsSearch", label: "Patents Search", icon: "🔎", group: "knowledge",
    component: P(() => import("@/pages/PatentsSearch")) },
  { name: "PatentRegistry", label: "Patent Registry", icon: "📜", group: "knowledge",
    component: P(() => import("@/pages/PatentRegistry")) },
  { name: "PatentIngest", label: "Patent Ingest", icon: "📥", group: "knowledge",
    component: P(() => import("@/pages/PatentIngest")) },
  { name: "KGIKBrain", label: "KGIK Brain", icon: "🧬", group: "knowledge",
    component: P(() => import("@/pages/KGIKBrain")) },
  { name: "KGIKLedger", label: "KGIK Ledger", icon: "📒", group: "knowledge",
    component: P(() => import("@/pages/KGIKLedger")) },
  { name: "TCIS", label: "TCIS", icon: "⟁", group: "knowledge",
    component: P(() => import("@/pages/TCIS")) },

  // ── PLATFORM (Wave-1 backends: ontology · search · ops · graph) ──────────
  { name: "OntologyManager", label: "Ontology Manager", icon: "🗃️", group: "platform",
    aliases: ["ontology", "objects", "entities"],
    component: P(() => import("@/pages/OntologyManager")) },
  { name: "SearchHub", label: "Search Hub", icon: "🔎", group: "platform",
    aliases: ["search", "find", "resolve"],
    component: P(() => import("@/pages/SearchHub")) },
  { name: "Operations", label: "Operations", icon: "🚨", group: "platform",
    aliases: ["alerts", "rules", "cases", "ops"],
    component: P(() => import("@/pages/Operations")) },
  { name: "GraphOps", label: "Graph Ops", icon: "🕸️", group: "platform",
    aliases: ["graph", "bridge", "pagerank", "optimize", "counterfactual"],
    component: P(() => import("@/pages/GraphOps")) },

  // ── PLATFORM (Wave-4 backends: link graph · reports · collab) ────────────
  { name: "LinkAnalysis", label: "Link Analysis", icon: "🕸️", group: "platform",
    aliases: ["graph", "link", "network", "paths", "communities", "centrality", "subgraph"],
    component: P(() => import("@/pages/LinkAnalysis")) },
  { name: "Reports", label: "Reports", icon: "📄", group: "platform",
    aliases: ["report", "brief", "export", "dossier", "markdown"],
    component: P(() => import("@/pages/Reports")) },
  { name: "Activity", label: "Activity", icon: "📣", group: "platform",
    aliases: ["activity", "feed", "collab", "notes", "audit"],
    component: P(() => import("@/pages/Activity")) },

  // ── PLATFORM (builder · workshop · admin) ────────────────────────────────
  { name: "DashboardBuilder", label: "Dashboard Builder", icon: "📐", group: "platform",
    aliases: ["dashboard", "builder", "widgets"],
    component: P(() => import("@/pages/DashboardBuilder")) },
  { name: "ObjectExplorer", label: "Object Explorer", icon: "📊", group: "platform",
    aliases: ["explorer", "histogram", "pivot", "workshop"],
    component: P(() => import("@/pages/ObjectExplorer")) },
  { name: "SystemAdmin", label: "System Admin", icon: "⚙️", group: "platform",
    aliases: ["admin", "metrics", "health", "labs", "system"],
    component: P(() => import("@/pages/SystemAdmin")) },

  // ── PLATFORM (Wave-6 backends: temporal · geo · scenario) ────────────────
  { name: "TemporalConsole", label: "Temporal Console", icon: "⏱️", group: "platform",
    aliases: ["temporal", "timeline", "replay", "events", "anomaly", "scrubber"],
    component: P(() => import("@/pages/TemporalConsole")) },
  { name: "GeoWorkspace", label: "Geo Workspace", icon: "🗺️", group: "platform",
    aliases: ["geo", "map", "geospatial", "radius", "geofence", "layers", "tracks"],
    component: P(() => import("@/pages/GeoWorkspace")) },
  { name: "ScenarioLab", label: "Scenario Lab", icon: "🧪", group: "platform",
    aliases: ["scenario", "whatif", "what-if", "optimize", "model registry", "drift"],
    component: P(() => import("@/pages/ScenarioLab")) },
  { name: "SemanticDiscover", label: "Semantic Discover", icon: "🧠", group: "platform",
    aliases: ["semantic", "vector", "rag", "embedding", "discover", "nl query", "natural language"],
    component: P(() => import("@/pages/SemanticDiscover")) },
  { name: "DataCatalog", label: "Data Catalog", icon: "🗂️", group: "platform",
    aliases: ["datasets", "catalog", "lineage", "transform", "schema", "data health", "provenance"],
    component: P(() => import("@/pages/DataCatalog")) },
  { name: "AIPActions", label: "AIP Actions", icon: "🤖", group: "platform",
    aliases: ["aip", "actions", "tools", "proposals", "agent", "workflow", "write-back"],
    component: P(() => import("@/pages/AIPActions")) },
  { name: "TenantAdmin", label: "Tenant Admin", icon: "🏛️", group: "platform",
    aliases: ["tenant", "tenancy", "multi-tenant", "members", "org", "whoami"],
    component: P(() => import("@/pages/TenantAdmin")) },
  { name: "SourcesConsole", label: "Sources", icon: "🔌", group: "platform",
    aliases: ["sources", "connectors", "ingest", "rest", "csv", "rss", "backfill", "preview"],
    component: P(() => import("@/pages/SourcesConsole")) },
  { name: "GatewayConsole", label: "Gateway", icon: "🌉", group: "platform",
    aliases: ["gateway", "underworld", "proxy", "unify", "sim", "worlds"],
    component: P(() => import("@/pages/GatewayConsole")) },
  { name: "SearchPlus", label: "Search+", icon: "🔭", group: "platform",
    aliases: ["facets", "saved search", "alerts", "paths", "search in graph"],
    component: P(() => import("@/pages/SearchPlus")) },
  { name: "ObjectSets", label: "Object Sets", icon: "📦", group: "platform",
    aliases: ["object sets", "bulk", "export", "import", "saved filter", "ontology ext"],
    component: P(() => import("@/pages/ObjectSets")) },
  { name: "ScienceConsoles", label: "Science Consoles", icon: "🔬", group: "platform",
    aliases: ["sonar","submarine","meteor","asteroid","buoy","ocean","air quality","ppm","flight","aerospace","rf","spectrum","frequency","neuron","neural","seismic","satellite","cluster","epidemic","quantum","materials","trajectory","science"],
    component: P(() => import("@/pages/ScienceConsoles")) },
  { name: "Investigations", label: "Investigations", icon: "🔍", group: "platform",
    aliases: ["investigation","case","graph case","playback","annotate","share","timeline graph"],
    component: P(() => import("@/pages/Investigations")) },
  { name: "Governance", label: "Governance", icon: "⚖️", group: "platform",
    aliases: ["governance","purpose","retention","subject rights","erase","gdpr","secrets","vault","policy"],
    component: P(() => import("@/pages/Governance")) },
  { name: "SecondBrain", label: "Second Brain", icon: "🧠", group: "knowledge",
    aliases: ["second brain","brain","notes","vault","wiki","wikilinks","capture","daily","research","ingest","reconcile","crm","obsidian","pkm","zettelkasten"],
    component: P(() => import("@/pages/SecondBrain")) },
  { name: "ForgeConsole", label: "Forge", icon: "🛠️", group: "apex",
    aliases: ["forge","code improve","self-improving","autonomous","approvals","ollama","agent"],
    component: P(() => import("@/pages/ForgeConsole")) },
  { name: "AutopilotConsole", label: "Autopilot", icon: "🧠", group: "apex",
    aliases: ["autopilot","auto-fill","knowledge gaps","self-improving brain","consolidate","gap fill","brain autopilot"],
    component: P(() => import("@/pages/AutopilotConsole")) },
  { name: "CaseBoard", label: "Case Board", icon: "🗂️", group: "platform",
    aliases: ["case","cases","kanban","investigation board","casework","case management"],
    component: P(() => import("@/pages/CaseBoard")) },
  { name: "PivotWorkshop", label: "Pivot Workshop", icon: "🧮", group: "platform",
    aliases: ["pivot","workshop","groupby","aggregate","crosstab","analysis","histogram"],
    component: P(() => import("@/pages/PivotWorkshop")) },
  { name: "LineageGraph", label: "Lineage", icon: "🧬", group: "platform",
    aliases: ["lineage","data lineage","dag","provenance","dataset flow","pipeline graph","upstream","downstream"],
    component: P(() => import("@/pages/LineageGraph")) },
  { name: "ActionRunner", label: "Actions", icon: "⚡", group: "platform",
    aliases: ["action","actions","writeback","ontology action","apply action","bulk action","mutate","edit object"],
    component: P(() => import("@/pages/ActionRunner")) },
  { name: "ObjectView", label: "Object View", icon: "🗂️", group: "platform",
    aliases: ["object view","foundry","object","properties","related","actions","detail","explorer"],
    component: P(() => import("@/pages/ObjectView")) },
  { name: "GraphCanvas", label: "Graph Canvas", icon: "🕸️", group: "platform",
    aliases: ["graph canvas","gotham","force graph","node-link","investigation","expand","network","link analysis"],
    component: P(() => import("@/pages/GraphCanvas")) },
  { name: "GraphTimeline", label: "Graph Timeline", icon: "⏳", group: "platform",
    aliases: ["graph timeline","playback","scrubber","graph over time","temporal graph","animate"],
    component: P(() => import("@/pages/GraphTimeline")) },
  { name: "AIPLogic", label: "AIP Logic", icon: "🧩", group: "platform",
    aliases: ["aip logic","agent studio","plan builder","logic","pipeline","tools","governed"],
    component: P(() => import("@/pages/AIPLogic")) },
  { name: "Quiver", label: "Quiver", icon: "📈", group: "platform",
    aliases: ["quiver","dashboard","charts","analytics","widgets","recharts","workshop"],
    component: P(() => import("@/pages/Quiver")) },

  // ── WEALTH & SYSTEM ──────────────────────────────────────────────────────
  { name: "InvestmentTracker", label: "Investment Tracker", icon: "💰", group: "wealth",
    component: P(() => import("@/pages/InvestmentTracker")) },
  { name: "SystemHealth", label: "System Health", icon: "❤", group: "wealth",
    component: P(() => import("@/pages/SystemHealth")) },

  // ── UNDERWORLD (separate destination — not shown in the APEX dock) ────────
  { name: "Underworld", label: "Underworld", icon: "🏙", group: "sim", dest: "underworld",
    component: P(() => import("@/pages/Underworld")) },
  { name: "War", label: "War", icon: "⚔", group: "war",
    component: P(() => import("@/pages/War")) },
  { name: "GameLeaderboard", label: "Game Leaderboard", icon: "🏆", group: "war",
    component: P(() => import("@/pages/GameLeaderboard")) },
];

export const HOME_PAGE = PAGES.find((p) => p.home) || PAGES[0];

// Only APEX pages (dest !== "underworld") cluster into the dock groups.
export const pagesByGroup = () =>
  GROUPS.map((g) => ({
    ...g,
    pages: PAGES.filter((p) => p.group === g.id && p.dest !== "underworld"),
  })).filter((g) => g.pages.length);

export const findPage = (name) => PAGES.find((p) => p.name === name);
