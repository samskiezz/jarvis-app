/**
 * F109 — IntelProfile × Dataset × Knowledge
 *         Threat Intelligence Repository Coverage (IDKTREP)
 *
 * Parallel-fetches /entities/IntelProfile + /v1/datasets + /knowledge/.
 * Keyword-correlates each threat actor profile against datasets AND KB articles to classify:
 *   FULLY_DOCUMENTED  (dataset + KB match)
 *   DATA_LINKED       (dataset only)
 *   KB_NOTED          (KB article only)
 *   UNDOCUMENTED      (no backing — intel repository gap)
 *
 * Amber badge on UNDOCUMENTED count.
 * Stat tiles INTEL PROFILES / DATASETS / KB ARTICLES + all four class counts + COVERAGE%.
 * Filter tabs ALL/FULLY_DOCUMENTED/DATA_LINKED/KB_NOTED/UNDOCUMENTED + search.
 * Expand profile → matched dataset cards (purple) + KB article cards (teal)
 *   with relevance bars.
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence intel-repository brief + TTS.
 * Voice trigger: "idktrep/intel profile dataset/threat actor documentation/
 *   undocumented actors/intel repository/actor knowledge coverage".
 * Event: jarvis:idktrep-toggle | 90-s auto-refresh.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_003_960;
const Z_INDEX  = 171;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const IDKTREP_RE = /\b(idktrep|intel[\s-]profile[\s-]dataset|threat[\s-]actor[\s-]doc(?:umentation)?|undocumented[\s-]actors?|intel[\s-]repository|actor[\s-]knowledge[\s-]coverage)\b/i;

const PU    = "#A78BFA";
const TE    = "#2DD4BF";
const AM    = "#F59E0B";
const GR    = "#22C55E";
const CY    = "#00CFFF";
const BG    = "rgba(6,11,22,0.97)";
const BORDER = "rgba(167,139,250,0.18)";
const FONT  = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_DOCUMENTED: GR,
  DATA_LINKED:      PU,
  KB_NOTED:         TE,
  UNDOCUMENTED:     AM,
};

const TABS = ["ALL","FULLY_DOCUMENTED","DATA_LINKED","KB_NOTED","UNDOCUMENTED"];

// ── exports for JarvisBrain ───────────────────────────────────────────────────

export function isIdktrepQuery(text) {
  return IDKTREP_RE.test(text || "");
}

// ── helpers ───────────────────────────────────────────────────────────────────

function norm(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function kwTokens(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function overlap(aStr, bStr) {
  const at = new Set(kwTokens(aStr));
  const bt = kwTokens(bStr);
  if (!at.size || !bt.length) return 0;
  return bt.filter(w => at.has(w)).length / Math.max(at.size, bt.length);
}

function profileKey(p) {
  return [p.name, p.aliases, p.org, p.role, p.tags, p.description, p.id].filter(Boolean).join(" ");
}

function datasetKey(d) {
  return [d.name, d.title, d.description, d.type, d.tags, d.id].filter(Boolean).join(" ");
}

function articleKey(a) {
  return [a.title, a.content, a.summary, a.tags, a.category, a.id].filter(Boolean).join(" ");
}

async function fetchAll() {
  const base = apiBase();
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [ipRes, dsRes, kbRes] = await Promise.all([
    fetch(`${base}/entities/IntelProfile`, { headers }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/v1/datasets`,           { headers }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/knowledge/`,            { headers }).then(r => r.ok ? r.json() : []),
  ]);
  const profiles  = norm(ipRes, ["profiles","data","items","results"]);
  const datasets  = norm(dsRes, ["datasets","data","items","results"]);
  const articles  = norm(kbRes, ["articles","data","items","results"]);
  return { profiles, datasets, articles };
}

function classify(profiles, datasets, articles) {
  return profiles.map(p => {
    const pk = profileKey(p);
    const matchedDatasets = datasets.filter(d => overlap(pk, datasetKey(d)) > 0.08);
    const matchedArticles = articles.filter(a => overlap(pk, articleKey(a)) > 0.08);
    const hasDS = matchedDatasets.length > 0;
    const hasKB = matchedArticles.length > 0;
    const cls =
      hasDS && hasKB ? "FULLY_DOCUMENTED" :
      hasDS           ? "DATA_LINKED"     :
      hasKB           ? "KB_NOTED"        :
                        "UNDOCUMENTED";
    return {
      ...p,
      _class:    cls,
      _datasets: matchedDatasets.map(d => ({ ...d, _rel: overlap(pk, datasetKey(d)) })),
      _articles: matchedArticles.map(a => ({ ...a, _rel: overlap(pk, articleKey(a)) })),
    };
  });
}

export async function buildIdktrepScript() {
  const base    = apiBase();
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const { profiles, datasets, articles } = await fetchAll();
  const rows     = classify(profiles, datasets, articles);
  const total    = rows.length;
  const fullyDoc = rows.filter(r => r._class === "FULLY_DOCUMENTED").length;
  const dataLink = rows.filter(r => r._class === "DATA_LINKED").length;
  const kbNoted  = rows.filter(r => r._class === "KB_NOTED").length;
  const undoc    = rows.filter(r => r._class === "UNDOCUMENTED").length;
  const cov      = total ? Math.round(((fullyDoc + dataLink + kbNoted) / total) * 100) : 0;
  const ctx      = `Intel profiles: ${total}. Datasets: ${datasets.length}. KB articles: ${articles.length}. ` +
                   `Fully documented: ${fullyDoc}. Data-linked: ${dataLink}. KB-noted: ${kbNoted}. Undocumented: ${undoc}. Repository coverage: ${cov}%.`;
  const payload  = {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are JARVIS. Be concise and direct. Two sentences max." },
      { role: "user",   content: `Assess threat intelligence repository coverage: ${ctx}` },
    ],
    max_tokens: 120,
  };
  const chat = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ message: `Assess threat actor intelligence repository coverage. Context: ${ctx}` }),
  }).then(r => r.ok ? r.json() : null);
  const brief = chat?.response || chat?.message || chat?.content || chat?.reply ||
    `Threat intelligence repository coverage is at ${cov} percent, sir. ${undoc} actor profiles remain completely undocumented — no dataset or knowledge base backing — requiring immediate intelligence collection priority.`;
  return brief;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function IntelProfileDatasetKnowledgeCoverage() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [counts,    setCounts]    = useState({ total:0, ds:0, kb:0, fullyDoc:0, dataLink:0, kbNoted:0, undoc:0 });
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState("");
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const timerRef  = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const { profiles, datasets, articles } = await fetchAll();
      const classified = classify(profiles, datasets, articles);
      setRows(classified);
      setCounts({
        total:    classified.length,
        ds:       datasets.length,
        kb:       articles.length,
        fullyDoc: classified.filter(r => r._class === "FULLY_DOCUMENTED").length,
        dataLink: classified.filter(r => r._class === "DATA_LINKED").length,
        kbNoted:  classified.filter(r => r._class === "KB_NOTED").length,
        undoc:    classified.filter(r => r._class === "UNDOCUMENTED").length,
      });
    } catch(e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:idktrep-toggle", handler);
    return () => window.removeEventListener("jarvis:idktrep-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true); setBrief("");
    try {
      const script = await buildIdktrepScript();
      setBrief(script);
      const base    = apiBase();
      const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ text: script }),
      }).then(async r => {
        if (!r.ok) return;
        const blob = await r.blob();
        const url  = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play();
        audio.onended = () => URL.revokeObjectURL(url);
      }).catch(() => {});
    } catch(e) {
      setBrief(String(e?.message || e));
    } finally {
      setAssessing(false);
    }
  }, []);

  if (!open) {
    const undocBadge = counts.undoc > 0;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Threat Intel Repository Coverage (IDKTREP)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${undocBadge ? AM : BORDER}`,
          color: undocBadge ? AM : CY, fontFamily: FONT, fontSize: 10, padding: "3px 7px",
          borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        ◈ IDKTREP{undocBadge ? ` [${counts.undoc}]` : ""}
      </button>
    );
  }

  const cov = counts.total ? Math.round(((counts.fullyDoc + counts.dataLink + counts.kbNoted) / counts.total) * 100) : 0;

  const filtered = rows.filter(r => {
    if (tab !== "ALL" && r._class !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.name || r.title || r.id || "").toLowerCase().includes(q);
    }
    return true;
  });

  const tile = (label, value, color) => (
    <div style={{
      background: "rgba(255,255,255,0.04)", border: `1px solid ${color}33`,
      borderRadius: 6, padding: "6px 10px", textAlign: "center", minWidth: 80,
    }}>
      <div style={{ color, fontSize: 16, fontWeight: 700 }}>{value}</div>
      <div style={{ color: "#8892A4", fontSize: 9, marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <div style={{
      position: "fixed", bottom: 44, left: BTN_LEFT - 200, zIndex: Z_INDEX,
      width: 640, maxHeight: "72vh", display: "flex", flexDirection: "column",
      background: BG, border: `1px solid ${BORDER}`, borderRadius: 10,
      fontFamily: FONT, fontSize: 11, color: "#C8D6E5", boxShadow: "0 8px 32px #000A",
      overflow: "hidden",
    }}>
      {/* header */}
      <div style={{ padding: "10px 14px 6px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: CY, fontWeight: 700, fontSize: 12 }}>
            ◈ IDKTREP — Intel Repository Coverage
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={load} disabled={loading}
              style={{ background: "none", border: `1px solid ${BORDER}`, color: CY,
                fontFamily: FONT, fontSize: 10, padding: "2px 7px", borderRadius: 4, cursor: "pointer" }}>
              {loading ? "…" : "↺"}
            </button>
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: `1px solid ${BORDER}`, color: "#8892A4",
                fontFamily: FONT, fontSize: 10, padding: "2px 7px", borderRadius: 4, cursor: "pointer" }}>
              ✕
            </button>
          </div>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {tile("PROFILES",     counts.total,    CY)}
          {tile("DATASETS",     counts.ds,       PU)}
          {tile("KB ARTICLES",  counts.kb,       TE)}
          {tile("FULLY DOC.",   counts.fullyDoc, GR)}
          {tile("DATA LINKED",  counts.dataLink, PU)}
          {tile("KB NOTED",     counts.kbNoted,  TE)}
          {tile("UNDOC.",       counts.undoc,    AM)}
          {tile("COVERAGE%",    `${cov}%`,       cov >= 70 ? GR : cov >= 40 ? AM : "#EF4444")}
        </div>

        {/* coverage bar */}
        <div style={{ marginTop: 8, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
          <div style={{ height: "100%", width: `${cov}%`, background: cov >= 70 ? GR : AM, borderRadius: 2, transition: "width 0.4s" }} />
        </div>

        {/* tabs */}
        <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                background: tab === t ? "rgba(0,207,255,0.12)" : "none",
                border: `1px solid ${tab === t ? CY : BORDER}`,
                color: tab === t ? CY : "#8892A4", fontFamily: FONT, fontSize: 9,
                padding: "2px 6px", borderRadius: 3, cursor: "pointer",
              }}>
              {t.replace("_", " ")}
            </button>
          ))}
        </div>

        {/* search */}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search actor profiles…"
          style={{
            marginTop: 7, width: "100%", boxSizing: "border-box",
            background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`,
            color: "#C8D6E5", fontFamily: FONT, fontSize: 10, padding: "4px 8px",
            borderRadius: 4, outline: "none",
          }}
        />
      </div>

      {/* list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 10px" }}>
        {err && <div style={{ color: "#EF4444", padding: 8 }}>Error: {err}</div>}
        {!err && filtered.length === 0 && !loading && (
          <div style={{ color: "#8892A4", textAlign: "center", padding: 16 }}>No profiles match.</div>
        )}
        {filtered.map((row, i) => {
          const isExp = expanded === i;
          const clsColor = CLASS_COLOR[row._class] || AM;
          return (
            <div key={row.id || i} style={{
              marginBottom: 5, border: `1px solid ${clsColor}33`,
              borderRadius: 6, overflow: "hidden",
            }}>
              <div
                onClick={() => setExpanded(isExp ? null : i)}
                style={{
                  padding: "6px 10px", cursor: "pointer", display: "flex",
                  justifyContent: "space-between", alignItems: "center",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ color: "#EDF2F7", fontWeight: 600 }}>
                    {row.name || row.id || "Unknown Actor"}
                  </span>
                  {row.role && (
                    <span style={{ color: "#8892A4", fontSize: 9, marginLeft: 6 }}>{row.role}</span>
                  )}
                  {row.org && (
                    <span style={{ color: "#8892A4", fontSize: 9, marginLeft: 6 }}>[{row.org}]</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  <span style={{
                    background: `${clsColor}22`, border: `1px solid ${clsColor}55`,
                    color: clsColor, fontSize: 9, padding: "1px 5px", borderRadius: 3,
                  }}>
                    {row._class.replace("_", " ")}
                  </span>
                  <span style={{ color: "#8892A4", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                </div>
              </div>

              {isExp && (
                <div style={{ padding: "8px 10px", background: "rgba(0,0,0,0.2)" }}>
                  {/* Datasets */}
                  {row._datasets.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: PU, fontSize: 9, marginBottom: 4 }}>
                        ◆ DATASETS ({row._datasets.length})
                      </div>
                      {row._datasets.sort((a,b) => b._rel - a._rel).slice(0,5).map((d,j) => (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ color: "#C8D6E5", fontSize: 10 }}>
                              {d.name || d.title || d.id}
                            </span>
                            <span style={{ color: PU, fontSize: 9 }}>
                              {Math.round(d._rel * 100)}%
                            </span>
                          </div>
                          <div style={{ height: 2, background: "rgba(255,255,255,0.07)", borderRadius: 1 }}>
                            <div style={{
                              height: "100%", width: `${Math.round(d._rel * 100)}%`,
                              background: PU, borderRadius: 1,
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* KB Articles */}
                  {row._articles.length > 0 && (
                    <div>
                      <div style={{ color: TE, fontSize: 9, marginBottom: 4 }}>
                        ◇ KB ARTICLES ({row._articles.length})
                      </div>
                      {row._articles.sort((a,b) => b._rel - a._rel).slice(0,5).map((a,j) => (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ color: "#C8D6E5", fontSize: 10 }}>
                              {a.title || a.id}
                            </span>
                            <span style={{ color: TE, fontSize: 9 }}>
                              {Math.round(a._rel * 100)}%
                            </span>
                          </div>
                          <div style={{ height: 2, background: "rgba(255,255,255,0.07)", borderRadius: 1 }}>
                            <div style={{
                              height: "100%", width: `${Math.round(a._rel * 100)}%`,
                              background: TE, borderRadius: 1,
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {row._datasets.length === 0 && row._articles.length === 0 && (
                    <div style={{ color: AM, fontSize: 10 }}>No dataset or KB article matches — actor undocumented.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{ padding: "8px 10px", borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <button onClick={assess} disabled={assessing}
            style={{
              background: "rgba(0,207,255,0.08)", border: `1px solid ${CY}55`,
              color: CY, fontFamily: FONT, fontSize: 10, padding: "4px 12px",
              borderRadius: 4, cursor: assessing ? "not-allowed" : "pointer", flexShrink: 0,
            }}>
            {assessing ? "ASSESSING…" : "▶ ASSESS COVERAGE"}
          </button>
          {brief && (
            <div style={{
              color: "#C8D6E5", fontSize: 10, lineHeight: 1.5,
              background: "rgba(0,207,255,0.05)", border: `1px solid ${CY}22`,
              borderRadius: 4, padding: "4px 8px", flex: 1,
            }}>
              {brief}
            </div>
          )}
        </div>
        <div style={{ color: "#4A5568", fontSize: 9, marginTop: 6 }}>
          Auto-refresh 90 s · /entities/IntelProfile × /v1/datasets × /knowledge/
        </div>
      </div>
    </div>
  );
}
