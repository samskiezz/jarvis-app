/**
 * F97 — Graph Community × Dataset Coverage (GCDS)
 *
 * Parallel-fetches /v1/graph/communities + /v1/datasets, then
 * keyword-correlates each network cluster against the dataset catalog
 * to surface:
 *
 *   COVERED   — at least one dataset covers this community's domain
 *   UNCHARTED — no dataset coverage (intelligence gap)
 *
 * Stat tiles: communities / datasets / covered / uncharted
 * Filter tabs: ALL | COVERED | UNCHARTED + text search
 * Expand any cluster → matched datasets with kind badge + row count +
 *   relevance score bar.
 * Amber badge on UNCHARTED count.
 * ▶ ASSESS: 2-sentence community-dataset readiness brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ GCDS  at bottom:8 left:696400, zIndex:272.
 * Event:   jarvis:gcds-toggle
 * Voice:   "graph community dataset / community dataset / gcds /
 *           uncharted community / community data gap /
 *           community dataset coverage"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 696400;
const POLL_MS  = 90_000;
const AMBER    = "#F59E0B";
const BLUE     = "#60A5FA";
const GREEN    = "#34D399";
const SLATE    = "#6E8AA0";
const CYAN     = "#22D3EE";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const GCDS_RE =
  /\b(graph\s+communit\w*\s+dataset[s]?|communit\w*\s+dataset[s]?|dataset[s]?\s+communit\w*|gcds|uncharted\s+communit\w*|communit\w*\s+data\s+gap|communit\w*\s+dataset\s+coverage|network\s+dataset[s]?|community\s+data\s+gap)\b/i;

export function isGcdsQuery(q) { return GCDS_RE.test(q); }

export async function buildGcdsScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [commRes, dsRes] = await Promise.all([
      fetch(`${base}/v1/graph/communities`, { headers: hdr }),
      fetch(`${base}/v1/datasets`,          { headers: hdr }),
    ]);
    const communities = normaliseCommunities(await commRes.json());
    const datasets    = normaliseDatasets(await dsRes.json());

    const covered   = communities.filter(
      (c) => datasets.some((d) => relevance(c, d) > 0)
    ).length;
    const uncharted = communities.length - covered;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS community dataset readiness brief: ${communities.length} graph communities ` +
          `correlated against ${datasets.length} datasets. ` +
          `${covered} communities are COVERED (at least one dataset provides empirical ` +
          `backing for their domain); ${uncharted} communities are UNCHARTED ` +
          `(no dataset coverage detected — intelligence gap). ` +
          `Provide a 2-sentence community-dataset readiness assessment — formal ` +
          `British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Community dataset coverage analysis complete, sir.").trim();
  } catch {
    return "Community dataset coverage unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseCommunities(raw) {
  const arr = Array.isArray(raw)                  ? raw
    : Array.isArray(raw?.communities)             ? raw.communities
    : Array.isArray(raw?.clusters)                ? raw.clusters
    : Array.isArray(raw?.data)                    ? raw.data
    : Array.isArray(raw?.results)                 ? raw.results
    : Array.isArray(raw?.items)                   ? raw.items
    : [];
  return arr.map((c, i) => ({
    id:      c.id       || c.community_id  || String(i),
    label:   c.label    || c.name          || c.title    || `Community ${i + 1}`,
    members: Array.isArray(c.members) ? c.members.join(" ") : (c.members || ""),
    summary: (c.summary || c.description   || c.notes    || "").toString().slice(0, 300),
    size:    c.size     || (Array.isArray(c.members) ? c.members.length : 0) || 0,
  }));
}

function normaliseDatasets(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.datasets)            ? raw.datasets
    : Array.isArray(raw?.items)               ? raw.items
    : Array.isArray(raw?.data)                ? raw.data
    : Array.isArray(raw?.results)             ? raw.results
    : [];
  return arr.map((d, i) => ({
    id:       d.id          || String(i),
    label:    d.name        || d.title       || d.label   || `Dataset ${i + 1}`,
    kind:     (d.type       || d.kind        || d.format  || "DATASET").toString().toUpperCase(),
    rows:     d.row_count   || d.rows        || d.total_rows || d.count || null,
    tokens:   tok(
      `${d.name || ""} ${d.title || ""} ${d.description || ""} ` +
      `${d.type  || ""} ${d.source || ""} ` +
      `${Array.isArray(d.tags) ? d.tags.join(" ") : d.tags || ""}`
    ),
  }));
}

function tok(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function relevance(community, dataset) {
  const cw = tok(`${community.label} ${community.members} ${community.summary}`);
  const dv = new Set(dataset.tokens);
  return cw.filter((w) => dv.has(w)).length;
}

function kindColor(kind) {
  if (kind.includes("SQL") || kind.includes("DB"))    return "#60A5FA";
  if (kind.includes("CSV") || kind.includes("FILE"))  return "#34D399";
  if (kind.includes("API") || kind.includes("REST"))  return "#A78BFA";
  if (kind.includes("JSON"))                          return "#F97316";
  return SLATE;
}

function buildLinked(communities, datasets) {
  return communities.map((c) => {
    const matched = datasets
      .map((d) => ({ ...d, score: relevance(c, d) }))
      .filter((d) => d.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    return { ...c, datasets: matched, covered: matched.length > 0 };
  });
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "COVERED", "UNCHARTED"];

export default function GraphCommunityDatasetCoverage() {
  const [open,        setOpen]        = useState(false);
  const [communities, setCommunities] = useState([]);
  const [datasets,    setDatasets]    = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [filter,      setFilter]      = useState("ALL");
  const [search,      setSearch]      = useState("");
  const [expanded,    setExpanded]    = useState(null);
  const [assessing,   setAssessing]   = useState(false);
  const [lastFetch,   setLastFetch]   = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [commRes, dsRes] = await Promise.all([
        fetch(`${base}/v1/graph/communities`, { headers: hdr }),
        fetch(`${base}/v1/datasets`,          { headers: hdr }),
      ]);
      setCommunities(normaliseCommunities(await commRes.json()));
      setDatasets(normaliseDatasets(await dsRes.json()));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const onToggle = () => {
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    };
    window.addEventListener("jarvis:gcds-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gcds-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    const text = await buildGcdsScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const linked    = buildLinked(communities, datasets);
  const covered   = linked.filter((c) => c.covered).length;
  const uncharted = linked.length - covered;

  const displayed = linked.filter((c) => {
    if (filter === "COVERED"   && !c.covered) return false;
    if (filter === "UNCHARTED" && c.covered)  return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return c.label.toLowerCase().includes(q) || c.members.toLowerCase().includes(q);
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Graph Community × Dataset Coverage (GCDS)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 272,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${AMBER}55`,
          color: AMBER, padding: "3px 10px", borderRadius: 6,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          cursor: "pointer", backdropFilter: "blur(6px)",
          letterSpacing: 1,
        }}
      >
        {uncharted > 0
          ? <><span style={{ background: AMBER, color: "#04060A", borderRadius: 4, padding: "0 4px", marginRight: 4, fontWeight: 700 }}>{uncharted}</span>◈ GCDS</>
          : "◈ GCDS"
        }
      </button>
    );
  }

  const TILE = { flex: "1 1 100px", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", textAlign: "center" };

  return (
    <div style={{
      position: "fixed", bottom: 52, left: BTN_LEFT - 360, zIndex: 272,
      width: 480, maxHeight: "72vh", display: "flex", flexDirection: "column",
      background: "rgba(6,10,16,0.95)", border: `1px solid ${AMBER}44`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: `0 0 40px ${AMBER}22`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${AMBER}33` }}>
        <span style={{ color: AMBER, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ GCDS</span>
        <span style={{ color: SLATE, fontSize: 9, flex: 1 }}>COMMUNITY × DATASET COVERAGE</span>
        {lastFetch && <span style={{ color: SLATE, fontSize: 8 }}>{lastFetch.toLocaleTimeString()}</span>}
        {loading && <span style={{ color: AMBER, fontSize: 9 }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{ marginLeft: 4, background: "none", border: "none", color: SLATE, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${AMBER}22` }}>
        {[
          { label: "COMMUNITIES", value: linked.length,   col: BLUE  },
          { label: "DATASETS",    value: datasets.length, col: CYAN  },
          { label: "COVERED",     value: covered,         col: GREEN },
          { label: "UNCHARTED",   value: uncharted,       col: AMBER },
        ].map(({ label, value, col }) => (
          <div key={label} style={TILE}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{value}</div>
            <div style={{ color: SLATE, fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${AMBER}22`, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? `${AMBER}22` : "none",
            border: `1px solid ${filter === t ? AMBER : SLATE}`,
            color: filter === t ? AMBER : SLATE,
            borderRadius: 5, padding: "2px 8px", fontSize: 9,
            cursor: "pointer", letterSpacing: 1,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="search communities…"
          style={{
            flex: 1, minWidth: 100, background: "rgba(255,255,255,0.04)",
            border: "1px solid #6E8AA044", borderRadius: 5, padding: "2px 8px",
            color: "#DCEBF5", fontSize: 9, outline: "none",
          }}
        />
        <button onClick={assess} disabled={assessing} style={{
          background: "none", border: `1px solid ${AMBER}`,
          color: AMBER, borderRadius: 5, padding: "2px 8px",
          fontSize: 9, cursor: "pointer", letterSpacing: 1,
        }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>

      {/* community list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
        {displayed.length === 0 && !loading && (
          <div style={{ color: SLATE, fontSize: 10, textAlign: "center", padding: 20 }}>
            No communities match the current filter.
          </div>
        )}
        {displayed.map((c) => {
          const isExp = expanded === c.id;
          const col   = c.covered ? GREEN : AMBER;
          const badge = c.covered ? "COVERED" : "UNCHARTED";
          return (
            <div key={c.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : c.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                  background: isExp ? `${AMBER}11` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${c.covered ? `${GREEN}44` : `${AMBER}44`}`,
                  transition: "background 0.2s",
                }}
              >
                <span style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: 1, padding: "1px 5px",
                  borderRadius: 4, background: `${col}22`, color: col,
                }}>
                  {badge}
                </span>
                <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5" }}>{c.label}</span>
                {c.size > 0 && <span style={{ fontSize: 8, color: SLATE }}>{c.size} nodes</span>}
                {c.covered && (
                  <span style={{ fontSize: 8, color: GREEN }}>{c.datasets.length} dataset{c.datasets.length !== 1 ? "s" : ""}</span>
                )}
                <span style={{ color: SLATE, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ margin: "4px 0 4px 12px", padding: "8px 10px", borderRadius: 7, background: "rgba(255,255,255,0.02)", border: `1px solid ${AMBER}22` }}>
                  {c.summary && (
                    <div style={{ fontSize: 9, color: SLATE, marginBottom: 6 }}>
                      {c.summary.slice(0, 120)}
                    </div>
                  )}
                  {c.datasets.length === 0 ? (
                    <div style={{ fontSize: 9, color: AMBER }}>No datasets currently cover this community's domain — intelligence gap detected.</div>
                  ) : (
                    c.datasets.map((d, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, padding: "4px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)" }}>
                        <span style={{
                          fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                          background: `${kindColor(d.kind)}22`, color: kindColor(d.kind),
                          letterSpacing: 1, flexShrink: 0,
                        }}>
                          {d.kind.slice(0, 6)}
                        </span>
                        <span style={{ flex: 1, fontSize: 9, color: "#DCEBF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</span>
                        {d.rows != null && (
                          <span style={{ fontSize: 8, color: CYAN, flexShrink: 0, padding: "1px 4px", borderRadius: 3, background: `${CYAN}11` }}>
                            {d.rows.toLocaleString()}r
                          </span>
                        )}
                        <div style={{ width: 60, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)", flexShrink: 0 }}>
                          <div style={{ height: "100%", borderRadius: 2, background: AMBER, width: `${Math.min(100, d.score * 20)}%` }} />
                        </div>
                        <span style={{ fontSize: 8, color: AMBER, flexShrink: 0 }}>{d.score}</span>
                      </div>
                    ))
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
