/**
 * KnowledgeScenarioNexus — F708
 *
 * Polls GET /knowledge/ + GET /v1/scenario/list every 90 s.
 * Cross-references: which knowledge articles are SCRIPTED by ≥1 scenario
 * (keyword overlap in title/description) vs UNSCRIPTED (no scenario backing).
 *
 * Voice intents: "knoscn" | "knowledge scenario" | "scenario knowledge"
 *                | "which knowledge covers scenarios" | "scripted knowledge"
 *                | "knowledge scenario coverage" | "scenario documentation"
 *                | "knowledge playbook coverage"
 * Strip button: ◈ KNOSCN   left:885760  bottom:8  zIndex:244
 * Custom event: jarvis:knoscn-toggle
 *
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFB347";
const DIM = "#566878";
const POLL = 90_000;
const BTN_LEFT = 885760;
const ZIDX = 244;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const KNOSCN_RE =
  /\b(knoscn|knowledge[.\s-]*scenario|scenario[.\s-]*knowledge|which[.\s]*knowledge[.\s]*covers[.\s]*scenario|scripted[.\s]*knowledge|knowledge[.\s]*scenario[.\s]*coverage|scenario[.\s]*doc|knowledge[.\s]*playbook)\b/i;

export function isKnoscnQuery(q) {
  return KNOSCN_RE.test(q || "");
}

export async function buildKnoscnScript() {
  try {
    const [kr, sr] = await Promise.all([
      fetch(`${apiBase()}/knowledge/`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/v1/scenario/list`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const articles  = kr.ok ? ((await kr.json())?.results ?? []) : [];
    const scenarios = sr.ok ? ((await sr.json())?.results ?? (await sr.json()) ?? []) : [];

    if (!articles.length && !scenarios.length)
      return "Knowledge and scenario data are unavailable at present, sir.";

    const scnTokens = scenarios.flatMap(s =>
      `${s.name||s.title||""} ${s.description||""} ${s.kind||""}`.toLowerCase().split(/\W+/).filter(t => t.length > 3)
    );
    const scnSet = new Set(scnTokens);

    const scripted = articles.filter(a => {
      const words = `${a.title||""} ${a.summary||""} ${a.content||""}`.toLowerCase().split(/\W+/).filter(t => t.length > 3);
      return words.some(w => scnSet.has(w));
    });

    const pct = articles.length ? Math.round((scripted.length / articles.length) * 100) : 0;

    const brief = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: `Knowledge × Scenario nexus: ${articles.length} knowledge articles, ${scenarios.length} scenarios, ${scripted.length} articles backed by scenarios (${pct}%). Provide a 2-sentence operational brief on knowledge coverage of scenario playbooks.` }),
    }).then(r => r.ok ? r.json() : null).then(d => d?.response || d?.reply || "").catch(() => "");

    return (
      `Knowledge × Scenario Nexus, sir. ${articles.length} articles, ${scenarios.length} scenarios. ` +
      `${scripted.length} articles (${pct}%) are backed by scenarios; ${articles.length - scripted.length} have no scenario coverage. ` +
      (brief || "")
    ).trim();
  } catch {
    return "I was unable to retrieve the knowledge scenario nexus at this time, sir.";
  }
}

const PANEL = {
  position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)",
  zIndex: ZIDX + 10, width: "min(560px,95vw)",
  background: "rgba(4,8,14,0.94)", border: `1px solid ${CY}44`, borderRadius: 12,
  backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
  boxShadow: `0 0 48px ${CY}18`, fontFamily: "'JetBrains Mono',monospace",
  color: "#DCEBF5", overflow: "hidden",
};
const HDR = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
  background: "rgba(41,231,255,0.05)",
};

function keywords(str) {
  return str.toLowerCase().split(/\W+/).filter(t => t.length > 3);
}

function scoreArticle(article, scnTokenSet) {
  const words = keywords(`${article.title||""} ${article.summary||""} ${article.content||""}`);
  return words.filter(w => scnTokenSet.has(w)).length;
}

function scnBadgeColor(kind) {
  if (!kind) return DIM;
  const k = kind.toLowerCase();
  if (k.includes("attack") || k.includes("threat")) return "#e8203c";
  if (k.includes("resil") || k.includes("recov")) return GRN;
  return AMB;
}

export default function KnowledgeScenarioNexus() {
  const [open, setOpen]       = useState(false);
  const [articles, setArts]   = useState([]);
  const [scenarios, setScns]  = useState([]);
  const [loading, setLoad]    = useState(false);
  const [err, setErr]         = useState(null);
  const [tab, setTab]         = useState("ALL");
  const [q, setQ]             = useState("");
  const [expanded, setExp]    = useState(null);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoad(true); setErr(null);
    try {
      const [kr, sr] = await Promise.all([
        fetch(`${apiBase()}/knowledge/`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${apiBase()}/v1/scenario/list`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      setArts(kr.ok ? ((await kr.json())?.results ?? []) : []);
      const sd = sr.ok ? await sr.json() : {};
      setScns(Array.isArray(sd) ? sd : (sd?.results ?? []));
    } catch (e) { setErr(e.message); }
    finally { setLoad(false); }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, POLL);
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener("jarvis:knoscn-toggle", h);
    return () => window.removeEventListener("jarvis:knoscn-toggle", h);
  }, []);

  const scnTokenSet = new Set(scenarios.flatMap(s =>
    keywords(`${s.name||s.title||""} ${s.description||""} ${s.kind||""}`)));

  const enriched = articles.map(a => {
    const hits = scoreArticle(a, scnTokenSet);
    const matched = hits > 0
      ? scenarios.filter(s => {
          const sw = keywords(`${s.name||s.title||""} ${s.description||""} ${s.kind||""}`);
          const aw = new Set(keywords(`${a.title||""} ${a.summary||""} ${a.content||""}`));
          return sw.some(w => aw.has(w));
        })
      : [];
    return { ...a, hits, matched };
  });

  const scripted   = enriched.filter(a => a.hits > 0);
  const unscripted = enriched.filter(a => a.hits === 0);
  const pct = articles.length ? Math.round((scripted.length / articles.length) * 100) : 0;

  const visible = enriched
    .filter(a => tab === "ALL" || (tab === "SCRIPTED" ? a.hits > 0 : a.hits === 0))
    .filter(a => !q || (a.title||"").toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Knowledge × Scenario coverage nexus"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: ZIDX,
          padding: "4px 10px", background: open ? CY : "rgba(5,8,13,0.75)",
          color: open ? "#04060A" : CY, border: `1px solid ${CY}`,
          borderRadius: 6, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1, cursor: "pointer",
          backdropFilter: "blur(6px)",
        }}
      >
        ◈ KNOSCN
      </button>

      {open && (
        <div style={PANEL}>
          <div style={HDR}>
            <span style={{ color: CY, fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>
              ◈ Knowledge × Scenario Nexus
            </span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {["ALL","SCRIPTED","UNSCRIPTED"].map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  fontSize: 8, padding: "2px 7px", borderRadius: 4,
                  border: `1px solid ${tab===t ? CY : "#2a3a4a"}`,
                  background: tab===t ? `${CY}22` : "transparent",
                  color: tab===t ? CY : DIM, cursor: "pointer",
                  fontFamily: "inherit", textTransform: "uppercase", letterSpacing: 1,
                }}>{t}</button>
              ))}
              <button onClick={() => setOpen(false)} style={{
                background:"none", border:"none", color: DIM,
                cursor:"pointer", fontSize:14, marginLeft:4, lineHeight:1,
              }}>×</button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "10px 14px", flexWrap: "wrap" }}>
            {[
              ["ARTICLES",   articles.length,   CY],
              ["SCENARIOS",  scenarios.length,  AMB],
              ["SCRIPTED",   scripted.length,   GRN],
              ["UNSCRIPTED", unscripted.length, "#e8203c"],
              ["COVERAGE",   `${pct}%`,         pct >= 60 ? GRN : pct >= 30 ? AMB : "#e8203c"],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                flex: "1 1 80px", background: "rgba(41,231,255,0.04)",
                border: `1px solid ${CY}18`, borderRadius: 8, padding: "6px 10px", textAlign:"center",
              }}>
                <div style={{ fontSize: 16, color: col, fontVariantNumeric: "tabular-nums" }}>{val}</div>
                <div style={{ fontSize: 8, color: DIM, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "0 14px 8px" }}>
            <input
              value={q} onChange={e => setQ(e.target.value)}
              placeholder="Filter articles…"
              style={{
                width: "100%", boxSizing: "border-box", background: "rgba(41,231,255,0.04)",
                border: `1px solid ${CY}22`, borderRadius: 6, color: "#DCEBF5",
                fontFamily: "inherit", fontSize: 10, padding: "5px 9px", outline: "none",
              }}
            />
          </div>

          {/* List */}
          <div style={{ padding: "0 14px 10px", maxHeight: 300, overflowY: "auto" }}>
            {loading && !articles.length && (
              <div style={{ color: DIM, fontSize: 10 }}>◌ Loading…</div>
            )}
            {err && <div style={{ color: "#e8203c", fontSize: 10 }}>⚠ {err}</div>}
            {visible.map((a, i) => (
              <div key={a.id || i}>
                <div
                  onClick={() => setExp(exp => exp === i ? null : i)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "5px 0",
                    borderBottom: "1px solid rgba(41,231,255,0.06)", cursor: "pointer",
                  }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    background: a.hits > 0 ? GRN : "#e8203c",
                  }} />
                  <span style={{ flex: 1, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.title || a.id || "Untitled"}
                  </span>
                  {a.hits > 0 && (
                    <span style={{ fontSize: 8, color: GRN, minWidth: 44, textAlign: "right" }}>
                      {a.hits} hit{a.hits !== 1 ? "s" : ""}
                    </span>
                  )}
                  {a.hits === 0 && (
                    <span style={{ fontSize: 8, color: DIM, minWidth: 44, textAlign: "right" }}>—</span>
                  )}
                </div>
                {expanded === i && (
                  <div style={{ padding: "6px 10px 6px 18px", background: "rgba(41,231,255,0.03)", borderRadius: 6, marginBottom: 4 }}>
                    {a.summary && (
                      <div style={{ fontSize: 10, color: "#DCEBF5", marginBottom: 6 }}>{a.summary}</div>
                    )}
                    {a.matched.length > 0 ? (
                      <>
                        <div style={{ fontSize: 8, color: GRN, marginBottom: 4 }}>
                          ✓ Backed by {a.matched.length} scenario{a.matched.length !== 1 ? "s" : ""}:
                        </div>
                        {a.matched.slice(0, 4).map((s, j) => (
                          <div key={j} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <span style={{
                              fontSize: 7, padding: "1px 5px", borderRadius: 3,
                              border: `1px solid ${scnBadgeColor(s.kind)}55`,
                              color: scnBadgeColor(s.kind), textTransform: "uppercase", letterSpacing: 1,
                            }}>{s.kind || "scenario"}</span>
                            <span style={{ fontSize: 9, color: "#DCEBF5" }}>
                              {s.name || s.title || s.id || "Unnamed"}
                            </span>
                          </div>
                        ))}
                        {a.matched.length > 4 && (
                          <div style={{ fontSize: 8, color: DIM }}>+{a.matched.length - 4} more</div>
                        )}
                      </>
                    ) : (
                      <div style={{ fontSize: 9, color: DIM }}>Not backed by any scenario</div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {!loading && !err && visible.length === 0 && (
              <div style={{ color: DIM, fontSize: 10 }}>No articles match.</div>
            )}
          </div>

          <div style={{ padding: "6px 14px", borderTop: `1px solid rgba(41,231,255,0.06)`, fontSize: 8, color: DIM, display: "flex", justifyContent: "space-between" }}>
            <span>Source: /knowledge/ × /v1/scenario/list</span>
            <span style={{ color: loading ? AMB : GRN }}>
              {loading ? "◌ updating" : `${visible.length} shown · ${tab}`}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
