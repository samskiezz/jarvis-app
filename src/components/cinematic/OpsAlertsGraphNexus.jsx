/**
 * OpsAlertsGraphNexus — F659
 * "JARVIS, oalgrph / ops alert graph / alert graph node / graph alert coverage /
 *  which alerts match graph nodes / central node alerts / alert centrality /
 *  graph-linked alerts / graph alert match"
 * Cross-references /v1/ops/alerts against /v1/graph/centrality.
 * CENTRAL alerts (≥1 high-centrality node keyword-matches) vs PERIPHERAL (no graph backing).
 * Coverage % tile; ALL/CENTRAL/PERIPHERAL filter tabs + search; click-to-expand matched nodes.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4444";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 118_280;
const Z_INDEX  = 196;

const OALGRPH_RE =
  /\boalgrph\b|\bops.?alert.?graph\b|\balert.?graph.?node\b|\bgraph.?alert.?coverage\b|\bwhich.?alerts?.?match.?graph\b|\bcentral.?node.?alert\b|\balert.?centrality\b|\bgraph.?linked.?alert\b|\bgraph.?alert.?match\b|\balert.?graph.?nexus\b/i;

export function isOalgrphQuery(text) {
  return OALGRPH_RE.test(text || "");
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

function normaliseAlerts(data) {
  if (!data) return [];
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.alerts)
    ? data.alerts
    : Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.data)
    ? data.data
    : [];
  return arr.map((a, i) => ({
    id:       a.id       || a.alert_id || String(i),
    title:    a.title    || a.name     || a.summary    || `Alert ${i + 1}`,
    severity: (a.severity || a.level   || "INFO").toString().toUpperCase(),
    source:   a.source   || a.service  || a.origin || "",
    message:  a.message  || a.description || a.body || "",
  }));
}

function normaliseNodes(data) {
  if (!data) return [];
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.nodes)
    ? data.nodes
    : Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.data)
    ? data.data
    : [];
  return arr.map((n, i) => ({
    id:         n.id    || `node-${i}`,
    label:      n.label || n.name || n.id || `Node ${i + 1}`,
    kind:       n.type  || n.kind || n.entity_type || "node",
    centrality: typeof n.centrality === "number" ? n.centrality : parseFloat(n.score || n.centrality_score || 0) || 0,
  }));
}

function correlate(alerts, nodes) {
  return alerts.map((alert) => {
    const haystack = [alert.title, alert.message, alert.source].join(" ");
    const matched = nodes
      .map((node) => {
        const needle = [node.label, node.kind].join(" ");
        const hits = overlap(haystack, needle);
        return hits > 0 ? { ...node, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits || b.centrality - a.centrality)
      .slice(0, 6);
    return { ...alert, _matched: matched, _linked: matched.length > 0 };
  });
}

export async function buildOalgrphScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [alR, grR] = await Promise.allSettled([
      fetch(`${base}/v1/ops/alerts`, { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/v1/graph/centrality`, { headers: hdr }).then((r) => r.json()),
    ]);
    const alerts = normaliseAlerts(alR.status === "fulfilled" ? alR.value : []);
    const nodes  = normaliseNodes(grR.status === "fulfilled" ? grR.value : []);
    const enriched  = correlate(alerts, nodes);
    const central    = enriched.filter((a) => a._linked).length;
    const peripheral = enriched.length - central;
    const topPeriph  = enriched
      .filter((a) => !a._linked)
      .slice(0, 3)
      .map((a) => a.title)
      .join(", ") || "none";
    return (
      `Ops Alerts × Graph Nexus: ${alerts.length} alerts, ${nodes.length} high-centrality nodes indexed. ` +
      `${central} alerts match central graph nodes; ${peripheral} are peripheral (no graph backing). ` +
      `Unmatched alerts: ${topPeriph}.`
    );
  } catch {
    return "Ops Alerts × Graph Nexus is online. Opening coverage panel now, sir.";
  }
}

function SevBadge({ sev }) {
  const color =
    sev === "CRITICAL" ? RED :
    sev === "HIGH"     ? AMB :
    sev === "WARNING"  ? AMB :
    sev === "INFO"     ? CY  : DIM;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, color, border: `1px solid ${color}`,
      borderRadius: 3, padding: "1px 4px", marginRight: 4,
    }}>{sev}</span>
  );
}

export default function OpsAlertsGraphNexus() {
  const [open,     setOpen]     = useState(false);
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [tab,      setTab]      = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [alR, grR] = await Promise.allSettled([
        fetch(`${base}/v1/ops/alerts`, { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/v1/graph/centrality`, { headers: hdr }).then((r) => r.json()),
      ]);
      const alerts = normaliseAlerts(alR.status === "fulfilled" ? alR.value : []);
      const nodes  = normaliseNodes(grR.status === "fulfilled" ? grR.value : []);
      setData({ alerts: correlate(alerts, nodes), nodeCount: nodes.length });
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail === "oalgrph") setOpen((o) => !o);
    };
    window.addEventListener("jarvis:oalgrph-toggle", handler);
    return () => window.removeEventListener("jarvis:oalgrph-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const alerts   = data?.alerts || [];
  const central    = alerts.filter((a) => a._linked).length;
  const peripheral = alerts.length - central;
  const pct = alerts.length ? Math.round((central / alerts.length) * 100) : 0;

  const visible = alerts.filter((a) => {
    if (tab === "CENTRAL"    && !a._linked) return false;
    if (tab === "PERIPHERAL" &&  a._linked) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!a.title.toLowerCase().includes(q) && !a.source.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = await buildOalgrphScript();
      const base   = apiBase();
      const hdr    = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
      const aiRes  = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers: hdr,
        body: JSON.stringify({ message: script }),
      });
      const aiJson = await aiRes.json();
      const text   = aiJson?.response || aiJson?.message || script;
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: text }));
    } catch {
      /* silent */
    } finally {
      setAssessing(false);
    }
  }, []);

  const btnStyle = {
    position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
    background: "rgba(0,20,40,0.85)", border: `1px solid ${AMB}`,
    color: AMB, fontSize: 9, fontWeight: 700, padding: "3px 6px",
    borderRadius: 4, cursor: "pointer", fontFamily: "monospace",
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen((o) => !o)} title="Ops Alerts × Graph Node Nexus">
        ◈ OALGRPH
        {peripheral > 0 && (
          <span style={{
            marginLeft: 4, background: AMB, color: "#000",
            borderRadius: 8, fontSize: 8, padding: "1px 4px",
          }}>{peripheral}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", top: 60, right: 20, width: 480, maxHeight: "80vh",
          background: "rgba(0,12,28,0.97)", border: `1px solid ${AMB}`,
          borderRadius: 8, zIndex: Z_INDEX + 1, display: "flex", flexDirection: "column",
          fontFamily: "monospace", color: CY, overflowY: "auto",
        }}>
          {/* header */}
          <div style={{ padding: "10px 14px 6px", borderBottom: `1px solid rgba(255,165,0,0.25)`, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flex: 1, fontWeight: 700, fontSize: 11, color: AMB }}>
              ◈ OPS ALERTS × GRAPH NODE NEXUS
            </span>
            <button onClick={assess} disabled={assessing} style={{
              background: assessing ? "#333" : "rgba(0,200,120,0.15)",
              border: `1px solid ${GRN}`, color: GRN, fontSize: 9, padding: "2px 7px",
              borderRadius: 3, cursor: assessing ? "wait" : "pointer",
            }}>{assessing ? "…" : "▶ ASSESS"}</button>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: DIM, fontSize: 14, cursor: "pointer",
            }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: `1px solid rgba(255,165,0,0.15)` }}>
            {[
              { label: "ALERTS",     val: alerts.length,         col: CY },
              { label: "NODES",      val: data?.nodeCount || 0,  col: CY },
              { label: "CENTRAL",    val: central,               col: GRN },
              { label: "PERIPHERAL", val: peripheral,            col: AMB },
              { label: "COVERAGE",   val: `${pct}%`,             col: pct >= 60 ? GRN : AMB },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                flex: 1, textAlign: "center", background: "rgba(255,255,255,0.04)",
                borderRadius: 4, padding: "4px 2px",
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: col }}>{val}</div>
                <div style={{ fontSize: 8, color: DIM }}>{label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs + search */}
          <div style={{ display: "flex", gap: 6, padding: "6px 14px", borderBottom: `1px solid rgba(255,165,0,0.1)`, alignItems: "center" }}>
            {["ALL", "CENTRAL", "PERIPHERAL"].map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${AMB}22` : "none",
                border: `1px solid ${tab === t ? AMB : "#334"}`,
                color: tab === t ? AMB : DIM, fontSize: 8, padding: "2px 6px",
                borderRadius: 3, cursor: "pointer",
              }}>{t}</button>
            ))}
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                marginLeft: "auto", background: "rgba(255,255,255,0.06)",
                border: `1px solid #334`, color: CY, fontSize: 9,
                padding: "2px 6px", borderRadius: 3, width: 120,
              }}
            />
          </div>

          {/* rows */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px" }}>
            {loading && !alerts.length && (
              <div style={{ color: DIM, fontSize: 10, padding: 8 }}>Loading…</div>
            )}
            {!loading && !visible.length && (
              <div style={{ color: DIM, fontSize: 10, padding: 8 }}>No alerts match this filter.</div>
            )}
            {visible.map((alert) => (
              <div key={alert.id} style={{
                borderBottom: `1px solid rgba(255,165,0,0.08)`,
                padding: "6px 0", cursor: "pointer",
              }} onClick={() => setExpanded(expanded === alert.id ? null : alert.id)}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <SevBadge sev={alert.severity} />
                  <span style={{
                    flex: 1, fontSize: 10, color: alert._linked ? CY : DIM,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>{alert.title}</span>
                  <span style={{
                    fontSize: 8, color: alert._linked ? GRN : "#556",
                    background: alert._linked ? "rgba(0,200,120,0.1)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${alert._linked ? GRN : "#334"}`,
                    borderRadius: 3, padding: "1px 4px",
                  }}>{alert._linked ? "CENTRAL" : "PERIPHERAL"}</span>
                </div>
                {alert.source && (
                  <div style={{ fontSize: 8, color: DIM, marginTop: 2, paddingLeft: 2 }}>
                    src: {alert.source}
                  </div>
                )}
                {expanded === alert.id && alert._matched.length > 0 && (
                  <div style={{ marginTop: 6, paddingLeft: 4 }}>
                    {alert._matched.map((node) => (
                      <div key={node.id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "3px 0", borderTop: `1px solid rgba(41,231,255,0.08)`,
                      }}>
                        <span style={{ fontSize: 9, color: CY, flex: 1 }}>{node.label}</span>
                        <span style={{ fontSize: 8, color: DIM }}>{node.kind}</span>
                        <span style={{ fontSize: 8, color: AMB }}>
                          score {typeof node.centrality === "number" ? node.centrality.toFixed(3) : "?"}
                        </span>
                        <span style={{
                          fontSize: 8, color: GRN, background: "rgba(0,200,120,0.1)",
                          border: `1px solid ${GRN}`, borderRadius: 3, padding: "1px 3px",
                        }}>{node.hits} hit{node.hits !== 1 ? "s" : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
                {expanded === alert.id && !alert._matched.length && (
                  <div style={{ fontSize: 8, color: DIM, marginTop: 4, paddingLeft: 4 }}>
                    No high-centrality node matches for this alert.
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
