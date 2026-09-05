/**
 * RemindersGraphNexus — F608
 * "JARVIS, remgrph / reminders graph / graph reminders / graph-linked reminders / node reminders"
 * Cross-references /reminders/list against /v1/graph/centrality top nodes.
 * GRAPH-LINKED reminders (≥1 high-centrality node keyword-matches) vs FLOATING (no graph backing).
 * Coverage % tile; ALL/GRAPH-LINKED/FLOATING filter tabs + search; click-to-expand matched nodes.
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

const POLL_MS = 90_000;

const REMGRPH_RE =
  /\bremgrph\b|\breminders?.graph\b|\bgraph.?reminders?\b|\bgraph.?linked.?reminders?\b|\bnode.?reminders?\b|\breminder.?node.?coverage\b|\bgraph.?memory.?notes?\b|\breminder.?graph.?coverage\b/i;

export function isRemgrphQuery(text) {
  return REMGRPH_RE.test(text || "");
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

function normaliseReminders(data) {
  if (!data) return [];
  const raw =
    data.reminders || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((r, i) => ({
    id:      r.id || `rem-${i}`,
    content: r.content || r.text || r.title || r.note || `Reminder ${i + 1}`,
    kind:    (r.kind || r.type || "reminder").toLowerCase(),
    status:  (r.status || "pending").toLowerCase(),
    tags:    r.tags || [],
  }));
}

function normaliseNodes(raw) {
  const arr = Array.isArray(raw)          ? raw
    : Array.isArray(raw?.nodes)           ? raw.nodes
    : Array.isArray(raw?.results)         ? raw.results
    : Array.isArray(raw?.centrality)      ? raw.centrality
    : [];
  return arr.map((n, i) => ({
    id:    n.id    || n.node_id   || String(i),
    label: n.label || n.name      || n.entity || `Node ${i + 1}`,
    score: n.score ?? n.centrality_score ?? n.weight ?? 0,
    kind:  (n.kind || n.type || n.entity_type || "NODE").toString().toUpperCase(),
    tags:  Array.isArray(n.tags) ? n.tags.join(" ") : (n.tags || ""),
  }));
}

function crossRef(reminders, nodes) {
  return reminders.map((rem) => {
    const haystack = `${rem.content} ${(rem.tags || []).join(" ")}`;
    const matches = nodes
      .map((node) => {
        const hits = overlap(haystack, `${node.label} ${node.kind} ${node.tags}`);
        return hits > 0 ? { ...node, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits || b.score - a.score)
      .slice(0, 5);
    return { ...rem, nodes: matches, linked: matches.length > 0 };
  });
}

export async function buildRemgrphScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [remRes, nodeRes] = await Promise.all([
      fetch(`${base}/reminders/list`,       { headers: hdr }),
      fetch(`${base}/v1/graph/centrality`,  { headers: hdr }),
    ]);
    const [remData, nodeData] = await Promise.all([remRes.json(), nodeRes.json()]);
    const reminders = normaliseReminders(remData);
    const nodes     = normaliseNodes(nodeData);
    const rows      = crossRef(reminders, nodes);
    const linked    = rows.filter((r) => r.linked).length;
    const floating  = rows.length - linked;
    const pct       = rows.length ? Math.round((linked / rows.length) * 100) : 0;
    if (!rows.length) return "No reminders found in the system, sir.";
    const topFloating = rows
      .filter((r) => !r.linked)
      .slice(0, 2)
      .map((r) => r.content.slice(0, 40))
      .join("; ");
    return (
      `${linked} of ${rows.length} reminders are anchored to high-centrality graph nodes (${pct}% graph coverage). ` +
      (floating > 0
        ? `${floating} reminder${floating !== 1 ? "s" : ""} have no matching graph node — unanchored notes: ${topFloating || "unknown"}.`
        : "All reminders are linked to influential graph entities.")
    );
  } catch {
    return "Unable to reach reminders or graph endpoints, sir.";
  }
}

export default function RemindersGraphNexus() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [remRes, nodeRes] = await Promise.all([
        fetch(`${base}/reminders/list`,      { headers: hdr }),
        fetch(`${base}/v1/graph/centrality`, { headers: hdr }),
      ]);
      const [remData, nodeData] = await Promise.all([remRes.json(), nodeRes.json()]);
      setRows(crossRef(normaliseReminders(remData), normaliseNodes(nodeData)));
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:remgrph-toggle", toggle);
    return () => window.removeEventListener("jarvis:remgrph-toggle", toggle);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try {
      const base    = apiBase();
      const linked   = rows.filter((r) => r.linked);
      const floating = rows.filter((r) => !r.linked);
      const resp = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message:
            `Assess reminder-to-graph-node linkage: ${rows.length} reminders total, ` +
            `${linked.length} are anchored to high-centrality network nodes, ` +
            `${floating.length} have no matching graph entity (unanchored notes). ` +
            `Top unanchored: ${floating.slice(0, 3).map((r) => r.content.slice(0, 40)).join("; ") || "none"}. ` +
            "Give a 2-sentence operational graph-memory coverage assessment with recommended action.",
        }),
      });
      const d = await resp.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(text);
      if (text) {
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }, [rows]);

  const linked   = rows.filter((r) => r.linked).length;
  const floating = rows.length - linked;
  const pct      = rows.length ? Math.round((linked / rows.length) * 100) : 0;

  const visible = rows
    .filter((r) => {
      if (tab === "GRAPH-LINKED") return r.linked;
      if (tab === "FLOATING")     return !r.linked;
      return true;
    })
    .filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        r.content.toLowerCase().includes(q) ||
        r.kind.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q)
      );
    });

  const KIND_COLOR = {
    note: CY, task: GRN, alert: RED, reminder: AMB,
  };

  const BTN_LEFT = 88_180;
  const BTN_STYLE = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 8,
    zIndex: 161,
    padding: "4px 10px",
    background: "rgba(5,8,13,0.82)",
    border: `1px solid ${floating > 0 ? AMB : CY}55`,
    borderRadius: 6,
    cursor: "pointer",
    color: CY,
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 10,
    letterSpacing: 1,
    display: "flex",
    alignItems: "center",
    gap: 5,
    backdropFilter: "blur(6px)",
  };

  const PANEL = {
    position: "fixed",
    left: BTN_LEFT - 340,
    bottom: 38,
    zIndex: 161,
    width: 400,
    maxHeight: "70vh",
    overflowY: "auto",
    background: "rgba(6,10,16,0.94)",
    border: `1px solid ${CY}44`,
    borderRadius: 10,
    padding: 14,
    fontFamily: "'JetBrains Mono',monospace",
    color: "#DCEBF5",
    backdropFilter: "blur(10px)",
    boxShadow: `0 0 40px ${CY}18`,
  };

  const tabStyle = (t) => ({
    padding: "3px 8px",
    border: `1px solid ${tab === t ? CY : CY + "33"}`,
    borderRadius: 4,
    cursor: "pointer",
    background: tab === t ? CY + "22" : "transparent",
    color: tab === t ? CY : DIM,
    fontSize: 10,
    letterSpacing: 1,
  });

  return (
    <>
      <button
        style={BTN_STYLE}
        onClick={() => setOpen((o) => !o)}
        title="Reminders × Graph Node Coverage (REMGRPH)"
      >
        ◈ REMGRPH
        {floating > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 4, padding: "1px 5px", fontSize: 9 }}>
            {floating}
          </span>
        )}
      </button>

      {open && (
        <div style={PANEL}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>REMINDERS × GRAPH NODE NEXUS</span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
            >✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              { label: "REMINDERS",    value: rows.length, color: CY },
              { label: "GRAPH-LINKED", value: linked,      color: linked > 0 ? GRN : DIM },
              { label: "FLOATING",     value: floating,    color: floating > 0 ? AMB : GRN },
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
              <span style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>GRAPH COVERAGE</span>
              <span style={{ color: pct >= 70 ? GRN : pct >= 40 ? AMB : RED, fontSize: 10, fontWeight: "bold" }}>{pct}%</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct >= 70 ? GRN : pct >= 40 ? AMB : RED, borderRadius: 2, transition: "width 0.4s" }} />
            </div>
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
            {["ALL", "GRAPH-LINKED", "FLOATING"].map((t) => (
              <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search reminders…"
            style={{ width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.4)", border: `1px solid ${CY}33`, borderRadius: 5, color: "#DCEBF5", padding: "5px 8px", fontSize: 11, marginBottom: 8, outline: "none" }}
          />

          {/* list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 12 }}>No reminders match.</div>
            )}
            {visible.map((rem) => (
              <div
                key={rem.id}
                style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${rem.linked ? GRN : AMB}33`, borderRadius: 6, padding: "7px 9px", cursor: "pointer" }}
                onClick={() => setExpanded(expanded === rem.id ? null : rem.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ color: rem.linked ? GRN : AMB, fontSize: 10 }}>{rem.linked ? "●" : "○"}</span>
                  <span style={{ color: KIND_COLOR[rem.kind] || CY, fontSize: 9, border: `1px solid ${(KIND_COLOR[rem.kind] || CY)}44`, borderRadius: 3, padding: "1px 4px" }}>{rem.kind}</span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>{rem.content.slice(0, 60)}{rem.content.length > 60 ? "…" : ""}</span>
                  <span style={{ color: rem.linked ? GRN : DIM, fontSize: 9 }}>
                    {rem.linked ? `${rem.nodes.length} node${rem.nodes.length !== 1 ? "s" : ""}` : "FLOATING"}
                  </span>
                </div>

                {expanded === rem.id && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${CY}22`, paddingTop: 6 }}>
                    {rem.linked ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {rem.nodes.map((node) => (
                          <div key={node.id} style={{ background: "rgba(0,229,160,0.04)", border: `1px solid ${GRN}33`, borderRadius: 4, padding: "5px 7px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ color: CY, fontSize: 9, border: `1px solid ${CY}44`, borderRadius: 3, padding: "1px 4px" }}>{node.kind}</span>
                              <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{node.label}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>score: {typeof node.score === "number" ? node.score.toFixed(3) : node.score}</span>
                              <span style={{ color: DIM, fontSize: 9, marginLeft: 4 }}>hits: {node.hits}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No influential graph nodes matched this reminder — unanchored operational note.</div>
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
