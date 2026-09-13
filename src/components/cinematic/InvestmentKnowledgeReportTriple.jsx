/**
 * F119 — Investment × Knowledge × Report Triple (IKRT)
 *
 * Parallel-fetches /entities/Investment, /knowledge/, /v1/reports every 90 s.
 * Keyword-correlates each investment against KB articles AND the report catalog
 * to classify:
 *
 *  FULL_COVERAGE — matched by at least one KB article AND one report
 *  REPORT_ONLY   — matched by report only
 *  KB_ONLY       — matched by KB article only
 *  DARK          — no overlap with either (intelligence gap)
 *
 * Stat tiles: investments / articles / reports / dark
 * Amber badge on dark count.
 * Filter tabs: ALL / FULL_COVERAGE / REPORT_ONLY / KB_ONLY / DARK + text search.
 * Expand investment → matched KB articles list + matched reports list
 *   with topic/type badge + relevance score bar.
 * ▶ ASSESS: 2-sentence brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ IKRT  at left:3960 bottom:18, zIndex:68
 * Event:   jarvis:ikrt-toggle
 * Voice:   "investment knowledge report / ikrt / portfolio knowledge /
 *           investment report coverage / funded knowledge / investment intelligence"
 * Refresh: 90 s auto-poll
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const PURP  = "#A78BFA";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 3960;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const CLASS_COLOR = {
  FULL_COVERAGE: GREEN,
  REPORT_ONLY:   CY,
  KB_ONLY:       PURP,
  DARK:          AMBER,
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseInvestments(raw) {
  return normaliseArray(raw).map((inv, i) => ({
    id:          String(inv.id ?? inv.investment_id ?? i),
    name:        inv.name ?? inv.title ?? inv.asset ?? `Investment ${i + 1}`,
    description: inv.description ?? inv.notes ?? inv.summary ?? "",
    sector:      inv.sector ?? inv.type ?? inv.category ?? "",
    tags:        Array.isArray(inv.tags) ? inv.tags : [],
  }));
}

function normaliseArticles(raw) {
  return normaliseArray(raw).map((a, i) => ({
    id:      String(a.id ?? a.article_id ?? i),
    title:   a.title ?? a.name ?? `Article ${i + 1}`,
    content: a.content ?? a.body ?? a.summary ?? "",
    topic:   a.topic ?? a.category ?? a.type ?? "",
    tags:    Array.isArray(a.tags) ? a.tags : [],
  }));
}

function normaliseReports(raw) {
  return normaliseArray(raw).map((r, i) => ({
    id:      String(r.id ?? r.report_id ?? i),
    title:   r.title ?? r.name ?? `Report ${i + 1}`,
    content: r.content ?? r.body ?? r.summary ?? r.description ?? "",
    type:    r.type ?? r.report_type ?? r.category ?? "",
    tags:    Array.isArray(r.tags) ? r.tags : [],
  }));
}

function tokenise(text) {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3);
}

function correlate(investment, items, fieldFn) {
  const invTokens = new Set([
    ...tokenise(investment.name),
    ...tokenise(investment.description),
    ...tokenise(investment.sector),
    ...investment.tags.flatMap(tokenise),
  ]);
  const matches = [];
  for (const item of items) {
    const itemTokens = tokenise(fieldFn(item));
    const hits = itemTokens.filter(t => invTokens.has(t)).length;
    if (hits > 0) matches.push({ ...item, score: hits });
  }
  return matches.sort((a, b) => b.score - a.score);
}

function articleFields(a) {
  return `${a.title} ${a.content} ${a.topic} ${a.tags.join(" ")}`;
}

function reportFields(r) {
  return `${r.title} ${r.content} ${r.type} ${r.tags.join(" ")}`;
}

function classify(kbMatches, rptMatches) {
  const hasKb  = kbMatches.length > 0;
  const hasRpt = rptMatches.length > 0;
  if (hasKb && hasRpt) return "FULL_COVERAGE";
  if (hasRpt)          return "REPORT_ONLY";
  if (hasKb)           return "KB_ONLY";
  return "DARK";
}

// ─── exported helpers for JarvisBrain wiring ─────────────────────────────────

export function isIkrtQuery(q) {
  return /\b(ikrt|investment\s*knowledge\s*report|portfolio\s*knowledge|investment\s*report\s*coverage|funded\s*knowledge|investment\s*intelligence\s*triple)\b/i.test(q);
}

export async function buildIkrtScript() {
  try {
    const base = apiBase();
    const hdrs = { Authorization: `Bearer ${API_KEY}` };
    const [invRaw, kbRaw, rptRaw] = await Promise.all([
      fetch(`${base}/entities/Investment`, { headers: hdrs }).then(r => r.json()).catch(() => []),
      fetch(`${base}/knowledge/`,          { headers: hdrs }).then(r => r.json()).catch(() => []),
      fetch(`${base}/v1/reports`,          { headers: hdrs }).then(r => r.json()).catch(() => []),
    ]);
    const investments = normaliseInvestments(invRaw);
    const articles    = normaliseArticles(kbRaw);
    const reports     = normaliseReports(rptRaw);

    let full = 0, rptOnly = 0, kbOnly = 0, dark = 0;
    for (const inv of investments) {
      const c = classify(
        correlate(inv, articles, articleFields),
        correlate(inv, reports, reportFields),
      );
      if (c === "FULL_COVERAGE") full++;
      else if (c === "REPORT_ONLY") rptOnly++;
      else if (c === "KB_ONLY")     kbOnly++;
      else dark++;
    }
    const pct = investments.length > 0 ? Math.round((full / investments.length) * 100) : 0;
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `IKRT summary: ${investments.length} investments correlated against ${articles.length} KB articles and ${reports.length} reports. Full-coverage: ${full}, report-only: ${rptOnly}, KB-only: ${kbOnly}, dark: ${dark}. Portfolio intelligence coverage: ${pct}%. Provide a 2-sentence operational brief on portfolio intelligence gaps.`,
      }),
    });
    const d = await r.json();
    return d.response ?? d.message ?? d.result ?? "IKRT brief unavailable.";
  } catch {
    return "IKRT assessment unavailable.";
  }
}

// ─── sub-components ──────────────────────────────────────────────────────────

function StatTile({ label, value, accent, pulse }) {
  return (
    <div style={{
      flex: 1, background: `${accent}11`, border: `1px solid ${accent}33`,
      borderRadius: 4, padding: "6px 4px", textAlign: "center",
    }}>
      {pulse && (
        <div style={{
          width: 6, height: 6, borderRadius: "50%", background: accent,
          margin: "0 auto 2px",
          animation: "ikrt-pulse 1.2s ease-in-out infinite",
        }} />
      )}
      <div style={{ fontSize: 14, fontWeight: 700, color: accent }}>{value}</div>
      <div style={{ fontSize: 6, color: MUTED, letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

function ScoreBar({ score, max, color }) {
  const pct = max > 0 ? Math.min(100, (score / max) * 100) : 0;
  return (
    <div style={{ height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, marginTop: 2 }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2 }} />
    </div>
  );
}

function InvestmentRow({ investment }) {
  const [open, setOpen] = useState(false);
  const cls    = investment._class;
  const col    = CLASS_COLOR[cls] ?? MUTED;
  const maxKb  = investment._kbMatches.length  > 0 ? investment._kbMatches[0].score  : 1;
  const maxRpt = investment._rptMatches.length > 0 ? investment._rptMatches[0].score : 1;

  return (
    <div style={{ borderBottom: `1px solid ${CY}11`, paddingBottom: 6, marginBottom: 6 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 8, fontWeight: 700, color: col }}>{cls}</span>
          {investment.sector && (
            <span style={{
              marginLeft: 5, fontSize: 6, color: "#000", background: PURP,
              borderRadius: 2, padding: "1px 4px",
            }}>{investment.sector}</span>
          )}
          <div style={{ fontSize: 8, color: CY, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {investment.name}
          </div>
          <div style={{ fontSize: 7, color: MUTED }}>
            {investment._kbMatches.length} KB articles · {investment._rptMatches.length} reports
          </div>
        </div>
        <span style={{ fontSize: 8, color: MUTED, marginLeft: 6 }}>{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div style={{ marginTop: 6, paddingLeft: 8 }}>
          {investment._kbMatches.length > 0 && (
            <>
              <div style={{ fontSize: 7, color: MUTED, letterSpacing: 1, marginBottom: 3 }}>KB ARTICLES</div>
              {investment._kbMatches.slice(0, 5).map(art => (
                <div key={art.id} style={{ marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {art.topic && (
                      <span style={{
                        fontSize: 6, color: "#000", background: PURP,
                        borderRadius: 2, padding: "1px 3px",
                      }}>{art.topic}</span>
                    )}
                    <span style={{ fontSize: 7, color: CY }}>{art.title}</span>
                  </div>
                  <ScoreBar score={art.score} max={maxKb} color={CY} />
                </div>
              ))}
            </>
          )}
          {investment._rptMatches.length > 0 && (
            <>
              <div style={{ fontSize: 7, color: MUTED, letterSpacing: 1, marginTop: 4, marginBottom: 3 }}>REPORTS</div>
              {investment._rptMatches.slice(0, 5).map(rpt => (
                <div key={rpt.id} style={{ marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {rpt.type && (
                      <span style={{
                        fontSize: 6, color: "#000", background: GREEN,
                        borderRadius: 2, padding: "1px 3px",
                      }}>{rpt.type}</span>
                    )}
                    <span style={{ fontSize: 7, color: GREEN }}>{rpt.title}</span>
                  </div>
                  <ScoreBar score={rpt.score} max={maxRpt} color={GREEN} />
                </div>
              ))}
            </>
          )}
          {investment._kbMatches.length === 0 && investment._rptMatches.length === 0 && (
            <div style={{ fontSize: 7, color: MUTED }}>No matches — DARK investment.</div>
          )}
        </div>
      )}
    </div>
  );
}

const TABS = ["ALL", "FULL_COVERAGE", "REPORT_ONLY", "KB_ONLY", "DARK"];

// ─── main component ───────────────────────────────────────────────────────────

export default function InvestmentKnowledgeReportTriple() {
  const [open,        setOpen]        = useState(false);
  const [investments, setInvestments] = useState([]);
  const [kbCount,     setKbCount]     = useState(0);
  const [rptCount,    setRptCount]    = useState(0);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const [tab,         setTab]         = useState("ALL");
  const [search,      setSearch]      = useState("");
  const [assessing,   setAssessing]   = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const base = apiBase();
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [invRaw, kbRaw, rptRaw] = await Promise.all([
        fetch(`${base}/entities/Investment`, { headers: hdrs }).then(r => r.json()).catch(() => []),
        fetch(`${base}/knowledge/`,          { headers: hdrs }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/reports`,          { headers: hdrs }).then(r => r.json()).catch(() => []),
      ]);
      const invs  = normaliseInvestments(invRaw);
      const arts  = normaliseArticles(kbRaw);
      const rpts  = normaliseReports(rptRaw);
      setKbCount(arts.length);
      setRptCount(rpts.length);
      const enriched = invs.map(inv => {
        const km = correlate(inv, arts, articleFields);
        const rm = correlate(inv, rpts, reportFields);
        return { ...inv, _kbMatches: km, _rptMatches: rm, _class: classify(km, rm) };
      });
      setInvestments(enriched);
    } catch (e) {
      setError(e.message ?? "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener("jarvis:ikrt-toggle", handler);
    return () => window.removeEventListener("jarvis:ikrt-toggle", handler);
  }, []);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildIkrtScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } finally {
      setAssessing(false);
    }
  }, [assessing]);

  const dark    = investments.filter(i => i._class === "DARK");
  const full    = investments.filter(i => i._class === "FULL_COVERAGE");
  const rptOnly = investments.filter(i => i._class === "REPORT_ONLY");
  const kbOnly  = investments.filter(i => i._class === "KB_ONLY");

  const filtered = investments
    .filter(i => tab === "ALL" || i._class === tab)
    .filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <style>{`@keyframes ikrt-pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>

      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 18,
          zIndex: 68,
          background: open ? CY : "rgba(41,231,255,0.13)",
          border: `1px solid ${open ? CY : `${CY}44`}`,
          color: open ? "#000" : CY,
          fontFamily: MONO, fontSize: 9, fontWeight: 700,
          padding: "4px 8px", borderRadius: 3, cursor: "pointer", letterSpacing: 1,
        }}
      >
        {dark.length > 0 && (
          <span style={{
            display: "inline-block", marginRight: 4,
            background: AMBER, color: "#000",
            borderRadius: "50%", fontSize: 7, fontWeight: 700,
            width: 14, height: 14, lineHeight: "14px", textAlign: "center",
          }}>{dark.length}</span>
        )}
        ◈ IKRT {open ? "▲" : "▼"}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 10, bottom: 55, zIndex: 68,
          width: 480, maxHeight: "74vh",
          background: BG, border: `1px solid ${CY}44`,
          borderRadius: 6, fontFamily: MONO,
          display: "flex", flexDirection: "column",
          boxShadow: `0 0 30px ${CY}22`,
        }}>
          {/* header */}
          <div style={{
            padding: "8px 12px", borderBottom: `1px solid ${CY}33`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div>
              <span style={{ fontSize: 10, fontWeight: 700, color: CY, letterSpacing: 2 }}>
                ◈ INVESTMENT × KNOWLEDGE × REPORT TRIPLE
              </span>
              {loading && (
                <span style={{ fontSize: 7, color: MUTED, marginLeft: 8 }}>polling…</span>
              )}
            </div>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? `${CY}1A` : `${CY}26`,
                border: `1px solid ${CY}66`, color: CY,
                fontFamily: MONO, fontSize: 8, padding: "3px 8px",
                borderRadius: 3, cursor: assessing ? "wait" : "pointer",
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* primary stat tiles */}
          <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
            <StatTile label="INVESTMENTS"  value={investments.length} accent={CY} />
            <StatTile label="FULL COV"     value={full.length}        accent={GREEN} />
            <StatTile label="REPORT ONLY"  value={rptOnly.length}     accent={CY} />
            <StatTile label="DARK"         value={dark.length}        accent={AMBER} pulse={dark.length > 0} />
          </div>

          {/* secondary stat tiles */}
          <div style={{ display: "flex", gap: 6, padding: "0 12px 8px" }}>
            <StatTile label="KB ARTICLES" value={kbCount}        accent={PURP} />
            <StatTile label="REPORTS"     value={rptCount}       accent={GREEN} />
            <StatTile label="KB ONLY"     value={kbOnly.length}  accent={PURP} />
          </div>

          {error && (
            <div style={{ padding: "4px 12px", fontSize: 8, color: AMBER }}>{error}</div>
          )}

          {/* filter tabs + search */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "0 12px 8px", alignItems: "center" }}>
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? CY : "transparent",
                  border: `1px solid ${tab === t ? CY : `${MUTED}44`}`,
                  color: tab === t ? "#000" : MUTED,
                  fontFamily: MONO, fontSize: 7, fontWeight: 700,
                  padding: "2px 6px", borderRadius: 2, cursor: "pointer", letterSpacing: 1,
                }}
              >
                {t}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search investments…"
              style={{
                flex: 1, minWidth: 80,
                background: `${CY}0D`, border: `1px solid ${CY}33`,
                borderRadius: 2, color: CY, fontFamily: MONO, fontSize: 8,
                padding: "2px 6px", outline: "none",
              }}
            />
          </div>

          {/* list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 12px" }}>
            {filtered.length === 0 && !loading ? (
              <div style={{ fontSize: 8, color: MUTED, padding: "12px 0", textAlign: "center" }}>
                {investments.length === 0 ? "No investments loaded." : "No investments match filter."}
              </div>
            ) : (
              filtered.map(inv => <InvestmentRow key={inv.id} investment={inv} />)
            )}
          </div>
        </div>
      )}
    </>
  );
}
