/**
 * ScenarioKnowledgeGap — F493
 * "JARVIS, scenario knowledge / knowledge gap scenarios / skgap / unsupported scenarios"
 * Cross-references /v1/scenario/list + /knowledge/.
 * Identifies which scenarios have at least one supporting knowledge article (GROUNDED)
 * vs which lack any knowledge documentation (UNSUPPORTED — operational blind spots).
 * Coverage % tile; filter tabs ALL/GROUNDED/UNSUPPORTED; click to expand matching articles.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const DIM = "#8899AA";
const RED = "#FF4444";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS = 90_000;

const SKGAP_RE =
  /\bscenario.?knowledge\b|\bknowledge.?scenario\b|\bskgap\b|\bunsupported.?scenario\b|\bscenario.?(gap|coverage|grounded|unsupported)\b|\bknowledge.?gap.?scenario\b|\bscenario.?without.?knowledge\b|\bscenario.?knowledge.?gap\b/i;

export function isSkgapQuery(text) {
  return SKGAP_RE.test(text || "");
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

function normaliseScenarios(data) {
  if (!data) return [];
  const raw =
    data.scenarios || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((s, i) => ({
    id:          s.id || `scn-${i}`,
    name:        s.name || s.title || s.scenario_name || `Scenario ${i + 1}`,
    kind:        s.kind || s.type || s.category || "GENERAL",
    description: s.description || s.summary || "",
    status:      s.status || null,
  }));
}

function normaliseArticles(data) {
  if (!data) return [];
  const raw =
    data.articles || data.knowledge || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((a, i) => ({
    id:      a.id || `art-${i}`,
    title:   a.title || a.name || `Article ${i + 1}`,
    kind:    a.kind || a.type || a.category || null,
    summary: a.summary || a.abstract || a.content || null,
    tags:    a.tags || [],
    source:  a.source || null,
  }));
}

function crossRef(scenarios, articles) {
  return scenarios.map((scn) => {
    const haystack = `${scn.name} ${scn.description} ${scn.kind}`;
    const matches = articles
      .map((art) => {
        const hits = overlap(haystack, `${art.title} ${art.summary || ""} ${(art.tags || []).join(" ")}`);
        return hits > 0 ? { ...art, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 5);
    return { ...scn, articles: matches, grounded: matches.length > 0 };
  });
}

export async function buildSkgapScript() {
  try {
    const base = apiBase();
    const [sRes, kRes] = await Promise.all([
      fetch(`${base}/v1/scenario/list`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${base}/knowledge/`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const [sData, kData] = await Promise.all([sRes.json(), kRes.json()]);
    const scenarios = normaliseScenarios(sData);
    const articles  = normaliseArticles(kData);
    const rows      = crossRef(scenarios, articles);
    const grounded  = rows.filter((r) => r.grounded).length;
    const unsupported = rows.length - grounded;
    const pct = rows.length ? Math.round((grounded / rows.length) * 100) : 0;
    if (!rows.length) return "No scenarios found in the catalog, sir.";
    return (
      `Scenario knowledge coverage is ${pct}% — ${grounded} of ${rows.length} scenarios have ` +
      `supporting knowledge articles. ${unsupported} scenario${unsupported !== 1 ? "s" : ""} ` +
      `${unsupported !== 1 ? "are" : "is"} unsupported and represent${unsupported !== 1 ? "" : "s"} operational blind spots.`
    );
  } catch {
    return "Unable to reach scenario or knowledge endpoints, sir.";
  }
}

export default function ScenarioKnowledgeGap() {
  const [open, setOpen]         = useState(false);
  const [scenarios, setScenarios] = useState([]);
  const [articles,  setArticles]  = useState([]);
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
      const [sRes, kRes] = await Promise.all([
        fetch(`${base}/v1/scenario/list`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/knowledge/`,       { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const [sData, kData] = await Promise.all([sRes.json(), kRes.json()]);
      const scns = normaliseScenarios(sData);
      const arts = normaliseArticles(kData);
      setScenarios(scns);
      setArticles(arts);
      setRows(crossRef(scns, arts));
    } catch {
      /* network errors are non-fatal */
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
    const toggle = () => { setOpen((o) => !o); };
    window.addEventListener("jarvis:skgap-toggle", toggle);
    return () => window.removeEventListener("jarvis:skgap-toggle", toggle);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message:
            `Analyse scenario knowledge coverage: ${rows.length} scenarios, ` +
            `${rows.filter((r) => r.grounded).length} grounded, ` +
            `${rows.filter((r) => !r.grounded).length} unsupported. ` +
            `Unsupported: ${rows.filter((r) => !r.grounded).map((r) => r.name).slice(0, 5).join(", ")}. ` +
            "Give a 2-sentence operational assessment and recommended action.",
        }),
      });
      const d = await r.json();
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

  const grounded    = rows.filter((r) => r.grounded).length;
  const unsupported = rows.length - grounded;
  const pct         = rows.length ? Math.round((grounded / rows.length) * 100) : 0;

  const visible = rows
    .filter((r) => {
      if (tab === "GROUNDED")    return r.grounded;
      if (tab === "UNSUPPORTED") return !r.grounded;
      return true;
    })
    .filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q) ||
        (r.kind || "").toLowerCase().includes(q)
      );
    });

  const BTN_LEFT = 20_380;
  const BTN_STYLE = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 8,
    zIndex: 82,
    padding: "4px 10px",
    background: "rgba(5,8,13,0.82)",
    border: `1px solid ${unsupported > 0 ? AMB : CY}55`,
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
    left: BTN_LEFT - 320,
    bottom: 38,
    zIndex: 82,
    width: 380,
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
      <button style={BTN_STYLE} onClick={() => setOpen((o) => !o)} title="Scenario Knowledge Gap">
        ◈ SKGAP
        {unsupported > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 4, padding: "1px 5px", fontSize: 9 }}>
            {unsupported}
          </span>
        )}
      </button>

      {open && (
        <div style={PANEL}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>SCENARIO KNOWLEDGE GAP</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              { label: "SCENARIOS", value: rows.length, color: CY },
              { label: "GROUNDED",  value: grounded,    color: GRN },
              { label: "UNSUPPORTED", value: unsupported, color: unsupported > 0 ? AMB : GRN },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${color}33`, borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
                <div style={{ color, fontSize: 16, fontWeight: "bold" }}>{loading ? "…" : value}</div>
                <div style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* coverage bar */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>KNOWLEDGE COVERAGE</span>
              <span style={{ color: pct >= 70 ? GRN : pct >= 40 ? AMB : RED, fontSize: 10, fontWeight: "bold" }}>{pct}%</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct >= 70 ? GRN : pct >= 40 ? AMB : RED, borderRadius: 2, transition: "width 0.4s" }} />
            </div>
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
            {["ALL", "GROUNDED", "UNSUPPORTED"].map((t) => (
              <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search scenarios…"
            style={{ width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.4)", border: `1px solid ${CY}33`, borderRadius: 5, color: "#DCEBF5", padding: "5px 8px", fontSize: 11, marginBottom: 8, outline: "none" }}
          />

          {/* list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 12 }}>No scenarios match.</div>
            )}
            {visible.map((scn) => (
              <div key={scn.id}
                style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${scn.grounded ? GRN : AMB}33`, borderRadius: 6, padding: "7px 9px", cursor: "pointer" }}
                onClick={() => setExpanded(expanded === scn.id ? null : scn.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ color: scn.grounded ? GRN : AMB, fontSize: 10 }}>{scn.grounded ? "●" : "○"}</span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>{scn.name}</span>
                  <span style={{ color: DIM, fontSize: 9, border: `1px solid ${DIM}44`, borderRadius: 3, padding: "1px 4px" }}>{scn.kind}</span>
                  <span style={{ color: scn.grounded ? GRN : AMB, fontSize: 9 }}>{scn.grounded ? `${scn.articles.length} art.` : "NONE"}</span>
                </div>
                {scn.description && (
                  <div style={{ color: DIM, fontSize: 9, marginBottom: 2 }}>{scn.description.slice(0, 80)}{scn.description.length > 80 ? "…" : ""}</div>
                )}

                {expanded === scn.id && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${CY}22`, paddingTop: 6 }}>
                    {scn.grounded ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {scn.articles.map((art) => (
                          <div key={art.id} style={{ background: "rgba(0,229,160,0.05)", border: `1px solid ${GRN}33`, borderRadius: 4, padding: "5px 7px" }}>
                            <div style={{ color: GRN, fontSize: 10 }}>{art.title}</div>
                            {art.kind && <div style={{ color: DIM, fontSize: 9 }}>{art.kind}</div>}
                            <div style={{ color: DIM, fontSize: 9 }}>relevance hits: {art.hits}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: AMB, fontSize: 10 }}>No knowledge articles found for this scenario — knowledge documentation gap.</div>
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
