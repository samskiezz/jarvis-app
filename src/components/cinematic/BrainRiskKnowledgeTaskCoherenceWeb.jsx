/**
 * BrainRiskKnowledgeTaskCoherenceWeb — F200
 * Fetches /v1/cinematic/brain + /entities/RiskSignal + /knowledge/ + /entities/Task
 * and cross-references each brain node against all 3 other sources.
 * Classifies:
 *   COHERENT    — brain node has matches across all 3 sources
 *   SIGNALED    — brain node matched a risk signal only (partial)
 *   DOCUMENTED  — brain node matched knowledge/task but no risk signal
 *   DARK        — brain node has 0 matches (no risk signal, no knowledge, no task)
 * Red pulse on DARK count (pure blind spots in the intelligence model).
 * ASSESS → /v1/jarvis/agent/chat advisory for dark nodes + TTS.
 * Voice triggers: "brain coherence"/"brktweb"/"dark brain"/"brain risk knowledge"/
 *   "brain task coherence"/"coherence web"/"intelligence coherence"
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

const BRKTWEB_RE =
  /\b(brain\.coherence|brktweb|dark\.brain|brain\.risk\.knowledge|brain\.task\.coherence|coherence\.web|intelligence\.coherence|brain\.coherence\.web|brktweb\.toggle)\b/i;

export function isBrktwebQuery(t) { return BRKTWEB_RE.test(t || ""); }

export function buildBrktwebScript(rows) {
  const dark = rows.filter(r => r.cls === "DARK");
  if (!dark.length) return "All brain nodes have at least one intelligence grounding source. No fully dark nodes detected.";
  return `You are JARVIS. ${dark.length} brain node(s) are DARK — they have no matched risk signal, no knowledge article, and no assigned task. List each dark node by label and type. Then provide a 2-sentence intelligence coherence advisory: what risk signals, knowledge articles, or tasks should be linked to bring each dark node into the active intelligence model. Be direct and specific.`;
}

const hdrs = { Authorization: `Bearer ${API_KEY}` };

async function fetchBrain() {
  const r = await fetch(`${apiBase()}/v1/cinematic/brain`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const nodes =
    Array.isArray(d?.nodes) ? d.nodes :
    Array.isArray(d?.data?.nodes) ? d.data.nodes :
    Array.isArray(d) ? d : [];
  return nodes.map(n => ({
    id: n.id || n._id || String(Math.random()),
    name: (n.label || n.name || n.title || "").toString(),
    type: n.type || n.node_type || n.category || "",
    score: typeof n.centrality === "number" ? n.centrality :
           typeof n.weight === "number" ? n.weight : null,
  }));
}

async function fetchRiskSignals() {
  const r = await fetch(`${apiBase()}/entities/RiskSignal`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data :
    Array.isArray(d?.results) ? d.results : [];
  return items.map(x => ({
    id: x.id || x._id || String(Math.random()),
    name: (x.title || x.name || x.signal || x.description || "").toString(),
    severity: x.severity || x.level || x.risk_level || "",
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
    category: k.category || k.type || k.domain || "",
  }));
}

async function fetchTasks() {
  const r = await fetch(`${apiBase()}/entities/Task`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data :
    Array.isArray(d?.results) ? d.results : [];
  return items.map(t => ({
    id: t.id || t._id || String(Math.random()),
    name: (t.title || t.name || t.task_name || t.description || "").toString(),
    status: t.status || t.state || "",
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

function classify(node, risks, knowledge, tasks) {
  const matchedRisks = risks.filter(r => overlap(node.name, r.name));
  const matchedKnow  = knowledge.filter(k => overlap(node.name, k.name));
  const matchedTasks = tasks.filter(t => overlap(node.name, t.name));
  const hitCount =
    (matchedRisks.length > 0 ? 1 : 0) +
    (matchedKnow.length  > 0 ? 1 : 0) +
    (matchedTasks.length > 0 ? 1 : 0);
  let cls;
  if (hitCount === 3) cls = "COHERENT";
  else if (hitCount === 0) cls = "DARK";
  else if (matchedRisks.length > 0 && hitCount < 3) cls = "SIGNALED";
  else cls = "DOCUMENTED";
  return { ...node, cls, matchedRisks, matchedKnow, matchedTasks };
}

const SEVERITY_COLOR = s => {
  const sl = (s || "").toLowerCase();
  if (sl === "critical") return RED;
  if (sl === "high")     return RED;
  if (sl === "medium")   return AMB;
  return CY;
};

const STATUS_COLOR = s => {
  const sl = (s || "").toLowerCase();
  if (sl === "completed" || sl === "done") return GRN;
  if (sl === "in_progress" || sl === "active") return CY;
  if (sl === "blocked")  return RED;
  return AMB;
};

const CLS_COLOR = {
  COHERENT:   GRN,
  SIGNALED:   AMB,
  DOCUMENTED: CY,
  DARK:       RED,
};

export default function BrainRiskKnowledgeTaskCoherenceWeb() {
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
      const [nodes, risks, knowledge, tasks] = await Promise.all([
        fetchBrain(),
        fetchRiskSignals(),
        fetchKnowledge(),
        fetchTasks(),
      ]);
      setRows(nodes.map(n => classify(n, risks, knowledge, tasks)));
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
    window.addEventListener("jarvis:brktweb-toggle", h);
    return () => window.removeEventListener("jarvis:brktweb-toggle", h);
  }, []);

  const assess = useCallback(async () => {
    const script = buildBrktwebScript(rows);
    const ttsBase = apiBase();
    try {
      const r = await fetch(`${ttsBase}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdrs, "Content-Type": "application/json" },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || d.text || "";
      if (text) {
        await fetch(`${ttsBase}/v1/voice/tts`, {
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
      <div style={{ position: "fixed", left: 159800, bottom: 8, zIndex: 296,
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
        }}>◈ BRKTWEB</button>
      </div>
    );
  }

  const displayed = filter === "ALL" ? rows : rows.filter(r => r.cls === filter);
  const counts = { COHERENT: 0, SIGNALED: 0, DOCUMENTED: 0, DARK: 0 };
  rows.forEach(r => { counts[r.cls] = (counts[r.cls] || 0) + 1; });

  return (
    <div style={{ position: "fixed", left: 159800, bottom: 8, zIndex: 296,
      width: 400, background: "#0A0F1A", border: `1px solid ${CY}55`,
      borderRadius: 8, fontFamily: "monospace", fontSize: 11, color: CY,
      boxShadow: `0 0 18px ${CY}22`, maxHeight: 520, display: "flex",
      flexDirection: "column" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 10px", borderBottom: `1px solid ${CY}33`, flexShrink: 0 }}>
        <span style={{ fontWeight: 700, letterSpacing: 1 }}>◈ BRKTWEB</span>
        <span style={{ fontSize: 9, color: "#ffffff66" }}>Brain × Risk × Knowledge × Task</span>
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
          <div style={{ color: RED, padding: "6px 10px", fontSize: 10 }}>
            {error}
          </div>
        )}
        {!error && displayed.length === 0 && !loading && (
          <div style={{ color: "#ffffff44", padding: "10px", textAlign: "center" }}>
            {loading ? "Loading…" : "No data"}
          </div>
        )}
        {displayed.map(row => (
          <div key={row.id}>
            <div onClick={() => setExpanded(e => ({ ...e, [row.id]: !e[row.id] }))}
              style={{ display: "flex", alignItems: "center", gap: 6,
                padding: "5px 10px", cursor: "pointer",
                background: expanded[row.id] ? `${CLS_COLOR[row.cls]}11` : "transparent",
                borderBottom: `1px solid ${CY}11` }}>
              <span style={{ color: CLS_COLOR[row.cls], fontSize: 9, minWidth: 76,
                border: `1px solid ${CLS_COLOR[row.cls]}66`, padding: "1px 4px",
                borderRadius: 3, letterSpacing: 0.5, textAlign: "center" }}>
                {row.cls}
              </span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis",
                whiteSpace: "nowrap" }}>{row.name || row.id}</span>
              {row.type && (
                <span style={{ fontSize: 9, color: PRP, border: `1px solid ${PRP}44`,
                  padding: "1px 4px", borderRadius: 3 }}>{row.type}</span>
              )}
              {typeof row.score === "number" && (
                <span style={{ fontSize: 9, color: AMB, border: `1px solid ${AMB}44`,
                  padding: "1px 4px", borderRadius: 3 }}>
                  {row.score.toFixed(2)}
                </span>
              )}
              <span style={{ color: `${CY}66`, fontSize: 9 }}>
                {expanded[row.id] ? "▲" : "▼"}
              </span>
            </div>
            {expanded[row.id] && (
              <div style={{ padding: "4px 14px 8px 20px", background: `${CLS_COLOR[row.cls]}08`,
                borderBottom: `1px solid ${CY}11` }}>
                {/* Risk signals */}
                {row.matchedRisks.length > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ color: "#ffffff55", fontSize: 9, marginBottom: 2 }}>
                      Risk Signals ({row.matchedRisks.length})
                    </div>
                    {row.matchedRisks.slice(0, 4).map(rs => (
                      <div key={rs.id} style={{ display: "flex", gap: 4,
                        alignItems: "center", marginBottom: 2 }}>
                        <span style={{ fontSize: 9, color: SEVERITY_COLOR(rs.severity),
                          border: `1px solid ${SEVERITY_COLOR(rs.severity)}55`,
                          padding: "1px 4px", borderRadius: 3, minWidth: 48,
                          textAlign: "center" }}>
                          {rs.severity || "?"}
                        </span>
                        <span style={{ color: CY, fontSize: 9, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {rs.name || rs.id}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Knowledge articles */}
                {row.matchedKnow.length > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ color: "#ffffff55", fontSize: 9, marginBottom: 2 }}>
                      Knowledge Articles ({row.matchedKnow.length})
                    </div>
                    {row.matchedKnow.slice(0, 4).map(k => (
                      <div key={k.id} style={{ display: "flex", gap: 4,
                        alignItems: "center", marginBottom: 2 }}>
                        <span style={{ fontSize: 9, color: PRP,
                          border: `1px solid ${PRP}55`,
                          padding: "1px 4px", borderRadius: 3, minWidth: 48,
                          textAlign: "center", overflow: "hidden",
                          textOverflow: "ellipsis", maxWidth: 64 }}>
                          {k.category || "?"}
                        </span>
                        <span style={{ color: CY, fontSize: 9, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {k.name || k.id}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Tasks */}
                {row.matchedTasks.length > 0 && (
                  <div>
                    <div style={{ color: "#ffffff55", fontSize: 9, marginBottom: 2 }}>
                      Tasks ({row.matchedTasks.length})
                    </div>
                    {row.matchedTasks.slice(0, 4).map(t => (
                      <div key={t.id} style={{ display: "flex", gap: 4,
                        alignItems: "center", marginBottom: 2 }}>
                        <span style={{ fontSize: 9, color: STATUS_COLOR(t.status),
                          border: `1px solid ${STATUS_COLOR(t.status)}55`,
                          padding: "1px 4px", borderRadius: 3, minWidth: 64,
                          textAlign: "center", overflow: "hidden",
                          textOverflow: "ellipsis", maxWidth: 80 }}>
                          {t.status || "?"}
                        </span>
                        <span style={{ color: CY, fontSize: 9, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t.name || t.id}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {row.matchedRisks.length === 0 && row.matchedKnow.length === 0 &&
                 row.matchedTasks.length === 0 && (
                  <div style={{ color: RED, fontSize: 9 }}>
                    No matching intelligence sources found for this brain node.
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
        <span>Brain × RiskSignal × Knowledge × Task</span>
        <span>90s auto-refresh</span>
      </div>
    </div>
  );
}
