/**
 * F80 – Ops Alert × Contact × SwarmJob Response Ownership Nexus (ACSRNEX)
 * Cross-correlates /v1/ops/alerts × /entities/Contact × /entities/SwarmJob.
 * Classifies each alert by response ownership:
 *   FULLY_OWNED   – matched by ≥1 contact AND ≥1 active swarm job
 *   CONTACT_ONLY  – a human contact is linked, but no swarm job covers it
 *   SWARM_ONLY    – swarm automation covers it, but no contact is assigned
 *   UNOWNED       – neither contact nor swarm job — response gap, red pulse
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const BTN_LEFT   = 961340;
const Z          = 662;
const REFRESH_MS = 90_000;

const CY   = "#29E7FF";
const AM   = "#F5A623";
const RD   = "#FF3B3B";
const GR   = "#00c878";
const DIM  = "#3a5060";
const MONO = "'JetBrains Mono', 'Courier New', monospace";
const SANS = "'Inter', system-ui, sans-serif";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
function authHdr() { return { Authorization: `Bearer ${API_KEY}` }; }

function kw(item) {
  return [
    item.name, item.title, item.description,
    item.subject, item.topic, item.category,
    item.type, item.kind, item.tags, item.source,
    item.summary, item.notes, item.rule,
    item.message, item.source_service, item.service,
    item.alert_type, item.severity,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function overlap(a, b) {
  const wa = a.split(/\W+/).filter(w => w.length > 3);
  const wb = new Set(b.split(/\W+/).filter(w => w.length > 3));
  return wa.filter(w => wb.has(w)).length;
}

function classifyAlert(alert, contacts, swarmJobs) {
  const ak = kw(alert);
  const matchedContacts = contacts.filter(c => overlap(ak, kw(c)) >= 1);
  const matchedSwarm    = swarmJobs.filter(j => overlap(ak, kw(j)) >= 1);

  const hasContact = matchedContacts.length > 0;
  const hasSwarm   = matchedSwarm.length > 0;

  let cls;
  if (hasContact && hasSwarm) cls = "FULLY_OWNED";
  else if (hasContact)        cls = "CONTACT_ONLY";
  else if (hasSwarm)          cls = "SWARM_ONLY";
  else                        cls = "UNOWNED";

  return {
    id:     alert.id || alert.name || Math.random().toString(36).slice(2),
    alert,
    cls,
    matchedContacts: matchedContacts.slice(0, 5).map(c => ({
      name:  c.name || c.title || c.email || "?",
      score: overlap(ak, kw(c)),
    })),
    matchedSwarm: matchedSwarm.slice(0, 5).map(j => ({
      name:  j.name || j.title || j.description || "?",
      score: overlap(ak, kw(j)),
    })),
  };
}

async function loadAll(base) {
  const [ar, cr, sr] = await Promise.allSettled([
    fetch(`${base}/v1/ops/alerts`,     { headers: authHdr() }),
    fetch(`${base}/entities/Contact`,  { headers: authHdr() }),
    fetch(`${base}/entities/SwarmJob`, { headers: authHdr() }),
  ]);
  const safe = async (r) => {
    if (r.status !== "fulfilled") return [];
    const resp = r.value;
    if (!resp.ok) return [];
    const d = await resp.json();
    return Array.isArray(d) ? d : (d.items || d.alerts || d.results || d.data || []);
  };
  const [alerts, contacts, swarmJobs] = await Promise.all([safe(ar), safe(cr), safe(sr)]);
  return { alerts, contacts, swarmJobs };
}

/* ── exported voice helpers ─────────────────────────────────────── */
export function isAcsrnexQuery(q) {
  const lq = q.toLowerCase();
  return (
    lq.includes("acsrnex") ||
    lq.includes("alert ownership") ||
    lq.includes("unowned alert") ||
    lq.includes("response ownership") ||
    lq.includes("alert contact swarm") ||
    lq.includes("alert response gap") ||
    lq.includes("response gap")
  );
}

export async function buildAcsrnexScript() {
  try {
    const base = apiBase();
    const { alerts, contacts, swarmJobs } = await loadAll(base);
    const rows = alerts.map(a => classifyAlert(a, contacts, swarmJobs));
    const unowned     = rows.filter(r => r.cls === "UNOWNED").length;
    const fullyOwned  = rows.filter(r => r.cls === "FULLY_OWNED").length;
    const contactOnly = rows.filter(r => r.cls === "CONTACT_ONLY").length;
    const swarmOnly   = rows.filter(r => r.cls === "SWARM_ONLY").length;
    const topUnowned  = rows
      .filter(r => r.cls === "UNOWNED")
      .slice(0, 3)
      .map(r => r.alert.name || r.alert.title || r.alert.description || r.id)
      .join(", ");
    return (
      `Alert response ownership analysis complete. ` +
      `${alerts.length} alerts evaluated against ${contacts.length} contacts and ${swarmJobs.length} swarm jobs. ` +
      `${fullyOwned} are fully owned — human and automation both assigned. ` +
      `${contactOnly} have contact ownership only, with no automation cover. ` +
      `${swarmOnly} have swarm automation only, with no human contact assigned. ` +
      `${unowned} alerts are completely unowned — a critical response gap.` +
      (topUnowned ? ` Top unowned alerts: ${topUnowned}.` : "") +
      ` Recommend assigning contacts or swarm jobs to all unowned alerts immediately.`
    );
  } catch {
    return "Unable to retrieve alert response ownership data at this time, sir.";
  }
}

/* ── component ──────────────────────────────────────────────────── */
export default function OpsAlertResponseOwnership() {
  const [open, setOpen]     = useState(false);
  const [rows, setRows]     = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const { alerts, contacts, swarmJobs } = await loadAll(base);
      setRows(alerts.map(a => classifyAlert(a, contacts, swarmJobs)));
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => {
      if (!o) load();
      return !o;
    });
    window.addEventListener("jarvis:acsrnex-toggle", onToggle);
    return () => window.removeEventListener("jarvis:acsrnex-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildAcsrnexScript();
      const voice  = getActiveVoice();
      const base   = apiBase();
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHdr() },
        body: JSON.stringify({ text: script, voice }),
      });
      await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHdr() },
        body: JSON.stringify({ message: script }),
      });
    } catch { /* silent */ }
    setAssessing(false);
  }

  const unowned     = rows.filter(r => r.cls === "UNOWNED").length;
  const fullyOwned  = rows.filter(r => r.cls === "FULLY_OWNED").length;
  const contactOnly = rows.filter(r => r.cls === "CONTACT_ONLY").length;
  const swarmOnly   = rows.filter(r => r.cls === "SWARM_ONLY").length;

  const CLS_ORDER = ["ALL", "FULLY_OWNED", "CONTACT_ONLY", "SWARM_ONLY", "UNOWNED"];
  const CLS_LABEL = {
    ALL: "ALL", FULLY_OWNED: "FULLY OWNED", CONTACT_ONLY: "CONTACT ONLY",
    SWARM_ONLY: "SWARM ONLY", UNOWNED: "UNOWNED",
  };
  const CLS_CLR = {
    FULLY_OWNED: GR, CONTACT_ONLY: CY, SWARM_ONLY: AM, UNOWNED: RD,
  };

  const visible = rows
    .filter(r => filter === "ALL" || r.cls === filter)
    .filter(r => {
      if (!search) return true;
      const lq = search.toLowerCase();
      const a = r.alert;
      return [a.name, a.title, a.description, a.severity, a.source]
        .filter(Boolean).join(" ").toLowerCase().includes(lq);
    });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Alert Response Ownership Nexus (ACSRNEX)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z,
          background: "rgba(5,8,13,0.7)", border: `1px solid ${CY}66`,
          color: CY, fontFamily: MONO, fontSize: 11, padding: "4px 10px",
          borderRadius: 4, cursor: "pointer", letterSpacing: 1,
          boxShadow: unowned > 0 ? `0 0 10px ${RD}44` : "none",
        }}
      >
        {unowned > 0
          ? <span style={{ color: RD, animation: "acsrnex-pulse 1.4s ease-in-out infinite" }}>◈</span>
          : "◈"} ACSRNEX
        <style>{`@keyframes acsrnex-pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
      zIndex: Z + 10, width: "min(860px,95vw)", maxHeight: "80vh",
      background: "rgba(5,10,18,0.97)", border: `1px solid ${CY}44`,
      borderRadius: 12, display: "flex", flexDirection: "column",
      backdropFilter: "blur(12px)", boxShadow: `0 0 60px ${RD}22`,
      fontFamily: SANS, color: "#DCEBF5",
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
        borderBottom: `1px solid ${CY}22`,
      }}>
        <span style={{ color: CY, fontFamily: MONO, fontSize: 13, letterSpacing: 2 }}>◈ ACSRNEX</span>
        <span style={{ color: "#6E8AA0", fontSize: 11, flex: 1 }}>
          Alert × Contact × SwarmJob — Response Ownership
        </span>
        {loading && <span style={{ color: AM, fontSize: 10 }}>loading…</span>}
        <button onClick={assess} disabled={assessing} style={{
          background: "transparent", border: `1px solid ${GR}66`, color: GR,
          fontFamily: MONO, fontSize: 10, padding: "3px 10px", borderRadius: 4, cursor: "pointer",
        }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
        <button onClick={() => setOpen(false)} style={{
          background: "transparent", border: "none", color: "#6E8AA0",
          fontSize: 18, cursor: "pointer", lineHeight: 1,
        }}>×</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 16px", flexWrap: "wrap" }}>
        {[
          ["ALERTS",         rows.length,    CY],
          ["FULLY OWNED",    fullyOwned,     GR],
          ["CONTACT ONLY",   contactOnly,    CY],
          ["SWARM ONLY",     swarmOnly,      AM],
          ["UNOWNED",        unowned,        RD],
        ].map(([lbl, val, clr]) => (
          <div key={lbl} style={{
            background: "rgba(0,0,0,0.35)", border: `1px solid ${clr}44`,
            borderRadius: 6, padding: "6px 14px", minWidth: 90, textAlign: "center",
          }}>
            <div style={{ fontSize: 18, fontFamily: MONO, color: clr, fontWeight: 700 }}>{val}</div>
            <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1, marginTop: 2 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* filter tabs + search */}
      <div style={{ display: "flex", gap: 6, padding: "0 16px 8px", flexWrap: "wrap", alignItems: "center" }}>
        {CLS_ORDER.map(cls => (
          <button key={cls} onClick={() => setFilter(cls)} style={{
            background: filter === cls ? `${CLS_CLR[cls] || CY}22` : "transparent",
            border: `1px solid ${filter === cls ? (CLS_CLR[cls] || CY) : DIM}`,
            color: filter === cls ? (CLS_CLR[cls] || CY) : "#6E8AA0",
            fontFamily: MONO, fontSize: 10, padding: "3px 10px", borderRadius: 4, cursor: "pointer",
          }}>
            {CLS_LABEL[cls]}
          </button>
        ))}
        <input
          placeholder="search alerts…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            background: "rgba(0,0,0,0.4)", border: `1px solid ${DIM}`,
            color: "#DCEBF5", fontFamily: MONO, fontSize: 11,
            padding: "4px 10px", borderRadius: 4, marginLeft: "auto", width: 180,
          }}
        />
      </div>

      {/* rows */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 16px 12px" }}>
        {visible.length === 0 && (
          <div style={{ color: "#6E8AA0", fontFamily: MONO, fontSize: 12, padding: "16px 0" }}>
            {loading ? "Loading…" : "No alerts match current filter."}
          </div>
        )}
        {visible.map(row => {
          const clr = CLS_CLR[row.cls] || CY;
          const isExp = expanded === row.id;
          const a = row.alert;
          const name = a.name || a.title || a.description || a.rule || row.id;
          const sev  = a.severity || a.level || "?";
          return (
            <div key={row.id} style={{
              borderBottom: `1px solid ${CY}11`, padding: "8px 0",
            }}>
              <div
                onClick={() => setExpanded(isExp ? null : row.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                  background: row.cls === "UNOWNED" ? `${RD}0a` : "transparent",
                  borderRadius: 4, padding: "4px 6px",
                }}
              >
                {row.cls === "UNOWNED" && (
                  <span style={{
                    color: RD, fontSize: 9, fontFamily: MONO,
                    animation: "acsrnex-pulse 1.4s ease-in-out infinite",
                  }}>●</span>
                )}
                <span style={{ flex: 1, fontSize: 12, color: "#DCEBF5", fontFamily: MONO,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {name}
                </span>
                <span style={{
                  fontSize: 9, fontFamily: MONO, color: "#FF888880", padding: "1px 6px",
                  border: `1px solid #FF888830`, borderRadius: 3,
                }}>
                  {sev}
                </span>
                <span style={{
                  fontSize: 9, fontFamily: MONO, color: clr, padding: "1px 8px",
                  border: `1px solid ${clr}44`, borderRadius: 3, minWidth: 86, textAlign: "center",
                }}>
                  {CLS_LABEL[row.cls]}
                </span>
                <span style={{ color: CY, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{
                  display: "flex", gap: 12, padding: "8px 14px",
                  background: "rgba(0,0,0,0.2)", borderRadius: 6, margin: "4px 0",
                }}>
                  {/* contacts */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: CY, fontFamily: MONO, marginBottom: 6, letterSpacing: 1 }}>
                      CONTACTS ({row.matchedContacts.length})
                    </div>
                    {row.matchedContacts.length === 0 && (
                      <div style={{ color: "#6E8AA0", fontSize: 11 }}>none matched</div>
                    )}
                    {row.matchedContacts.map((c, i) => (
                      <div key={i} style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 11, color: "#DCEBF5", marginBottom: 2,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.name}
                        </div>
                        <div style={{ height: 4, borderRadius: 2, background: DIM, overflow: "hidden" }}>
                          <div style={{
                            height: "100%", borderRadius: 2, background: CY,
                            width: `${Math.min(100, c.score * 20)}%`,
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* swarm jobs */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: AM, fontFamily: MONO, marginBottom: 6, letterSpacing: 1 }}>
                      SWARM JOBS ({row.matchedSwarm.length})
                    </div>
                    {row.matchedSwarm.length === 0 && (
                      <div style={{ color: "#6E8AA0", fontSize: 11 }}>none matched</div>
                    )}
                    {row.matchedSwarm.map((j, i) => (
                      <div key={i} style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 11, color: "#DCEBF5", marginBottom: 2,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {j.name}
                        </div>
                        <div style={{ height: 4, borderRadius: 2, background: DIM, overflow: "hidden" }}>
                          <div style={{
                            height: "100%", borderRadius: 2, background: AM,
                            width: `${Math.min(100, j.score * 20)}%`,
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
