/**
 * AttentionNudge — F31 JARVIS Attention Nudge.
 *
 * After NUDGE_INTERVAL_MS of inactivity (no jarvis:ask events), fetches:
 *   /entities/Task        → pending / blocked task count
 *   /entities/RiskSignal  → critical risk signal count
 * then speaks a concise attention-required brief via /v1/voice/tts.
 * Resets the inactivity timer whenever jarvis:ask fires.
 *
 * Toggle: ⚠ nudge indicator fixed top-right (below ticker bar).
 * Voice trigger: "nudge on / nudge off / enable nudge / disable nudge"
 * Event: jarvis:nudge-toggle
 *
 * Off by default — operator must enable.
 * Speaks at most once per interval even if multiple items are pending.
 * Additive only — mounted via App.jsx; intent exported for JarvisBrain.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const NUDGE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const CHECK_INTERVAL_MS = 30_000;         // check every 30 s

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const NUDGE_RE = /\bnudge\b|\battention.nudge\b|\benable.nudge\b|\bdisable.nudge\b|\bnudge.(on|off)\b/i;

export function isNudgeQuery(text) {
  return NUDGE_RE.test(text || "");
}

export function buildNudgeScript(enabled) {
  if (enabled) return "Attention nudge is now disabled, sir.";
  return "Attention nudge armed. I will alert you when tasks or risks require your attention, sir.";
}

async function fetchPendingTasks() {
  try {
    const r = await fetch(`${apiBase()}/entities/Task`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!r.ok) return 0;
    const d = await r.json();
    const items = Array.isArray(d) ? d : (d?.items ?? d?.data ?? d?.results ?? []);
    return items.filter(t => {
      const s = (t.status || "").toLowerCase();
      return s === "pending" || s === "blocked" || s === "in_progress" || s === "in-progress";
    }).length;
  } catch {
    return 0;
  }
}

async function fetchCriticalRisks() {
  try {
    const r = await fetch(`${apiBase()}/entities/RiskSignal`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!r.ok) return 0;
    const d = await r.json();
    const items = Array.isArray(d) ? d : (d?.items ?? d?.data ?? d?.results ?? []);
    return items.filter(s => {
      const sev = (s.severity || s.level || "").toLowerCase();
      return sev === "critical" || sev === "high";
    }).length;
  } catch {
    return 0;
  }
}

async function speakNudge(tasks, risks) {
  let parts = [];
  if (tasks > 0) parts.push(`${tasks} active task${tasks !== 1 ? "s" : ""}`);
  if (risks > 0) parts.push(`${risks} critical signal${risks !== 1 ? "s" : ""}`);
  if (!parts.length) return;

  const script = `JARVIS attention check: ${parts.join(" and ")} require your attention, sir.`;

  try {
    await fetch(`${apiBase()}/v1/voice/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ text: script, voice: "onyx" }),
    });
  } catch {
    // TTS failure is non-critical
  }

  window.dispatchEvent(
    new CustomEvent("jarvis:speak-dossier", { detail: { text: script } })
  );
}

export default function AttentionNudge() {
  const [enabled, setEnabled]   = useState(false);
  const [lastSeen, setLastSeen] = useState(Date.now());
  const [status, setStatus]     = useState("idle"); // idle | armed | spoke

  const lastSeenRef = useRef(Date.now());
  const enabledRef  = useRef(false);

  const resetTimer = useCallback(() => {
    lastSeenRef.current = Date.now();
    setLastSeen(Date.now());
    if (status === "spoke") setStatus("armed");
  }, [status]);

  // Keep ref in sync
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  // Listen for jarvis activity → reset timer
  useEffect(() => {
    window.addEventListener("jarvis:ask", resetTimer);
    return () => window.removeEventListener("jarvis:ask", resetTimer);
  }, [resetTimer]);

  // Listen for toggle event from JarvisBrain
  useEffect(() => {
    const onToggle = () => setEnabled(v => !v);
    window.addEventListener("jarvis:nudge-toggle", onToggle);
    return () => window.removeEventListener("jarvis:nudge-toggle", onToggle);
  }, []);

  // Main check loop
  useEffect(() => {
    if (!enabled) { setStatus("idle"); return; }

    setStatus("armed");
    lastSeenRef.current = Date.now();

    const id = setInterval(async () => {
      if (!enabledRef.current) return;
      const elapsed = Date.now() - lastSeenRef.current;
      if (elapsed < NUDGE_INTERVAL_MS) return;

      // Time to nudge
      const [tasks, risks] = await Promise.all([fetchPendingTasks(), fetchCriticalRisks()]);
      if (tasks > 0 || risks > 0) {
        await speakNudge(tasks, risks);
        setStatus("spoke");
      }
      // Reset timer after nudge attempt
      lastSeenRef.current = Date.now();
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(id);
  }, [enabled]);

  const toggle = () => setEnabled(v => !v);

  const dot = enabled
    ? status === "spoke" ? "#FFD700" : "#FF8800"
    : "#334455";

  const label = enabled
    ? status === "spoke" ? "NUDGE ↑" : "NUDGE ●"
    : "NUDGE";

  return (
    <button
      onClick={toggle}
      title={
        enabled
          ? `Attention nudge armed. Resets on activity. Next check every 30s.`
          : "Enable attention nudge — JARVIS will alert you when tasks or risks need attention after 5 min idle."
      }
      style={{
        position: "fixed",
        right: 16,
        top: 50,
        zIndex: 69,
        background: enabled ? "rgba(255,136,0,0.12)" : "rgba(5,8,13,0.70)",
        border: `1px solid ${dot}66`,
        borderRadius: 7,
        color: dot,
        cursor: "pointer",
        padding: "4px 10px",
        fontSize: 9,
        letterSpacing: 1.5,
        fontFamily: "'JetBrains Mono',monospace",
        fontWeight: 700,
        boxShadow: enabled ? `0 0 14px ${dot}44` : "none",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        gap: 5,
        transition: "all 0.2s",
      }}
    >
      <span style={{ fontSize: 10 }}>⚠</span>
      {label}
    </button>
  );
}
