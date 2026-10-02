import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const AM = "#FFB300"; const CY = "#00E5FF"; const OR = "#FF9800";
const PU = "#CE93D8"; const RD = "#FF3D3D"; const GN = "#4CAF50";
const TE = "#26C6DA"; const DIM = "rgba(255,255,255,0.04)";
const BG = "rgba(6,10,18,0.94)";
const MN = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const REFRESH_MS = 90_000;
const BTN_LEFT   = 1101200;
const Z_IDX      = 682;

/* ── normalizers ─────────────────────────────────────────────────────────── */
function normNodes(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw)
    ? raw
    : (raw.nodes ?? raw.centrality ?? raw.top_nodes ?? raw.data ?? raw.items ?? []);
  return arr.map((n, i) => ({
    id:         String(n.id         ?? n.node_id   ?? i),
    name:       String(n.name       ?? n.label     ?? n.title ?? `Node-${i}`),
    type:       String(n.type       ?? n.node_type ?? ""),
    score:      Number(n.score      ?? n.centrality_score ?? n.influence ?? n.rank ?? 0),
    community:  String(n.community  ?? n.cluster   ?? ""),
    tags:       Array.isArray(n.tags) ? n.tags.map(String) : [],
    desc:       String(n.description ?? n.desc ?? n.summary ?? ""),
  }));
}

function normContacts(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw)
    ? raw
    : (raw.contacts ?? raw.people ?? raw.data ?? raw.items ?? []);
  return arr.map((c, i) => ({
    id:   String(c.id   ?? c.contact_id  ?? i),
    name: String(c.name ?? c.full_name   ?? c.label ?? `Contact-${i}`),
    role: String(c.role ?? c.title       ?? c.position ?? ""),
    org:  String(c.org  ?? c.organisation ?? c.company ?? ""),
    tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
    desc: String(c.description ?? c.desc ?? c.bio ?? ""),
  }));
}

function normTasks(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw)
    ? raw
    : (raw.tasks ?? raw.missions ?? raw.data ?? raw.items ?? []);
  return arr.map((t, i) => ({
    id:       String(t.id       ?? t.task_id   ?? i),
    name:     String(t.name     ?? t.title     ?? t.label ?? `Task-${i}`),
    priority: String(t.priority ?? t.urgency   ?? ""),
    status:   String(t.status   ?? t.state     ?? ""),
    tags:     Array.isArray(t.tags) ? t.tags.map(String) : [],
    desc:     String(t.description ?? t.desc ?? t.objective ?? ""),
  }));
}

/* ── token overlap ───────────────────────────────────────────────────────── */
function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function overlap(nodeToks, obj) {
  const objToks = tokens(obj.name + " " + (obj.desc || "") + " " + (obj.tags || []).join(" "));
  return nodeToks.filter(t => objToks.includes(t)).length;
}

/* ── classification ──────────────────────────────────────────────────────── */
function classify(node, contacts, tasks) {
  const tt = tokens(node.name + " " + node.desc + " " + node.tags.join(" ") + " " + node.type);
  const hasContact = contacts.some(c => overlap(tt, c) >= 1);
  const hasTask    = tasks.some(t => overlap(tt, t) >= 1);
  if (hasContact && hasTask) return "FULLY_OPERATIONAL";
  if (hasContact)            return "CONTACT_LINKED";
  if (hasTask)               return "TASK_DRIVEN";
  return "UNTRACKED";
}

function matchContacts(node, contacts) {
  const tt = tokens(node.name + " " + node.desc + " " + node.tags.join(" "));
  return contacts.filter(c => overlap(tt, c) >= 1).slice(0, 4);
}

function matchTasks(node, tasks) {
  const tt = tokens(node.name + " " + node.desc + " " + node.tags.join(" "));
  return tasks.filter(t => overlap(tt, t) >= 1).slice(0, 4);
}

function relevanceScore(node, item) {
  const tt = tokens(node.name + " " + node.desc + " " + node.tags.join(" "));
  return Math.min(1, overlap(tt, item) / 3);
}

/* ── build script (exported for JarvisBrain) ─────────────────────────────── */
export async function buildGnocovScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [nR, cR, tR] = await Promise.all([
    fetch(`${base}/v1/graph/centrality`, { headers }),
    fetch(`${base}/entities/Contact`,    { headers }),
    fetch(`${base}/entities/Task`,       { headers }),
  ]);
  const [nJ, cJ, tJ] = await Promise.all([nR.json(), cR.json(), tR.json()]);
  const nodes    = normNodes(nJ);
  const contacts = normContacts(cJ);
  const tasks    = normTasks(tJ);
  const classified = nodes.map(n => ({ ...n, cls: classify(n, contacts, tasks) }));
  const fullyOp   = classified.filter(n => n.cls === "FULLY_OPERATIONAL").length;
  const contLink  = classified.filter(n => n.cls === "CONTACT_LINKED").length;
  const taskDriv  = classified.filter(n => n.cls === "TASK_DRIVEN").length;
  const untracked = classified.filter(n => n.cls === "UNTRACKED").length;
  const pct       = nodes.length ? Math.round((fullyOp / nodes.length) * 100) : 0;
  return `GNOCOV online, sir. ${nodes.length} graph nodes correlated against ${contacts.length} contacts and ${tasks.length} tasks. ` +
    `${fullyOp} fully operational, ${contLink} contact-linked, ${taskDriv} task-driven, ${untracked} untracked — ${pct}% full operational coverage.`;
}

/* ── voice trigger ───────────────────────────────────────────────────────── */
export function isGnocovQuery(q) {
  const lower = (q || "").toLowerCase();
  return /gnocov|graph node coverage|node operational|untracked node|node contact task|graph operational coverage/.test(lower);
}

/* ── stat tile ───────────────────────────────────────────────────────────── */
function StatTile({ label, value, color }) {
  return (
    <div style={{ flex: 1, background: DIM, borderRadius: 6, padding: "8px 10px", minWidth: 70, textAlign: "center" }}>
      <div style={{ fontFamily: MN, fontSize: 18, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
    </div>
  );
}

/* ── badge ───────────────────────────────────────────────────────────────── */
const CLS_META = {
  FULLY_OPERATIONAL: { color: GN, label: "FULLY OP"    },
  CONTACT_LINKED:    { color: TE, label: "CONTACT"      },
  TASK_DRIVEN:       { color: CY, label: "TASK DRIVEN"  },
  UNTRACKED:         { color: RD, label: "UNTRACKED"    },
};

function ClsBadge({ cls }) {
  const m = CLS_META[cls] || { color: OR, label: cls };
  return (
    <span style={{ fontFamily: MN, fontSize: 9, fontWeight: 700, color: m.color,
      border: `1px solid ${m.color}`, borderRadius: 3, padding: "1px 5px", letterSpacing: "0.06em" }}>
      {m.label}
    </span>
  );
}

function RelevanceBar({ score, color }) {
  return (
    <div style={{ height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2, marginTop: 3 }}>
      <div style={{ height: "100%", width: `${Math.round(score * 100)}%`, background: color, borderRadius: 2 }} />
    </div>
  );
}

/* ── main component ──────────────────────────────────────────────────────── */
export default function GraphNodeOperationalCoverage() {
  const [open, setOpen]         = useState(false);
  const [nodes, setNodes]       = useState([]);
  const [contacts, setContacts] = useState([]);
  const [tasks, setTasks]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const base = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [nR, cR, tR] = await Promise.all([
        fetch(`${base}/v1/graph/centrality`, { headers }),
        fetch(`${base}/entities/Contact`,    { headers }),
        fetch(`${base}/entities/Task`,       { headers }),
      ]);
      const [nJ, cJ, tJ] = await Promise.all([nR.json(), cR.json(), tR.json()]);
      const ns = normNodes(nJ);
      const cs = normContacts(cJ);
      const ts = normTasks(tJ);
      const classified = ns.map(n => ({
        ...n,
        cls:           classify(n, cs, ts),
        matchedContacts: matchContacts(n, cs),
        matchedTasks:    matchTasks(n, ts),
      }));
      setNodes(classified); setContacts(cs); setTasks(ts);
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener("jarvis:gnocov-toggle", handler);
    return () => window.removeEventListener("jarvis:gnocov-toggle", handler);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildGnocovScript();
      const base   = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
      const chatR = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers,
        body: JSON.stringify({ message: `GNOCOV assessment: ${script}. Provide a 2-sentence operational coverage brief.` }),
      });
      const chatJ = await chatR.json();
      const reply = chatJ.response ?? chatJ.message ?? chatJ.content ?? script;
      const ttsR = await fetch(`${base}/v1/voice/tts`, {
        method: "POST", headers: { ...headers },
        body: JSON.stringify({ text: reply, voice: getActiveVoice() }),
      });
      if (ttsR.ok) {
        const blob = await ttsR.blob();
        const url  = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play().catch(() => {});
        audio.onended = () => URL.revokeObjectURL(url);
      }
    } catch { /* non-critical */ }
    setAssessing(false);
  }, [assessing]);

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        style={{ position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_IDX,
          background: "rgba(0,229,255,0.08)", border: "1px solid rgba(0,229,255,0.35)",
          color: CY, fontFamily: MN, fontSize: 10, padding: "4px 9px", borderRadius: 4,
          cursor: "pointer", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
        ◈ GNOCOV
      </button>
    );
  }

  const fullyOp   = nodes.filter(n => n.cls === "FULLY_OPERATIONAL").length;
  const contLink  = nodes.filter(n => n.cls === "CONTACT_LINKED").length;
  const taskDriv  = nodes.filter(n => n.cls === "TASK_DRIVEN").length;
  const untracked = nodes.filter(n => n.cls === "UNTRACKED").length;
  const covPct    = nodes.length ? Math.round((fullyOp / nodes.length) * 100) : 0;

  const TABS = ["ALL", "FULLY_OPERATIONAL", "CONTACT_LINKED", "TASK_DRIVEN", "UNTRACKED"];
  const visible = nodes.filter(n => {
    if (filter !== "ALL" && n.cls !== filter) return false;
    if (search) {
      const lc = search.toLowerCase();
      return n.name.toLowerCase().includes(lc) || n.type.toLowerCase().includes(lc);
    }
    return true;
  });

  return (
    <div style={{ position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh",
      background: "rgba(0,0,0,0.55)", zIndex: Z_IDX, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: BG, border: "1px solid rgba(0,229,255,0.18)", borderRadius: 10,
        width: "min(900px,96vw)", maxHeight: "88vh", display: "flex", flexDirection: "column",
        boxShadow: "0 0 40px rgba(0,0,0,0.7)", overflow: "hidden" }}>

        {/* header */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)",
          display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: MN, fontSize: 11, color: CY, fontWeight: 700, letterSpacing: "0.08em" }}>
            ◈ GNOCOV — Graph Node Operational Coverage
          </span>
          <span style={{ marginLeft: "auto", fontFamily: MN, fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
            {nodes.length} nodes · {contacts.length} contacts · {tasks.length} tasks
          </span>
          {untracked > 0 && (
            <span style={{ fontFamily: MN, fontSize: 10, fontWeight: 700, color: AM,
              border: `1px solid ${AM}`, borderRadius: 3, padding: "1px 6px" }}>
              {untracked} UNTRACKED
            </span>
          )}
          <button onClick={() => setOpen(false)}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)",
              fontSize: 16, cursor: "pointer", padding: "0 4px" }}>✕</button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 8, padding: "10px 14px", flexWrap: "wrap" }}>
          <StatTile label="NODES"      value={nodes.length}  color={CY} />
          <StatTile label="CONTACTS"   value={contacts.length} color={TE} />
          <StatTile label="TASKS"      value={tasks.length}  color={CY} />
          <StatTile label="FULLY OP"   value={fullyOp}       color={GN} />
          <StatTile label="CONTACT"    value={contLink}      color={TE} />
          <StatTile label="TASK"       value={taskDriv}      color={CY} />
          <StatTile label="UNTRACKED"  value={untracked}     color={RD} />
          <StatTile label="COV%"       value={`${covPct}%`}  color={covPct >= 70 ? GN : covPct >= 40 ? AM : RD} />
        </div>

        {/* coverage bar */}
        <div style={{ padding: "0 14px 8px" }}>
          <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 3 }}>
            <div style={{ height: "100%", width: `${covPct}%`, borderRadius: 3,
              background: covPct >= 70 ? GN : covPct >= 40 ? AM : RD }} />
          </div>
        </div>

        {/* filter tabs */}
        <div style={{ display: "flex", gap: 6, padding: "0 14px 8px", flexWrap: "wrap", alignItems: "center" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setFilter(t)}
              style={{ background: filter === t ? "rgba(0,229,255,0.15)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${filter === t ? CY : "rgba(255,255,255,0.12)"}`,
                color: filter === t ? CY : "rgba(255,255,255,0.5)",
                fontFamily: MN, fontSize: 9, padding: "3px 8px", borderRadius: 4,
                cursor: "pointer", letterSpacing: "0.05em" }}>
              {t.replace(/_/g, " ")}
            </button>
          ))}
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search nodes…"
            style={{ marginLeft: "auto", background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.12)", color: "#fff",
              fontFamily: MN, fontSize: 10, padding: "3px 8px", borderRadius: 4, width: 140 }} />
        </div>

        {/* assess button */}
        <div style={{ padding: "0 14px 8px" }}>
          <button onClick={assess} disabled={assessing}
            style={{ background: assessing ? "rgba(0,229,255,0.05)" : "rgba(0,229,255,0.12)",
              border: `1px solid ${assessing ? "rgba(0,229,255,0.2)" : CY}`,
              color: assessing ? "rgba(0,229,255,0.4)" : CY,
              fontFamily: MN, fontSize: 10, padding: "5px 14px", borderRadius: 4,
              cursor: assessing ? "default" : "pointer", letterSpacing: "0.06em" }}>
            {assessing ? "▶ ASSESSING…" : "▶ ASSESS COVERAGE"}
          </button>
        </div>

        {/* list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 12px" }}>
          {loading && (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)",
              fontFamily: MN, fontSize: 11, padding: 32 }}>Loading…</div>
          )}
          {error && (
            <div style={{ textAlign: "center", color: RD,
              fontFamily: MN, fontSize: 11, padding: 32 }}>{error}</div>
          )}
          {!loading && !error && visible.length === 0 && (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.25)",
              fontFamily: MN, fontSize: 11, padding: 32 }}>No nodes match.</div>
          )}
          {visible.map(node => (
            <div key={node.id}
              style={{ marginBottom: 4, borderRadius: 6,
                background: node.cls === "UNTRACKED" ? "rgba(255,61,61,0.06)" : DIM,
                border: node.cls === "UNTRACKED"
                  ? "1px solid rgba(255,61,61,0.18)"
                  : "1px solid rgba(255,255,255,0.06)",
                animation: node.cls === "UNTRACKED" ? "pulse 2s infinite" : "none" }}>
              <div onClick={() => setExpanded(e => e === node.id ? null : node.id)}
                style={{ padding: "8px 12px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: MN, fontSize: 11, color: CY, flex: 1, fontWeight: 600 }}>
                  {node.name}
                </span>
                {node.type && (
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontFamily: MN }}>
                    {node.type}
                  </span>
                )}
                {node.score > 0 && (
                  <span style={{ fontSize: 9, color: AM, fontFamily: MN }}>
                    ↑{node.score.toFixed ? node.score.toFixed(2) : node.score}
                  </span>
                )}
                <ClsBadge cls={node.cls} />
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: MN }}>
                  {expanded === node.id ? "▲" : "▼"}
                </span>
              </div>
              {expanded === node.id && (
                <div style={{ padding: "0 12px 12px", display: "flex", gap: 12 }}>
                  {/* contacts */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: TE, fontFamily: MN, fontWeight: 700,
                      marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Contacts ({node.matchedContacts.length})
                    </div>
                    {node.matchedContacts.length === 0
                      ? <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: MN }}>No matching contacts.</div>
                      : node.matchedContacts.map(c => (
                          <div key={c.id} style={{ background: "rgba(38,198,218,0.07)", borderRadius: 4, padding: "5px 8px", marginBottom: 4 }}>
                            <div style={{ fontSize: 10, color: "#fff", fontFamily: MN }}>{c.name}</div>
                            {c.role && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>{c.role}</div>}
                            <RelevanceBar score={relevanceScore(node, c)} color={TE} />
                          </div>
                        ))}
                  </div>
                  {/* tasks */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: CY, fontFamily: MN, fontWeight: 700,
                      marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Tasks ({node.matchedTasks.length})
                    </div>
                    {node.matchedTasks.length === 0
                      ? <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: MN }}>No matching tasks.</div>
                      : node.matchedTasks.map(t => (
                          <div key={t.id} style={{ background: "rgba(0,229,255,0.07)", borderRadius: 4, padding: "5px 8px", marginBottom: 4 }}>
                            <div style={{ fontSize: 10, color: "#fff", fontFamily: MN }}>{t.name}</div>
                            {t.priority && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>Priority: {t.priority}</div>}
                            <RelevanceBar score={relevanceScore(node, t)} color={CY} />
                          </div>
                        ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.45 } }`}</style>
    </div>
  );
}
