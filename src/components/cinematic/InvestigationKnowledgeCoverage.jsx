/**
 * F181 — Investigation × Knowledge Coverage (INVKNOW)
 *
 * Parallel-fetches /v1/investigations + /knowledge/, then keyword-correlates
 * each open investigation against the knowledge-article catalogue to surface:
 *
 *   SUPPORTED — at least one article provides research backing for this case
 *   BLIND     — no knowledge documentation found (research gap)
 *
 * Stat tiles: investigations / articles / supported / blind
 * Filter tabs: ALL | SUPPORTED | BLIND + text search
 * Expand any investigation → matched articles with type badge + relevance score.
 * Amber badge on blind count.
 * ▶ ASSESS: 2-sentence investigation-knowledge brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ INVKNOW  at bottom:8 left:62920, zIndex:122.
 * Event:   jarvis:invknow-toggle
 * Voice:   "investigation knowledge / knowledge for investigations / invknow /
 *           research gap / what do we know about cases / blind investigations /
 *           case knowledge / unsupported investigations"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 62920;
const POLL_MS  = 90_000;
const AMBER    = "#F59E0B";
const GREEN    = "#34D399";
const SLATE    = "#6E8AA0";
const BLUE     = "#60A5FA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const INVKNOW_RE =
  /\b(investigation\s+knowledge|knowledge\s+(for|about|covering)\s+invest\w*|invknow|research\s+gap[s]?|what\s+do\s+we\s+know\s+about\s+(case|invest\w*)|blind\s+invest\w*|case\s+knowledge|unsupported\s+invest\w*|invest\w*\s+without\s+knowledge|knowledge\s+gap\s+(for|in)\s+invest\w*)\b/i;

export function isInvknowQuery(q) { return INVKNOW_RE.test(q); }

export async function buildInvknowScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [invRes, knowRes] = await Promise.all([
      fetch(`${base}/v1/investigations`, { headers: hdr }),
      fetch(`${base}/knowledge/`,        { headers: hdr }),
    ]);
    const investigations = normaliseInvestigations(await invRes.json());
    const articles       = normaliseArticles(await knowRes.json());

    const supported = investigations.filter(
      (inv) => articles.some((a) => relevance(inv, a) > 0)
    ).length;
    const blind = investigations.length - supported;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS investigation knowledge coverage: ${investigations.length} active investigations, ` +
          `${articles.length} knowledge articles in the vault. ${supported} investigations have ` +
          `at least one supporting knowledge article; ${blind} investigations have no knowledge ` +
          `backing whatsoever — these are research blind spots. ` +
          `Provide a 2-sentence investigation-knowledge brief — formal British butler ` +
          `tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Investigation knowledge coverage analysis complete, sir.").trim();
  } catch {
    return "Investigation knowledge coverage unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseInvestigations(raw) {
  const arr = Array.isArray(raw)                  ? raw
    : Array.isArray(raw?.investigations)           ? raw.investigations
    : Array.isArray(raw?.cases)                    ? raw.cases
    : Array.isArray(raw?.data)                     ? raw.data
    : Array.isArray(raw?.results)                  ? raw.results
    : Array.isArray(raw?.items)                    ? raw.items
    : [];
  return arr.map((inv, i) => ({
    id:      inv.id           || inv.investigation_id || String(i),
    title:   inv.title        || inv.name             || inv.subject   || `Case ${i + 1}`,
    status:  inv.status       || inv.state            || "open",
    summary: (inv.summary     || inv.description      || inv.notes     || "").toString().slice(0, 300),
    tags:    Array.isArray(inv.tags) ? inv.tags.join(" ") : (inv.tags || ""),
  }));
}

function normaliseArticles(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.articles)            ? raw.articles
    : Array.isArray(raw?.knowledge)           ? raw.knowledge
    : Array.isArray(raw?.entries)             ? raw.entries
    : Array.isArray(raw?.data)                ? raw.data
    : Array.isArray(raw?.results)             ? raw.results
    : Array.isArray(raw?.items)               ? raw.items
    : [];
  return arr.map((a, i) => ({
    id:    a.id      || a.article_id  || String(i),
    title: a.title   || a.name        || a.subject    || `Article ${i + 1}`,
    type:  a.type    || a.category    || a.kind       || "article",
    body:  (a.body   || a.content     || a.summary    || a.description || "").toString().slice(0, 300),
    tags:  Array.isArray(a.tags) ? a.tags.join(" ") : (a.tags || ""),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(investigation, article) {
  const iw = keywords(`${investigation.title} ${investigation.summary} ${investigation.tags}`);
  const aw = keywords(`${article.title} ${article.body} ${article.tags}`);
  return iw.filter((w) => aw.some((p) => p.includes(w) || w.includes(p))).length;
}

function buildLinked(investigations, articles) {
  return investigations.map((inv) => {
    const matched = articles
      .map((a) => ({ ...a, score: relevance(inv, a) }))
      .filter((a) => a.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...inv, articles: matched, supported: matched.length > 0 };
  });
}

function statusColor(status) {
  const lc = String(status || "").toLowerCase();
  if (lc.includes("clos") || lc.includes("resolv") || lc.includes("complet")) return GREEN;
  if (lc.includes("open") || lc.includes("active") || lc.includes("progress"))  return BLUE;
  if (lc.includes("stall") || lc.includes("block"))                              return AMBER;
  return SLATE;
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "SUPPORTED", "BLIND"];

export default function InvestigationKnowledgeCoverage() {
  const [open,            setOpen]            = useState(false);
  const [investigations,  setInvestigations]  = useState([]);
  const [articles,        setArticles]        = useState([]);
  const [loading,         setLoading]         = useState(false);
  const [filter,          setFilter]          = useState("ALL");
  const [search,          setSearch]          = useState("");
  const [expanded,        setExpanded]        = useState(null);
  const [assessing,       setAssessing]       = useState(false);
  const [lastFetch,       setLastFetch]       = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [invRes, knowRes] = await Promise.all([
        fetch(`${base}/v1/investigations`, { headers: hdr }),
        fetch(`${base}/knowledge/`,        { headers: hdr }),
      ]);
      setInvestigations(normaliseInvestigations(await invRes.json()));
      setArticles(normaliseArticles(await knowRes.json()));
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
    window.addEventListener("jarvis:invknow-toggle", onToggle);
    return () => window.removeEventListener("jarvis:invknow-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    const text = await buildInvknowScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const linked    = buildLinked(investigations, articles);
  const supported = linked.filter((inv) => inv.supported).length;
  const blind     = linked.length - supported;

  const displayed = linked.filter((inv) => {
    if (filter === "SUPPORTED" && !inv.supported) return false;
    if (filter === "BLIND"     && inv.supported)  return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      inv.title.toLowerCase().includes(q) ||
      inv.summary.toLowerCase().includes(q)
    );
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Investigation × Knowledge Coverage (INVKNOW)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 122,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${AMBER}55`,
          color: AMBER, padding: "3px 10px", borderRadius: 6,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          cursor: "pointer", backdropFilter: "blur(6px)",
          letterSpacing: 1,
        }}
      >
        {blind > 0
          ? <><span style={{ background: AMBER, color: "#04060A", borderRadius: 4, padding: "0 4px", marginRight: 4, fontWeight: 700 }}>{blind}</span>◈ INVKNOW</>
          : "◈ INVKNOW"
        }
      </button>
    );
  }

  const TILE = { flex: "1 1 100px", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", textAlign: "center" };

  return (
    <div style={{
      position: "fixed", bottom: 52, left: BTN_LEFT - 360, zIndex: 122,
      width: 480, maxHeight: "72vh", display: "flex", flexDirection: "column",
      background: "rgba(6,10,16,0.95)", border: `1px solid ${AMBER}44`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: `0 0 40px ${AMBER}22`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${AMBER}33` }}>
        <span style={{ color: AMBER, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ INVKNOW</span>
        <span style={{ color: SLATE, fontSize: 9, flex: 1 }}>INVESTIGATION × KNOWLEDGE COVERAGE</span>
        {lastFetch && <span style={{ color: SLATE, fontSize: 8 }}>{lastFetch.toLocaleTimeString()}</span>}
        {loading && <span style={{ color: AMBER, fontSize: 9 }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{ marginLeft: 4, background: "none", border: "none", color: SLATE, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${AMBER}22` }}>
        {[
          { label: "CASES",      value: linked.length,  col: BLUE  },
          { label: "ARTICLES",   value: articles.length, col: "#A78BFA" },
          { label: "SUPPORTED",  value: supported,      col: GREEN },
          { label: "BLIND",      value: blind,          col: AMBER },
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
          placeholder="search investigations…"
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

      {/* investigation list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
        {displayed.length === 0 && !loading && (
          <div style={{ color: SLATE, fontSize: 10, textAlign: "center", padding: 20 }}>
            No investigations match the current filter.
          </div>
        )}
        {displayed.map((inv) => {
          const isExp  = expanded === inv.id;
          const col    = inv.supported ? GREEN : AMBER;
          const badge  = inv.supported ? "SUPPORTED" : "BLIND";
          return (
            <div key={inv.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : inv.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                  background: isExp ? `${AMBER}11` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${inv.supported ? "#34D39944" : `${AMBER}44`}`,
                  transition: "background 0.2s",
                }}
              >
                <span style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: 1, padding: "1px 5px",
                  borderRadius: 4, background: `${col}22`, color: col,
                }}>
                  {badge}
                </span>
                <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5" }}>{inv.title}</span>
                <span style={{
                  fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                  background: `${statusColor(inv.status)}22`, color: statusColor(inv.status),
                  letterSpacing: 1,
                }}>
                  {String(inv.status || "OPEN").toUpperCase().slice(0, 8)}
                </span>
                {inv.supported && (
                  <span style={{ fontSize: 8, color: GREEN }}>{inv.articles.length} art.</span>
                )}
                <span style={{ color: SLATE, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ margin: "4px 0 4px 12px", padding: "8px 10px", borderRadius: 7, background: "rgba(255,255,255,0.02)", border: `1px solid ${AMBER}22` }}>
                  {inv.summary && (
                    <div style={{ fontSize: 9, color: SLATE, marginBottom: 6 }}>
                      {inv.summary.slice(0, 120)}
                    </div>
                  )}
                  {inv.articles.length === 0 ? (
                    <div style={{ fontSize: 9, color: AMBER }}>
                      No knowledge articles found for this investigation — research gap identified.
                    </div>
                  ) : (
                    inv.articles.map((a) => (
                      <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, padding: "4px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)" }}>
                        <span style={{
                          fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                          background: "#A78BFA22", color: "#A78BFA",
                          letterSpacing: 1,
                        }}>
                          {String(a.type || "ART").toUpperCase().slice(0, 6)}
                        </span>
                        <span style={{ flex: 1, fontSize: 9, color: "#DCEBF5" }}>{a.title}</span>
                        <span style={{ fontSize: 8, color: AMBER }}>rel:{a.score}</span>
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
