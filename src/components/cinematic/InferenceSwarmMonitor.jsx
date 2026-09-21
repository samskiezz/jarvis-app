/**
 * InferenceSwarmMonitor — F242.
 *
 * Data sources (real — backed by server/routes/inf_swarm.py):
 *   GET  /v1/inf-swarm/agents              → {ok,items:[{agent_id,kind,status,queue_depth,spawned_ts,last_heartbeat,error}],count,supported_kinds,source}
 *   POST /v1/inf-swarm/spawn               {agent_kind, count}  → {ok,agent_ids,kind,count,status}
 *   POST /v1/inf-swarm/kill                {agent_id}           → {ok,agent_id,status,rows_changed}
 *
 * Displays:
 *   - Stat tiles: total / running / declared / errored
 *   - ALL + kind filter tabs (scraper/summarizer/classifier/translator/vision/research)
 *   - Text search on agent_id + kind
 *   - Expand row → kind, status badge, queue_depth, spawned, last_heartbeat, error
 *   - ✕ KILL per agent → POST /v1/inf-swarm/kill
 *   - ▶ SPAWN modal for ad-hoc agent creation
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence swarm brief + TTS
 *
 * Toggle: ⊛ ISWM at left:132960, bottom:8, zIndex:122.
 * Badge: green = agent count; red = any errored.
 * 60 s auto-refresh.
 *
 * Exported helpers for JarvisBrain:
 *   isIswmQuery(q) / buildIswmScript()
 *
 * Voice triggers: "inference swarm / swarm agents / iswm / agent swarm /
 *   spawn agent / running agents / worker agents / swarm status /
 *   agent workers / inference agents / swarm monitor"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AM  = "#F5A623";
const GN  = "#4ADE80";
const RED = "#F87171";
const PRP = "#A78BFA";
const DIM = "#3A4A55";

const BTN_LEFT   = 132960;
const REFRESH_MS = 60_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const ISWM_RE =
  /\b(inf(?:erence)?\s*swarm|swarm\s*agent|iswm\b|agent\s*swarm|spawn\s*agent|running\s*agent|worker\s*agent|swarm\s*status|agent\s*worker|inference\s*agent|swarm\s*monitor)\b/i;

export function isIswmQuery(t) {
  return ISWM_RE.test(t || "");
}

export async function buildIswmScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/inf-swarm/agents`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    const items = Array.isArray(d?.items) ? d.items : [];
    if (!items.length) return "Inference swarm reports no registered agents at this time, sir.";
    const running  = items.filter(a => a.status === "running").length;
    const errored  = items.filter(a => a.status === "errored").length;
    const declared = items.filter(a => a.status === "declared").length;
    const kinds    = [...new Set(items.map(a => a.kind))].slice(0, 4).join(", ");
    return `Inference swarm: ${items.length} agent${items.length !== 1 ? "s" : ""} registered. ` +
      `${running} running, ${declared} declared, ${errored} errored. ` +
      `Active kinds: ${kinds || "none"}.`;
  } catch {
    return "Unable to reach the inference swarm endpoint at this time, sir.";
  }
}

const STATUS_COLOUR = {
  running:  GN,
  idle:     CY,
  declared: AM,
  starting: PRP,
  stopped:  DIM,
  errored:  RED,
};

function fmtTs(ts) {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  return d.toLocaleString("en-GB", { hour12: false, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

async function fetchAgents() {
  const r = await fetch(`${apiBase()}/v1/inf-swarm/agents?limit=200`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return { items: Array.isArray(d?.items) ? d.items : [], kinds: Array.isArray(d?.supported_kinds) ? d.supported_kinds : [] };
}

async function killAgent(agentId) {
  const r = await fetch(`${apiBase()}/v1/inf-swarm/kill`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ agent_id: agentId }),
  });
  return r.json();
}

async function spawnAgents(kind, count) {
  const r = await fetch(`${apiBase()}/v1/inf-swarm/spawn`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ agent_kind: kind, count }),
  });
  return r.json();
}

async function agentAssess(total, running, errored) {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      message: `Assess the JARVIS inference swarm: ${total} agents total, ${running} running, ${errored} errored. Provide a 2-sentence operational status and recommended action.`,
    }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "No response from agent.";
}

export default function InferenceSwarmMonitor() {
  const [open,       setOpen]       = useState(false);
  const [agents,     setAgents]     = useState([]);
  const [kinds,      setKinds]      = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [query,      setQuery]      = useState("");
  const [kindFilter, setKindFilter] = useState("ALL");
  const [expanded,   setExpanded]   = useState(null);
  const [killing,    setKilling]    = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const [dossier,    setDossier]    = useState(null);
  const [spawnOpen,  setSpawnOpen]  = useState(false);
  const [spawnKind,  setSpawnKind]  = useState("scraper");
  const [spawnCount, setSpawnCount] = useState(1);
  const [spawning,   setSpawning]   = useState(false);
  const [spawnMsg,   setSpawnMsg]   = useState("");
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { items, kinds: k } = await fetchAgents();
      setAgents(items);
      if (k.length) setKinds(k);
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (ISWM_RE.test(q)) {
        setOpen(true);
        window.dispatchEvent(new CustomEvent("jarvis:iswm-toggle"));
      }
    };
    window.addEventListener("jarvis:iswm-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:iswm-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  const allKinds = ["ALL", ...(kinds.length ? kinds : [...new Set(agents.map(a => a.kind))].filter(Boolean))];

  const filtered = agents.filter(a => {
    const matchKind = kindFilter === "ALL" || a.kind === kindFilter;
    const q = query.trim().toLowerCase();
    const matchQ = !q ||
      (a.agent_id || "").toLowerCase().includes(q) ||
      (a.kind || "").toLowerCase().includes(q);
    return matchKind && matchQ;
  });

  const total    = agents.length;
  const running  = agents.filter(a => a.status === "running").length;
  const declared = agents.filter(a => a.status === "declared").length;
  const errored  = agents.filter(a => a.status === "errored").length;

  const badgeColor = errored > 0 ? RED : GN;

  async function handleKill(agentId) {
    if (killing) return;
    setKilling(agentId);
    try {
      await killAgent(agentId);
      await load();
    } catch (_) {}
    setKilling(null);
  }

  async function handleAssess() {
    if (assessing) return;
    setAssessing(true);
    setDossier(null);
    try {
      const text = await agentAssess(total, running, errored);
      setDossier(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {
      setDossier("Agent assessment unavailable.");
    }
    setAssessing(false);
  }

  async function handleSpawn() {
    if (spawning) return;
    setSpawning(true);
    setSpawnMsg("");
    try {
      const d = await spawnAgents(spawnKind, Math.max(1, Math.min(32, spawnCount)));
      if (d.ok) {
        setSpawnMsg(`✓ Spawned ${d.count} ${d.kind} agent${d.count !== 1 ? "s" : ""}.`);
        await load();
      } else {
        setSpawnMsg(`✗ ${d.error || "Spawn failed."}`);
      }
    } catch (_) {
      setSpawnMsg("✗ Network error.");
    }
    setSpawning(false);
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Inference Swarm Monitor"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 122,
          background: "rgba(5,10,18,0.82)", border: `1px solid ${CY}55`,
          color: CY, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1, padding: "3px 8px",
          borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        ⊛ ISWM
        {total > 0 && (
          <span style={{
            marginLeft: 5, background: badgeColor, color: "#000",
            borderRadius: 3, padding: "0 4px", fontSize: 8,
          }}>
            {total}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", top: 60, right: 18, zIndex: 123,
          width: "min(600px, 96vw)", maxHeight: "82vh",
          background: "rgba(5,10,18,0.97)",
          border: `1px solid ${CY}44`, borderRadius: 14,
          display: "flex", flexDirection: "column",
          boxShadow: `0 0 60px ${CY}14, 0 24px 48px rgba(0,0,0,0.8)`,
          fontFamily: "'JetBrains Mono',monospace",
        }}>
          {/* Header */}
          <div style={{
            padding: "12px 16px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          }}>
            <span style={{ color: CY, fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>
              ⊛ INFERENCE SWARM
            </span>
            {loading && <span style={{ fontSize: 9, color: DIM }}>refreshing…</span>}
            <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
              <button
                onClick={() => { setSpawnOpen(v => !v); setSpawnMsg(""); }}
                style={{
                  background: spawnOpen ? `${GN}22` : "transparent",
                  border: `1px solid ${GN}55`, borderRadius: 4,
                  color: GN, fontSize: 9, padding: "2px 8px",
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                + SPAWN
              </button>
              <button
                onClick={handleAssess}
                disabled={assessing}
                style={{
                  background: assessing ? `${CY}22` : "transparent",
                  border: `1px solid ${CY}33`, borderRadius: 4,
                  color: CY, fontSize: 9, padding: "2px 8px",
                  cursor: assessing ? "default" : "pointer",
                  fontFamily: "inherit", opacity: assessing ? 0.6 : 1,
                }}
              >
                {assessing ? "…" : "▶ ASSESS"}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none", border: "none",
                  color: DIM, cursor: "pointer", fontSize: 14, lineHeight: 1,
                }}
              >✕</button>
            </div>
          </div>

          {/* Spawn form */}
          {spawnOpen && (
            <div style={{
              padding: "10px 16px", borderBottom: `1px solid ${GN}22`,
              background: `${GN}06`,
              display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
            }}>
              <select
                value={spawnKind}
                onChange={e => setSpawnKind(e.target.value)}
                style={{
                  background: "rgba(41,231,255,0.06)", border: `1px solid ${CY}22`,
                  borderRadius: 6, padding: "4px 8px", color: "#DCEBF5",
                  fontFamily: "inherit", fontSize: 10, outline: "none",
                }}
              >
                {(kinds.length ? kinds : ["scraper","summarizer","classifier","translator","vision","research"])
                  .map(k => <option key={k} value={k}>{k}</option>)}
              </select>
              <input
                type="number" min={1} max={32}
                value={spawnCount}
                onChange={e => setSpawnCount(Number(e.target.value))}
                style={{
                  width: 50, background: "rgba(41,231,255,0.06)",
                  border: `1px solid ${CY}22`, borderRadius: 6,
                  padding: "4px 6px", color: "#DCEBF5",
                  fontFamily: "inherit", fontSize: 10, outline: "none",
                }}
              />
              <button
                onClick={handleSpawn}
                disabled={spawning}
                style={{
                  background: spawning ? `${GN}22` : `${GN}11`,
                  border: `1px solid ${GN}55`, borderRadius: 4,
                  color: GN, fontSize: 9, padding: "3px 10px",
                  cursor: spawning ? "default" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {spawning ? "spawning…" : "SPAWN"}
              </button>
              {spawnMsg && (
                <span style={{ fontSize: 9, color: spawnMsg.startsWith("✓") ? GN : RED }}>
                  {spawnMsg}
                </span>
              )}
            </div>
          )}

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
            gap: 1, padding: "10px 16px",
            borderBottom: `1px solid ${CY}11`,
          }}>
            {[
              { label: "TOTAL",    val: total,    col: CY },
              { label: "RUNNING",  val: running,  col: GN },
              { label: "DECLARED", val: declared, col: AM },
              { label: "ERRORED",  val: errored,  col: RED },
            ].map(({ label, val, col }) => (
              <div key={label} style={{ textAlign: "center", padding: "4px 0" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: col }}>{val}</div>
                <div style={{ fontSize: 8, color: DIM, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Dossier */}
          {dossier && (
            <div style={{
              margin: "0 16px 8px", padding: "8px 10px",
              background: `${CY}08`, border: `1px solid ${CY}22`,
              borderRadius: 6, color: "#9BBCCC", fontSize: 10, lineHeight: 1.6,
            }}>
              {dossier}
            </div>
          )}

          {/* Search */}
          <div style={{ padding: "6px 16px", borderBottom: `1px solid ${CY}11` }}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search agent ID or kind…"
              style={{
                width: "100%", background: "rgba(41,231,255,0.06)",
                border: `1px solid ${CY}22`, borderRadius: 6,
                padding: "5px 10px", color: "#DCEBF5",
                fontFamily: "inherit", fontSize: 11, outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Kind filter tabs */}
          {allKinds.length > 1 && (
            <div style={{
              display: "flex", gap: 4, padding: "6px 16px",
              borderBottom: `1px solid ${CY}11`,
              overflowX: "auto", flexShrink: 0,
            }}>
              {allKinds.map(k => (
                <button
                  key={k}
                  onClick={() => setKindFilter(k)}
                  style={{
                    background: kindFilter === k ? CY : "transparent",
                    color: kindFilter === k ? "#04060A" : DIM,
                    border: `1px solid ${kindFilter === k ? CY : DIM}`,
                    borderRadius: 4, padding: "2px 8px",
                    fontSize: 9, letterSpacing: 1,
                    cursor: "pointer", whiteSpace: "nowrap",
                    fontFamily: "inherit",
                  }}
                >
                  {k.toUpperCase()}
                </button>
              ))}
            </div>
          )}

          {/* Agent list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {!agents.length && !loading && (
              <div style={{ padding: "24px 16px", color: DIM, fontSize: 11, textAlign: "center" }}>
                No agents registered — use SPAWN to declare the first worker.
              </div>
            )}
            {filtered.map((agent) => {
              const statusCol = STATUS_COLOUR[agent.status] || DIM;
              const isExp     = expanded === agent.agent_id;
              const isKilling = killing === agent.agent_id;
              const isActive  = agent.status === "running" || agent.status === "idle";
              return (
                <div
                  key={agent.agent_id}
                  style={{
                    padding: "9px 16px",
                    borderBottom: `1px solid ${CY}0A`,
                    background: isExp ? `${CY}05` : "transparent",
                    cursor: "pointer",
                  }}
                  onClick={() => setExpanded(isExp ? null : agent.agent_id)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {/* Status dot */}
                    <span style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: statusCol, flexShrink: 0,
                      boxShadow: isActive ? `0 0 6px ${statusCol}` : "none",
                    }} />

                    {/* Kind chip */}
                    <span style={{
                      fontSize: 9, letterSpacing: 1, color: AM,
                      border: `1px solid ${AM}44`, borderRadius: 3,
                      padding: "1px 5px", flexShrink: 0,
                    }}>
                      {agent.kind || "?"}
                    </span>

                    {/* Agent ID */}
                    <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1, fontWeight: 600 }}>
                      {agent.agent_id}
                    </span>

                    {/* Queue depth */}
                    {agent.queue_depth > 0 && (
                      <span style={{ fontSize: 9, color: AM, marginRight: 4 }}>
                        q:{agent.queue_depth}
                      </span>
                    )}

                    {/* Status badge */}
                    <span style={{
                      fontSize: 8, color: statusCol,
                      border: `1px solid ${statusCol}44`,
                      borderRadius: 3, padding: "1px 5px",
                    }}>
                      {(agent.status || "unknown").toUpperCase()}
                    </span>

                    {/* Kill button */}
                    {agent.status !== "stopped" && (
                      <button
                        onClick={e => { e.stopPropagation(); handleKill(agent.agent_id); }}
                        disabled={!!killing}
                        title="Stop agent"
                        style={{
                          background: "transparent",
                          border: `1px solid ${RED}44`, borderRadius: 3,
                          color: RED, fontSize: 9, padding: "1px 6px",
                          cursor: killing ? "default" : "pointer",
                          fontFamily: "inherit", opacity: killing && !isKilling ? 0.4 : 1,
                          flexShrink: 0,
                        }}
                      >
                        {isKilling ? "…" : "✕ KILL"}
                      </button>
                    )}
                  </div>

                  {/* Expanded detail */}
                  {isExp && (
                    <div style={{
                      marginTop: 8, padding: "8px 10px",
                      background: `${CY}06`, border: `1px solid ${CY}18`,
                      borderRadius: 6, fontSize: 9, color: "#7AABB8", lineHeight: 2,
                    }}>
                      <div><span style={{ color: DIM }}>KIND       </span>{agent.kind || "—"}</div>
                      <div><span style={{ color: DIM }}>STATUS     </span><span style={{ color: statusCol }}>{agent.status}</span></div>
                      <div><span style={{ color: DIM }}>QUEUE      </span>{agent.queue_depth ?? 0}</div>
                      <div><span style={{ color: DIM }}>SPAWNED    </span>{fmtTs(agent.spawned_ts)}</div>
                      <div><span style={{ color: DIM }}>HEARTBEAT  </span>{fmtTs(agent.last_heartbeat)}</div>
                      {agent.error && (
                        <div style={{ marginTop: 4, color: RED }}>
                          ✗ {agent.error}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {filtered.length === 0 && agents.length > 0 && (
              <div style={{ padding: "20px 16px", color: DIM, fontSize: 11, textAlign: "center" }}>
                No agents match filter.
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "6px 16px", borderTop: `1px solid ${CY}11`,
            color: DIM, fontSize: 9, letterSpacing: 1,
            display: "flex", justifyContent: "space-between",
          }}>
            <span>GET /v1/inf-swarm/agents · 60 s poll</span>
            <span>{filtered.length}/{total} agents</span>
          </div>
        </div>
      )}
    </>
  );
}
