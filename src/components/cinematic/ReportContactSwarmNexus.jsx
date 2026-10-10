import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const AM = "#FFB300"; const GN = "#4CAF50"; const RD = "#FF3D3D";
const CY = "#00E5FF"; const OR = "#FF9800"; const PU = "#CE93D8";
const DIM = "rgba(255,255,255,0.04)"; const BG = "rgba(6,10,18,0.94)";
const MN = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const REFRESH_MS = 90_000;
const BTN_LEFT   = 1104000;
const Z_IDX      = 687;

/* ── normalizers ─────────────────────────────────────────────────────────── */
function normReports(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.reports ?? raw.data ?? raw.items ?? []);
  return arr.map((r, i) => ({
    id:    String(r.id    ?? r.report_id ?? i),
    name:  String(r.name  ?? r.title     ?? r.label ?? `Report-${i}`),
    type:  String(r.type  ?? r.category  ?? r.report_type ?? ""),
    tags:  Array.isArray(r.tags) ? r.tags.map(String) : [],
    desc:  String(r.description ?? r.summary ?? r.content ?? r.body ?? ""),
    author: String(r.author ?? r.created_by ?? ""),
  }));
}

function normContacts(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.contacts ?? raw.data ?? raw.items ?? []);
  return arr.map((c, i) => ({
    id:   String(c.id   ?? c.contact_id ?? i),
    name: String(c.name ?? c.full_name  ?? c.label ?? `Contact-${i}`),
    role: String(c.role ?? c.title      ?? c.position ?? ""),
    org:  String(c.org  ?? c.organization ?? c.company ?? ""),
    tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
    desc: String(c.description ?? c.notes ?? c.bio ?? ""),
  }));
}

function normSwarm(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.swarm_jobs ?? raw.jobs ?? raw.data ?? raw.items ?? []);
  return arr.map((s, i) => ({
    id:     String(s.id     ?? s.job_id    ?? i),
    name:   String(s.name   ?? s.title     ?? s.label ?? `Job-${i}`),
    status: String(s.status ?? s.state     ?? ""),
    type:   String(s.type   ?? s.job_type  ?? ""),
    tags:   Array.isArray(s.tags) ? s.tags.map(String) : [],
    desc:   String(s.description ?? s.objective ?? s.detail ?? ""),
  }));
}

/* ── token overlap ───────────────────────────────────────────────────────── */
function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function overlap(rToks, obj) {
  const oToks = tokens(
    obj.name + " " + (obj.desc || "") + " " + (obj.tags || []).join(" ") +
    " " + (obj.role || "") + " " + (obj.org || "") + " " + (obj.type || "") +
    " " + (obj.status || "")
  );
  return rToks.filter(t => oToks.includes(t)).length;
}

/* ── classification ──────────────────────────────────────────────────────── */
function classify(report, contacts, swarm) {
  const rt = tokens(report.name + " " + report.type + " " + report.tags.join(" ") + " " + report.desc);
  const hasContact = contacts.some(c => overlap(rt, c) >= 1);
  const hasSwarm   = swarm.some(s   => overlap(rt, s) >= 1);
  if (hasContact && hasSwarm) return "FULLY_ACTIVE";
  if (hasContact)             return "CONTACT_BRIEFED";
  if (hasSwarm)               return "SWARM_SUPPORTED";
  return "UNSUPPORTED";
}

function matchItems(report, list) {
  const rt = tokens(report.name + " " + report.type + " " + report.tags.join(" ") + " " + report.desc);
  return list.filter(x => overlap(rt, x) >= 1).slice(0, 4);
}

function relScore(report, item) {
  const rt = tokens(report.name + " " + report.type + " " + report.tags.join(" "));
  return Math.min(1, overlap(rt, item) / 3);
}

/* ── build script (exported for JarvisBrain) ─────────────────────────────── */
export async function buildRcsanScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [rR, cR, sR] = await Promise.all([
    fetch(`${base}/v1/reports`,          { headers }),
    fetch(`${base}/entities/Contact`,    { headers }),
    fetch(`${base}/entities/SwarmJob`,   { headers }),
  ]);
  const [rJ, cJ, sJ] = await Promise.all([rR.json(), cR.json(), sR.json()]);
  const reports  = normReports(rJ);
  const contacts = normContacts(cJ);
  const swarm    = normSwarm(sJ);
  const results  = reports.map(r => ({ ...r, cls: classify(r, contacts, swarm) }));
  const fullyActive     = results.filter(r => r.cls === "FULLY_ACTIVE").length;
  const contactBriefed  = results.filter(r => r.cls === "CONTACT_BRIEFED").length;
  const swarmSupported  = results.filter(r => r.cls === "SWARM_SUPPORTED").length;
  const unsupported     = results.filter(r => r.cls === "UNSUPPORTED").length;
  const covPct = reports.length
    ? Math.round(((fullyActive + contactBriefed + swarmSupported) / reports.length) * 100)
    : 0;
  return (
    `RCSAN Intelligence Action Nexus. ` +
    `${reports.length} reports cross-referenced against ${contacts.length} contacts and ${swarm.length} swarm jobs. ` +
    `${fullyActive} fully active (contact + swarm), ` +
    `${contactBriefed} contact-briefed only, ` +
    `${swarmSupported} swarm-supported only, ` +
    `${unsupported} unsupported — ${covPct}% intelligence action coverage.`
  );
}

export function isRcsanQuery(q) {
  return /rcsan|report contact swarm|swarm contact report|intelligence action nexus|unsupported reports|report action coverage|contact swarm report|report swarm coverage/i.test(q);
}

/* ── component ───────────────────────────────────────────────────────────── */
export default function ReportContactSwarmNexus() {
  const [open, setOpen]       = useState(false);
  const [reports, setReports]   = useState([]);
  const [contacts, setContacts] = useState([]);
  const [swarm, setSwarm]       = useState([]);
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [rR, cR, sR] = await Promise.all([
        fetch(`${base}/v1/reports`,        { headers }),
        fetch(`${base}/entities/Contact`,  { headers }),
        fetch(`${base}/entities/SwarmJob`, { headers }),
      ]);
      const [rJ, cJ, sJ] = await Promise.all([rR.json(), cR.json(), sR.json()]);
      setReports(normReports(rJ));
      setContacts(normContacts(cJ));
      setSwarm(normSwarm(sJ));
    } catch { /* stay with previous data */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener("jarvis:rcsan-toggle", handler);
    return () => window.removeEventListener("jarvis:rcsan-toggle", handler);
  }, []);

  useEffect(() => {
    if (open) {
      load();
      timerRef.current = setInterval(load, REFRESH_MS);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position:"fixed", bottom:8, left:BTN_LEFT, zIndex:Z_IDX,
          background:"rgba(0,229,255,0.08)", border:"1px solid rgba(0,229,255,0.25)",
          color:CY, fontFamily:MN, fontSize:10, padding:"3px 8px",
          borderRadius:4, cursor:"pointer", letterSpacing:1,
        }}
      >
        ◈ RCSAN
      </button>
    );
  }

  const classified = reports.map(r => ({ ...r, cls: classify(r, contacts, swarm) }));
  const fullyActive    = classified.filter(r => r.cls === "FULLY_ACTIVE").length;
  const contactBriefed = classified.filter(r => r.cls === "CONTACT_BRIEFED").length;
  const swarmSupported = classified.filter(r => r.cls === "SWARM_SUPPORTED").length;
  const unsupported    = classified.filter(r => r.cls === "UNSUPPORTED").length;
  const covPct = reports.length
    ? Math.round(((fullyActive + contactBriefed + swarmSupported) / reports.length) * 100)
    : 0;

  const TABS = ["ALL","FULLY_ACTIVE","CONTACT_BRIEFED","SWARM_SUPPORTED","UNSUPPORTED"];
  const visible = classified.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildRcsanScript();
      const base = apiBase();
      const headers = { "Content-Type":"application/json", Authorization:`Bearer ${API_KEY}` };
      const chatResp = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method:"POST", headers, body: JSON.stringify({ message: script }),
      });
      const chatJson = await chatResp.json();
      const brief = chatJson?.response ?? chatJson?.message ?? chatJson?.content ?? script;
      const ttsResp = await fetch(`${base}/v1/voice/tts`, {
        method:"POST", headers,
        body: JSON.stringify({ text: brief, voice: getActiveVoice() }),
      });
      if (ttsResp.ok) {
        const blob = await ttsResp.blob();
        new Audio(URL.createObjectURL(blob)).play();
      }
    } catch { /* non-fatal */ }
    setAssessing(false);
  }

  const clsColor = { FULLY_ACTIVE: GN, CONTACT_BRIEFED: CY, SWARM_SUPPORTED: PU, UNSUPPORTED: AM };
  const clsLabel = { FULLY_ACTIVE:"FULLY ACTIVE", CONTACT_BRIEFED:"CONTACT BRIEFED", SWARM_SUPPORTED:"SWARM SUPPORTED", UNSUPPORTED:"UNSUPPORTED" };

  return (
    <div style={{
      position:"fixed", top:60, right:16, width:540, maxHeight:"80vh",
      background:BG, border:"1px solid rgba(0,229,255,0.2)", borderRadius:8,
      zIndex:Z_IDX+1, fontFamily:MN, fontSize:11, color:"rgba(255,255,255,0.85)",
      display:"flex", flexDirection:"column", overflowY:"hidden",
    }}>
      {/* header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                    padding:"8px 12px", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
        <span style={{ color:CY, fontWeight:700, fontSize:12 }}>
          ◈ RCSAN — Report × Contact × SwarmJob Action Nexus
          {unsupported > 0 && (
            <span style={{ marginLeft:8, background:AM, color:"#000", borderRadius:10,
                           padding:"1px 6px", fontSize:10 }}>{unsupported}</span>
          )}
        </span>
        <div style={{ display:"flex", gap:6 }}>
          <button onClick={assess} disabled={assessing}
            style={{ background:"rgba(0,229,255,0.1)", border:"1px solid rgba(0,229,255,0.3)",
                     color:CY, fontFamily:MN, fontSize:10, padding:"2px 8px",
                     borderRadius:4, cursor:"pointer" }}>
            {assessing ? "…" : "▶ ASSESS"}
          </button>
          <button onClick={load} disabled={loading}
            style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.15)",
                     color:"rgba(255,255,255,0.6)", fontFamily:MN, fontSize:10, padding:"2px 8px",
                     borderRadius:4, cursor:"pointer" }}>
            {loading ? "…" : "↻"}
          </button>
          <button onClick={() => setOpen(false)}
            style={{ background:"none", border:"none", color:"rgba(255,255,255,0.4)",
                     cursor:"pointer", fontSize:14 }}>✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, padding:"8px 12px" }}>
        {[
          ["REPORTS",  reports.length,  "rgba(255,255,255,0.5)"],
          ["CONTACTS", contacts.length, OR],
          ["SWARM",    swarm.length,    CY],
          ["FULLY",    fullyActive,     GN],
          ["CONTACT",  contactBriefed,  CY],
          ["SWARM",    swarmSupported,  PU],
          ["UNSUP.",   unsupported,     AM],
        ].map(([label, val, col]) => (
          <div key={label} style={{ background:DIM, borderRadius:4, padding:"4px 2px", textAlign:"center" }}>
            <div style={{ color:col, fontSize:14, fontWeight:700 }}>{val}</div>
            <div style={{ fontSize:8, color:"rgba(255,255,255,0.4)" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* coverage bar */}
      <div style={{ padding:"0 12px 6px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
          <span style={{ color:"rgba(255,255,255,0.4)", fontSize:9 }}>ACTION COVERAGE</span>
          <span style={{ color: covPct >= 70 ? GN : covPct >= 40 ? AM : RD, fontSize:9 }}>{covPct}%</span>
        </div>
        <div style={{ height:4, background:"rgba(255,255,255,0.07)", borderRadius:2 }}>
          <div style={{ height:"100%", width:`${covPct}%`,
                        background: covPct >= 70 ? GN : covPct >= 40 ? AM : RD,
                        borderRadius:2, transition:"width 0.5s" }} />
        </div>
      </div>

      {/* filter tabs */}
      <div style={{ display:"flex", gap:4, padding:"0 12px 6px", flexWrap:"wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setFilter(t)}
            style={{ background: filter === t ? "rgba(0,229,255,0.15)" : "rgba(255,255,255,0.04)",
                     border: `1px solid ${filter === t ? "rgba(0,229,255,0.5)" : "rgba(255,255,255,0.1)"}`,
                     color: filter === t ? CY : "rgba(255,255,255,0.5)",
                     fontFamily:MN, fontSize:9, padding:"2px 7px", borderRadius:3, cursor:"pointer" }}>
            {t.replace("_"," ")}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{ flex:1, minWidth:80, background:"rgba(255,255,255,0.04)",
                   border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.7)",
                   fontFamily:MN, fontSize:9, padding:"2px 6px", borderRadius:3 }} />
      </div>

      {/* list */}
      <div style={{ overflowY:"auto", flex:1, padding:"0 12px 12px" }}>
        {visible.length === 0 && (
          <div style={{ color:"rgba(255,255,255,0.25)", textAlign:"center", paddingTop:20 }}>
            {loading ? "Loading…" : "No items"}
          </div>
        )}
        {visible.map(r => {
          const isExp = expanded === r.id;
          const mContacts = matchItems(r, contacts);
          const mSwarm    = matchItems(r, swarm);
          const col = clsColor[r.cls] ?? AM;
          return (
            <div key={r.id}
              style={{ background: r.cls === "UNSUPPORTED" ? "rgba(255,179,0,0.04)" : DIM,
                       border:`1px solid ${r.cls === "UNSUPPORTED" ? "rgba(255,179,0,0.15)" : "rgba(255,255,255,0.06)"}`,
                       borderRadius:5, marginBottom:5, padding:"6px 8px", cursor:"pointer" }}
              onClick={() => setExpanded(isExp ? null : r.id)}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ color:"rgba(255,255,255,0.85)", fontSize:11 }}>{r.name}</span>
                <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                  {r.type && (
                    <span style={{ background:"rgba(255,255,255,0.06)", borderRadius:3,
                                   padding:"1px 5px", fontSize:9, color:"rgba(255,255,255,0.5)" }}>
                      {r.type.toUpperCase().slice(0,10)}
                    </span>
                  )}
                  <span style={{ color:col, fontSize:9, fontWeight:700 }}>{clsLabel[r.cls]}</span>
                  <span style={{ color:"rgba(255,255,255,0.3)", fontSize:10 }}>{isExp ? "▲" : "▼"}</span>
                </div>
              </div>
              {isExp && (
                <div style={{ marginTop:8 }}>
                  {/* matched contacts */}
                  {mContacts.length > 0 && (
                    <div style={{ marginBottom:6 }}>
                      <div style={{ color:OR, fontSize:9, marginBottom:4 }}>CONTACTS ({mContacts.length})</div>
                      {mContacts.map(c => (
                        <div key={c.id} style={{ display:"flex", alignItems:"center", gap:6,
                                                 marginBottom:3, padding:"3px 6px",
                                                 background:"rgba(255,152,0,0.06)", borderRadius:3 }}>
                          <span style={{ flex:1, color:"rgba(255,255,255,0.75)", fontSize:10 }}>{c.name}</span>
                          {c.role && <span style={{ color:OR, fontSize:9 }}>{c.role.slice(0,18)}</span>}
                          <div style={{ width:60, height:3, background:"rgba(255,255,255,0.08)", borderRadius:2 }}>
                            <div style={{ height:"100%", width:`${Math.round(relScore(r,c)*100)}%`,
                                          background:OR, borderRadius:2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {mContacts.length === 0 && (
                    <div style={{ color:"rgba(255,255,255,0.2)", fontSize:9, marginBottom:4 }}>No matched contacts</div>
                  )}
                  {/* matched swarm jobs */}
                  {mSwarm.length > 0 && (
                    <div>
                      <div style={{ color:CY, fontSize:9, marginBottom:4 }}>SWARM JOBS ({mSwarm.length})</div>
                      {mSwarm.map(s => (
                        <div key={s.id} style={{ display:"flex", alignItems:"center", gap:6,
                                                  marginBottom:3, padding:"3px 6px",
                                                  background:"rgba(0,229,255,0.05)", borderRadius:3 }}>
                          <span style={{ flex:1, color:"rgba(255,255,255,0.75)", fontSize:10 }}>{s.name}</span>
                          {s.status && <span style={{ color:CY, fontSize:9 }}>{s.status.toUpperCase().slice(0,12)}</span>}
                          <div style={{ width:60, height:3, background:"rgba(255,255,255,0.08)", borderRadius:2 }}>
                            <div style={{ height:"100%", width:`${Math.round(relScore(r,s)*100)}%`,
                                          background:CY, borderRadius:2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {mSwarm.length === 0 && (
                    <div style={{ color:"rgba(255,255,255,0.2)", fontSize:9 }}>No matched swarm jobs</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
