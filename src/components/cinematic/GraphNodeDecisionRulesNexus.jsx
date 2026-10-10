/**
 * GraphNodeDecisionRulesNexus — F633
 * "JARVIS, gndruls / graph rules / node rules / watched nodes / dark nodes /
 *  which nodes have rules / graph watchtower / node coverage / rule watched nodes"
 * Cross-references /v1/graph/centrality top nodes against /v1/rules by keyword.
 * WATCHED nodes (≥1 rule keyword-matches) vs DARK (no watchtower coverage).
 * Coverage % tile; ALL/WATCHED/DARK filter tabs + search; click-to-expand matched rules.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence network-monitoring brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4444";
const DIM = "#8899AA";
const PRP = "#B06EFF";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 103_660;
const Z_INDEX  = 179;

const GNDRULS_RE =
  /\bgndruls\b|\bgraph.?rules?\b|\bnode.?rules?\b|\bwatched.?nodes?\b|\bdark.?nodes?\b|\bwhich.?nodes?.?(?:have|has).?rules?\b|\bgraph.?watchtower\b|\bnode.?coverage\b|\brule.?watched.?nodes?\b|\bnetwork.?rules?\b|\bgraph.?monitor\b/i;

export function isGndRulsQuery(text) {
  return GNDRULS_RE.test(text || "");
}

function keywords(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function overlap(a, b) {
  const sa = new Set(keywords(a));
  return keywords(b).filter((w) => sa.has(w)).length;
}

function normaliseNodes(data) {
  if (!data) return [];
  const raw =
    data.nodes || data.centrality || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.slice(0, 60).map((n, i) => ({
    id:    n.id || n.node_id || `node-${i}`,
    name:  n.name || n.label || n.id || `Node ${i + 1}`,
    kind:  n.kind || n.type || n.entity_type || "entity",
    score: n.score || n.centrality_score || n.centrality || 0,
  }));
}

function normaliseRules(data) {
  if (!data) return [];
  const raw =
    data.rules || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((r, i) => ({
    id:       r.id || `rule-${i}`,
    name:     r.name || r.title || r.rule_name || `Rule ${i + 1}`,
    severity: (r.severity || r.level || "medium").toUpperCase(),
    target:   r.target || r.entity || r.condition_target || "",
    enabled:  r.enabled !== false,
    condition: r.condition || r.expression || "",
  }));
}

function crossRef(nodes, rules) {
  return nodes.map((node) => {
    const haystack = `${node.name} ${node.kind}`;
    const matches = rules
      .map((rule) => {
        const needle = `${rule.name} ${rule.target} ${rule.condition}`;
        const hits = overlap(haystack, needle);
        return hits > 0 ? { ...rule, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits);
    return { ...node, watched: matches.length > 0, rules: matches };
  });
}

export async function buildGndRulsScript() {
  try {
    const base = apiBase();
    const [nodeRes, ruleRes] = await Promise.all([
      fetch(`${base}/v1/graph/centrality`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/v1/rules`,            { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const [nodeData, ruleData] = await Promise.all([nodeRes.json(), ruleRes.json()]);
    const nodes = normaliseNodes(nodeData);
    const rules = normaliseRules(ruleData);
    const rows  = crossRef(nodes, rules);
    const watched = rows.filter((r) => r.watched).length;
    const dark    = rows.length - watched;
    const pct     = rows.length ? Math.round((watched / rows.length) * 100) : 0;
    if (!rows.length) return "No graph nodes found in the centrality index, sir.";
    const topDark = rows
      .filter((r) => !r.watched)
      .slice(0, 2)
      .map((r) => r.name)
      .join("; ");
    return (
      `${watched} of ${rows.length} high-centrality graph nodes are covered by watchtower decision rules (${pct}% network monitoring coverage). ` +
      (dark > 0
        ? `${dark} influential node${dark !== 1 ? "s" : ""} have no rule watching them — network blind spots: ${topDark || "unknown"}.`
        : "All high-influence nodes are under active rule monitoring.")
    );
  } catch {
    return "Unable to reach graph centrality or rules endpoints, sir.";
  }
}

const SEV_COLOR = {
  CRITICAL: RED,
  HIGH:     AMB,
  MEDIUM:   CY,
  LOW:      GRN,
};

export default function GraphNodeDecisionRulesNexus() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [brief,     setBrief]     = useState("");
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const [nodeRes, ruleRes] = await Promise.all([
        fetch(`${base}/v1/graph/centrality`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/v1/rules`,            { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const [nodeData, ruleData] = await Promise.all([nodeRes.json(), ruleRes.json()]);
      setRows(crossRef(normaliseNodes(nodeData), normaliseRules(ruleData)));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen((v) => !v); };
    window.addEventListener("jarvis:gndruls-toggle", handler);
    return () => window.removeEventListener("jarvis:gndruls-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const watched = rows.filter((r) => r.watched).length;
  const dark    = rows.length - watched;
  const pct     = rows.length ? Math.round((watched / rows.length) * 100) : 0;

  const visible = rows.filter((r) => {
    const matchTab =
      tab === "ALL"     ? true :
      tab === "WATCHED" ? r.watched :
      !r.watched;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      r.name.toLowerCase().includes(q) ||
      r.kind.toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  async function assess() {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    setBrief("");
    try {
      const base   = apiBase();
      const script = await buildGndRulsScript();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Graph network monitoring coverage assessment: ${script}. Provide a concise 2-sentence strategic brief.` }),
      });
      const d    = await r.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(text);
      if (text) {
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch {
      setBrief("Unable to reach reasoning core, sir.");
    } finally {
      setAssessing(false);
    }
  }

  const tabStyle = (t) => ({
    background: tab === t ? `${CY}22` : "transparent",
    border: `1px solid ${tab === t ? CY : DIM}44`,
    borderRadius: 4,
    color: tab === t ? CY : DIM,
    cursor: "pointer",
    fontSize: 9,
    letterSpacing: 1,
    padding: "3px 7px",
  });

  const badge = dark > 0 ? dark : null;

  return (
    <>
      {/* floating button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Graph Node × Decision Rules Nexus (GNDRULS)"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: Z_INDEX,
          background: open ? `${CY}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${CY}${open ? "99" : "44"}`,
          borderRadius: 5,
          color: CY,
          cursor: "pointer",
          fontSize: 9,
          letterSpacing: 1,
          padding: "4px 8px",
          backdropFilter: "blur(6px)",
          whiteSpace: "nowrap",
        }}
      >
        ◈ GNDRULS{badge ? <span style={{ marginLeft: 4, background: AMB, color: "#000", borderRadius: 3, padding: "0 4px", fontSize: 9 }}>{badge}</span> : null}
      </button>

      {/* panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            left: BTN_LEFT,
            bottom: 36,
            zIndex: Z_INDEX + 1,
            width: 340,
            maxHeight: "70vh",
            overflowY: "auto",
            background: "rgba(4,7,12,0.96)",
            border: `1px solid ${CY}44`,
            borderRadius: 8,
            padding: "12px 14px",
            backdropFilter: "blur(14px)",
            boxShadow: `0 0 28px ${CY}22`,
            fontFamily: "monospace",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: "bold" }}>GRAPH NODE × DECISION RULES</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
            {[
              { label: "NODES",   value: rows.length, color: CY },
              { label: "WATCHED", value: watched,      color: GRN },
              { label: "DARK",    value: dark,         color: dark > 0 ? AMB : GRN },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${color}33`, borderRadius: 6, padding: "6px 8px", textAlign: "center" }}
              >
                <div style={{ color, fontSize: 16, fontWeight: "bold" }}>{loading ? "…" : value}</div>
                <div style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* coverage bar */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>NETWORK MONITORING COVERAGE</span>
              <span style={{ color: pct >= 70 ? GRN : pct >= 40 ? AMB : RED, fontSize: 10, fontWeight: "bold" }}>{pct}%</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct >= 70 ? GRN : pct >= 40 ? AMB : RED, borderRadius: 2, transition: "width 0.4s" }} />
            </div>
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
            {["ALL", "WATCHED", "DARK"].map((t) => (
              <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search nodes…"
            style={{ width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.4)", border: `1px solid ${CY}33`, borderRadius: 5, color: "#DCEBF5", padding: "5px 8px", fontSize: 11, marginBottom: 8, outline: "none" }}
          />

          {/* list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 12 }}>No nodes match.</div>
            )}
            {visible.map((node) => (
              <div
                key={node.id}
                style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${node.watched ? GRN : AMB}33`, borderRadius: 6, padding: "7px 9px", cursor: "pointer" }}
                onClick={() => setExpanded(expanded === node.id ? null : node.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ color: node.watched ? GRN : AMB, fontSize: 10 }}>{node.watched ? "●" : "○"}</span>
                  <span style={{ color: PRP, fontSize: 9, border: `1px solid ${PRP}44`, borderRadius: 3, padding: "1px 4px" }}>{node.kind}</span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>{node.name}</span>
                  <span style={{ color: DIM, fontSize: 9 }}>s:{typeof node.score === "number" ? node.score.toFixed(2) : node.score}</span>
                  <span style={{ color: node.watched ? GRN : DIM, fontSize: 9 }}>
                    {node.watched ? `${node.rules.length} rule${node.rules.length !== 1 ? "s" : ""}` : "DARK"}
                  </span>
                </div>

                {expanded === node.id && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${CY}22`, paddingTop: 6 }}>
                    {node.watched ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {node.rules.map((rule) => (
                          <div key={rule.id} style={{ background: "rgba(41,231,255,0.04)", border: `1px solid ${CY}33`, borderRadius: 4, padding: "5px 7px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                              <span style={{ color: SEV_COLOR[rule.severity] || CY, fontSize: 9, border: `1px solid ${(SEV_COLOR[rule.severity] || CY)}44`, borderRadius: 3, padding: "1px 4px" }}>{rule.severity}</span>
                              <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{rule.name}</span>
                              <span style={{ color: rule.enabled ? GRN : DIM, fontSize: 9 }}>{rule.enabled ? "ON" : "OFF"}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>hits:{rule.hits}</span>
                            </div>
                            {rule.target && (
                              <div style={{ color: DIM, fontSize: 9 }}>target: {rule.target}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No decision rules matched this node — network monitoring blind spot.</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* assess */}
          <div style={{ marginTop: 10, borderTop: `1px solid ${CY}22`, paddingTop: 8 }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{ background: `${CY}18`, border: `1px solid ${CY}55`, borderRadius: 5, color: CY, padding: "5px 12px", cursor: "pointer", fontSize: 10, letterSpacing: 1, width: "100%", opacity: assessing ? 0.6 : 1 }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, color: "#DCEBF5", fontSize: 10, lineHeight: 1.5, borderLeft: `2px solid ${CY}`, paddingLeft: 8 }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
