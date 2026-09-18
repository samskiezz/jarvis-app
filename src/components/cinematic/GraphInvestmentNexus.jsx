/**
 * GraphInvestmentNexus — F587
 * "JARVIS, graph investment / grinv / invested nodes / uninvested nodes / node investment coverage"
 * Cross-references /v1/graph/centrality (top influential nodes) + /entities/Investment.
 * Finds INVESTED nodes (≥1 investment keyword-matches) vs UNINVESTED (no investment backing).
 * Coverage % tile; ALL/INVESTED/UNINVESTED filter tabs + search; click-to-expand matched investments.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence graph-investment intelligence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 73_700;
const Z_INDEX  = 144;

const GRINV_RE =
  /\bgrinv\b|\bgraph.?invest\w*\b|\binvest\w*.?graph\b|\binvested.?nodes?\b|\buninvested.?nodes?\b|\bnode.?invest\w*.?coverage\b|\bgraph.?portfolio\b|\bgraph.?holding\b|\bnode.?invest\w*\b|\bgraph.?invest\w*.?coverage\b/i;

export function isGrinvQuery(text) {
  return GRINV_RE.test(text || "");
}

// ─── helpers ─────────────────────────────────────────────────────────────────

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

function normaliseNodes(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.nodes)            ? raw.nodes
    : Array.isArray(raw?.results)          ? raw.results
    : Array.isArray(raw?.centrality)       ? raw.centrality
    : [];
  return arr.map((n, i) => ({
    id:          n.id          || n.node_id   || String(i),
    label:       n.label       || n.name      || n.entity || `Node ${i + 1}`,
    score:       n.score       ?? n.centrality_score ?? n.weight ?? 0,
    kind:        (n.kind       || n.type      || n.entity_type || "NODE").toString().toUpperCase(),
    description: (n.description || n.summary  || "").toString().slice(0, 300),
    tags:        Array.isArray(n.tags) ? n.tags.join(" ") : (n.tags || ""),
  }));
}

function normaliseInvestments(raw) {
  const arr = Array.isArray(raw)                ? raw
    : Array.isArray(raw?.investments)           ? raw.investments
    : Array.isArray(raw?.items)                 ? raw.items
    : Array.isArray(raw?.results)               ? raw.results
    : [];
  return arr.map((inv, i) => ({
    id:       inv.id       || inv.investment_id || String(i),
    name:     inv.name     || inv.title         || inv.symbol || `Investment ${i + 1}`,
    category: (inv.category || inv.type || inv.sector || "GENERAL").toString().toUpperCase(),
    amount:   inv.amount   ?? inv.value ?? inv.quantity ?? 0,
    summary:  (inv.summary || inv.description  || inv.notes || "").toString().slice(0, 200),
    tags:     Array.isArray(inv.tags) ? inv.tags.join(" ") : (inv.tags || ""),
  }));
}

function crossRef(nodes, investments) {
  return nodes.map((node) => {
    const haystack = `${node.label} ${node.description} ${node.tags} ${node.kind}`;
    const matches = investments
      .map((inv) => ({
        inv,
        hits: overlap(haystack, `${inv.name} ${inv.summary} ${inv.tags} ${inv.category}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...node,
      invested: matches.length > 0,
      matches: matches.map(({ inv, hits }) => ({ ...inv, hits })),
    };
  });
}

// ─── buildGrinvScript (for JarvisBrain) ──────────────────────────────────────

export async function buildGrinvScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [nodeRes, invRes] = await Promise.all([
      fetch(`${base}/v1/graph/centrality`,  { headers: hdr }),
      fetch(`${base}/entities/Investment`,  { headers: hdr }),
    ]);
    const nodeData = nodeRes.ok ? await nodeRes.json() : {};
    const invData  = invRes.ok  ? await invRes.json()  : {};

    const nodes       = normaliseNodes(nodeData);
    const investments = normaliseInvestments(invData);
    const crossed     = crossRef(nodes, investments);

    const total      = crossed.length;
    const invested   = crossed.filter((n) => n.invested).length;
    const uninvested = total - invested;
    const coverage   = total > 0 ? Math.round((invested / total) * 100) : 0;
    const topDark    = crossed
      .filter((n) => !n.invested)
      .slice(0, 2)
      .map((n) => n.label)
      .join(", ");

    const brief =
      `${coverage}% of ${total} top graph nodes have investment backing. ` +
      `${invested} INVESTED, ${uninvested} UNINVESTED.` +
      (topDark ? ` Top uninvested nodes: ${topDark}.` : "");

    const agentRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Graph × Investment Nexus: ${brief} Provide a 2-sentence graph-investment intelligence assessment.`,
      }),
    });
    const agentData = agentRes.ok ? await agentRes.json() : {};
    const agentText = agentData.response || agentData.message || agentData.reply || "";

    return agentText ? `${brief}\n\n${agentText}` : brief;
  } catch (err) {
    return `Graph × Investment Nexus unavailable: ${err.message}`;
  }
}

// ─── category colour map ──────────────────────────────────────────────────────

const CAT_COLOR = {
  EQUITY:      "#29E7FF",
  BOND:        "#00E5A0",
  CRYPTO:      "#FFA500",
  REAL_ESTATE: "#FF6B35",
  COMMODITY:   "#CC88FF",
  FUND:        "#FF4466",
};

function catColor(c) {
  return CAT_COLOR[c] || DIM;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function GraphInvestmentNexus() {
  const [open, setOpen]           = useState(false);
  const [nodes, setNodes]         = useState([]);
  const [investments, setInvs]    = useState([]);
  const [crossed, setCrossed]     = useState([]);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [loading, setLoading]     = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [nRes, iRes] = await Promise.all([
        fetch(`${base}/v1/graph/centrality`, { headers: hdr }),
        fetch(`${base}/entities/Investment`, { headers: hdr }),
      ]);
      const nd = nRes.ok ? await nRes.json() : {};
      const id = iRes.ok ? await iRes.json() : {};
      const n  = normaliseNodes(nd);
      const inv = normaliseInvestments(id);
      const cx  = crossRef(n, inv);
      setNodes(n);
      setInvs(inv);
      setCrossed(cx);
    } catch {/* silent */}
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:grinv-toggle", toggle);
    return () => window.removeEventListener("jarvis:grinv-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    pollRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    setAssessment("");
    const txt = await buildGrinvScript();
    setAssessment(txt);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
  };

  const total      = crossed.length;
  const invested   = crossed.filter((n) => n.invested).length;
  const uninvested = total - invested;
  const coverage   = total > 0 ? Math.round((invested / total) * 100) : 0;

  const filtered = crossed
    .filter((n) => {
      if (tab === "INVESTED")   return n.invested;
      if (tab === "UNINVESTED") return !n.invested;
      return true;
    })
    .filter((n) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        n.label.toLowerCase().includes(s) ||
        n.kind.toLowerCase().includes(s) ||
        n.matches.some((m) => m.name.toLowerCase().includes(s))
      );
    });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Graph × Investment Nexus (GRINV)"
        style={{
          position: "fixed",
          left:     BTN_LEFT,
          bottom:   8,
          zIndex:   Z_INDEX,
          padding:  "3px 9px",
          fontSize: 11,
          fontFamily: "monospace",
          border:   `1px solid ${AMB}`,
          borderRadius: 4,
          background: "rgba(5,8,13,0.82)",
          color:    AMB,
          cursor:   "pointer",
          letterSpacing: 1,
          whiteSpace: "nowrap",
        }}
      >
        {uninvested > 0 && (
          <span style={{
            marginRight: 4,
            background: AMB,
            color: "#000",
            borderRadius: 10,
            padding: "0 5px",
            fontSize: 10,
          }}>
            {uninvested}
          </span>
        )}
        ◈ GRINV
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, right: 18, zIndex: Z_INDEX + 200,
      width: "min(660px,95vw)", maxHeight: "80vh",
      background: "rgba(5,8,13,0.96)", border: `1px solid ${AMB}55`,
      borderRadius: 14, fontFamily: "monospace", color: "#DCEBF5",
      display: "flex", flexDirection: "column", overflow: "hidden",
      boxShadow: `0 0 40px ${AMB}22`,
    }}>
      {/* header */}
      <div style={{
        padding: "10px 14px 8px", borderBottom: `1px solid ${AMB}33`,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ color: AMB, fontWeight: "bold", letterSpacing: 2, fontSize: 12 }}>
          ◈ GRAPH × INVESTMENT NEXUS
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: DIM }}>
          {loading ? "loading…" : `${total} nodes · ${investments.length} holdings`}
        </span>
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 16,
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 14px" }}>
        {[
          { label: "NODES",      val: total,     col: CY },
          { label: "INVESTED",   val: invested,  col: GRN },
          { label: "UNINVESTED", val: uninvested, col: AMB },
          { label: "COVERAGE",   val: `${coverage}%`, col: coverage >= 50 ? GRN : AMB },
        ].map(({ label, val, col }) => (
          <div key={label} style={{
            flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 8,
            padding: "6px 8px", textAlign: "center",
          }}>
            <div style={{ fontSize: 16, fontWeight: "bold", color: col }}>{val}</div>
            <div style={{ fontSize: 9, color: DIM, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* tabs + search */}
      <div style={{ display: "flex", gap: 6, padding: "0 14px 6px", alignItems: "center" }}>
        {["ALL", "INVESTED", "UNINVESTED"].map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "3px 10px", fontSize: 11, borderRadius: 4, cursor: "pointer",
            background: tab === t ? AMB : "transparent",
            color:      tab === t ? "#000" : DIM,
            border: `1px solid ${tab === t ? AMB : "#333"}`,
            letterSpacing: 1,
          }}>{t}</button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search nodes…"
          style={{
            marginLeft: "auto", padding: "3px 8px", fontSize: 11, borderRadius: 4,
            background: "rgba(255,255,255,0.06)", border: `1px solid #333`,
            color: "#DCEBF5", outline: "none", width: 140,
          }}
        />
      </div>

      {/* list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 14px 8px" }}>
        {filtered.length === 0 && (
          <div style={{ color: DIM, fontSize: 12, padding: "20px 0", textAlign: "center" }}>
            {loading ? "Fetching data…" : "No nodes match filter."}
          </div>
        )}
        {filtered.map((node) => (
          <div key={node.id} style={{
            borderBottom: `1px solid #1a2233`,
            padding: "8px 0",
          }}>
            <div
              onClick={() => setExpanded(expanded === node.id ? null : node.id)}
              style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
            >
              <span style={{
                width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                background: node.invested ? GRN : AMB,
                boxShadow: `0 0 6px ${node.invested ? GRN : AMB}`,
              }} />
              <span style={{ fontSize: 12, flex: 1 }}>{node.label}</span>
              <span style={{
                fontSize: 10, padding: "1px 6px", borderRadius: 3,
                background: `${CY}22`, color: CY,
              }}>{node.kind}</span>
              <span style={{
                fontSize: 10, padding: "1px 6px", borderRadius: 3,
                background: node.invested ? `${GRN}22` : `${AMB}22`,
                color: node.invested ? GRN : AMB,
              }}>{node.invested ? "INVESTED" : "UNINVESTED"}</span>
              {node.matches.length > 0 && (
                <span style={{ fontSize: 10, color: DIM }}>
                  {node.matches.length} match{node.matches.length !== 1 ? "es" : ""}
                </span>
              )}
            </div>

            {expanded === node.id && node.matches.length > 0 && (
              <div style={{ marginTop: 6, paddingLeft: 16 }}>
                {node.matches.slice(0, 4).map((m) => (
                  <div key={m.id} style={{
                    fontSize: 11, padding: "4px 8px", marginBottom: 4,
                    background: "rgba(255,255,255,0.03)", borderRadius: 6,
                    borderLeft: `2px solid ${catColor(m.category)}`,
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <span style={{
                      fontSize: 9, padding: "1px 5px", borderRadius: 3,
                      background: `${catColor(m.category)}22`, color: catColor(m.category),
                      flexShrink: 0,
                    }}>{m.category}</span>
                    <span style={{ flex: 1, color: "#DCEBF5" }}>{m.name}</span>
                    {m.amount > 0 && (
                      <span style={{ color: GRN, fontSize: 10 }}>
                        {m.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    )}
                    <span style={{ color: DIM, fontSize: 10 }}>hits:{m.hits}</span>
                  </div>
                ))}
              </div>
            )}
            {expanded === node.id && node.matches.length === 0 && (
              <div style={{ marginTop: 4, paddingLeft: 16, fontSize: 11, color: DIM }}>
                No matching investments found for this node.
              </div>
            )}
          </div>
        ))}
      </div>

      {/* assess */}
      <div style={{
        padding: "8px 14px", borderTop: `1px solid ${AMB}33`,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <button onClick={assess} disabled={assessing} style={{
          padding: "4px 14px", fontSize: 11, borderRadius: 4, cursor: "pointer",
          background: assessing ? "transparent" : AMB,
          color:      assessing ? AMB : "#000",
          border: `1px solid ${AMB}`,
          letterSpacing: 1, fontFamily: "monospace",
        }}>
          {assessing ? "assessing…" : "▶ ASSESS"}
        </button>
        {assessment && (
          <div style={{ fontSize: 11, color: "#DCEBF5", flex: 1, lineHeight: 1.5 }}>
            {assessment.slice(0, 220)}{assessment.length > 220 ? "…" : ""}
          </div>
        )}
      </div>
    </div>
  );
}
