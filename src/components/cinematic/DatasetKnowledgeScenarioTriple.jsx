/**
 * DatasetKnowledgeScenarioTriple — F248 (DKST)
 *
 * Parallel-fetches /v1/datasets + /knowledge/ + /v1/scenario/list every 90 s.
 * Keyword-correlates each dataset (name/title/description/tags/category/type)
 * against KB articles (title/content/topic/tags) AND scenarios (name/description/type/tags).
 * Classification:
 *   FULL_COVERAGE  — matched both KB article AND scenario
 *   KB_ONLY        — matched KB article, no scenario
 *   SCENARIO_ONLY  — matched scenario, no KB article
 *   DARK           — no match in either source
 * Amber badge on dark count.
 *
 * Voice intents: "dataset knowledge scenario / dkst / dataset triple /
 *                knowledge scenario dataset / dark datasets / grounded datasets /
 *                dataset coverage triple / which datasets have knowledge /
 *                dataset scenario knowledge / dataset kb scenario"
 * Strip button: ◈ DKST  left:5280 bottom:18 zIndex:68
 * Custom event: jarvis:dkst-toggle
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AMB = "#FFD700";
const GRN = "#00E5A0";
const RED = "#FF4D6D";
const DIM = "#5A7A9A";
const POLL = 90_000;
const THRESHOLD = 0.04;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const hdrs = { Authorization: `Bearer ${API_KEY}` };

const DKST_RE =
  /\b(dataset.knowledge.scenario|dkst|dataset.triple|knowledge.scenario.dataset|dark.dataset|grounded.dataset|dataset.coverage.triple|which.dataset.have.knowledge|dataset.scenario.knowledge|dataset.kb.scenario|dkst.panel)\b/i;

export function isDkstQuery(t) { return DKST_RE.test(t || ""); }

function tokenize(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function relevance(tokensA, tokensB) {
  const setB = new Set(tokensB);
  const hits = tokensA.filter(w => setB.has(w)).length;
  return hits / Math.max(tokensA.length, 1);
}

function datasetTokens(d) {
  return tokenize([d.name, d.title, d.description, (d.tags || []).join(" "), d.category || "", d.type || ""].join(" "));
}

function articleTokens(a) {
  return tokenize([a.title, a.content, a.topic, (a.tags || []).join(" ")].join(" "));
}

function scenarioTokens(s) {
  return tokenize([s.name, s.title, s.description, s.type, (s.tags || []).join(" ")].join(" "));
}

async function fetchAll() {
  const base = apiBase();
  const [dr, kr, sr] = await Promise.all([
    fetch(`${base}/v1/datasets`,      { headers: hdrs }),
    fetch(`${base}/knowledge/`,       { headers: hdrs }),
    fetch(`${base}/v1/scenario/list`, { headers: hdrs }),
  ]);

  const dd = dr.ok ? await dr.json() : {};
  const kd = kr.ok ? await kr.json() : {};
  const sd = sr.ok ? await sr.json() : {};

  const datasets = (Array.isArray(dd) ? dd : dd?.data || dd?.items || dd?.results || dd?.datasets || []).map(d => ({
    id:          d.id || d._id || String(Math.random()),
    name:        d.name || d.title || "Unnamed Dataset",
    title:       d.title || d.name || "",
    description: d.description || d.summary || "",
    category:    d.category || d.type || "",
    type:        d.type || "",
    tags:        d.tags || [],
  }));

  const articles = (Array.isArray(kd) ? kd : kd?.data || kd?.items || kd?.results || kd?.articles || []).map(a => ({
    id:      a.id || a._id || String(Math.random()),
    title:   a.title || a.name || "Untitled",
    content: a.content || a.body || a.summary || "",
    topic:   a.topic || a.category || "",
    tags:    a.tags || [],
  }));

  const scenarios = (Array.isArray(sd) ? sd : sd?.data || sd?.items || sd?.results || sd?.scenarios || []).map(s => ({
    id:          s.id || s._id || String(Math.random()),
    name:        s.name || s.title || "Unnamed Scenario",
    description: s.description || s.summary || "",
    type:        s.type || s.category || "",
    tags:        s.tags || [],
  }));

  return { datasets, articles, scenarios };
}

export async function buildDkstScript() {
  try {
    const base = apiBase();
    const { datasets, articles, scenarios } = await fetchAll();
    const classified = datasets.map(d => {
      const dt = datasetTokens(d);
      const kbMatch  = articles.some(a  => relevance(dt, articleTokens(a))   >= THRESHOLD);
      const scnMatch = scenarios.some(s => relevance(dt, scenarioTokens(s))  >= THRESHOLD);
      if (kbMatch && scnMatch) return "FULL_COVERAGE";
      if (kbMatch)              return "KB_ONLY";
      if (scnMatch)             return "SCENARIO_ONLY";
      return "DARK";
    });
    const full  = classified.filter(c => c === "FULL_COVERAGE").length;
    const kbOnly = classified.filter(c => c === "KB_ONLY").length;
    const scnOnly = classified.filter(c => c === "SCENARIO_ONLY").length;
    const dark  = classified.filter(c => c === "DARK").length;
    const darkDs = datasets
      .filter((_, i) => classified[i] === "DARK")
      .slice(0, 3).map(d => d.name).join("; ") || "none";
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...hdrs },
      body: JSON.stringify({
        message: `Dataset × Knowledge × Scenario Triple (DKST): ${datasets.length} datasets, ` +
          `${articles.length} KB articles, ${scenarios.length} scenarios. ` +
          `${full} fully covered, ${kbOnly} KB-only, ${scnOnly} scenario-only, ` +
          `${dark} dark (no match). Dark datasets: ${darkDs}. ` +
          "Assess dataset coverage gaps across the knowledge base and scenario library in exactly 2 sentences.",
      }),
    });
    const j = r.ok ? await r.json() : null;
    return j?.response || j?.reply || j?.content || j?.text ||
      `DKST: ${full} fully covered, ${dark} dark of ${datasets.length} datasets.`;
  } catch {
    return "DKST: unable to fetch assessment.";
  }
}

/* ── Styles ──────────────────────────────────────────────────────── */
const PANEL = {
  position: "fixed",
  bottom: 48,
  left: 5280,
  width: 460,
  height: 540,
  background: "rgba(7,18,28,0.97)",
  border: "1px solid #29E7FF44",
  borderRadius: 10,
  boxShadow: "0 0 28px #29E7FF22",
  display: "flex",
  flexDirection: "column",
  zIndex: 68,
  fontFamily: "'Share Tech Mono','Courier New',monospace",
  color: "#DCEBF5",
  backdropFilter: "blur(14px)",
};

const BTN = {
  position: "fixed",
  left: 5280,
  bottom: 18,
  zIndex: 68,
  background: "rgba(7,18,28,0.88)",
  border: "1px solid #29E7FF55",
  borderRadius: 6,
  color: CY,
  fontFamily: "'Share Tech Mono',monospace",
  fontSize: 11,
  padding: "3px 8px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 5,
};

const STATUS_COLOR = { FULL_COVERAGE: GRN, KB_ONLY: CY, SCENARIO_ONLY: AMB, DARK: RED };
const FILTER_OPTS = ["ALL", "FULL_COVERAGE", "KB_ONLY", "SCENARIO_ONLY", "DARK"];

/* ── Component ───────────────────────────────────────────────────── */
export default function DatasetKnowledgeScenarioTriple() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState(null);
  const [meta,      setMeta]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState(null);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assess,    setAssess]    = useState("");
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { datasets, articles, scenarios } = await fetchAll();
      const enriched = datasets.map(d => {
        const dt = datasetTokens(d);
        const kbMatches = articles
          .map(a => ({ ...a, score: relevance(dt, articleTokens(a)) }))
          .filter(a => a.score >= THRESHOLD)
          .sort((x, y) => y.score - x.score);
        const scnMatches = scenarios
          .map(s => ({ ...s, score: relevance(dt, scenarioTokens(s)) }))
          .filter(s => s.score >= THRESHOLD)
          .sort((x, y) => y.score - x.score);
        const hasKb  = kbMatches.length > 0;
        const hasScn = scnMatches.length > 0;
        const status = hasKb && hasScn ? "FULL_COVERAGE"
                     : hasKb           ? "KB_ONLY"
                     : hasScn          ? "SCENARIO_ONLY"
                     :                   "DARK";
        return { ...d, status, kbMatches, scnMatches };
      });
      enriched.sort((a, b) => {
        const order = { DARK: 0, SCENARIO_ONLY: 1, KB_ONLY: 2, FULL_COVERAGE: 3 };
        return order[a.status] - order[b.status];
      });
      setRows(enriched);
      setMeta({ datasets: datasets.length, articles: articles.length, scenarios: scenarios.length });
    } catch (e) {
      setErr(e.message || "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener("jarvis:dkst-toggle", handler);
    return () => window.removeEventListener("jarvis:dkst-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    pollRef.current = setInterval(load, POLL);
    return () => clearInterval(pollRef.current);
  }, [open, load]);

  const runAssess = async () => {
    setAssessing(true); setAssess("");
    const txt = await buildDkstScript();
    setAssess(txt); setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
  };

  if (!open) {
    const darkCount = rows ? rows.filter(r => r.status === "DARK").length : 0;
    return (
      <button style={BTN} onClick={() => setOpen(true)} title="Dataset × Knowledge × Scenario Triple">
        ◈ DKST
        {darkCount > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 3, fontSize: 9, padding: "1px 4px", fontWeight: 700 }}>
            {darkCount}
          </span>
        )}
      </button>
    );
  }

  const full    = (rows || []).filter(r => r.status === "FULL_COVERAGE").length;
  const kbOnly  = (rows || []).filter(r => r.status === "KB_ONLY").length;
  const scnOnly = (rows || []).filter(r => r.status === "SCENARIO_ONLY").length;
  const dark    = (rows || []).filter(r => r.status === "DARK").length;

  const visible = (rows || []).filter(r => {
    if (filter !== "ALL" && r.status !== filter) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (r.name + r.description + r.category + r.type).toLowerCase().includes(q);
  });

  const toggleRow = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  return (
    <div style={PANEL}>
      {/* Header */}
      <div style={{ padding: "10px 14px 6px", borderBottom: "1px solid #29E7FF22", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 12, letterSpacing: 1 }}>◈ DATASET × KB × SCENARIO TRIPLE</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 5, padding: "8px 14px", borderBottom: "1px solid #29E7FF11", flexWrap: "wrap" }}>
        {[
          { label: "DATASETS",  val: meta?.datasets  || 0, color: CY  },
          { label: "KB ART",    val: meta?.articles  || 0, color: CY  },
          { label: "SCENARIOS", val: meta?.scenarios || 0, color: CY  },
          { label: "FULL COV",  val: full,                 color: GRN },
          { label: "KB ONLY",   val: kbOnly,               color: CY  },
          { label: "SCN ONLY",  val: scnOnly,              color: AMB },
          { label: "DARK",      val: dark,                 color: RED },
        ].map(t => (
          <div key={t.label} style={{ flex: "1 1 auto", minWidth: 54, background: "rgba(41,231,255,0.04)", borderRadius: 5, padding: "5px 4px", textAlign: "center" }}>
            <div style={{ color: t.color, fontSize: 13, fontWeight: 700 }}>{t.val}</div>
            <div style={{ color: DIM, fontSize: 7, letterSpacing: 0.5 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: "flex", gap: 3, padding: "6px 14px 4px", flexWrap: "wrap", alignItems: "center" }}>
        {FILTER_OPTS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ background: filter === f ? CY : "rgba(41,231,255,0.08)", color: filter === f ? "#000" : DIM, border: "none", borderRadius: 4, padding: "2px 6px", fontSize: 9, cursor: "pointer", fontFamily: "inherit" }}>
            {f.replace(/_/g, " ")}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search datasets…"
          style={{ marginLeft: "auto", background: "rgba(41,231,255,0.05)", border: "1px solid #29E7FF22", borderRadius: 4, color: "#DCEBF5", fontFamily: "inherit", fontSize: 10, padding: "2px 8px", width: 120 }} />
      </div>

      {/* Dataset rows */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 14px" }}>
        {loading && !rows && <div style={{ color: DIM, fontSize: 11, textAlign: "center", marginTop: 20 }}>loading…</div>}
        {err && <div style={{ color: RED, fontSize: 11, textAlign: "center", marginTop: 10 }}>{err}</div>}
        {visible.map(d => (
          <div key={d.id} style={{ marginBottom: 6, background: "rgba(41,231,255,0.03)", borderRadius: 6, border: "1px solid #29E7FF18" }}>
            <div onClick={() => toggleRow(d.id)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", cursor: "pointer" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_COLOR[d.status] || DIM, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {d.name}
              </span>
              {d.category && <span style={{ fontSize: 8, color: DIM }}>{d.category.toUpperCase()}</span>}
              <span style={{ fontSize: 9, color: STATUS_COLOR[d.status] || DIM, marginLeft: "auto", whiteSpace: "nowrap" }}>
                {d.status.replace(/_/g, " ")}
              </span>
              <span style={{ color: DIM, fontSize: 10 }}>{expanded[d.id] ? "▲" : "▼"}</span>
            </div>

            {expanded[d.id] && (
              <div style={{ padding: "6px 12px 8px", borderTop: "1px solid #29E7FF11" }}>
                {/* KB matches */}
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 9, color: CY, letterSpacing: 1, marginBottom: 3 }}>KB ARTICLES ({d.kbMatches.length})</div>
                  {d.kbMatches.length === 0 ? (
                    <div style={{ fontSize: 10, color: DIM, fontStyle: "italic" }}>No KB articles matched.</div>
                  ) : d.kbMatches.slice(0, 4).map((a, i) => (
                    <div key={a.id + i} style={{ marginBottom: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</span>
                        {a.topic && <span style={{ fontSize: 8, color: CY, background: "rgba(41,231,255,0.12)", borderRadius: 3, padding: "1px 4px" }}>{a.topic.toUpperCase()}</span>}
                        <span style={{ fontSize: 9, color: GRN }}>{(a.score * 100).toFixed(0)}%</span>
                      </div>
                      <div style={{ height: 2, background: "#1a2a3a", borderRadius: 1, marginTop: 2 }}>
                        <div style={{ height: 2, width: `${Math.min(100, a.score * 400)}%`, background: GRN, borderRadius: 1 }} />
                      </div>
                    </div>
                  ))}
                </div>
                {/* Scenario matches */}
                <div>
                  <div style={{ fontSize: 9, color: AMB, letterSpacing: 1, marginBottom: 3 }}>SCENARIOS ({d.scnMatches.length})</div>
                  {d.scnMatches.length === 0 ? (
                    <div style={{ fontSize: 10, color: DIM, fontStyle: "italic" }}>No scenarios matched.</div>
                  ) : d.scnMatches.slice(0, 4).map((s, i) => (
                    <div key={s.id + i} style={{ marginBottom: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                        {s.type && <span style={{ fontSize: 8, color: AMB, background: "rgba(255,215,0,0.10)", borderRadius: 3, padding: "1px 4px" }}>{s.type.toUpperCase()}</span>}
                        <span style={{ fontSize: 9, color: AMB }}>{(s.score * 100).toFixed(0)}%</span>
                      </div>
                      <div style={{ height: 2, background: "#1a2a3a", borderRadius: 1, marginTop: 2 }}>
                        <div style={{ height: 2, width: `${Math.min(100, s.score * 400)}%`, background: AMB, borderRadius: 1 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        {!loading && visible.length === 0 && rows && (
          <div style={{ color: DIM, fontSize: 11, textAlign: "center", marginTop: 20 }}>No datasets match.</div>
        )}
      </div>

      {/* Assess footer */}
      <div style={{ padding: "6px 14px 10px", borderTop: "1px solid #29E7FF22" }}>
        {assess && <div style={{ fontSize: 10, color: "#DCEBF5", marginBottom: 5, lineHeight: 1.4 }}>{assess}</div>}
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={runAssess} disabled={assessing}
            style={{ flex: 1, background: "rgba(41,231,255,0.10)", border: "1px solid #29E7FF44", borderRadius: 5, color: CY, fontFamily: "inherit", fontSize: 10, padding: "4px 0", cursor: assessing ? "default" : "pointer" }}>
            {assessing ? "assessing…" : "▶ ASSESS"}
          </button>
          <button onClick={load}
            style={{ background: "rgba(41,231,255,0.06)", border: "1px solid #29E7FF33", borderRadius: 5, color: DIM, fontFamily: "inherit", fontSize: 10, padding: "4px 10px", cursor: "pointer" }}>
            ↻
          </button>
        </div>
      </div>
    </div>
  );
}
