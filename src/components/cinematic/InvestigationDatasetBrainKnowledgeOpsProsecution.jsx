/**
 * InvestigationDatasetBrainKnowledgeOpsProsecution — F193
 * Fetches /v1/investigations + /v1/datasets + /v1/cinematic/brain +
 * /knowledge/ + /v1/ops/alerts and cross-references each investigation
 * against all 4 other sources.
 * Classifies:
 *   PROSECUTING — investigation has 4 cross-source matches
 *   RESOURCED   — investigation has 2–3 matches
 *   PARTIAL     — investigation has 1 match
 *   COLD        — investigation has 0 matches (prosecution dead-ends)
 * Red pulse on COLD count.
 * ASSESS → /v1/jarvis/agent/chat advisory for cold investigations + TTS.
 * Voice triggers: "prosecution web"/"ivpweb"/"investigation evidence"/
 *   "cold cases"/"investigation dataset"/"prosecution dead"
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const RED = "#FF4D6D";
const AMB = "#FFD700";
const GRN = "#00E5A0";
const PRP = "#B485FF";
const POLL = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const IVPWEB_RE =
  /\b(prosecution.web|ivpweb|investigation.evidence|cold.cases?|investigation.dataset|prosecution.dead|evidence.prosecution|cold.investigation|ivpweb.toggle)\b/i;

export function isIvpwebQuery(t) { return IVPWEB_RE.test(t || ""); }

export function buildIvpwebScript(rows) {
  const cold = rows.filter(r => r.cls === "COLD");
  if (!cold.length) return "All investigations have at least one supporting resource. No prosecution dead-ends detected.";
  return `You are JARVIS. ${cold.length} investigation(s) are COLD — no dataset, no brain model, no knowledge article, and no ops alert support them. List each cold investigation by title, then provide a 2-sentence prosecution advisory: what evidence or resource should be acquired to advance each case. Be direct and operational.`;
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
    name: (i.title || i.name || i.subject || "").toString(),
    status: i.status || i.state || "",
  }));
}

async function fetchDatasets() {
  const r = await fetch(`${apiBase()}/v1/datasets`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.datasets) ? d.datasets :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(ds => ({
    id: ds.id || ds._id || String(Math.random()),
    name: (ds.name || ds.title || "").toString(),
    rows: typeof ds.rows === "number" ? ds.rows :
          typeof ds.row_count === "number" ? ds.row_count :
          typeof ds.count === "number" ? ds.count : null,
  }));
}

async function fetchBrainNodes() {
  const r = await fetch(`${apiBase()}/v1/cinematic/brain`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const nodes =
    Array.isArray(d?.nodes) ? d.nodes :
    Array.isArray(d) ? d : [];
  return nodes.map(n => ({
    id: n.id || n._id || String(Math.random()),
    label: (n.label || n.name || n.title || "").toString(),
    score: typeof n.centrality === "number" ? n.centrality :
           typeof n.score === "number" ? n.score : 0,
    type: n.type || n.category || "",
  }));
}

async function fetchKnowledge() {
  const r = await fetch(`${apiBase()}/knowledge/`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.articles) ? d.articles :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(k => ({
    id: k.id || k._id || String(Math.random()),
    name: (k.title || k.name || k.subject || "").toString(),
    category: k.category || k.type || "",
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
    name: (a.title || a.name || a.message || a.alert || "").toString(),
    severity: a.severity || a.level || a.priority || "",
  }));
}

function kw(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(w => w.length > 2);
}

function matches(inv, pool) {
  const ik = kw(inv.name);
  return pool.filter(p => {
    const pk = kw(p.name);
    return ik.some(w => pk.includes(w)) || pk.some(w => ik.includes(w));
  });
}

function classify(inv, datasets, brainNodes, knowledge, opsAlerts) {
  const ds  = matches(inv, datasets);
  const bn  = matches(inv, brainNodes);
  const kn  = matches(inv, knowledge);
  const oa  = matches(inv, opsAlerts);
  const score = [ds.length > 0, bn.length > 0, kn.length > 0, oa.length > 0].filter(Boolean).length;
  const cls =
    score === 4 ? "PROSECUTING" :
    score >= 2  ? "RESOURCED" :
    score === 1 ? "PARTIAL" : "COLD";
  return { ...inv, cls, matchedDs: ds, matchedBn: bn, matchedKn: kn, matchedOa: oa };
}

const clsColor = { PROSECUTING: GRN, RESOURCED: CY, PARTIAL: AMB, COLD: RED };
const clsOrder = { PROSECUTING: 0, RESOURCED: 1, PARTIAL: 2, COLD: 3 };

const SevBadge = ({ s }) => {
  const c = /critical|high/i.test(s) ? RED : /med/i.test(s) ? AMB : CY;
  return s ? <span style={{ fontSize: 10, border: `1px solid ${c}`, color: c, borderRadius: 3, padding: "1px 4px", marginLeft: 4 }}>{s}</span> : null;
};

const StatusBadge = ({ s }) => {
  const c = /open|active/i.test(s) ? GRN : /closed|resolved/i.test(s) ? PRP : CY;
  return s ? <span style={{ fontSize: 10, border: `1px solid ${c}`, color: c, borderRadius: 3, padding: "1px 4px", marginLeft: 4 }}>{s}</span> : null;
};

const ScoreBadge = ({ v }) =>
  v != null ? <span style={{ fontSize: 10, border: `1px solid ${CY}`, color: CY, borderRadius: 3, padding: "1px 4px", marginLeft: 4 }}>{typeof v === "number" ? v.toFixed(2) : v}</span> : null;

const RowsBadge = ({ v }) =>
  v != null ? <span style={{ fontSize: 10, border: `1px solid ${PRP}`, color: PRP, borderRadius: 3, padding: "1px 4px", marginLeft: 4 }}>{v.toLocaleString()} rows</span> : null;

const CatBadge = ({ s }) =>
  s ? <span style={{ fontSize: 10, border: `1px solid ${AMB}`, color: AMB, borderRadius: 3, padding: "1px 4px", marginLeft: 4 }}>{s}</span> : null;

export default function InvestigationDatasetBrainKnowledgeOpsProsecution() {
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
      const [invs, datasets, brainNodes, knowledge, opsAlerts] = await Promise.all([
        fetchInvestigations(), fetchDatasets(), fetchBrainNodes(),
        fetchKnowledge(), fetchOpsAlerts(),
      ]);
      const classified = invs
        .map(i => classify(i, datasets, brainNodes, knowledge, opsAlerts))
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
    window.addEventListener("jarvis:ivpweb-toggle", toggle);
    return () => window.removeEventListener("jarvis:ivpweb-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, POLL);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAss(true); setAdvice("");
    const script = buildIvpwebScript(rows);
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
        title="Investigation × Dataset × Brain × Knowledge × Ops Alert Evidence Prosecution Web"
        style={{
          position: "fixed", bottom: 8, left: 155880, zIndex: 289,
          background: "rgba(0,0,0,0.7)", border: `1px solid ${coldCount > 0 ? RED : CY}`,
          color: coldCount > 0 ? RED : CY, fontSize: 10, padding: "3px 7px",
          borderRadius: 4, cursor: "pointer", fontFamily: "monospace",
          boxShadow: coldCount > 0 ? `0 0 8px ${RED}88` : "none",
          animation: coldCount > 0 ? "pulse-red 2s infinite" : "none",
        }}
      >
        ◈ IVPWEB{coldCount > 0 ? ` ⚠${coldCount}` : ""}
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
          ◈ IVPWEB — INVESTIGATION × DATASET × BRAIN × KNOWLEDGE × OPS ALERT
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

      {/* filter */}
      <div style={{ display: "flex", gap: 6, padding: "6px 12px", borderBottom: `1px solid ${CY}22` }}>
        {["ALL", "PROSECUTING", "RESOURCED", "PARTIAL", "COLD"].map(f => (
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
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name || "(no title)"}</span>
              <StatusBadge s={row.status} />
              <span style={{ opacity: 0.4, fontSize: 10 }}>{expanded[row.id] ? "▲" : "▼"}</span>
            </div>
            {expanded[row.id] && (
              <div style={{ paddingLeft: 16, paddingTop: 4, opacity: 0.85 }}>
                {row.matchedDs.length > 0 && (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: PRP }}>datasets: </span>
                    {row.matchedDs.slice(0, 3).map(d => (
                      <span key={d.id}>{d.name}<RowsBadge v={d.rows} />{" "}</span>
                    ))}
                  </div>
                )}
                {row.matchedBn.length > 0 && (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: AMB }}>brain: </span>
                    {row.matchedBn.slice(0, 3).map(n => (
                      <span key={n.id}>{n.label}<ScoreBadge v={n.score} />{" "}</span>
                    ))}
                  </div>
                )}
                {row.matchedKn.length > 0 && (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: GRN }}>knowledge: </span>
                    {row.matchedKn.slice(0, 3).map(k => (
                      <span key={k.id}>{k.name}<CatBadge s={k.category} />{" "}</span>
                    ))}
                  </div>
                )}
                {row.matchedOa.length > 0 && (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: RED }}>ops alerts: </span>
                    {row.matchedOa.slice(0, 3).map(a => (
                      <span key={a.id}>{a.name}<SevBadge s={a.severity} />{" "}</span>
                    ))}
                  </div>
                )}
                {row.cls === "COLD" && (
                  <div style={{ color: RED, fontSize: 10, opacity: 0.8 }}>
                    ⚠ No supporting evidence across any source — prosecution dead-end.
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
