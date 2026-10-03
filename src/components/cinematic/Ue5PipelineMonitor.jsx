/**
 * Ue5PipelineMonitor — F305.
 *
 * Monitors the UE5 render pipeline managed by scripts/ue5_pipeline.py.
 *
 * Data sources (all real — endpoints in /v1/pipeline):
 *   GET  /v1/pipeline                 (poll 30 s)
 *        → {status, steps:[{name,status,elapsed_s?,eta_s?}],
 *             overall_pct, eta_s, pid?, note?, updated_at?}
 *   POST /v1/pipeline/start           (LAUNCH button — bearer)
 *        → {ok, started?, already_running?, pids?}
 *   POST /v1/pipeline/deploy          (DEPLOY button — bearer, only when done/idle)
 *        → {ok, error?, pids?}
 *
 * Displays:
 *   - Stat tiles: status / overall % / steps / ETA
 *   - Overall progress bar (0–100 %)
 *   - Per-step rows: name + status chip + elapsed / eta (expand-on-click)
 *   - ▶ LAUNCH button (POST /v1/pipeline/start)
 *   - ▶ DEPLOY button (POST /v1/pipeline/deploy)
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence pipeline brief + TTS
 *
 * Toggle: ⚙ UE5P at left:406560, bottom:8, zIndex:182.
 * Badge: green=running, amber=idle/done, red=error/stalled.
 * Auto-refresh: status every 30 s.
 *
 * Exported helpers for JarvisBrain:
 *   isUe5pQuery(q) / buildUe5pScript()
 *
 * Voice triggers: "ue5 / pipeline / render pipeline / pipeline status /
 *   ue5 pipeline / unreal engine / render status / pipeline launch /
 *   pipeline steps / render steps / deploy pipeline / ue5p"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RD   = "#F87171";
const PU   = "#A78BFA";
const DIM  = "#3A4A55";
const GRAY = "#4E6070";

const BTN_LEFT = 406560;
const POLL_MS  = 30_000;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

const UE5P_RE =
  /\b(ue5\b|ue5p\b|ue5\s+pipeline|render\s+pipeline|pipeline\s+status|unreal\s+engine|render\s+status|pipeline\s+launch|pipeline\s+steps?|render\s+steps?|deploy\s+pipeline|ue5\s+render|ue5\s+status)\b/i;

export function isUe5pQuery(q) {
  return UE5P_RE.test(q || "");
}

export async function buildUe5pScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/pipeline`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    window.dispatchEvent(new CustomEvent("jarvis:ue5p-toggle"));
    const status  = d?.status ?? "idle";
    const pct     = d?.overall_pct ?? 0;
    const eta     = d?.eta_s ?? 0;
    const steps   = d?.steps ?? [];
    const done    = steps.filter((s) => s.status === "done").length;
    const running = steps.find((s) => s.status === "running");
    const note    = d?.note ?? "";
    const etaStr  = eta > 0 ? ` ETA ${Math.round(eta / 60)} min` : "";
    return (
      `UE5 render pipeline: status ${status}, ${pct}% complete${etaStr}. ` +
      `${done} of ${steps.length} step${steps.length !== 1 ? "s" : ""} done` +
      (running ? `, currently running step "${running.name}"` : "") +
      (note && status === "stalled" ? `. ${note}` : "") +
      "."
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:ue5p-toggle"));
    return "UE5 Pipeline Monitor open, sir.";
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function hdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function fmtSeconds(s) {
  if (!s || s <= 0) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;
}

function stepColor(status) {
  if (!status || status === "pending") return DIM;
  if (status === "done")    return GN;
  if (status === "running") return AM;
  if (status === "stalled") return RD;
  if (status === "error")   return RD;
  return GRAY;
}

function pipelineStatusColor(status) {
  if (status === "running") return GN;
  if (status === "done")    return CY;
  if (status === "stalled") return RD;
  if (status === "error")   return RD;
  return AM;
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatTile({ label, value, color }) {
  return (
    <div
      style={{
        flex: 1,
        background: "rgba(41,231,255,0.04)",
        border: "1px solid rgba(41,231,255,0.10)",
        borderRadius: 6,
        padding: "8px 10px",
        minWidth: 60,
      }}
    >
      <div style={{ color, fontSize: 16, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      <div
        style={{
          color: GRAY,
          fontSize: 9,
          marginTop: 3,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function Chip({ label, color, pulse }) {
  return (
    <span
      style={{
        background: `${color}22`,
        border: `1px solid ${color}55`,
        borderRadius: 3,
        color,
        fontSize: 9,
        fontFamily: "monospace",
        padding: "1px 5px",
        whiteSpace: "nowrap",
        animation: pulse ? "ue5p-pulse 1.2s ease-in-out infinite" : undefined,
      }}
    >
      {label}
    </span>
  );
}

function ProgressBar({ pct, color }) {
  return (
    <div
      style={{
        background: "rgba(41,231,255,0.08)",
        borderRadius: 3,
        height: 6,
        overflow: "hidden",
        width: "100%",
      }}
    >
      <div
        style={{
          background: color,
          borderRadius: 3,
          height: "100%",
          transition: "width 0.6s ease",
          width: `${Math.max(0, Math.min(100, pct || 0))}%`,
        }}
      />
    </div>
  );
}

function StepRow({ step }) {
  const [expanded, setExpanded] = useState(false);
  const sc = stepColor(step?.status);
  const isRunning = step?.status === "running";

  return (
    <div
      style={{
        borderBottom: "1px solid rgba(41,231,255,0.06)",
        cursor: "pointer",
        padding: "5px 8px",
      }}
      onClick={() => setExpanded((v) => !v)}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Chip
          label={(step?.status ?? "pending").toUpperCase()}
          color={sc}
          pulse={isRunning}
        />
        <span
          style={{
            color: CY,
            flex: 1,
            fontFamily: "monospace",
            fontSize: 11,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {step?.name ?? "unknown"}
        </span>
        {step?.elapsed_s != null && (
          <span style={{ color: GRAY, fontSize: 9 }}>
            {fmtSeconds(step.elapsed_s)}
          </span>
        )}
        <span style={{ color: GRAY, fontSize: 9 }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div
          style={{
            background: "rgba(0,0,0,0.15)",
            borderRadius: 4,
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginTop: 5,
            padding: "6px 8px",
          }}
        >
          {step?.elapsed_s != null && (
            <Chip label={`elapsed: ${fmtSeconds(step.elapsed_s)}`} color={CY} />
          )}
          {step?.eta_s != null && step.eta_s > 0 && (
            <Chip label={`eta: ${fmtSeconds(step.eta_s)}`} color={AM} />
          )}
          {!step?.elapsed_s && !step?.eta_s && (
            <span style={{ color: GRAY, fontSize: 10 }}>No timing data.</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function Ue5PipelineMonitor() {
  const [open, setOpen]         = useState(false);
  const [data, setData]         = useState(null);
  const [error, setError]       = useState(null);
  const [launching, setLaunching] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [actionMsg, setActionMsg] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase()}/v1/pipeline`, {
        headers: hdr(),
      });
      const d = await r.json();
      setData(d);
      setError(null);
    } catch (e) {
      setError(e?.message || "fetch error");
    }
  }, []);

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [load]);

  useEffect(() => {
    function onToggle() { setOpen((v) => !v); }
    window.addEventListener("jarvis:ue5p-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ue5p-toggle", onToggle);
  }, []);

  async function handleLaunch() {
    setLaunching(true);
    setActionMsg(null);
    try {
      const r = await fetch(`${apiBase()}/v1/pipeline/start`, {
        method: "POST",
        headers: hdr(),
      });
      const d = await r.json();
      if (d?.already_running) {
        setActionMsg("Pipeline already running.");
      } else if (d?.started) {
        setActionMsg("Pipeline launched successfully.");
        setTimeout(load, 2000);
      } else {
        setActionMsg(d?.error || "Launch response received.");
      }
    } catch (e) {
      setActionMsg(`Launch failed: ${e?.message || "unknown error"}`);
    }
    setLaunching(false);
  }

  async function handleDeploy() {
    setDeploying(true);
    setActionMsg(null);
    try {
      const r = await fetch(`${apiBase()}/v1/pipeline/deploy`, {
        method: "POST",
        headers: hdr(),
      });
      const d = await r.json();
      if (!d?.ok) {
        setActionMsg(d?.error || "Deploy blocked — pipeline may still be running.");
      } else {
        setActionMsg("Deploy phase started.");
      }
    } catch (e) {
      setActionMsg(`Deploy failed: ${e?.message || "unknown error"}`);
    }
    setDeploying(false);
  }

  async function handleAssess() {
    setAssessing(true);
    try {
      const script = await buildUe5pScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdr(), "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `UE5 pipeline state: ${script}. Give a 2-sentence operational brief on pipeline health and recommended action.`,
        }),
      });
      const d = await r.json();
      const answer = d?.answer || script;
      setActionMsg(answer);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch {
      setActionMsg("Assessment unavailable.");
    }
    setAssessing(false);
  }

  const status  = data?.status ?? "idle";
  const pct     = data?.overall_pct ?? 0;
  const eta     = data?.eta_s ?? 0;
  const steps   = data?.steps ?? [];
  const note    = data?.note;

  const badgeColor =
    status === "running" ? GN :
    status === "error" || status === "stalled" ? RD : AM;

  if (!open) {
    return (
      <>
        <style>{`
          @keyframes ue5p-pulse {
            0%,100% { opacity:1; } 50% { opacity:0.4; }
          }
        `}</style>
        <button
          onClick={() => setOpen(true)}
          title="UE5 Render Pipeline Monitor"
          style={{
            position: "fixed",
            left: BTN_LEFT,
            bottom: 8,
            zIndex: 182,
            background: "rgba(10,20,30,0.82)",
            border: `1px solid ${badgeColor}55`,
            borderRadius: 5,
            color: badgeColor,
            cursor: "pointer",
            fontFamily: "monospace",
            fontSize: 10,
            letterSpacing: "0.06em",
            padding: "4px 9px",
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          ⚙ UE5P
          <span
            style={{
              background: `${badgeColor}33`,
              border: `1px solid ${badgeColor}`,
              borderRadius: 3,
              color: badgeColor,
              fontSize: 9,
              padding: "0 4px",
              animation: status === "running" ? "ue5p-pulse 1.2s ease-in-out infinite" : undefined,
            }}
          >
            {status.toUpperCase()}
          </span>
        </button>
      </>
    );
  }

  return (
    <>
      <style>{`
        @keyframes ue5p-pulse {
          0%,100% { opacity:1; } 50% { opacity:0.4; }
        }
      `}</style>
      <div
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 9400,
          background: "rgba(0,0,0,0.55)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
      >
        <div
          style={{
            background: "linear-gradient(160deg,#0a1520 0%,#0d1e2c 100%)",
            border: `1px solid ${CY}33`,
            borderRadius: 10,
            boxShadow: `0 0 40px ${CY}18`,
            display: "flex",
            flexDirection: "column",
            gap: 0,
            maxHeight: "88vh",
            overflow: "hidden",
            width: 480,
          }}
        >
          {/* header */}
          <div
            style={{
              alignItems: "center",
              borderBottom: `1px solid ${CY}22`,
              display: "flex",
              gap: 8,
              padding: "10px 14px",
            }}
          >
            <span style={{ color: CY, fontFamily: "monospace", fontSize: 13, fontWeight: 700 }}>
              ⚙ UE5 RENDER PIPELINE
            </span>
            <Chip
              label={status.toUpperCase()}
              color={pipelineStatusColor(status)}
              pulse={status === "running"}
            />
            <div style={{ flex: 1 }} />
            <button
              onClick={handleLaunch}
              disabled={launching || status === "running"}
              style={{
                background: `${GN}11`,
                border: `1px solid ${GN}44`,
                borderRadius: 4,
                color: (launching || status === "running") ? GRAY : GN,
                cursor: (launching || status === "running") ? "not-allowed" : "pointer",
                fontFamily: "monospace",
                fontSize: 9,
                padding: "3px 8px",
              }}
            >
              {launching ? "…" : "▶ LAUNCH"}
            </button>
            <button
              onClick={handleDeploy}
              disabled={deploying || status === "running"}
              title={status === "running" ? "Wait for pipeline to finish before deploying" : "Deploy to GPU"}
              style={{
                background: `${PU}11`,
                border: `1px solid ${PU}44`,
                borderRadius: 4,
                color: (deploying || status === "running") ? GRAY : PU,
                cursor: (deploying || status === "running") ? "not-allowed" : "pointer",
                fontFamily: "monospace",
                fontSize: 9,
                padding: "3px 8px",
              }}
            >
              {deploying ? "…" : "▲ DEPLOY"}
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                color: GRAY,
                cursor: "pointer",
                fontSize: 14,
                padding: "0 2px",
              }}
            >
              ✕
            </button>
          </div>

          {/* stat tiles */}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "10px 14px 0",
            }}
          >
            <StatTile
              label="status"
              value={status.toUpperCase()}
              color={pipelineStatusColor(status)}
            />
            <StatTile
              label="progress"
              value={`${Math.round(pct)}%`}
              color={pct >= 100 ? GN : pct > 0 ? AM : GRAY}
            />
            <StatTile
              label="steps"
              value={`${steps.filter((s) => s.status === "done").length}/${steps.length}`}
              color={CY}
            />
            <StatTile
              label="eta"
              value={fmtSeconds(eta)}
              color={eta > 0 ? AM : GRAY}
            />
          </div>

          {/* progress bar */}
          <div style={{ padding: "8px 14px 0" }}>
            <ProgressBar
              pct={pct}
              color={pipelineStatusColor(status)}
            />
          </div>

          {/* note */}
          {note && (
            <div
              style={{
                background: "rgba(41,231,255,0.04)",
                borderTop: `1px solid ${CY}11`,
                color: GRAY,
                fontSize: 10,
                fontStyle: "italic",
                margin: "6px 14px 0",
                padding: "5px 8px",
                borderRadius: 4,
              }}
            >
              {note}
            </div>
          )}

          {/* steps */}
          <div
            style={{
              flex: 1,
              margin: "8px 14px 0",
              overflowY: "auto",
              border: `1px solid ${CY}18`,
              borderRadius: 6,
            }}
          >
            {error && (
              <div style={{ color: RD, fontSize: 10, padding: "10px 12px" }}>
                Error: {error}
              </div>
            )}
            {!error && steps.length === 0 && (
              <div style={{ color: GRAY, fontSize: 10, padding: "12px" }}>
                No steps recorded yet.
              </div>
            )}
            {steps.map((step, i) => (
              <StepRow key={step?.name ?? i} step={step} />
            ))}
          </div>

          {/* action message */}
          {actionMsg && (
            <div
              style={{
                background: "rgba(41,231,255,0.05)",
                border: `1px solid ${CY}22`,
                borderRadius: 4,
                color: CY,
                fontSize: 10,
                margin: "6px 14px 0",
                padding: "6px 10px",
              }}
            >
              {actionMsg}
            </div>
          )}

          {/* footer */}
          <div
            style={{
              alignItems: "center",
              borderTop: `1px solid ${CY}18`,
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
              margin: "8px 0 0",
              padding: "8px 14px",
            }}
          >
            <button
              onClick={handleAssess}
              disabled={assessing}
              style={{
                background: `${CY}11`,
                border: `1px solid ${CY}44`,
                borderRadius: 4,
                color: assessing ? GRAY : CY,
                cursor: assessing ? "wait" : "pointer",
                fontFamily: "monospace",
                fontSize: 9,
                padding: "3px 10px",
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
            <button
              onClick={load}
              style={{
                background: "transparent",
                border: `1px solid ${GRAY}55`,
                borderRadius: 4,
                color: GRAY,
                cursor: "pointer",
                fontFamily: "monospace",
                fontSize: 9,
                padding: "3px 8px",
              }}
            >
              ↺ REFRESH
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
