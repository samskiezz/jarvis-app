/**
 * RiskSignalGraphKnowledgeOpsContactSaturation — F209
 * Fetches /entities/RiskSignal + /v1/graph/centrality + /knowledge/ +
 *          /v1/ops/alerts + /entities/Contact
 * Cross-references each risk signal against all 4 other sources.
 * Classifies:
 *   SATURATED  — signal matched a graph node, knowledge article, ops alert, AND contact
 *   ATTRIBUTED — signal matched 2-3 of the 4 sources
 *   SIGNALED   — signal matched exactly 1 source
 *   DARK       — signal has 0 matches (full intelligence blind spot)
 * Red pulse on DARK count.
 * ASSESS → /v1/jarvis/agent/chat advisory for dark signals + TTS.
 * Voice triggers: "tasmon"/"threat saturation"/"signal saturation"/"dark signals"
 *                 "risk saturation"/"threat attribution saturation"
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

const TASMON_RE =
  /\b(tasmon|threat\.saturation|signal\.saturation|dark\.signals|risk\.saturation|threat\.attribution\.saturation|signal\.blind|saturated\.risks|tasmon\.toggle)\b/i;

export function isTasmonQuery(t) { return TASMON_RE.test(t || ""); }

export function buildTasmonScript(rows) {
  const dark = rows.filter(r => r.cls === "DARK");
  if (!dark.length) return "All risk signals have at least one intelligence grounding across graph, knowledge, ops alerts, and contacts. No dark signals detected.";
  return `You are JARVIS. ${dark.length} risk signal(s) are DARK — they have no matched graph node, no knowledge article, no ops alert, and no contact owner. List each dark signal by title and severity. Then provide a 2-sentence threat attribution advisory: what graph nodes, knowledge articles, ops alerts, or contacts should be linked to each dark signal to establish minimum threat intelligence coverage. Be direct and specific.`;
}

const hdrs = { Authorization: `Bearer ${API_KEY}` };

async function fetchRiskSignals() {
  const r = await fetch(`${apiBase()}/entities/RiskSignal`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data :
    Array.isArray(d?.results) ? d.results : [];
  return items.map(s => ({
    id: s.id || s._id || String(Math.random()),
    name: (s.title || s.name || s.signal_name || s.description || "").toString(),
    severity: s.severity || s.level || s.priority || "",
  }));
}

async function fetchGraph() {
  const r = await fetch(`${apiBase()}/v1/graph/centrality`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.nodes) ? d.nodes :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(n => ({
    id: n.id || n._id || String(Math.random()),
    name: (n.label || n.name || n.entity || "").toString(),
    score: typeof n.centrality === "number" ? n.centrality :
           typeof n.score === "number" ? n.score : null,
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
    category: k.category || k.type || k.tag || "",
  }));
}

async function fetchOpsAlerts() {
  const r = await fetch(`${apiBase()}/v1/ops/alerts`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.alerts) ? d.alerts :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data :
    Array.isArray(d?.results) ? d.results : [];
  return items.map(a => ({
    id: a.id || a._id || String(Math.random()),
    name: (a.title || a.name || a.message || a.description || "").toString(),
    severity: a.severity || a.level || a.priority || "",
  }));
}

async function fetchContacts() {
  const r = await fetch(`${apiBase()}/entities/Contact`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data :
    Array.isArray(d?.results) ? d.results : [];
  return items.map(c => ({
    id: c.id || c._id || String(Math.random()),
    name: (c.name || c.full_name || c.display_name || "").toString(),
    role: c.role || c.title || c.position || "",
    org: c.org || c.organization || c.company || "",
  }));
}

function keywords(str) {
  return str.toLowerCase().split(/[\s\-_/.,;:()[\]]+/).filter(w => w.length > 2);
}

function overlap(a, b) {
  const ka = keywords(a);
  const kb = keywords(b);
  return ka.some(w => kb.includes(w));
}

function classify(signal, nodes, articles, alerts, contacts) {
  const matchedNodes    = nodes.filter(n => overlap(signal.name, n.name));
  const matchedArticles = articles.filter(k => overlap(signal.name, k.name));
  const matchedAlerts   = alerts.filter(a => overlap(signal.name, a.name));
  const matchedContacts = contacts.filter(c => overlap(signal.name, c.name) || overlap(signal.name, c.role));
  const hitCount =
    (matchedNodes.length    > 0 ? 1 : 0) +
    (matchedArticles.length > 0 ? 1 : 0) +
    (matchedAlerts.length   > 0 ? 1 : 0) +
    (matchedContacts.length > 0 ? 1 : 0);
  let cls;
  if (hitCount === 4)      cls = "SATURATED";
  else if (hitCount >= 2)  cls = "ATTRIBUTED";
  else if (hitCount === 1) cls = "SIGNALED";
  else                     cls = "DARK";
  return { ...signal, cls, matchedNodes, matchedArticles, matchedAlerts, matchedContacts };
}

const SEVERITY_COLOR = s => {
  const sl = (s || "").toLowerCase();
  if (sl === "critical" || sl === "high") return RED;
  if (sl === "medium") return AMB;
  return CY;
};

const CLS_COLOR = {
  SATURATED:  GRN,
  ATTRIBUTED: CY,
  SIGNALED:   AMB,
  DARK:       RED,
};

export default function RiskSignalGraphKnowledgeOpsContactSaturation() {
  const [open, setOpen]   = useState(false);
  const [rows, setRows]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [filter, setFilter] = useState("ALL");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [signals, nodes, articles, alerts, contacts] = await Promise.all([
        fetchRiskSignals(),
        fetchGraph(),
        fetchKnowledge(),
        fetchOpsAlerts(),
        fetchContacts(),
      ]);
      setRows(signals.map(s => classify(s, nodes, articles, alerts, contacts)));
    } catch (e) {
      setError(e.message || "Fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener("jarvis:tasmon-toggle", h);
    return () => window.removeEventListener("jarvis:tasmon-toggle", h);
  }, []);

  const assess = useCallback(async () => {
    const script = buildTasmonScript(rows);
    const base = apiBase();
    try {
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdrs, "Content-Type": "application/json" },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || d.text || "";
      if (text) {
        await fetch(`${base}/v1/voice/tts`, {
          method: "POST",
          headers: { ...hdrs, "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: "onyx" }),
        });
      }
    } catch (_) { /* TTS best-effort */ }
  }, [rows]);

  if (!open) {
    const darkCount = rows.filter(r => r.cls === "DARK").length;
    return (
      <div style={{ position: "fixed", left: 164840, bottom: 8, zIndex: 305,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        {darkCount > 0 && (
          <div style={{ background: RED, color: "#000", fontSize: 9, fontWeight: 700,
            borderRadius: 6, padding: "1px 5px", animation: "pulse 1.5s infinite",
            boxShadow: `0 0 6px ${RED}` }}>
            {darkCount}
          </div>
        )}
        <button onClick={() => setOpen(true)} style={{
          background: "transparent", border: `1px solid ${CY}`, color: CY,
          fontSize: 10, fontFamily: "monospace", padding: "3px 7px",
          cursor: "pointer", borderRadius: 4, letterSpacing: 1,
          boxShadow: `0 0 6px ${CY}44`, whiteSpace: "nowrap",
        }}>◈ TASMON</button>
      </div>
    );
  }

  const displayed = filter === "ALL" ? rows : rows.filter(r => r.cls === filter);
  const counts = { SATURATED: 0, ATTRIBUTED: 0, SIGNALED: 0, DARK: 0 };
  rows.forEach(r => { counts[r.cls] = (counts[r.cls] || 0) + 1; });

  return (
    <div style={{ position: "fixed", left: 164840, bottom: 8, zIndex: 305,
      width: 420, background: "#0A0F1A", border: `1px solid ${CY}55`,
      borderRadius: 8, fontFamily: "monospace", fontSize: 11, color: CY,
      boxShadow: `0 0 18px ${CY}22`, maxHeight: 540, display: "flex",
      flexDirection: "column" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 10px", borderBottom: `1px solid ${CY}33`, flexShrink: 0 }}>
        <span style={{ fontWeight: 700, letterSpacing: 1 }}>◈ TASMON</span>
        <span style={{ fontSize: 9, color: "#ffffff66" }}>Risk × Graph × Knowledge × Alert × Contact</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={assess} style={{ background: `${CY}22`, border: `1px solid ${CY}`,
            color: CY, fontSize: 9, padding: "2px 7px", cursor: "pointer",
            borderRadius: 3, letterSpacing: 1 }}>▶ ASSESS</button>
          <button onClick={() => setOpen(false)} style={{ background: "transparent",
            border: `1px solid ${CY}44`, color: CY, fontSize: 10,
            padding: "1px 6px", cursor: "pointer", borderRadius: 3 }}>✕</button>
        </div>
      </div>

      {/* Stat row */}
      <div style={{ display: "flex", gap: 6, padding: "6px 10px",
        borderBottom: `1px solid ${CY}22`, flexShrink: 0, flexWrap: "wrap" }}>
        {Object.entries(counts).map(([cls, n]) => (
          <button key={cls} onClick={() => setFilter(filter === cls ? "ALL" : cls)}
            style={{ background: filter === cls ? `${CLS_COLOR[cls]}22` : "transparent",
              border: `1px solid ${CLS_COLOR[cls]}`,
              color: CLS_COLOR[cls], fontSize: 9, padding: "2px 7px",
              cursor: "pointer", borderRadius: 3, letterSpacing: 1,
              boxShadow: cls === "DARK" && n > 0 ? `0 0 8px ${RED}` : "none" }}>
            {cls} {n}
          </button>
        ))}
        <button onClick={load} disabled={loading}
          style={{ marginLeft: "auto", background: "transparent",
            border: `1px solid ${CY}44`, color: CY, fontSize: 9,
            padding: "2px 6px", cursor: "pointer", borderRadius: 3 }}>
          {loading ? "…" : "↻"}
        </button>
      </div>

      {/* Body */}
      <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
        {error && (
          <div style={{ color: RED, padding: "6px 10px", fontSize: 10 }}>{error}</div>
        )}
        {!error && displayed.length === 0 && !loading && (
          <div style={{ color: "#ffffff44", padding: "10px", textAlign: "center" }}>No data</div>
        )}
        {displayed.map(row => (
          <div key={row.id}>
            <div onClick={() => setExpanded(e => ({ ...e, [row.id]: !e[row.id] }))}
              style={{ display: "flex", alignItems: "center", gap: 6,
                padding: "5px 10px", cursor: "pointer",
                background: expanded[row.id] ? `${CLS_COLOR[row.cls]}11` : "transparent",
                borderBottom: `1px solid ${CY}11` }}>
              <span style={{ color: CLS_COLOR[row.cls], fontSize: 9, minWidth: 60,
                border: `1px solid ${CLS_COLOR[row.cls]}66`, padding: "1px 4px",
                borderRadius: 3, letterSpacing: 0.5, textAlign: "center" }}>
                {row.cls}
              </span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis",
                whiteSpace: "nowrap" }}>{row.name || row.id}</span>
              {row.severity && (
                <span style={{ fontSize: 9, color: SEVERITY_COLOR(row.severity),
                  border: `1px solid ${SEVERITY_COLOR(row.severity)}44`,
                  padding: "1px 4px", borderRadius: 3 }}>{row.severity}</span>
              )}
              <span style={{ color: `${CY}66`, fontSize: 9 }}>
                {expanded[row.id] ? "▲" : "▼"}
              </span>
            </div>
            {expanded[row.id] && (
              <div style={{ padding: "4px 14px 8px 20px",
                background: `${CLS_COLOR[row.cls]}08`,
                borderBottom: `1px solid ${CY}11` }}>
                {/* Graph nodes */}
                {row.matchedNodes.length > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ color: "#ffffff55", fontSize: 9, marginBottom: 2 }}>
                      Graph Nodes ({row.matchedNodes.length})
                    </div>
                    {row.matchedNodes.slice(0, 3).map(n => (
                      <div key={n.id} style={{ display: "flex", gap: 4,
                        alignItems: "center", marginBottom: 2 }}>
                        {n.score != null && (
                          <span style={{ fontSize: 9, color: CY,
                            border: `1px solid ${CY}55`, padding: "1px 4px",
                            borderRadius: 3, minWidth: 30, textAlign: "center" }}>
                            {typeof n.score === "number" ? n.score.toFixed(2) : n.score}
                          </span>
                        )}
                        <span style={{ color: CY, fontSize: 9, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {n.name || n.id}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Knowledge articles */}
                {row.matchedArticles.length > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ color: "#ffffff55", fontSize: 9, marginBottom: 2 }}>
                      Knowledge ({row.matchedArticles.length})
                    </div>
                    {row.matchedArticles.slice(0, 3).map(k => (
                      <div key={k.id} style={{ display: "flex", gap: 4,
                        alignItems: "center", marginBottom: 2 }}>
                        {k.category && (
                          <span style={{ fontSize: 9, color: PRP,
                            border: `1px solid ${PRP}55`, padding: "1px 4px",
                            borderRadius: 3, maxWidth: 60, overflow: "hidden",
                            textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {k.category}
                          </span>
                        )}
                        <span style={{ color: CY, fontSize: 9, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {k.name || k.id}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Ops alerts */}
                {row.matchedAlerts.length > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ color: "#ffffff55", fontSize: 9, marginBottom: 2 }}>
                      Ops Alerts ({row.matchedAlerts.length})
                    </div>
                    {row.matchedAlerts.slice(0, 3).map(a => (
                      <div key={a.id} style={{ display: "flex", gap: 4,
                        alignItems: "center", marginBottom: 2 }}>
                        {a.severity && (
                          <span style={{ fontSize: 9, color: SEVERITY_COLOR(a.severity),
                            border: `1px solid ${SEVERITY_COLOR(a.severity)}55`,
                            padding: "1px 4px", borderRadius: 3, minWidth: 36,
                            textAlign: "center" }}>
                            {a.severity}
                          </span>
                        )}
                        <span style={{ color: CY, fontSize: 9, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {a.name || a.id}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Contacts */}
                {row.matchedContacts.length > 0 && (
                  <div>
                    <div style={{ color: "#ffffff55", fontSize: 9, marginBottom: 2 }}>
                      Contacts ({row.matchedContacts.length})
                    </div>
                    {row.matchedContacts.slice(0, 3).map(c => (
                      <div key={c.id} style={{ display: "flex", gap: 4,
                        alignItems: "center", marginBottom: 2 }}>
                        <span style={{ fontSize: 9, color: GRN,
                          border: `1px solid ${GRN}55`, padding: "1px 4px",
                          borderRadius: 3, maxWidth: 70, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.role || c.org || "?"}
                        </span>
                        <span style={{ color: CY, fontSize: 9, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.name || c.id}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {row.matchedNodes.length === 0 && row.matchedArticles.length === 0 &&
                 row.matchedAlerts.length === 0 && row.matchedContacts.length === 0 && (
                  <div style={{ color: RED, fontSize: 9 }}>
                    No intelligence grounding found for this threat signal.
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: "4px 10px", borderTop: `1px solid ${CY}22`,
        fontSize: 9, color: "#ffffff44", flexShrink: 0, display: "flex",
        justifyContent: "space-between" }}>
        <span>RiskSignal × Graph × Knowledge × Alert × Contact</span>
        <span>90s auto-refresh</span>
      </div>
    </div>
  );
}
