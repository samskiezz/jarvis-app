/**
 * ServiceFleetMonitor — F270.
 *
 * Data sources:
 *   GET  /v1/registry/services   (poll 60 s) → {count, alive, services:[{id,name,
 *                                              port,role,base_url,transport,status,
 *                                              health_path,routes,pid,alive,meta}]}
 *   GET  /v1/pm2                 (poll 60 s) → {available, count, processes:[{name,
 *                                              status,cpu,mem,uptime,restarts,...}]}
 *   POST /v1/pm2/{name}/restart  (bearer)    → restart a pm2 process
 *
 * Displays:
 *   - Stat tiles: registry total / registry alive / pm2 processes / total restarts
 *   - REGISTRY | FLEET tab switcher + text search
 *   - REGISTRY: per-service id/name/role/status/transport/port chips
 *   - FLEET: per-process name/status/cpu/mem/restarts/uptime + ▶ RESTART
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence fleet brief + TTS
 *
 * Toggle: ◈ FLEET at left:251520, bottom:8, zIndex:148.
 * Green badge = alive service count; amber when any service is dead or pm2
 * processes are restarting.
 *
 * Exported helpers for JarvisBrain:
 *   isFleetQuery(q) / buildFleetScript()
 *
 * Voice triggers: "fleet / pm2 / service fleet / registry / process list /
 *   running services / service registry / fleet status / pm2 status /
 *   process fleet / fleet monitor / nexus registry"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#4ADE80";
const PURP  = "#B06EFF";
const GRAY  = "#4E6070";
const RED   = "#F87171";

const BTN_LEFT   = 251520;
const REFRESH_MS = 60_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── fetch helpers ────────────────────────────────────────────────────────────

async function fetchRegistry() {
  const r = await fetch(`${apiBase()}/v1/registry/services`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`registry ${r.status}`);
  return r.json();
}

async function fetchPm2() {
  const r = await fetch(`${apiBase()}/v1/pm2`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`pm2 ${r.status}`);
  return r.json();
}

async function restartProcess(name) {
  const r = await fetch(
    `${apiBase()}/v1/pm2/${encodeURIComponent(name)}/restart`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );
  if (!r.ok) throw new Error(`restart ${r.status}`);
  return r.json();
}

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

const FLEET_RE =
  /\b(fleet|pm2|service.?fleet|nexus.?registry|process.?list|running.?services|service.?registry|fleet.?status|pm2.?status|process.?fleet|fleet.?monitor|which.?services|what.?services|all.?services|service.?health)\b/i;

export function isFleetQuery(q) {
  return FLEET_RE.test(q || "");
}

export async function buildFleetScript() {
  try {
    const [reg, pm2] = await Promise.all([fetchRegistry(), fetchPm2()]);
    window.dispatchEvent(new CustomEvent("jarvis:fleet-toggle"));
    const alive    = reg?.alive ?? 0;
    const total    = reg?.count ?? 0;
    const procs    = (pm2?.processes ?? []).length;
    const restarts = (pm2?.processes ?? []).reduce(
      (acc, p) => acc + (p.restarts || 0),
      0
    );
    return (
      `Service fleet: ${alive} of ${total} registry service${total !== 1 ? "s" : ""} alive` +
      (pm2?.available
        ? `, ${procs} pm2 process${procs !== 1 ? "es" : ""} tracked with ${restarts} total restart${restarts !== 1 ? "s" : ""}`
        : ", pm2 not available on this host") +
      ". Fleet panel open, sir."
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:fleet-toggle"));
    return "Service Fleet Monitor open, sir.";
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtUptime(ms) {
  if (!ms && ms !== 0) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function fmtMem(bytes) {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function statusColor(s) {
  if (!s) return GRAY;
  const l = s.toLowerCase();
  if (l === "online" || l === "ok" || l === "healthy" || l === "up") return GREEN;
  if (l === "stopping" || l === "launching") return AMBER;
  if (l === "errored" || l === "stopped") return RED;
  return CY;
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatTile({ label, value, color }) {
  return (
    <div
      style={{
        flex: 1,
        background: "rgba(41,231,255,0.04)",
        border: `1px solid ${CY}22`,
        borderRadius: 7,
        padding: "7px 10px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: color || CY,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value ?? "—"}
      </div>
      <div style={{ fontSize: 7, color: GRAY, marginTop: 2, letterSpacing: 1 }}>
        {label}
      </div>
    </div>
  );
}

function Chip({ label, color }) {
  return (
    <span
      style={{
        background: `${color || CY}18`,
        border: `1px solid ${color || CY}44`,
        borderRadius: 4,
        padding: "1px 5px",
        color: color || CY,
        fontSize: 7,
        letterSpacing: 1,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function ServiceRow({ svc }) {
  const sc = statusColor(svc.status);
  return (
    <div
      style={{
        borderBottom: `1px solid ${CY}18`,
        padding: "7px 12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: svc.alive ? GREEN : RED,
            boxShadow: svc.alive ? `0 0 5px ${GREEN}` : undefined,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            color: CY,
            fontSize: 9,
            fontWeight: 600,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {svc.name || svc.id}
        </span>
        {svc.role && <Chip label={svc.role.toUpperCase()} color={PURP} />}
        {svc.transport && svc.transport !== "http" && (
          <Chip label={svc.transport.toUpperCase()} color={AMBER} />
        )}
        <Chip label={(svc.status || "unknown").toUpperCase()} color={sc} />
        {svc.port && (
          <span style={{ fontSize: 7, color: GRAY }}>:{svc.port}</span>
        )}
      </div>
      {svc.id && svc.id !== svc.name && (
        <div style={{ fontSize: 7, color: GRAY, marginTop: 2, paddingLeft: 12 }}>
          id: {svc.id}
        </div>
      )}
    </div>
  );
}

function ProcessRow({ proc, onRestarted }) {
  const [restarting, setRestarting] = useState(false);
  const [result, setResult]         = useState(null);
  const sc = statusColor(proc.status);

  async function handleRestart() {
    setRestarting(true);
    setResult(null);
    try {
      await restartProcess(proc.name);
      setResult("ok");
      setTimeout(() => onRestarted(), 1500);
    } catch (e) {
      setResult("err:" + e.message);
    } finally {
      setRestarting(false);
    }
  }

  return (
    <div
      style={{
        borderBottom: `1px solid ${CY}18`,
        padding: "7px 12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: sc,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            color: CY,
            fontSize: 9,
            fontWeight: 600,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {proc.name}
        </span>
        <Chip label={(proc.status || "?").toUpperCase()} color={sc} />
        <button
          onClick={handleRestart}
          disabled={restarting}
          style={{
            background: restarting ? `${GRAY}18` : `${AMBER}14`,
            border: `1px solid ${restarting ? GRAY : AMBER}55`,
            borderRadius: 4,
            padding: "1px 7px",
            color: restarting ? GRAY : AMBER,
            fontSize: 8,
            cursor: restarting ? "default" : "pointer",
            fontFamily: "inherit",
            letterSpacing: 1,
            whiteSpace: "nowrap",
          }}
        >
          {restarting ? "…" : "▶ RESTART"}
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: 14,
          marginTop: 4,
          paddingLeft: 12,
          fontSize: 7,
          color: GRAY,
          flexWrap: "wrap",
        }}
      >
        {proc.cpu != null && (
          <span>
            CPU <span style={{ color: proc.cpu > 50 ? RED : CY }}>{proc.cpu}%</span>
          </span>
        )}
        {proc.mem != null && (
          <span>
            MEM <span style={{ color: CY }}>{fmtMem(proc.mem)}</span>
          </span>
        )}
        {proc.restarts != null && (
          <span>
            RESTARTS{" "}
            <span style={{ color: proc.restarts > 5 ? RED : proc.restarts > 0 ? AMBER : GREEN }}>
              {proc.restarts}
            </span>
          </span>
        )}
        {proc.uptime != null && (
          <span>
            UP <span style={{ color: GREEN }}>{fmtUptime(proc.uptime)}</span>
          </span>
        )}
      </div>

      {result && (
        <div
          style={{ marginTop: 4, paddingLeft: 12, fontSize: 8, color: result === "ok" ? GREEN : RED }}
        >
          {result === "ok" ? "✓ Restarting…" : `✕ ${result.slice(4)}`}
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function ServiceFleetMonitor() {
  const [visible,    setVisible]    = useState(false);
  const [registry,   setRegistry]   = useState(null);
  const [pm2,        setPm2]        = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [tab,        setTab]        = useState("REGISTRY");
  const [search,     setSearch]     = useState("");
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState("");
  const timer = useRef(null);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:fleet-toggle", onToggle);
    return () => window.removeEventListener("jarvis:fleet-toggle", onToggle);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [reg, p] = await Promise.allSettled([fetchRegistry(), fetchPm2()]);
      if (reg.status === "fulfilled") setRegistry(reg.value);
      if (p.status === "fulfilled") setPm2(p.value);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    loadData();
    timer.current = setInterval(loadData, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [visible, loadData]);

  const services  = registry?.services ?? [];
  const processes = pm2?.processes     ?? [];
  const aliveCount   = registry?.alive ?? 0;
  const totalSvc     = registry?.count ?? 0;
  const totalRestart = processes.reduce((a, p) => a + (p.restarts || 0), 0);

  const q = search.toLowerCase();

  const filteredSvc = services.filter(
    (s) =>
      !q ||
      (s.name || "").toLowerCase().includes(q) ||
      (s.id || "").toLowerCase().includes(q) ||
      (s.role || "").toLowerCase().includes(q)
  );

  const filteredProc = processes.filter(
    (p) =>
      !q ||
      (p.name || "").toLowerCase().includes(q) ||
      (p.status || "").toLowerCase().includes(q)
  );

  const hasIssue =
    (totalSvc > 0 && aliveCount < totalSvc) ||
    totalRestart > 0 ||
    processes.some((p) => (p.status || "").toLowerCase() === "errored");

  const badgeColor = hasIssue ? AMBER : aliveCount > 0 ? GREEN : GRAY;
  const badgeLabel = aliveCount > 0 ? `${aliveCount}` : "—";

  async function handleAssess() {
    setAssessing(true);
    try {
      const ctx = `registry_alive=${aliveCount}/${totalSvc}, pm2_processes=${processes.length}, total_restarts=${totalRestart}`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          message: `In 2 sentences, assess the service fleet health. Context: ${ctx}`,
        }),
      });
      const d = await r.json();
      const brief = (d.answer || "Fleet assessment unavailable.")
        .replace(/<<ACTION:[^>]*>>/g, "")
        .trim();
      setAssessment(brief);
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text: brief } })
      );
    } catch {
      setAssessment("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }

  const panelW = 440;

  return (
    <>
      {/* ── trigger button ── */}
      <div
        style={{
          position:      "fixed",
          left:          `min(${BTN_LEFT}px, calc(100vw - 115px))`,
          bottom:        8,
          zIndex:        148,
          display:       "flex",
          flexDirection: "column",
          alignItems:    "center",
          gap:           2,
        }}
      >
        <div
          style={{
            background:   badgeColor,
            color:        "#000",
            borderRadius: 8,
            fontSize:     7,
            padding:      "1px 5px",
            fontWeight:   700,
            letterSpacing: 1,
          }}
        >
          {badgeLabel}
        </div>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("jarvis:fleet-toggle"))}
          style={{
            background:   "rgba(41,231,255,0.08)",
            border:       `1px solid ${CY}55`,
            borderRadius: 6,
            padding:      "3px 8px",
            color:        CY,
            fontSize:     8,
            letterSpacing: 1,
            cursor:       "pointer",
            fontFamily:   "inherit",
            whiteSpace:   "nowrap",
          }}
        >
          ◈ FLEET
        </button>
      </div>

      {/* ── panel ── */}
      {visible && (
        <div
          style={{
            position:      "fixed",
            left:          `min(${BTN_LEFT}px, calc(100vw - ${panelW + 10}px))`,
            bottom:        40,
            zIndex:        148,
            width:         panelW,
            maxHeight:     "74vh",
            background:    "rgba(4,14,22,0.97)",
            border:        `1px solid ${CY}44`,
            borderRadius:  10,
            display:       "flex",
            flexDirection: "column",
            overflow:      "hidden",
            fontFamily:    "monospace",
            boxShadow:     `0 0 28px ${CY}22`,
          }}
        >
          {/* header */}
          <div
            style={{
              padding:      "8px 12px 6px",
              borderBottom: `1px solid ${CY}22`,
              display:      "flex",
              alignItems:   "center",
              gap:          8,
              flexShrink:   0,
            }}
          >
            <span
              style={{ color: CY, fontWeight: 700, fontSize: 10, letterSpacing: 2 }}
            >
              ◈ SERVICE FLEET MONITOR
            </span>
            {loading && <span style={{ color: GRAY, fontSize: 8 }}>…</span>}
            <div style={{ flex: 1 }} />
            <button
              onClick={handleAssess}
              disabled={assessing}
              style={{
                background:   "rgba(41,231,255,0.08)",
                border:       `1px solid ${CY}44`,
                borderRadius: 4,
                padding:      "2px 7px",
                color:        CY,
                fontSize:     8,
                cursor:       assessing ? "default" : "pointer",
                fontFamily:   "inherit",
                letterSpacing: 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
            <button
              onClick={() => setVisible(false)}
              style={{
                background: "transparent",
                border:     "none",
                color:      GRAY,
                fontSize:   11,
                cursor:     "pointer",
                fontFamily: "inherit",
                padding:    "0 3px",
              }}
            >
              ✕
            </button>
          </div>

          {/* assessment */}
          {assessment && (
            <div
              style={{
                padding:      "6px 12px",
                fontSize:     9,
                color:        CY,
                background:   `${CY}08`,
                borderBottom: `1px solid ${CY}22`,
                flexShrink:   0,
              }}
            >
              {assessment}
            </div>
          )}

          {/* stat tiles */}
          <div
            style={{ display: "flex", gap: 6, padding: "8px 12px 6px", flexShrink: 0 }}
          >
            <StatTile label="REGISTERED" value={totalSvc}   color={CY}    />
            <StatTile label="ALIVE"      value={aliveCount} color={aliveCount === totalSvc && totalSvc > 0 ? GREEN : AMBER} />
            <StatTile label="PM2 PROCS"  value={pm2?.available === false ? "N/A" : processes.length} color={PURP} />
            <StatTile label="RESTARTS"   value={totalRestart} color={totalRestart > 5 ? RED : totalRestart > 0 ? AMBER : GREEN} />
          </div>

          {/* tabs */}
          <div
            style={{
              display:      "flex",
              gap:          4,
              padding:      "4px 12px",
              flexShrink:   0,
              borderBottom: `1px solid ${CY}22`,
            }}
          >
            {["REGISTRY", "FLEET"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background:   tab === t ? `${CY}22` : "transparent",
                  border:       `1px solid ${tab === t ? CY : CY + "33"}`,
                  borderRadius: 4,
                  padding:      "2px 10px",
                  color:        tab === t ? CY : GRAY,
                  fontSize:     8,
                  cursor:       "pointer",
                  fontFamily:   "inherit",
                  letterSpacing: 1,
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* search */}
          <div style={{ padding: "5px 12px", flexShrink: 0 }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                tab === "REGISTRY"
                  ? "search services…"
                  : "search processes…"
              }
              style={{
                width:        "100%",
                background:   "rgba(41,231,255,0.05)",
                border:       `1px solid ${CY}22`,
                borderRadius: 5,
                padding:      "3px 8px",
                color:        CY,
                fontSize:     9,
                fontFamily:   "inherit",
                outline:      "none",
                boxSizing:    "border-box",
              }}
            />
          </div>

          {/* list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {tab === "REGISTRY" ? (
              filteredSvc.length === 0 ? (
                <div
                  style={{ padding: 16, color: GRAY, fontSize: 9, textAlign: "center" }}
                >
                  {loading
                    ? "Loading registry…"
                    : search
                    ? "No matching services."
                    : "No services registered."}
                </div>
              ) : (
                filteredSvc.map((s, i) => (
                  <ServiceRow key={s.id || i} svc={s} />
                ))
              )
            ) : pm2?.available === false ? (
              <div
                style={{ padding: 16, color: GRAY, fontSize: 9, textAlign: "center" }}
              >
                pm2 is not available on this host.
              </div>
            ) : filteredProc.length === 0 ? (
              <div
                style={{ padding: 16, color: GRAY, fontSize: 9, textAlign: "center" }}
              >
                {loading
                  ? "Loading fleet…"
                  : search
                  ? "No matching processes."
                  : "No pm2 processes found."}
              </div>
            ) : (
              filteredProc.map((p, i) => (
                <ProcessRow key={p.name || i} proc={p} onRestarted={loadData} />
              ))
            )}
          </div>

          {/* footer */}
          <div
            style={{
              padding:    "5px 12px",
              fontSize:   8,
              color:      GRAY,
              borderTop:  `1px solid ${CY}22`,
              flexShrink: 0,
            }}
          >
            {tab === "REGISTRY"
              ? `${filteredSvc.length} of ${services.length} service${services.length !== 1 ? "s" : ""}`
              : `${filteredProc.length} of ${processes.length} process${processes.length !== 1 ? "es" : ""}`}{" "}
            · poll 60 s · /v1/registry/services · /v1/pm2
          </div>
        </div>
      )}
    </>
  );
}
