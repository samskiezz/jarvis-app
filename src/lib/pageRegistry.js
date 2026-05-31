/**
 * pageRegistry — single source of truth for every page in the Jarvis Palantir app.
 *
 * This is the spine the live Base44 app never had in code: one declarative list
 * that drives the router (App.jsx), the consolidated nav dock (Layout.jsx), and
 * page-to-page navigation. Adding a page = one entry here + the component.
 *
 * `group` clusters pages in the dock so the nav reads as a handful of sections
 * instead of a wall of 30 links.
 */

// Lazy imports keep the initial bundle small — each page is its own chunk.
import { lazy } from "react";

const P = (loader) => lazy(loader);

export const GROUPS = [
  { id: "intel",    label: "INTELLIGENCE", color: "#00c878" },
  { id: "command",  label: "COMMAND",      color: "#0096d4" },
  { id: "ml",       label: "ML / AI",      color: "#a855f7" },
  { id: "apex",     label: "APEX / PLUGINS", color: "#f07820" },
  { id: "patents",  label: "PATENTS",      color: "#e8a800" },
  { id: "kgik",     label: "KGIK",         color: "#00c878" },
  { id: "sim",      label: "SIMULATION",   color: "#e8203c" },
  { id: "wealth",   label: "WEALTH",       color: "#e8a800" },
  { id: "system",   label: "SYSTEM",       color: "#566878" },
];

/**
 * Each page: { name (route + nav id), label, icon, group, component, home? }.
 * `name` is the PascalCase route segment; createPageUrl turns it into the path.
 */
export const PAGES = [
  // ── Intelligence ───────────────────────────────────────────────────────
  { name: "JarvisTerminal", label: "Jarvis Terminal", icon: "◆", group: "intel", home: true,
    component: P(() => import("@/pages/JarvisTerminal")) },
  { name: "GlobalIntel", label: "Global Intel", icon: "🌐", group: "intel",
    component: P(() => import("@/pages/GlobalIntel")) },
  { name: "SystemIntel", label: "System Intel", icon: "📡", group: "intel",
    component: P(() => import("@/pages/SystemIntel")) },
  { name: "AlertsNotificationCenter", label: "Alerts & Notifications", icon: "🔔", group: "intel",
    component: P(() => import("@/pages/AlertsNotificationCenter")) },

  // ── Command ────────────────────────────────────────────────────────────
  { name: "CommandCenter", label: "Command Center", icon: "⌘", group: "command",
    component: P(() => import("@/pages/CommandCenter")) },
  { name: "Command", label: "Command", icon: "▶", group: "command",
    component: P(() => import("@/pages/Command")) },
  { name: "AxisCommand", label: "Axis Command", icon: "✥", group: "command",
    component: P(() => import("@/pages/AxisCommand")) },
  { name: "PipelineMonitor", label: "Pipeline Monitor", icon: "⛓", group: "command",
    component: P(() => import("@/pages/PipelineMonitor")) },

  // ── ML / AI ────────────────────────────────────────────────────────────
  { name: "MLHub", label: "ML Hub", icon: "🧠", group: "ml",
    component: P(() => import("@/pages/MLHub")) },
  { name: "MLDashboard", label: "ML Dashboard", icon: "📊", group: "ml",
    component: P(() => import("@/pages/MLDashboard")) },
  { name: "TechTree", label: "Tech Tree", icon: "🌳", group: "ml",
    component: P(() => import("@/pages/TechTree")) },

  // ── Apex / Plugins ───────────────────────────────────────────────────────
  { name: "ApexCore", label: "Apex Core", icon: "◉", group: "apex",
    component: P(() => import("@/pages/ApexCore")) },
  { name: "PluginControlPlane", label: "Plugin Control Plane", icon: "🔌", group: "apex",
    component: P(() => import("@/pages/PluginControlPlane")) },
  { name: "PluginIntegrationProof", label: "Plugin Integration Proof", icon: "✓", group: "apex",
    component: P(() => import("@/pages/PluginIntegrationProof")) },

  // ── Patents ──────────────────────────────────────────────────────────────
  { name: "PatentsSearch", label: "Patents Search", icon: "🔎", group: "patents",
    component: P(() => import("@/pages/PatentsSearch")) },
  { name: "PatentRegistry", label: "Patent Registry", icon: "📜", group: "patents",
    component: P(() => import("@/pages/PatentRegistry")) },
  { name: "PatentIngest", label: "Patent Ingest", icon: "📥", group: "patents",
    component: P(() => import("@/pages/PatentIngest")) },

  // ── KGIK ───────────────────────────────────────────────────────────────
  { name: "KGIKBrain", label: "KGIK Brain", icon: "🧬", group: "kgik",
    component: P(() => import("@/pages/KGIKBrain")) },
  { name: "KGIKLedger", label: "KGIK Ledger", icon: "📒", group: "kgik",
    component: P(() => import("@/pages/KGIKLedger")) },
  { name: "TCIS", label: "TCIS", icon: "⟁", group: "kgik",
    component: P(() => import("@/pages/TCIS")) },

  // ── Simulation / Arena ───────────────────────────────────────────────────
  { name: "Underworld", label: "Underworld", icon: "🏙", group: "sim",
    component: P(() => import("@/pages/Underworld")) },
  { name: "WarEnvironment", label: "War Environment", icon: "🎯", group: "sim",
    component: P(() => import("@/pages/WarEnvironment")) },
  { name: "GameArena", label: "Game Arena", icon: "🕹", group: "sim",
    component: P(() => import("@/pages/GameArena")) },
  { name: "GameLeaderboard", label: "Game Leaderboard", icon: "🏆", group: "sim",
    component: P(() => import("@/pages/GameLeaderboard")) },
  { name: "HandParticles", label: "Hand Particles", icon: "✋", group: "sim",
    component: P(() => import("@/pages/HandParticles")) },
  { name: "ImageBlast", label: "Image Blast", icon: "💥", group: "sim",
    component: P(() => import("@/pages/ImageBlast")) },

  // ── Wealth ───────────────────────────────────────────────────────────────
  { name: "InvestmentTracker", label: "Investment Tracker", icon: "💰", group: "wealth",
    component: P(() => import("@/pages/InvestmentTracker")) },

  // ── System ───────────────────────────────────────────────────────────────
  { name: "SystemHealth", label: "System Health", icon: "❤", group: "system",
    component: P(() => import("@/pages/SystemHealth")) },
];

export const HOME_PAGE = PAGES.find((p) => p.home) || PAGES[0];

export const pagesByGroup = () =>
  GROUPS.map((g) => ({ ...g, pages: PAGES.filter((p) => p.group === g.id) })).filter((g) => g.pages.length);

export const findPage = (name) => PAGES.find((p) => p.name === name);
