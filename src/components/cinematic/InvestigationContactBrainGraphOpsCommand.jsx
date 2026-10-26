/**
 * InvestigationContactBrainGraphOpsCommand — F196
 * Fetches /v1/investigations + /entities/Contact + /v1/cinematic/brain +
 * /v1/graph/centrality + /v1/ops/alerts and cross-references each
 * investigation against all 4 other sources.
 * Classifies:
 *   COMMANDED — investigation has matches across all 4 sources
 *   STAFFED   — investigation has 2–3 source matches
 *   TRACED    — investigation has 1 source match
 *   COLD      — investigation has 0 matches (no contact, brain model, graph trace, or ops alert)
 * Red pulse on COLD count.
 * ASSESS → /v1/jarvis/agent/chat advisory for cold cases + TTS.
 * Voice triggers: "investigation command"/"iccgoa"/"cold cases"/"case coverage"/
 *   "investigation coverage"/"active command"/"case command"
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const RED = "#FF4D6D";
const AMB = "#FFD700";
const GRN = "#00E5A0";
const PRP = "#B485FF";
const ORG = "#FF9A3C";
const POLL = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const ICCGOA_RE =
  /\b(investigation.command|iccgoa|cold.cases?|case.coverage|investigation.coverage|active.command|case.command|iccgoa.toggle|command.coverage|investigation.command.coverage)\b/i;

export function isIccgoaQuery(t) { return ICCGOA_RE.test(t || ""); }

export function buildIccgoaScript(rows) {
  const cold = rows.filter(r => r.cls === "COLD");
  if (!cold.length) return "All investigations have at least one supporting intelligence resource. No cold-case blind spots detected.";
  return `You are JARVIS. ${cold.length} investigation(s) are COLD — they have no matched contact owner, no brain model grounding, no graph trace, and no ops alert coverage. List each cold investigation by name and status. Then provide a 2-sentence command advisory: what contacts, skills, or systems should be assigned to activate each cold case. Be direct and specific.`;
}

const hdrs = { Authorization: `Bearer ${API_KEY}` };

async function fetchInvestigations() {
  const r = await fetch(`${apiBase()}/v1/investigations`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.investigations) ? d.investigations :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(i => ({
    id: i.id || i._id || String(Math.random()),
    name: (i.name || i.title || i.subject || "").toString(),
    status: i.status || i.state || "",
  }));
}

async function fetchContacts() {
  const r = await fetch(`${apiBase()}/entities/Contact`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.contacts) ? d.contacts :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(c => ({
    id: c.id || c._id || String(Math.random()),
    name: (c.name || c.full_name || "").toString(),
    role: c.role || c.title || "",
    org: c.org || c.organization || c.company || "",
  }));
}

async function fetchBrain() {
  const r = await fetch(`${apiBase()}/v1/cinematic/brain`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.nodes) ? d.nodes :
    Array.isArray(d?.entities) ? d.entities :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(n => ({
    id: n.id || n._id || String(Math.random()),
    name: (n.name || n.label || n.entity || "").toString(),
    type: n.type || n.category || "",
    score: typeof n.centrality === "number" ? n.centrality :
           typeof n.score === "number" ? n.score : null,
  }));
}

async function fetchGraphCentrality() {
  const r = await fetch(`${apiBase()}/v1/graph/centrality`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.nodes) ? d.nodes :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(n => ({
    id: n.id || n._id || String(Math.random()),
    name: (n.name || n.label || n.entity || "").toString(),
    score: typeof n.centrality === "number" ? n.centrality :
           typeof n.score === "number" ? n.score : null,
  }));
}

async function fetchOpsAlerts() {
  const r = await fetch(`${apiBase()}/v1/ops/alerts`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.alerts) ? d.alerts :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(a => ({
    id: a.id || a._id || String(Math.random()),
    name: (a.name || a.title || a.message || a.summary || "").toString(),
    severity: a.severity || a.level || a.priority || "",
  }));
}

function kw(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(w => w.length > 2);
}

function matchPool(item, pool) {
  const ik = kw(item.name);
  return pool.filter(p => {
    const pk = kw(p.name);
    return ik.some(w => pk.includes(w)) || pk.some(w => ik.includes(w));
  });
}

function classify(inv, contacts, brain, graphNodes, opsAlerts) {
  const mc = matchPool(inv, contacts);
  const mb = matchPool(inv, brain);
  const mg = matchPool(inv, graphNodes);
  const mo = matchPool(inv, opsAlerts);
  const score = [mc.length > 0, mb.length > 0, mg.length > 0, mo.length > 0].filter(Boolean).length;
  const cls =
    score === 4 ? "COMMANDED" :
    score >= 2  ? "STAFFED" :
    score === 1 ? "TRACED" : "COLD";
  return { ...inv, cls, matchedContacts: mc, matchedBrain: mb, matchedGraph: mg, matchedOps: mo };
}

const clsColor = { COMMANDED: GRN, STAFFED: CY, TRACED: AMB, COLD: RED };
const clsOrder = { COMMANDED: 0, STAFFED: 1, TRACED: 2, COLD: 3 };

const StatusBadge = ({ s }) =>
  s ? <span style={{ fontSize: 10, border: `1px solid ${AMB}`, color: AMB, borderRadius: 3, padding: "1px 4px", marginLeft: 4 }}>{s}</span> : null;

const ScoreBadge = ({ v }) =>
  v != null ? <span style={{ fontSize: 10, border: `1px solid ${CY}`, color: CY, borderRadius: 3, padding: "1px 4px", marginLeft: 4 }}>{typeof v === "number" ? v.toFixed(2) : v}</span> : null;

const SevBadge = ({ s }) =>
  s ? <span style={{ fontSize: 10, border: `1px solid ${RED}`, color: RED, borderRadius: 3, padding: "1px 4px", marginLeft: 4 }}>{s}</span> : null;

const TypeBadge = ({ s }) =>
  s ? <span style={{ fontSize: 10, border: `1px solid ${PRP}`, color: PRP, borderRadius: 3, padding: "1px 4px", marginLeft: 4 }}>{s}</span> : null;

export default function InvestigationContactBrainGraphOpsCommand() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState(null);
  const [expanded, setExp]    = useState({});
  const [filter, setFilter]   = useState("ALL");
  const [assessing, setAss]   = useState(false);
  const [advice, setAdvice]   = useState("");
  const timerRef              = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [investigations, contacts, brain, graphNodes, opsAlerts] = await Promise.all([
        fetchInvestigations(), fetchContacts(), fetchBrain(),
        fetchGraphCentrality(), fetchOpsAlerts(),
      ]);
      const classified = investigations
        .map(inv => classify(inv, contacts, brain, graphNodes, opsAlerts))
        .sort((a, b) => clsOrder[a.cls] - clsOrder[b.cls]);
      setRows(classified);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener("jarvis:iccgoa-toggle", toggle);
    return () => window.removeEventListener("jarvis:iccgoa-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, POLL);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAss(true); setAdvice("");
    const script = buildIccgoaScript(rows);
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdrs, "Content-Type": "application/json" },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || "";
      setAdvice(text);
      if (text) {
        try {
          await fetch(`${apiBase()}/v1/voice/tts`, {
            method: "POST",
            headers: { ...hdrs, "Content-Type": "application/json" },
            body: JSON.stringify({ text: text.slice(0, 400) }),
          });
        } catch { /* TTS optional */ }
      }
    } catch (e) {
      setAdvice("Advisory unavailable: " + e.message);
    } finally {
      setAss(false);
    }
  }, [rows]);

  const coldCount = rows.filter(r => r.cls === "COLD").length;
  const visible   = filter === "ALL" ? rows : rows.filter(r => r.cls === filter);

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Investigation × Contact × Brain × Graph × Ops Alert Active Case Command Coverage"
        style={{
          position: "fixed", bottom: 8, left: 157560, zIndex: 292,
          background: "rgba(0,0,0,0.7)", border: `1px solid ${coldCount > 0 ? RED : ORG}`,
          color: coldCount > 0 ? RED : ORG, fontSize: 10, padding: "3px 7px",
          borderRadius: 4, cursor: "pointer", fontFamily: "monospace",
          boxShadow: coldCount > 0 ? `0 0 8px ${RED}88` : "none",
          animation: coldCount > 0 ? "pulse-red 2s infinite" : "none",
        }}
      >
        ◈ ICCGOA{coldCount > 0 ? ` ⚠${coldCount}` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, right: 16, width: 560, maxHeight: "80vh",
      background: "rgba(5,10,18,0.97)", border: `1px solid ${CY}44`,
      borderRadius: 8, zIndex: 9999, display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: CY, fontSize: 12,
      boxShadow: `0 0 24px ${CY}22`,
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: `1px solid ${CY}33` }}>
        <span style={{ flex: 1, fontWeight: "bold", fontSize: 11 }}>
          ◈ ICCGOA — INVESTIGATION × CONTACT × BRAIN × GRAPH × OPS ALERT
        </span>
        {coldCount > 0 && (
          <span style={{ color: RED, fontWeight: "bold", marginRight: 10,
            animation: "pulse-red 2s infinite" }}>
            ⚠ {coldCount} COLD
          </span>
        )}
        <button onClick={load} disabled={loading} style={{ background: "none", border: `1px solid ${CY}55`, color: CY, borderRadius: 3, padding: "2px 7px", cursor: "pointer", fontSize: 10, marginRight: 6 }}>
          {loading ? "…" : "↺"}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 6, padding: "6px 12px", borderBottom: `1px solid ${CY}22` }}>
        {["ALL", "COMMANDED", "STAFFED", "TRACED", "COLD"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? `${clsColor[f] || CY}22` : "transparent",
            border: `1px solid ${clsColor[f] || CY}55`,
            color: clsColor[f] || CY, borderRadius: 3, padding: "2px 7px",
            cursor: "pointer", fontSize: 10,
          }}>
            {f}
            <span style={{ marginLeft: 4, opacity: 0.7 }}>
              {f === "ALL" ? rows.length : rows.filter(r => r.cls === f).length}
            </span>
          </button>
        ))}
      </div>

      {/* rows */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 12px" }}>
        {err && <div style={{ color: RED, padding: 8 }}>Error: {err}</div>}
        {!loading && !err && visible.length === 0 && (
          <div style={{ opacity: 0.5, padding: 8 }}>No investigations to display.</div>
        )}
        {visible.map(row => (
          <div key={row.id} style={{ borderBottom: `1px solid ${CY}18`, padding: "5px 0" }}>
            <div
              onClick={() => setExp(e => ({ ...e, [row.id]: !e[row.id] }))}
              style={{ display: "flex", alignItems: "center", cursor: "pointer", gap: 6 }}
            >
              <span style={{ color: clsColor[row.cls], fontWeight: "bold", minWidth: 88 }}>{row.cls}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name || "(no name)"}</span>
              {row.status && <StatusBadge s={row.status} />}
              <span style={{ opacity: 0.4, fontSize: 10 }}>{expanded[row.id] ? "▲" : "▼"}</span>
            </div>
            {expanded[row.id] && (
              <div style={{ paddingLeft: 16, paddingTop: 4, opacity: 0.85 }}>
                {row.matchedContacts.length > 0 && (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: GRN }}>contacts: </span>
                    {row.matchedContacts.slice(0, 3).map(c => (
                      <span key={c.id}>{c.name}
                        {c.role && <span style={{ fontSize: 10, color: AMB, marginLeft: 3 }}>{c.role}</span>}
                        {c.org && <span style={{ fontSize: 10, color: PRP, marginLeft: 3 }}>{c.org}</span>}
                        {" "}
                      </span>
                    ))}
                  </div>
                )}
                {row.matchedBrain.length > 0 && (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: CY }}>brain nodes: </span>
                    {row.matchedBrain.slice(0, 3).map(n => (
                      <span key={n.id}>{n.name}<TypeBadge s={n.type} /><ScoreBadge v={n.score} />{" "}</span>
                    ))}
                  </div>
                )}
                {row.matchedGraph.length > 0 && (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: ORG }}>graph nodes: </span>
                    {row.matchedGraph.slice(0, 3).map(n => (
                      <span key={n.id}>{n.name}<ScoreBadge v={n.score} />{" "}</span>
                    ))}
                  </div>
                )}
                {row.matchedOps.length > 0 && (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: RED }}>ops alerts: </span>
                    {row.matchedOps.slice(0, 3).map(a => (
                      <span key={a.id}>{a.name}<SevBadge s={a.severity} />{" "}</span>
                    ))}
                  </div>
                )}
                {row.cls === "COLD" && (
                  <div style={{ color: RED, fontSize: 10, opacity: 0.8 }}>
                    ⚠ No contact, brain model, graph trace, or ops alert coverage — cold case blind spot.
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* assess */}
      <div style={{ padding: "8px 12px", borderTop: `1px solid ${CY}33` }}>
        <button
          onClick={assess}
          disabled={assessing || rows.length === 0}
          style={{
            background: `${RED}22`, border: `1px solid ${RED}88`,
            color: RED, borderRadius: 4, padding: "4px 14px",
            cursor: assessing ? "wait" : "pointer", fontSize: 11,
          }}
        >
          {assessing ? "ASSESSING…" : "▶ ASSESS COLD CASES"}
        </button>
        {advice && (
          <div style={{ marginTop: 8, color: CY, fontSize: 11, opacity: 0.9,
            maxHeight: 120, overflowY: "auto", borderTop: `1px solid ${CY}22`, paddingTop: 6 }}>
            {advice}
          </div>
        )}
      </div>
    </div>
  );
}
