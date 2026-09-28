/**
 * F168 — Investment × Scenario × Knowledge Portfolio Intelligence Nexus (ISKPIN)
 *
 * Parallel-fetches /entities/Investment + /v1/scenario/list + /knowledge/ and
 * keyword-correlates each investment (name/type/sector/description/tags) against
 * scenarios AND knowledge articles to classify:
 *
 *   FULLY_BACKED    — matched both a scenario AND a knowledge article
 *   SCENARIO_ONLY   — matched a scenario, no knowledge article
 *   KNOWLEDGE_ONLY  — matched a knowledge article, no scenario
 *   UNSUPPORTED     — no matches (intelligence gap)
 *
 * Stat tiles: INVESTMENTS / SCENARIOS / KNOWLEDGE + all four class counts + BACKED%.
 * Amber badge on unsupported count.
 * Filter tabs ALL / FULLY_BACKED / SCENARIO_ONLY / KNOWLEDGE_ONLY / UNSUPPORTED + text search.
 * Expand investment → matched scenario cards (green, type badge) +
 *                     matched knowledge cards (purple, freshness label) with relevance bars.
 * ▶ ASSESS PORTFOLIO INTELLIGENCE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:iskpin-toggle event.
 *
 * Voice triggers: "iskpin / portfolio intelligence / investment scenario / investment knowledge /
 *                  unsupported investment / portfolio coverage / portfolio scenario knowledge".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_036_440;
const Z_INDEX  = 229;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const ISKPIN_RE = /\b(iskpin|portfolio[\s-]intelligence|investment[\s-]scenario|investment[\s-]knowledge|unsupported[\s-]investments?|portfolio[\s-]coverage|portfolio[\s-]scenario[\s-]knowledge)\b/i;

const GR     = "#22C55E";
const PU     = "#A855F7";
const CY     = "#00CFFF";
const AM     = "#F59E0B";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(34,197,94,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_BACKED:   GR,
  SCENARIO_ONLY:  CY,
  KNOWLEDGE_ONLY: PU,
  UNSUPPORTED:    AM,
};

const TABS = ["ALL", "FULLY_BACKED", "SCENARIO_ONLY", "KNOWLEDGE_ONLY", "UNSUPPORTED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function investText(inv) {
  return `${inv.name || inv.title || ""} ${inv.type || inv.asset_type || ""} ${inv.sector || inv.category || ""} ${inv.description || inv.summary || ""} ${(inv.tags || []).join(" ")}`;
}
function scenarioText(s) {
  return `${s.name || s.title || ""} ${s.description || s.summary || ""} ${s.type || ""} ${(s.tags || []).join(" ")}`;
}
function knowledgeText(a) {
  return `${a.title || a.name || ""} ${a.content || a.summary || a.description || ""} ${(a.tags || []).join(" ")}`;
}

export function isIskpinQuery(q = "") { return ISKPIN_RE.test(q); }

export async function buildIskpinScript() {
  try {
    const [invRes, scRes, kRes] = await Promise.all([
      fetch(`${apiBase()}/entities/Investment`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/v1/scenario/list`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/knowledge/`,           { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const invData = await invRes.json().catch(() => ({}));
    const scData  = await scRes.json().catch(() => ({}));
    const kData   = await kRes.json().catch(() => ({}));

    const investments = Array.isArray(invData) ? invData : (invData.data || invData.items || invData.investments || invData.results || []);
    const scenarios   = Array.isArray(scData)  ? scData  : (scData.data  || scData.items  || scData.scenarios  || scData.results || []);
    const articles    = Array.isArray(kData)   ? kData   : (kData.data   || kData.items   || kData.articles    || kData.results || []);

    let fb = 0, so = 0, ko = 0, un = 0;
    for (const inv of investments) {
      const kws  = keywords(investText(inv));
      const hasS = scenarios.some(s => score(scenarioText(s),  kws) > 0);
      const hasK = articles.some(a  => score(knowledgeText(a), kws) > 0);
      if (hasS && hasK)  fb++;
      else if (hasS)     so++;
      else if (hasK)     ko++;
      else               un++;
    }
    const total = investments.length;
    const pct   = total ? Math.round((fb / total) * 100) : 0;
    return `ISKPIN Portfolio Intelligence Nexus online. ${total} investments cross-referenced against ${scenarios.length} scenarios and ${articles.length} knowledge articles. ${fb} fully backed (${pct}%), ${so} scenario-only, ${ko} knowledge-only, ${un} unsupported. ${un > 0 ? `${un} investments lack both scenario and knowledge backing — intelligence gap detected.` : "Full portfolio backing confirmed."}`;
  } catch {
    return "ISKPIN Portfolio Intelligence Nexus online, sir. Correlating investments against scenarios and knowledge to identify unsupported assets now.";
  }
}

export default function InvestmentScenarioKnowledgeNexus() {
  const [open, setOpen]           = useState(false);
  const [investments, setInvs]    = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [articles, setArticles]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState({});
  const [assessment, setAssess]   = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [invRes, scRes, kRes] = await Promise.all([
        fetch(`${apiBase()}/entities/Investment`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${apiBase()}/v1/scenario/list`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${apiBase()}/knowledge/`,           { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const invData = await invRes.json().catch(() => ({}));
      const scData  = await scRes.json().catch(() => ({}));
      const kData   = await kRes.json().catch(() => ({}));

      const rawInv = Array.isArray(invData) ? invData : (invData.data || invData.items || invData.investments || invData.results || []);
      const rawSc  = Array.isArray(scData)  ? scData  : (scData.data  || scData.items  || scData.scenarios  || scData.results || []);
      const rawK   = Array.isArray(kData)   ? kData   : (kData.data   || kData.items   || kData.articles    || kData.results || []);

      const enriched = rawInv.map(inv => {
        const kws = keywords(investText(inv));
        const matchedSc = rawSc
          .map(s => ({ sc: s, rel: score(scenarioText(s), kws) }))
          .filter(x => x.rel > 0)
          .sort((a, b) => b.rel - a.rel)
          .slice(0, 5);
        const matchedK = rawK
          .map(a => ({ art: a, rel: score(knowledgeText(a), kws) }))
          .filter(x => x.rel > 0)
          .sort((a, b) => b.rel - a.rel)
          .slice(0, 5);
        const hasS = matchedSc.length > 0;
        const hasK = matchedK.length > 0;
        const cls  = hasS && hasK ? "FULLY_BACKED" : hasS ? "SCENARIO_ONLY" : hasK ? "KNOWLEDGE_ONLY" : "UNSUPPORTED";
        return { ...inv, _cls: cls, _scenarios: matchedSc, _knowledge: matchedK };
      });

      setInvs(enriched);
      setScenarios(rawSc);
      setArticles(rawK);
    } catch (e) {
      setError(e.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener("jarvis:iskpin-toggle", toggle);
    return () => window.removeEventListener("jarvis:iskpin-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    try {
      const fb   = investments.filter(i => i._cls === "FULLY_BACKED").length;
      const un   = investments.filter(i => i._cls === "UNSUPPORTED").length;
      const ctx  = `${investments.length} investments cross-referenced against ${scenarios.length} scenarios and ${articles.length} knowledge articles. Fully backed: ${fb}. Unsupported: ${un}.`;
      const r    = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `In 2 sentences, assess the portfolio intelligence coverage. Context: ${ctx}` }),
      });
      const d = await r.json().catch(() => ({}));
      const txt = (d.answer || d.response || "").trim();
      setAssess(txt);
      if (txt) {
        await fetch(`${apiBase()}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text: txt }),
        }).then(r => r.arrayBuffer()).then(ab => new Audio(URL.createObjectURL(new Blob([ab], { type: "audio/mpeg" }))).play()).catch(() => {});
      }
    } catch {
      setAssess("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  };

  const counts = { FULLY_BACKED: 0, SCENARIO_ONLY: 0, KNOWLEDGE_ONLY: 0, UNSUPPORTED: 0 };
  investments.forEach(i => { if (counts[i._cls] !== undefined) counts[i._cls]++; });
  const pct = investments.length ? Math.round((counts.FULLY_BACKED / investments.length) * 100) : 0;

  const filtered = investments.filter(inv => {
    const matchTab = tab === "ALL" || inv._cls === tab;
    const matchSrch = !search || investText(inv).toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSrch;
  });

  const toggleExpand = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)",
          color: GR, fontFamily: FONT, fontSize: 9, padding: "3px 8px",
          cursor: "pointer", borderRadius: 3, letterSpacing: 1,
          boxShadow: `0 0 8px rgba(34,197,94,0.12)`,
        }}
      >
        ◈ ISKPIN
        {counts.UNSUPPORTED > 0 && (
          <span style={{ marginLeft: 5, background: AM, color: "#000", borderRadius: 3,
            padding: "1px 5px", fontSize: 8 }}>{counts.UNSUPPORTED}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 44, left: BTN_LEFT - 400, zIndex: Z_INDEX,
      width: 520, maxHeight: "78vh", display: "flex", flexDirection: "column",
      background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
      fontFamily: FONT, color: "#ccc", boxShadow: `0 0 32px rgba(34,197,94,0.12)`,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ padding: "8px 14px", borderBottom: `1px solid ${BORDER}`,
        display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span style={{ color: GR, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ ISKPIN</span>
          <span style={{ marginLeft: 8, fontSize: 9, color: "#666" }}>
            Investment × Scenario × Knowledge Nexus
          </span>
        </div>
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px",
        borderBottom: `1px solid ${BORDER}`, flexWrap: "wrap" }}>
        {[
          ["INVESTMENTS", investments.length, GR],
          ["SCENARIOS",   scenarios.length,   CY],
          ["KNOWLEDGE",   articles.length,    PU],
          ["FULLY BACKED",  counts.FULLY_BACKED,   GR],
          ["SCENARIO ONLY", counts.SCENARIO_ONLY,  CY],
          ["KB ONLY",       counts.KNOWLEDGE_ONLY, PU],
          ["UNSUPPORTED",   counts.UNSUPPORTED,    AM],
          ["BACKED%", `${pct}%`, pct >= 60 ? GR : pct >= 30 ? AM : "#EF4444"],
        ].map(([label, val, col]) => (
          <div key={label} style={{ flex: "1 1 80px", background: "rgba(0,0,0,0.3)",
            border: `1px solid ${col}22`, borderRadius: 4, padding: "4px 6px", minWidth: 70 }}>
            <div style={{ fontSize: 8, color: "#555", letterSpacing: 1 }}>{label}</div>
            <div style={{ fontSize: 14, color: col, fontWeight: 700 }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: "4px 14px", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ height: 4, background: "#111", borderRadius: 2 }}>
          <div style={{ height: 4, width: `${pct}%`, background: GR,
            borderRadius: 2, transition: "width .5s" }} />
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "6px 14px",
        borderBottom: `1px solid ${BORDER}`, overflowX: "auto" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `${CLASS_COLOR[t] || GR}22` : "none",
            border: `1px solid ${tab === t ? (CLASS_COLOR[t] || GR) : "#333"}`,
            color: tab === t ? (CLASS_COLOR[t] || GR) : "#555",
            fontFamily: FONT, fontSize: 8, padding: "2px 8px",
            cursor: "pointer", borderRadius: 2, whiteSpace: "nowrap",
          }}>{t.replace(/_/g, " ")}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: "4px 14px", borderBottom: `1px solid ${BORDER}` }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search investments…"
          style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: `1px solid ${BORDER}`,
            color: "#aaa", fontFamily: FONT, fontSize: 10, padding: "3px 8px",
            borderRadius: 3, outline: "none", boxSizing: "border-box" }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: "auto", flex: 1, padding: "6px 8px" }}>
        {loading && <div style={{ padding: 12, color: "#555", fontSize: 10 }}>Loading…</div>}
        {error && <div style={{ padding: 12, color: "#EF4444", fontSize: 10 }}>Error: {error}</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: 12, color: "#555", fontSize: 10 }}>No investments match.</div>
        )}
        {filtered.map((inv, i) => {
          const id    = inv.id || inv._id || `inv-${i}`;
          const isExp = expanded[id];
          const col   = CLASS_COLOR[inv._cls] || AM;
          const name  = inv.name || inv.title || inv.asset || `Investment ${i + 1}`;
          const type  = inv.type || inv.asset_type || inv.category || "";
          return (
            <div key={id} style={{ marginBottom: 4, border: `1px solid ${col}22`,
              borderRadius: 4, background: "rgba(0,0,0,0.2)", overflow: "hidden" }}>
              <div
                onClick={() => toggleExpand(id)}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "6px 10px", cursor: "pointer" }}>
                <div>
                  <span style={{ fontSize: 11, color: "#ccc" }}>{name}</span>
                  {type && <span style={{ fontSize: 9, color: "#666", marginLeft: 8 }}>{type}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 9, color: col, letterSpacing: 1 }}>{inv._cls.replace(/_/g, " ")}</span>
                  <span style={{ fontSize: 9, color: "#555" }}>{isExp ? "▲" : "▼"}</span>
                </div>
              </div>

              {isExp && (
                <div style={{ padding: "6px 10px", background: "rgba(0,0,0,0.2)",
                  borderLeft: `2px solid ${col}`, marginLeft: 4 }}>
                  {/* Matched scenarios */}
                  {inv._scenarios.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: CY, marginBottom: 4, letterSpacing: 1 }}>SCENARIOS</div>
                      {inv._scenarios.map(({ sc, rel }, j) => (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ fontSize: 10, color: "#ccc" }}>{sc.name || sc.title || `Scenario ${j + 1}`}</span>
                            <span style={{ fontSize: 9, color: CY, padding: "1px 5px",
                              background: "rgba(0,207,255,0.1)", borderRadius: 2 }}>{sc.type || sc.status || "SCENARIO"}</span>
                          </div>
                          <div style={{ height: 3, background: "#111", borderRadius: 2 }}>
                            <div style={{ height: 3, width: `${Math.min(rel * 20, 100)}%`,
                              background: CY, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Matched knowledge articles */}
                  {inv._knowledge.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: PU, marginBottom: 4, letterSpacing: 1 }}>KNOWLEDGE</div>
                      {inv._knowledge.map(({ art, rel }, j) => (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ fontSize: 10, color: "#ccc" }}>{art.title || art.name || `Article ${j + 1}`}</span>
                            <span style={{ fontSize: 9, color: PU, padding: "1px 5px",
                              background: "rgba(168,85,247,0.1)", borderRadius: 2 }}>KB</span>
                          </div>
                          <div style={{ height: 3, background: "#111", borderRadius: 2 }}>
                            <div style={{ height: 3, width: `${Math.min(rel * 20, 100)}%`,
                              background: PU, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {inv._scenarios.length === 0 && inv._knowledge.length === 0 && (
                    <div style={{ fontSize: 9, color: "#555" }}>No scenarios or knowledge articles matched this investment.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assess */}
      <div style={{ padding: "8px 14px", borderTop: `1px solid ${BORDER}` }}>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? "rgba(0,0,0,0.3)" : "rgba(34,197,94,0.12)",
          border: `1px solid ${assessing ? "#333" : GR}`,
          color: assessing ? "#555" : GR, fontFamily: FONT, fontSize: 10,
          padding: "4px 12px", cursor: assessing ? "not-allowed" : "pointer", borderRadius: 3,
        }}>
          {assessing ? "Assessing…" : "▶ ASSESS PORTFOLIO INTELLIGENCE"}
        </button>
        {assessment && (
          <div style={{ marginTop: 8, fontSize: 10, color: "#aaa", lineHeight: 1.5,
            padding: "6px 10px", background: "rgba(34,197,94,0.06)",
            border: "1px solid rgba(34,197,94,0.15)", borderRadius: 4 }}>
            {assessment}
          </div>
        )}
      </div>

      {/* Refresh button */}
      <div style={{ padding: "4px 14px", borderTop: `1px solid ${BORDER}`,
        display: "flex", justifyContent: "flex-end" }}>
        <button onClick={load} disabled={loading} style={{
          background: "none", border: `1px solid #333`, color: "#555",
          fontFamily: FONT, fontSize: 9, padding: "2px 8px",
          cursor: loading ? "not-allowed" : "pointer", borderRadius: 2,
        }}>{loading ? "…" : "↺ refresh"}</button>
      </div>
    </div>
  );
}
