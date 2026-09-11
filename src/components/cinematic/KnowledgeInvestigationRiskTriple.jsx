/**
 * F117 — Knowledge × Investigation × Risk Signal Triple (KIRNT)
 *
 * Parallel-fetches /knowledge/, /v1/investigations, /entities/RiskSignal
 * every 90 s.  Keyword-correlates each KB article against open
 * investigation cases AND active risk signals to classify:
 *
 *  FULL_COVERAGE — matched by at least one investigation AND one risk signal
 *  INV_ONLY      — matched by investigation only
 *  RISK_ONLY     — matched by risk signal only
 *  DARK          — no overlap with either
 *
 * Stat tiles: articles / investigations / risk signals / dark
 * Amber badge on dark count.
 * Filter tabs: ALL / FULL_COVERAGE / INV_ONLY / RISK_ONLY / DARK + text search.
 * Expand article → matched investigations list + matched risk signals list
 *   with severity badge + relevance score bar.
 * ▶ ASSESS: 2-sentence brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ KIRNT  at left:3900 bottom:18, zIndex:68
 * Event:   jarvis:kirnt-toggle
 * Voice:   "knowledge triple / kirnt / kb triple / knowledge investigation risk /
 *           knowledge coverage triple / dark knowledge"
 * Refresh: 90 s auto-poll
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3B6B";
const PURP  = "#A78BFA";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 3900;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const SEV_COLORS = { CRITICAL: RED, HIGH: AMBER, MEDIUM: "#F59E0B", LOW: CY, INFO: MUTED };

const CLASS_COLOR = {
  FULL_COVERAGE: GREEN,
  INV_ONLY:      CY,
  RISK_ONLY:     PURP,
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

function normaliseArticles(raw) {
  return normaliseArray(raw).map((a, i) => ({
    id:      String(a.id ?? a.article_id ?? i),
    title:   a.title ?? a.name ?? `Article ${i + 1}`,
    content: a.content ?? a.body ?? a.summary ?? "",
    topic:   a.topic ?? a.category ?? a.type ?? "",
    tags:    Array.isArray(a.tags) ? a.tags : [],
  }));
}

function normaliseInvestigations(raw) {
  return normaliseArray(raw).map((inv, i) => ({
    id:          String(inv.id ?? inv.investigation_id ?? i),
    title:       inv.title ?? inv.name ?? `Investigation ${i + 1}`,
    description: inv.description ?? inv.details ?? inv.summary ?? "",
    seeds:       Array.isArray(inv.seeds) ? inv.seeds.map(s => String(s.value ?? s)).join(" ") : "",
    annotations: Array.isArray(inv.annotations)
      ? inv.annotations.map(a => `${a.actor ?? ""} ${a.text ?? ""}`).join(" ")
      : "",
  }));
}

function normaliseRiskSignals(raw) {
  return normaliseArray(raw).map((r, i) => ({
    id:          String(r.id ?? r.signal_id ?? i),
    title:       r.title ?? r.name ?? r.signal_name ?? `Signal ${i + 1}`,
    description: r.description ?? r.details ?? "",
    severity:    (r.severity ?? r.level ?? r.priority ?? "INFO").toUpperCase(),
    category:    r.category ?? r.type ?? "",
    tags:        Array.isArray(r.tags) ? r.tags : [],
  }));
}

function tokenise(text) {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3);
}

function correlateInv(article, invs) {
  const artTokens = new Set([
    ...tokenise(article.title),
    ...tokenise(article.content),
    ...tokenise(article.topic),
    ...article.tags.flatMap(tokenise),
  ]);
  const matches = [];
  for (const inv of invs) {
    const invTokens = tokenise(
      `${inv.title} ${inv.description} ${inv.seeds} ${inv.annotations}`
    );
    const hits = invTokens.filter(t => artTokens.has(t)).length;
    if (hits > 0) matches.push({ ...inv, score: hits });
  }
  return matches.sort((a, b) => b.score - a.score);
}

function correlateRisk(article, signals) {
  const artTokens = new Set([
    ...tokenise(article.title),
    ...tokenise(article.content),
    ...tokenise(article.topic),
    ...article.tags.flatMap(tokenise),
  ]);
  const matches = [];
  for (const sig of signals) {
    const sigTokens = tokenise(
      `${sig.title} ${sig.description} ${sig.category} ${sig.tags.join(" ")}`
    );
    const hits = sigTokens.filter(t => artTokens.has(t)).length;
    if (hits > 0) matches.push({ ...sig, score: hits });
  }
  return matches.sort((a, b) => b.score - a.score);
}

function classify(invMatches, riskMatches) {
  const hasInv  = invMatches.length > 0;
  const hasRisk = riskMatches.length > 0;
  if (hasInv && hasRisk) return "FULL_COVERAGE";
  if (hasInv)            return "INV_ONLY";
  if (hasRisk)           return "RISK_ONLY";
  return "DARK";
}

// ─── exported helpers for JarvisBrain wiring ─────────────────────────────────

export function isKirntQuery(q) {
  return /\b(kirnt|knowledge\s*triple|kb\s*triple|knowledge\s*investigation\s*risk|knowledge\s*coverage\s*triple|dark\s*knowledge)\b/i.test(q);
}

export async function buildKirntScript() {
  try {
    const base = apiBase();
    const hdrs = { Authorization: `Bearer ${API_KEY}` };
    const [kbRaw, invRaw, rsRaw] = await Promise.all([
      fetch(`${base}/knowledge/`, { headers: hdrs }).then(r => r.json()).catch(() => []),
      fetch(`${base}/v1/investigations`, { headers: hdrs }).then(r => r.json()).catch(() => []),
      fetch(`${base}/entities/RiskSignal`, { headers: hdrs }).then(r => r.json()).catch(() => []),
    ]);
    const articles = normaliseArticles(kbRaw);
    const invs     = normaliseInvestigations(invRaw);
    const signals  = normaliseRiskSignals(rsRaw);

    let full = 0, invOnly = 0, riskOnly = 0, dark = 0;
    for (const art of articles) {
      const c = classify(correlateInv(art, invs), correlateRisk(art, signals));
      if (c === "FULL_COVERAGE") full++;
      else if (c === "INV_ONLY")  invOnly++;
      else if (c === "RISK_ONLY") riskOnly++;
      else dark++;
    }
    const pct = articles.length > 0 ? Math.round((full / articles.length) * 100) : 0;
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `KIRNT summary: ${articles.length} KB articles correlated against ${invs.length} investigations and ${signals.length} risk signals. Full-coverage: ${full}, investigation-only: ${invOnly}, risk-only: ${riskOnly}, dark: ${dark}. Coverage rate: ${pct}%. Provide a 2-sentence operational brief.`,
      }),
    });
    const d = await r.json();
    return d.response ?? d.message ?? d.result ?? "KIRNT brief unavailable.";
  } catch {
    return "KIRNT assessment unavailable.";
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
          animation: "pulse-ring 1.2s ease-in-out infinite",
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

function ArticleRow({ article }) {
  const [open, setOpen] = useState(false);
  const cls  = article._class;
  const col  = CLASS_COLOR[cls] ?? MUTED;
  const maxI = article._invMatches.length > 0 ? article._invMatches[0].score : 1;
  const maxR = article._riskMatches.length > 0 ? article._riskMatches[0].score : 1;

  return (
    <div style={{ borderBottom: `1px solid ${CY}11`, paddingBottom: 6, marginBottom: 6 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 8, fontWeight: 700, color: col }}>{cls}</span>
          {article.topic && (
            <span style={{
              marginLeft: 5, fontSize: 6, color: "#000", background: PURP,
              borderRadius: 2, padding: "1px 4px",
            }}>{article.topic}</span>
          )}
          <div style={{ fontSize: 8, color: CY, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {article.title}
          </div>
          <div style={{ fontSize: 7, color: MUTED }}>
            {article._invMatches.length} inv · {article._riskMatches.length} signals
          </div>
        </div>
        <span style={{ fontSize: 8, color: MUTED, marginLeft: 6 }}>{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div style={{ marginTop: 6, paddingLeft: 8 }}>
          {article._invMatches.length > 0 && (
            <>
              <div style={{ fontSize: 7, color: MUTED, letterSpacing: 1, marginBottom: 3 }}>INVESTIGATIONS</div>
              {article._invMatches.slice(0, 5).map(inv => (
                <div key={inv.id} style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 7, color: CY }}>{inv.title}</div>
                  <ScoreBar score={inv.score} max={maxI} color={CY} />
                </div>
              ))}
            </>
          )}
          {article._riskMatches.length > 0 && (
            <>
              <div style={{ fontSize: 7, color: MUTED, letterSpacing: 1, marginTop: 4, marginBottom: 3 }}>RISK SIGNALS</div>
              {article._riskMatches.slice(0, 5).map(sig => (
                <div key={sig.id} style={{ marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{
                      fontSize: 6, fontWeight: 700, color: "#000",
                      background: SEV_COLORS[sig.severity] ?? MUTED,
                      borderRadius: 2, padding: "1px 3px",
                    }}>{sig.severity}</span>
                    <span style={{ fontSize: 7, color: PURP }}>{sig.title}</span>
                  </div>
                  <ScoreBar score={sig.score} max={maxR} color={SEV_COLORS[sig.severity] ?? MUTED} />
                </div>
              ))}
            </>
          )}
          {article._invMatches.length === 0 && article._riskMatches.length === 0 && (
            <div style={{ fontSize: 7, color: MUTED }}>No matches — DARK article.</div>
          )}
        </div>
      )}
    </div>
  );
}

const TABS = ["ALL", "FULL_COVERAGE", "INV_ONLY", "RISK_ONLY", "DARK"];

// ─── main component ───────────────────────────────────────────────────────────

export default function KnowledgeInvestigationRiskTriple() {
  const [open,      setOpen]      = useState(false);
  const [articles,  setArticles]  = useState([]);
  const [invCount,  setInvCount]  = useState(0);
  const [rsCount,   setRsCount]   = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const base = apiBase();
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [kbRaw, invRaw, rsRaw] = await Promise.all([
        fetch(`${base}/knowledge/`,          { headers: hdrs }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/investigations`,   { headers: hdrs }).then(r => r.json()).catch(() => []),
        fetch(`${base}/entities/RiskSignal`, { headers: hdrs }).then(r => r.json()).catch(() => []),
      ]);
      const arts = normaliseArticles(kbRaw);
      const invs = normaliseInvestigations(invRaw);
      const sigs = normaliseRiskSignals(rsRaw);
      setInvCount(invs.length);
      setRsCount(sigs.length);
      const enriched = arts.map(art => {
        const im = correlateInv(art, invs);
        const rm = correlateRisk(art, sigs);
        return { ...art, _invMatches: im, _riskMatches: rm, _class: classify(im, rm) };
      });
      setArticles(enriched);
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
    const handler = e => {
      setOpen(o => {
        const next = !o;
        return next;
      });
    };
    window.addEventListener("jarvis:kirnt-toggle", handler);
    return () => window.removeEventListener("jarvis:kirnt-toggle", handler);
  }, []);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildKirntScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } finally {
      setAssessing(false);
    }
  }, [assessing]);

  const dark    = articles.filter(a => a._class === "DARK");
  const full    = articles.filter(a => a._class === "FULL_COVERAGE");
  const invOnly = articles.filter(a => a._class === "INV_ONLY");
  const rskOnly = articles.filter(a => a._class === "RISK_ONLY");

  const filtered = articles
    .filter(a => tab === "ALL" || a._class === tab)
    .filter(a => !search || a.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <style>{`@keyframes pulse-ring{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>

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
        ◈ KIRNT {open ? "▲" : "▼"}
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
                ◈ KNOWLEDGE × INVESTIGATION × RISK TRIPLE
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

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
            <StatTile label="KB ARTICLES" value={articles.length}  accent={CY} />
            <StatTile label="FULL COV"    value={full.length}      accent={GREEN} />
            <StatTile label="RISK ONLY"   value={rskOnly.length}   accent={PURP} />
            <StatTile label="DARK"        value={dark.length}      accent={AMBER} pulse={dark.length > 0} />
          </div>

          {/* secondary tiles */}
          <div style={{ display: "flex", gap: 6, padding: "0 12px 8px" }}>
            <StatTile label="INVESTIGATIONS" value={invCount}        accent={CY} />
            <StatTile label="RISK SIGNALS"   value={rsCount}        accent={PURP} />
            <StatTile label="INV ONLY"       value={invOnly.length} accent={CY} />
          </div>

          {error && (
            <div style={{ padding: "4px 12px", fontSize: 8, color: RED }}>{error}</div>
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
              placeholder="search articles…"
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
                {articles.length === 0 ? "No KB articles loaded." : "No articles match filter."}
              </div>
            ) : (
              filtered.map(a => <ArticleRow key={a.id} article={a} />)
            )}
          </div>
        </div>
      )}
    </>
  );
}
