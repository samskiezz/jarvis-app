/**
 * SystemSnapshotExport — F31
 * One-click export of live JARVIS state as a timestamped JSON file.
 * Parallel-fetches:
 *   /v1/jarvis/system/status · /v1/cinematic/brain
 *   /entities/RiskSignal     · /entities/Task
 *   /functions/getLiveIntel
 * Renders a small ⬇ SNAP button in the bottom HUD strip.
 * Additive only — mounted via App.jsx.
 */
import { useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const RED = "#FF4D6D";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const BTN = {
  position: "fixed",
  bottom: 18,
  left: 340 + 120, // right of OvernightPanels button
  zIndex: 9999,
  background: "rgba(0,0,0,0.72)",
  border: `1px solid ${CY}44`,
  borderRadius: 4,
  color: CY,
  fontSize: 10,
  letterSpacing: "0.08em",
  padding: "4px 8px",
  cursor: "pointer",
  fontFamily: "monospace",
  display: "flex",
  alignItems: "center",
  gap: 4,
  userSelect: "none",
  transition: "border-color 0.2s",
};

async function safeJson(url) {
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}` } });
    if (!r.ok) return { _error: r.status };
    return await r.json();
  } catch (e) {
    return { _error: String(e) };
  }
}

async function buildSnapshot() {
  const base = apiBase();
  const [status, brain, risks, tasks, intel] = await Promise.all([
    safeJson(`${base}/v1/jarvis/system/status`),
    safeJson(`${base}/v1/cinematic/brain`),
    safeJson(`${base}/entities/RiskSignal`),
    safeJson(`${base}/entities/Task`),
    safeJson(`${base}/functions/getLiveIntel`),
  ]);

  const riskArr = Array.isArray(risks)
    ? risks
    : risks?.data || risks?.items || risks?.results || [];

  const taskArr = Array.isArray(tasks)
    ? tasks
    : tasks?.data || tasks?.items || tasks?.results || [];

  return {
    _meta: {
      generated: new Date().toISOString(),
      tool: "JARVIS SystemSnapshotExport F31",
    },
    system_status: status,
    brain: brain,
    top_risks: riskArr
      .sort((a, b) => {
        const SEV = { critical: 4, high: 3, medium: 2, low: 1 };
        return (SEV[b?.severity?.toLowerCase()] || 0) -
               (SEV[a?.severity?.toLowerCase()] || 0);
      })
      .slice(0, 20),
    tasks: taskArr.slice(0, 50),
    live_intel: intel,
  };
}

function triggerDownload(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SystemSnapshotExport() {
  const [state, setState] = useState("idle"); // idle | loading | done | error

  const handleExport = useCallback(async () => {
    if (state === "loading") return;
    setState("loading");
    try {
      const snap = await buildSnapshot();
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      triggerDownload(snap, `jarvis-snapshot-${ts}.json`);
      setState("done");
      setTimeout(() => setState("idle"), 2500);
    } catch (e) {
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  }, [state]);

  const color =
    state === "done"  ? GRN :
    state === "error" ? RED :
    CY;

  const label =
    state === "loading" ? "…" :
    state === "done"    ? "SAVED" :
    state === "error"   ? "ERR" :
    "SNAP";

  return (
    <button
      style={{ ...BTN, borderColor: `${color}66`, color }}
      onClick={handleExport}
      title="Export live JARVIS state snapshot as JSON"
      aria-label="Download system snapshot"
    >
      <span style={{ fontSize: 11 }}>⬇</span>
      {label}
    </button>
  );
}
