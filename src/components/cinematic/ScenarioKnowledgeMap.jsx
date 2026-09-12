/**
 * F72 — Scenario × Knowledge Intelligence Map (SKIM)
 *
 * Parallel-fetches /v1/scenario/list and /knowledge/, then keyword-correlates
 * each scenario (name, description, tags) against KB articles (title, content,
 * tags, topic) to surface:
 *
 *   DOCUMENTED — at least one KB article covers the scenario
 *   BLIND      — no KB backing found for this scenario
 *
 * Stat tiles: scenarios / articles / documented / blind
 * Filter tabs: ALL | DOCUMENTED | BLIND + text search
 * Expand scenario → matched KB articles with topic badge + relevance score bar.
 * Amber badge on blind count.
 * ▶ ASSESS: 2-sentence knowledge-scenario brief via /v1/jarvis/agent/chat +
 *   jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SKIM  at left:1860 bottom:18, zIndex:68.
 * Event:   jarvis:skim-toggle
 * Voice:   "scenario knowledge / knowledge scenario / skim / blind scenarios /
 *           undocumented scenarios / kb scenario / knowledge gaps /
 *           scenario kb coverage / which scenarios have knowledge /
 *           scenario documentation / scenario intel coverage"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1860;
const POLL_MS  = 90_000;
const AMBER    = "#F59E0B";
const CYAN     = "#29E7FF";
const GREEN    = "#34D399";
const SLATE    = "#6E8AA0";
const VIOLET   = "#A78BFA";
const ROSE     = "#FB7185";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const SKIM_RE =
  /\b(scenario\s+knowledge|knowledge\s+scenario[s]?|skim|blind\s+scenario[s]?|undocumented\s+scenario[s]?|kb\s+scenario[s]?|scenario\s+kb|scenario\s+coverage|scenario\s+documentation|which\s+scenarios\s+(have|lack)\s+knowledge|knowledge\s+gap[s]?|scenario\s+intel\s+coverage|scenario\s+kb\s+coverage|skim\s+panel|scenario\s+knowledge\s+map)\b/i;

export function isSkimQuery(q) { return SKIM_RE.test(q); }

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseScenarios(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : (raw?.items ?? raw?.data ?? raw?.scenarios ?? raw?.results ?? []);
  return arr.map((x) => ({
    id:          x.id ?? x._id ?? String(Math.random()),
    name:        String(x.name ?? x.title ?? "Scenario"),
    description: String(x.description ?? x.summary ?? x.objective ?? ""),
    tags:        Array.isArray(x.tags) ? x.tags.join(" ") : String(x.tags ?? ""),
  }));
}

function normaliseArticles(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : (raw?.items ?? raw?.data ?? raw?.articles ?? raw?.results ?? []);
  return arr.map((x) => ({
    id:      x.id ?? x._id ?? String(Math.random()),
    title:   String(x.title ?? x.name ?? "Article"),
    topic:   String(x.topic ?? x.category ?? x.type ?? ""),
    content: String(x.content ?? x.body ?? x.summary ?? x.text ?? ""),
    tags:    Array.isArray(x.tags) ? x.tags.join(" ") : String(x.tags ?? ""),
  }));
}

function relevance(scenario, article) {
  const haystack = [article.title, article.topic, article.content.slice(0, 400), article.tags]
    .join(" ")
    .toLowerCase();
  const needles = [scenario.name, scenario.description, scenario.tags]
    .join(" ")
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);
  let score = 0;
  needles.forEach((n) => { if (haystack.includes(n)) score += 1; });
  return score;
}

function correlate(scenarios, articles) {
  return scenarios.map((sc) => {
    const matches = articles
      .map((art) => ({ art, score: relevance(sc, art) }))
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    return { ...sc, matches, documented: matches.length > 0 };
  });
}

// ── async build helper exported for JarvisBrain ───────────────────────────────

export async function buildSkimScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [scRes, kbRes] = await Promise.all([
      fetch(`${base}/v1/scenario/list`, { headers: hdr }),
      fetch(`${base}/knowledge/`,       { headers: hdr }),
    ]);
    const scenarios = normaliseScenarios(await scRes.json());
    const articles  = normaliseArticles(await kbRes.json());
    const correlated = correlate(scenarios, articles);

    const documented = correlated.filter((s) => s.documented).length;
    const blind      = scenarios.length - documented;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS scenario × knowledge intelligence map: ${scenarios.length} operational scenarios ` +
          `cross-referenced against ${articles.length} knowledge-base articles. ` +
          `${documented} scenarios are DOCUMENTED (KB coverage found); ${blind} are BLIND (no KB backing). ` +
          `Provide a 2-sentence knowledge-scenario coverage brief — formal British butler tone, ` +
          `first person, highlight any critical intelligence gaps requiring immediate KB authoring.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Knowledge-scenario coverage analysis complete, sir.").trim();
  } catch {
    return "Scenario knowledge map unavailable at this time, sir.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export default function ScenarioKnowledgeMap() {
  const [open,      setOpen]      = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [rows,      setRows]      = useState([]);
  const [articles,  setArticles]  = useState([]);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const [err,       setErr]       = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [scRes, kbRes] = await Promise.all([
        fetch(`${base}/v1/scenario/list`, { headers: hdr }),
        fetch(`${base}/knowledge/`,       { headers: hdr }),
      ]);
      if (!scRes.ok || !kbRes.ok) throw new Error("fetch failed");
      const scenarios = normaliseScenarios(await scRes.json());
      const arts      = normaliseArticles(await kbRes.json());
      setRows(correlate(scenarios, arts));
      setArticles(arts);
      setErr("");
    } catch (e) {
      setErr(String(e.message ?? "Load failed"));
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jarvis:skim-toggle", handler);
    return () => window.removeEventListener("jarvis:skim-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    const script = await buildSkimScript();
    setBrief(script);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
  }, []);

  if (!open) {
    const blind = rows.filter((r) => !r.documented).length;
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position:     "fixed",
          left:         BTN_LEFT,
          bottom:       18,
          zIndex:       68,
          background:   blind > 0 ? "rgba(245,158,11,0.15)" : "rgba(0,0,0,0.55)",
          border:       `1px solid ${blind > 0 ? AMBER : "#29E7FF44"}`,
          borderRadius: 6,
          color:        blind > 0 ? AMBER : CYAN,
          fontFamily:   "monospace",
          fontSize:     11,
          padding:      "4px 8px",
          cursor:       "pointer",
          whiteSpace:   "nowrap",
        }}
      >
        ◈ SKIM{blind > 0 ? ` [${blind}]` : ""}
      </button>
    );
  }

  const documented = rows.filter((r) => r.documented).length;
  const blind      = rows.length - documented;

  const visible = rows.filter((r) => {
    if (tab === "DOCUMENTED" && !r.documented) return false;
    if (tab === "BLIND"      &&  r.documented) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.tags.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const panelStyle = {
    position:     "fixed",
    bottom:       60,
    left:         BTN_LEFT,
    width:        520,
    maxHeight:    520,
    overflowY:    "auto",
    background:   "rgba(8,16,26,0.97)",
    border:       "1px solid #29E7FF33",
    borderRadius: 10,
    zIndex:       68,
    padding:      16,
    fontFamily:   "monospace",
    color:        "#C8D8E8",
    fontSize:     12,
  };

  const tile = (label, val, col) => (
    <div style={{
      flex: 1, textAlign: "center", background: "rgba(255,255,255,0.04)",
      borderRadius: 6, padding: "6px 4px",
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: col }}>{val}</div>
      <div style={{ fontSize: 10, color: SLATE }}>{label}</div>
    </div>
  );

  const tabBtn = (label) => (
    <button key={label} onClick={() => setTab(label)} style={{
      background:   tab === label ? "#29E7FF22" : "transparent",
      border:       `1px solid ${tab === label ? CYAN : "#29E7FF33"}`,
      borderRadius: 4,
      color:        tab === label ? CYAN : SLATE,
      fontFamily:   "monospace",
      fontSize:     11,
      padding:      "2px 8px",
      cursor:       "pointer",
    }}>{label}</button>
  );

  return (
    <div style={panelStyle}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ color: AMBER, fontWeight: 700, fontSize: 13 }}>
          ◈ SCENARIO × KNOWLEDGE MAP
        </span>
        <button onClick={() => setOpen(false)} style={{
          background: "transparent", border: "none", color: SLATE,
          cursor: "pointer", fontSize: 14,
        }}>✕</button>
      </div>

      {err && <div style={{ color: ROSE, marginBottom: 8, fontSize: 11 }}>{err}</div>}

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {tile("SCENARIOS",  rows.length,     CYAN)}
        {tile("KB ARTICLES", articles.length, VIOLET)}
        {tile("DOCUMENTED", documented,       GREEN)}
        {tile("BLIND",      blind,            AMBER)}
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {["ALL", "DOCUMENTED", "BLIND"].map(tabBtn)}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          style={{
            marginLeft: "auto",
            background: "rgba(255,255,255,0.06)",
            border:     "1px solid #29E7FF33",
            borderRadius: 4,
            color:      "#C8D8E8",
            fontSize:   11,
            padding:    "2px 6px",
            width:      100,
          }}
        />
      </div>

      {/* rows */}
      {visible.length === 0 && (
        <div style={{ color: SLATE, textAlign: "center", padding: 16 }}>No results.</div>
      )}
      {visible.map((sc) => (
        <div key={sc.id} style={{
          background:   "rgba(255,255,255,0.03)",
          border:       `1px solid ${sc.documented ? "#34D39955" : AMBER + "55"}`,
          borderRadius: 6,
          marginBottom: 6,
          overflow:     "hidden",
        }}>
          <div
            onClick={() => setExpanded(expanded === sc.id ? null : sc.id)}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", cursor: "pointer" }}
          >
            <span style={{
              fontSize:    10,
              fontWeight:  700,
              padding:     "1px 6px",
              borderRadius: 3,
              background:  sc.documented ? "rgba(52,211,153,0.15)" : "rgba(245,158,11,0.2)",
              color:       sc.documented ? GREEN : AMBER,
            }}>
              {sc.documented ? "DOCUMENTED" : "BLIND"}
            </span>
            <span style={{ flex: 1, fontWeight: 600, color: "#E0EEFF" }}>{sc.name}</span>
            <span style={{ color: SLATE, fontSize: 10 }}>
              {sc.documented ? `${sc.matches.length} article${sc.matches.length !== 1 ? "s" : ""}` : "—"}
            </span>
          </div>

          {expanded === sc.id && sc.matches.length > 0 && (
            <div style={{ borderTop: "1px solid #29E7FF22", padding: "8px 10px" }}>
              {sc.matches.map(({ art, score }) => {
                const maxScore = Math.max(...sc.matches.map((m) => m.score), 1);
                return (
                  <div key={art.id} style={{
                    display: "flex", alignItems: "center", gap: 8, marginBottom: 5,
                  }}>
                    {art.topic && (
                      <span style={{
                        fontSize:    9,
                        fontWeight:  700,
                        padding:     "1px 5px",
                        borderRadius: 3,
                        background:  "rgba(167,139,250,0.2)",
                        color:       VIOLET,
                        whiteSpace:  "nowrap",
                      }}>
                        {art.topic.toUpperCase().slice(0, 12)}
                      </span>
                    )}
                    <span style={{ flex: 1, color: "#C8D8E8", fontSize: 11 }}>{art.title}</span>
                    <div style={{ width: 60, background: "#1E2A38", borderRadius: 3, height: 6 }}>
                      <div style={{
                        width:        `${Math.round((score / maxScore) * 100)}%`,
                        height:       "100%",
                        background:   GREEN,
                        borderRadius: 3,
                      }} />
                    </div>
                    <span style={{ width: 22, textAlign: "right", color: GREEN, fontSize: 10 }}>
                      {score}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {expanded === sc.id && sc.matches.length === 0 && (
            <div style={{ padding: "6px 10px", color: SLATE, fontSize: 11, borderTop: "1px solid #29E7FF22" }}>
              No KB article correlations — scenario is knowledge-blind.
            </div>
          )}
        </div>
      ))}

      {/* assess */}
      <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "flex-start" }}>
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            background:   "rgba(245,158,11,0.15)",
            border:       `1px solid ${AMBER}`,
            borderRadius: 4,
            color:        AMBER,
            fontFamily:   "monospace",
            fontSize:     11,
            padding:      "4px 10px",
            cursor:       assessing ? "not-allowed" : "pointer",
          }}
        >
          {assessing ? "Assessing…" : "▶ ASSESS"}
        </button>
        {brief && (
          <div style={{
            flex:         1,
            color:        "#C8D8E8",
            fontSize:     11,
            lineHeight:   1.5,
            background:   "rgba(255,255,255,0.04)",
            borderRadius: 6,
            padding:      "6px 8px",
          }}>
            {brief}
          </div>
        )}
      </div>
    </div>
  );
}
