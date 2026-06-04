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
  { id: "apex",      label: "APEX CORE",       color: "#f07820" },
  { id: "knowledge", label: "KNOWLEDGE",       color: "#e8a800" },
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

  // ── COMMAND ────────────────────────────────────────────────────────────
  { name: "CommandCenter", label: "Command Center", icon: "⌘", group: "command",
    component: P(() => import("@/pages/CommandCenter")) },
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
