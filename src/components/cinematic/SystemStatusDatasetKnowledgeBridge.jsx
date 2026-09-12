/**
 * SystemStatusDatasetKnowledgeBridge — F250 (SDKB)
 *
 * Parallel-fetches /v1/jarvis/system/status + /v1/datasets + /knowledge/ every 90 s.
 * Keyword-correlates each service name/health entry from system status
 * against the dataset catalog (name/description/category/tags) AND
 * knowledge articles (title/content/topic/tags).
 * Classification:
 *   FULL_COVERAGE — service matched in both datasets AND knowledge
 *   DATA_ONLY     — matched in datasets only
 *   KB_ONLY       — matched in knowledge only
 *   DARK          — matched in neither
 * Amber badge on DARK count.
 *
 * Voice intents: "system dataset knowledge / sdkb / service data /
 *                system kb / system knowledge / service documentation /
 *                service dataset / which services have data /
 *                dark services / service coverage"
 * Strip button: ◈ SDKB  left:5400 bottom:18 zIndex:68
 * Custom event: jarvis:sdkb-toggle
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

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const hdrs = { Authorization: `Bearer ${API_KEY}` };

const SDKB_RE =
  /\b(system.dataset.knowledge|sdkb|service.data(?:set)?|system.kb|system.knowledge|service.documentation|service.dataset|which.service.have.data|dark.service|service.coverage)\b/i;

export function isSdkbQuery(t) { return SDKB_RE.test(t || ""); }

function tokenize(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function relevance(serviceTokens, item) {
  const b = tokenize([
    item.name, item.title, item.description,
    item.category, item.topic,
    (item.tags || []).join(" "),
    (item.content || "").slice(0, 300),
  ].join(" "));
  const setB = new Set(b);
  const hits = serviceTokens.filter(w => setB.has(w)).length;
  return hits / Math.max(serviceTokens.length, 1);
}

async function fetchAll() {
  const base = apiBase();
  const [sr, dr, kr] = await Promise.all([
    fetch(`${base}/v1/jarvis/system/status`, { headers: hdrs }),
    fetch(`${base}/v1/datasets`,             { headers: hdrs }),
    fetch(`${base}/knowledge/`,              { headers: hdrs }),
  ]);
  const sd = sr.ok ? await sr.json() : {};
  const dd = dr.ok ? await dr.json() : {};
  const kd = kr.ok ? await kr.json() : {};

  // Extract services from system status
  const rawServices = sd?.services || sd?.components || sd?.data?.services || [];
  const services = (Array.isArray(rawServices) ? rawServices : Object.entries(
    typeof rawServices === "object" ? rawServices : {}
  ).map(([name, val]) => ({
    name,
    status: typeof val === "string" ? val : val?.status || val?.health || "unknown",
    health: typeof val === "object" ? val?.health || val?.status || "unknown" : val,
  }))).map(s => ({
    id:     String(s.id || s.name || Math.random()),
    name:   s.name || s.service || s.id || "Unknown Service",
    status: s.status || s.health || "unknown",
  }));

  const datasets = (Array.isArray(dd) ? dd : dd?.data || dd?.items || dd?.results || dd?.datasets || []).map(d => ({
    id:          String(d.id || d._id || Math.random()),
    name:        d.name || d.title || "Unnamed Dataset",
    description: d.description || d.summary || "",
    category:    d.category || d.type || "",
    tags:        d.tags || [],
  }));

  const articles = (Array.isArray(kd) ? kd : kd?.data || kd?.items || kd?.results || kd?.articles || []).map(a => ({
    id:      String(a.id || a._id || Math.random()),
    title:   a.title || a.name || "Untitled",
    topic:   a.topic || a.category || "",
    content: a.content || a.summary || a.body || "",
    tags:    a.tags || [],
  }));

  return { services, datasets, articles };
}

export async function buildSdkbScript() {
  try {
    const base = apiBase();
    const { services, datasets, articles } = await fetchAll();
    const threshold = 0.04;
    const classified = services.map(s => {
      const tokens = tokenize(s.name);
      const dsMatches  = datasets.filter(d  => relevance(tokens, d)  >= threshold);
      const kbMatches  = articles.filter(a  => relevance(tokens, a)  >= threshold);
      const hasDat = dsMatches.length > 0;
      const hasKb  = kbMatches.length > 0;
      const status = hasDat && hasKb ? "FULL_COVERAGE" : hasDat ? "DATA_ONLY" : hasKb ? "KB_ONLY" : "DARK";
      return { ...s, status, dsMatches, kbMatches };
    });
    const dark = classified.filter(s => s.status === "DARK");
    const full = classified.filter(s => s.status === "FULL_COVERAGE");
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...hdrs },
      body: JSON.stringify({
        message: `System Status × Dataset × Knowledge Bridge (SDKB): ${services.length} services, ` +
          `${datasets.length} datasets, ${articles.length} KB articles. ` +
          `${full.length} FULL_COVERAGE, ${dark.length} DARK (no data or knowledge). ` +
          `Dark services: ${dark.slice(0, 3).map(s => s.name).join("; ") || "none"}. ` +
          "Assess service documentation coverage gaps in exactly 2 sentences.",
      }),
    });
    const d = r.ok ? await r.json() : null;
    return d?.response || d?.reply || d?.content || d?.text ||
      `SDKB: ${full.length}/${services.length} services fully covered, ${dark.length} dark.`;
  } catch {
    return "SDKB: unable to fetch assessment.";
  }
}

/* ── Styles ─────────────────────────────────────────────────────── */
const PANEL = {
  position: "fixed",
  bottom: 48,
  left: 5400,
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
  left: 5400,
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

const STATUS_COLOR = {
  FULL_COVERAGE: GRN,
  DATA_ONLY:     CY,
  KB_ONLY:       AMB,
  DARK:          RED,
};

/* ── Component ─────────────────────────────────────────────────── */
export default function SystemStatusDatasetKnowledgeBridge() {
  const [open,      setOpen]      = useState(false);
  const [data,      setData]      = useState(null);
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
      const { services, datasets, articles } = await fetchAll();
      const threshold = 0.04;
      const enriched = services.map(s => {
        const tokens = tokenize(s.name);
        const dsMatches = datasets
          .map(d => ({ ...d, score: relevance(tokens, d) }))
          .filter(d => d.score >= threshold)
          .sort((x, y) => y.score - x.score);
        const kbMatches = articles
          .map(a => ({ ...a, score: relevance(tokens, a) }))
          .filter(a => a.score >= threshold)
          .sort((x, y) => y.score - x.score);
        const hasDat = dsMatches.length > 0;
        const hasKb  = kbMatches.length > 0;
        const coverageStatus =
          hasDat && hasKb ? "FULL_COVERAGE" :
          hasDat ? "DATA_ONLY" :
          hasKb  ? "KB_ONLY"   : "DARK";
        return { ...s, coverageStatus, dsMatches, kbMatches };
      });
      setData({ services: enriched, datasets, articles });
    } catch (e) {
      setErr(e.message || "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:sdkb-toggle", toggle);
    return () => window.removeEventListener("jarvis:sdkb-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    pollRef.current = setInterval(load, POLL);
    return () => clearInterval(pollRef.current);
  }, [open, load]);

  const runAssess = async () => {
    setAssessing(true); setAssess("");
    const txt = await buildSdkbScript();
    setAssess(txt); setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
  };

  if (!open) {
    const darkCount = data ? data.services.filter(s => s.coverageStatus === "DARK").length : 0;
    return (
      <button style={BTN} onClick={() => setOpen(true)} title="System Status × Dataset × Knowledge Bridge">
        ◈ SDKB
        {darkCount > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 3, fontSize: 9, padding: "1px 4px", fontWeight: 700 }}>
            {darkCount}
          </span>
        )}
      </button>
    );
  }

  const services = data?.services || [];
  const full     = services.filter(s => s.coverageStatus === "FULL_COVERAGE");
  const dataOnly = services.filter(s => s.coverageStatus === "DATA_ONLY");
  const kbOnly   = services.filter(s => s.coverageStatus === "KB_ONLY");
  const dark     = services.filter(s => s.coverageStatus === "DARK");

  const visible = services.filter(s => {
    if (filter !== "ALL" && s.coverageStatus !== filter) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return s.name.toLowerCase().includes(q);
  });

  const toggleRow = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  return (
    <div style={PANEL}>
      {/* Header */}
      <div style={{ padding: "10px 14px 6px", borderBottom: "1px solid #29E7FF22", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 11, letterSpacing: 0.8 }}>◈ SYSTEM STATUS × DATASET × KNOWLEDGE</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 5, padding: "8px 14px", borderBottom: "1px solid #29E7FF11" }}>
        {[
          { label: "SVCS",      val: services.length,  color: CY  },
          { label: "FULL",      val: full.length,      color: GRN },
          { label: "DATA_ONLY", val: dataOnly.length,  color: CY  },
          { label: "KB_ONLY",   val: kbOnly.length,    color: AMB },
          { label: "DARK",      val: dark.length,      color: RED },
        ].map(t => (
          <div key={t.label} style={{ flex: 1, background: "rgba(41,231,255,0.04)", borderRadius: 5, padding: "5px 3px", textAlign: "center" }}>
            <div style={{ color: t.color, fontSize: 13, fontWeight: 700 }}>{t.val}</div>
            <div style={{ color: DIM, fontSize: 8, letterSpacing: 0.4 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: "flex", gap: 4, padding: "6px 14px 4px", flexWrap: "wrap" }}>
        {["ALL", "FULL_COVERAGE", "DATA_ONLY", "KB_ONLY", "DARK"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ background: filter === f ? CY : "rgba(41,231,255,0.08)", color: filter === f ? "#000" : DIM, border: "none", borderRadius: 4, padding: "2px 7px", fontSize: 9, cursor: "pointer", fontFamily: "inherit" }}>
            {f}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search services…"
          style={{ marginLeft: "auto", background: "rgba(41,231,255,0.05)", border: "1px solid #29E7FF22", borderRadius: 4, color: "#DCEBF5", fontFamily: "inherit", fontSize: 10, padding: "2px 7px", width: 110 }} />
      </div>

      {/* Service list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 14px" }}>
        {loading && !data && <div style={{ color: DIM, fontSize: 11, textAlign: "center", marginTop: 20 }}>loading…</div>}
        {err && <div style={{ color: RED, fontSize: 11, textAlign: "center", marginTop: 10 }}>{err}</div>}
        {visible.map(s => (
          <div key={s.id} style={{ marginBottom: 6, background: "rgba(41,231,255,0.03)", borderRadius: 6, border: "1px solid #29E7FF18" }}>
            <div onClick={() => toggleRow(s.id)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", cursor: "pointer" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_COLOR[s.coverageStatus] || DIM, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.name}
              </span>
              {s.status && (
                <span style={{ fontSize: 9, color: DIM, flexShrink: 0 }}>{s.status}</span>
              )}
              <span style={{ fontSize: 9, color: STATUS_COLOR[s.coverageStatus] || DIM, marginLeft: 4, flexShrink: 0 }}>
                {s.coverageStatus}
              </span>
              <span style={{ color: DIM, fontSize: 10, flexShrink: 0 }}>{expanded[s.id] ? "▲" : "▼"}</span>
            </div>

            {expanded[s.id] && (
              <div style={{ padding: "4px 12px 8px", borderTop: "1px solid #29E7FF11" }}>
                {/* Datasets */}
                <div style={{ fontSize: 9, color: CY, letterSpacing: 1, marginBottom: 3 }}>DATASETS ({s.dsMatches.length})</div>
                {s.dsMatches.length === 0 ? (
                  <div style={{ fontSize: 10, color: DIM, fontStyle: "italic", marginBottom: 5 }}>No datasets matched.</div>
                ) : (
                  s.dsMatches.slice(0, 4).map((d, i) => (
                    <div key={d.id + i} style={{ marginBottom: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                        {d.category && (
                          <span style={{ fontSize: 8, color: CY, background: "rgba(41,231,255,0.10)", borderRadius: 3, padding: "1px 4px" }}>
                            {d.category}
                          </span>
                        )}
                        <span style={{ fontSize: 9, color: GRN }}>{(d.score * 100).toFixed(0)}%</span>
                      </div>
                      <div style={{ height: 2, background: "#1a2a3a", borderRadius: 1, marginTop: 2 }}>
                        <div style={{ height: 2, width: `${Math.min(100, d.score * 400)}%`, background: GRN, borderRadius: 1 }} />
                      </div>
                    </div>
                  ))
                )}

                {/* KB Articles */}
                <div style={{ fontSize: 9, color: AMB, letterSpacing: 1, marginTop: 5, marginBottom: 3 }}>KNOWLEDGE ({s.kbMatches.length})</div>
                {s.kbMatches.length === 0 ? (
                  <div style={{ fontSize: 10, color: DIM, fontStyle: "italic" }}>No KB articles matched.</div>
                ) : (
                  s.kbMatches.slice(0, 4).map((a, i) => (
                    <div key={a.id + i} style={{ marginBottom: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</span>
                        {a.topic && (
                          <span style={{ fontSize: 8, color: AMB, background: "rgba(255,215,0,0.10)", borderRadius: 3, padding: "1px 4px" }}>
                            {a.topic}
                          </span>
                        )}
                        <span style={{ fontSize: 9, color: AMB }}>{(a.score * 100).toFixed(0)}%</span>
                      </div>
                      <div style={{ height: 2, background: "#1a2a3a", borderRadius: 1, marginTop: 2 }}>
                        <div style={{ height: 2, width: `${Math.min(100, a.score * 400)}%`, background: AMB, borderRadius: 1 }} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
        {!loading && visible.length === 0 && data && (
          <div style={{ color: DIM, fontSize: 11, textAlign: "center", marginTop: 20 }}>No services match.</div>
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
