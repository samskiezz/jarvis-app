/**
 * F178 — SwarmJob × Contact × Knowledge — Swarm Human Knowledge Coverage (SHKC)
 *
 * Parallel-fetches /entities/SwarmJob + /entities/Contact + /knowledge/ every 90 s.
 * Keyword-correlates each SwarmJob against the Contact roster AND Knowledge articles:
 *
 *   FULLY_SUPPORTED — matched ≥1 contact AND ≥1 KB article
 *   HUMAN_BACKED    — contact matched, no KB coverage
 *   KB_BACKED       — KB article matched, no contact assignment
 *   UNSUPPORTED     — neither — a swarm running blind with no human or knowledge backing
 *
 * Stat tiles: jobs / contacts / articles / fully supported / unsupported
 * Filter tabs: ALL | FULLY_SUPPORTED | HUMAN_BACKED | KB_BACKED | UNSUPPORTED
 * Text search on job name / type / status.
 * Expand row → matched contacts (cyan bars) + matched KB articles (amber bars).
 * Red badge + pulse on UNSUPPORTED count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence swarm coverage brief + TTS.
 *
 * Toggle:  ◈ SHKC  at bottom:8 left:972520, zIndex:679.
 * Event:   jarvis:shkc-toggle
 * Voice:   "shkc / swarm knowledge / swarm contact / swarm human coverage /
 *           swarm job knowledge / unsupported swarm / swarm autonomy gap /
 *           swarm coverage / unbackd swarm / swarm support"
 * Refresh: 90 s auto-poll.
 */
import { useEffect, useRef, useState } from "react";

const BTN_LEFT = 972_520;
const POLL_MS  = 90_000;

const API_KEY =
  (typeof window !== "undefined" && window.__JARVIS_API_KEY__) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function apiBase() {
  if (typeof window !== "undefined" && window.__JARVIS_API_BASE__) return window.__JARVIS_API_BASE__;
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    return `${window.location.protocol}//${window.location.hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── Exported intent helpers ───────────────────────────────────────────────────

const SHKC_RE =
  /\b(shkc|swarm\s+knowledge|swarm\s+contact|swarm\s+human\s+coverage|swarm\s+job\s+knowledge|unsupported\s+swarm|swarm\s+autonomy\s+gap|swarm\s+coverage|unbacked\s+swarm|swarm\s+support)\b/i;

export function isShkcQuery(q) { return SHKC_RE.test(q || ""); }

export async function buildShkcScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [jRes, cRes, kRes] = await Promise.all([
      fetch(`${base}/entities/SwarmJob`, { headers: hdr }),
      fetch(`${base}/entities/Contact`,  { headers: hdr }),
      fetch(`${base}/knowledge/`,        { headers: hdr }),
    ]);
    const jobs     = normArr(await jRes.json(), ["jobs", "swarmJobs", "data", "items", "results"]);
    const contacts = normArr(await cRes.json(), ["contacts", "data", "items", "results"]);
    const articles = normaliseKb(await kRes.json());

    const rows        = classifyJobs(jobs, contacts, articles);
    const unsupported = rows.filter((r) => r.cls === "UNSUPPORTED").length;
    const full        = rows.filter((r) => r.cls === "FULLY_SUPPORTED").length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS swarm human knowledge coverage audit (SHKC): ${jobs.length} swarm jobs ` +
          `cross-referenced against ${contacts.length} contacts and ${articles.length} knowledge articles — ` +
          `${full} fully supported (contact + KB), ${unsupported} unsupported (no human or knowledge backing). ` +
          `Give a 2-sentence swarm autonomy brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Swarm human knowledge coverage audit complete, sir.").trim();
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:shkc-toggle"));
    return "Swarm human knowledge coverage analysis unavailable at this time, sir.";
  }
}

// ── Normalisers ───────────────────────────────────────────────────────────────

function normaliseKb(raw) {
  const arr = normArr(raw, ["articles", "knowledge", "docs", "documents", "data", "items", "results"]);
  return arr.map((a, i) => ({
    id:      a.id || a._id || a.slug || String(i),
    title:   a.title || a.name || a.label || a.subject || `Article ${i + 1}`,
    content: a.content || a.summary || a.body || a.description || "",
    tags:    Array.isArray(a.tags) ? a.tags : [],
    extra:   a,
  }));
}

function normArr(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    for (const k of keys) {
      if (Array.isArray(raw[k])) return raw[k];
    }
    for (const v of Object.values(raw)) {
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

function kw(obj) {
  return JSON.stringify(obj)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function score(jobKws, other) {
  const otherKws = new Set(kw(other));
  return jobKws.filter((w) => otherKws.has(w)).length;
}

function classifyJobs(jobs, contacts, articles) {
  return jobs.map((j) => {
    const jKws = kw(j);
    const matchedContacts = contacts
      .map((c) => ({ ...c, score: score(jKws, c) }))
      .filter((c) => c.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const matchedArticles = articles
      .map((a) => ({ ...a, score: score(jKws, a) }))
      .filter((a) => a.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const hasContact = matchedContacts.length > 0;
    const hasKB      = matchedArticles.length > 0;
    const cls =
      hasContact && hasKB ? "FULLY_SUPPORTED" :
      hasContact           ? "HUMAN_BACKED" :
      hasKB                ? "KB_BACKED" :
                             "UNSUPPORTED";

    return {
      id:      j.id || j._id || j.job_id || String(Math.random()),
      name:    j.name || j.title || j.job_type || j.type || "Unnamed Job",
      status:  j.status || j.state || "",
      type:    j.type || j.job_type || "",
      cls,
      matchedContacts,
      matchedArticles,
      extra: j,
    };
  });
}

// ── Style constants ───────────────────────────────────────────────────────────

const CLS_COLOR = {
  FULLY_SUPPORTED: "#22D3EE",
  HUMAN_BACKED:    "#F59E0B",
  KB_BACKED:       "#8B5CF6",
  UNSUPPORTED:     "#EF4444",
};
const CLS_LABEL = {
  FULLY_SUPPORTED: "FULLY SUPPORTED",
  HUMAN_BACKED:    "HUMAN BACKED",
  KB_BACKED:       "KB BACKED",
  UNSUPPORTED:     "UNSUPPORTED",
};

const TABS = ["ALL", "FULLY_SUPPORTED", "HUMAN_BACKED", "KB_BACKED", "UNSUPPORTED"];
const CY = "#22D3EE";
const AM = "#F59E0B";
const RD = "#EF4444";

// ── Component ─────────────────────────────────────────────────────────────────

export default function SwarmJobContactKnowledge() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [contacts, setContacts]   = useState([]);
  const [articles, setArticles]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [jRes, cRes, kRes] = await Promise.all([
        fetch(`${base}/entities/SwarmJob`, { headers: hdr }),
        fetch(`${base}/entities/Contact`,  { headers: hdr }),
        fetch(`${base}/knowledge/`,        { headers: hdr }),
      ]);
      const jobs    = normArr(await jRes.json(), ["jobs", "swarmJobs", "data", "items", "results"]);
      const cArr    = normArr(await cRes.json(), ["contacts", "data", "items", "results"]);
      const kbArr   = normaliseKb(await kRes.json());
      setContacts(cArr);
      setArticles(kbArr);
      setRows(classifyJobs(jobs, cArr, kbArr));
    } catch {
      /* backend may be down — keep stale rows */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:shkc-toggle", toggle);
    return () => window.removeEventListener("jarvis:shkc-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  const unsupportedCount = rows.filter((r) => r.cls === "UNSUPPORTED").length;
  const fullCount        = rows.filter((r) => r.cls === "FULLY_SUPPORTED").length;
  const humanCount       = rows.filter((r) => r.cls === "HUMAN_BACKED").length;
  const kbCount          = rows.filter((r) => r.cls === "KB_BACKED").length;

  const visible = rows.filter((r) => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (r.name + r.status + r.type).toLowerCase().includes(s);
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment("");
    try {
      const base = apiBase();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message:
            `JARVIS SHKC swarm coverage audit: ${rows.length} jobs — ` +
            `${fullCount} fully supported, ${humanCount} human-backed, ${kbCount} KB-backed, ` +
            `${unsupportedCount} unsupported. Give a 2-sentence operational brief — formal British butler tone.`,
        }),
      });
      const d   = await r.json();
      const txt = (d.answer || "Swarm coverage assessment complete, sir.").trim();
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setAssessment("Assessment unavailable at this time, sir.");
    } finally {
      setAssessing(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 679,
          background: "rgba(8,14,22,0.82)", border: `1px solid ${CY}55`,
          borderRadius: 6, padding: "3px 9px", cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          color: CY, letterSpacing: 2,
          boxShadow: unsupportedCount > 0 ? `0 0 12px ${RD}88` : "none",
          animation: unsupportedCount > 0 ? "shkcPulse 1.8s ease-in-out infinite" : "none",
        }}
      >
        ◈ SHKC
        {unsupportedCount > 0 && (
          <span style={{
            marginLeft: 5, background: RD, color: "#fff",
            borderRadius: 9, padding: "1px 5px", fontSize: 9,
          }}>
            {unsupportedCount}
          </span>
        )}
        <style>{`@keyframes shkcPulse{0%,100%{box-shadow:0 0 8px ${RD}55}50%{box-shadow:0 0 18px ${RD}}}`}</style>
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 8, left: BTN_LEFT - 440, zIndex: 679,
      width: "min(500px,92vw)", maxHeight: "82vh", overflowY: "auto",
      background: "rgba(6,11,18,0.94)", border: `1px solid ${CY}44`,
      borderRadius: 12, padding: "14px 16px",
      backdropFilter: "blur(12px)", boxShadow: `0 0 60px ${CY}18`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5", fontSize: 11,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 3, fontSize: 12 }}>◈ SHKC</span>
        <span style={{ color: "#6E8AA0", fontSize: 10 }}>SWARM HUMAN KNOWLEDGE COVERAGE</span>
        <span style={{ marginLeft: "auto", cursor: "pointer", color: "#6E8AA0" }} onClick={() => setOpen(false)}>✕</span>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {[
          ["JOBS",      rows.length,        CY],
          ["CONTACTS",  contacts.length,    "#8B5CF6"],
          ["KB ART",    articles.length,    AM],
          ["FULL",      fullCount,          CY],
          ["HUMAN",     humanCount,         AM],
          ["KB",        kbCount,            "#8B5CF6"],
          ["UNSUPPORTED", unsupportedCount, RD],
        ].map(([lbl, val, col]) => (
          <div key={lbl} style={{
            background: "rgba(34,211,238,0.06)", border: `1px solid ${col}33`,
            borderRadius: 6, padding: "4px 8px", textAlign: "center", minWidth: 56,
          }}>
            <div style={{ color: col, fontSize: 13, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#6E8AA0", fontSize: 9 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `${CLS_COLOR[t] || CY}22` : "transparent",
            border: `1px solid ${tab === t ? (CLS_COLOR[t] || CY) : "#1E3A4A"}`,
            borderRadius: 4, padding: "2px 7px", cursor: "pointer", fontSize: 9,
            color: tab === t ? (CLS_COLOR[t] || CY) : "#6E8AA0", letterSpacing: 1,
          }}>
            {t === "ALL" ? "ALL" : CLS_LABEL[t] || t}
          </button>
        ))}
      </div>
      <input
        value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="search jobs…"
        style={{
          width: "100%", boxSizing: "border-box", marginBottom: 8,
          background: "rgba(34,211,238,0.05)", border: `1px solid ${CY}33`,
          borderRadius: 5, padding: "4px 8px", color: "#DCEBF5", fontSize: 11,
          fontFamily: "'JetBrains Mono',monospace",
        }}
      />

      {loading && <div style={{ color: "#6E8AA0", marginBottom: 8 }}>Loading swarm jobs…</div>}

      {/* Job rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {visible.map((row) => (
          <div key={row.id}>
            <div
              onClick={() => setExpanded(expanded === row.id ? null : row.id)}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "5px 8px",
                background: "rgba(34,211,238,0.04)", border: `1px solid ${CLS_COLOR[row.cls]}33`,
                borderRadius: 6, cursor: "pointer",
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%",
                background: CLS_COLOR[row.cls], flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.name}
              </span>
              {row.status && (
                <span style={{ fontSize: 9, color: "#6E8AA0", background: "rgba(0,0,0,0.3)",
                  padding: "1px 4px", borderRadius: 3 }}>
                  {row.status}
                </span>
              )}
              <span style={{ fontSize: 9, color: CLS_COLOR[row.cls], letterSpacing: 1 }}>
                {CLS_LABEL[row.cls]}
              </span>
              <span style={{ color: "#6E8AA0", fontSize: 10 }}>
                {expanded === row.id ? "▲" : "▼"}
              </span>
            </div>

            {expanded === row.id && (
              <div style={{
                margin: "2px 0 2px 16px", padding: "8px 10px",
                background: "rgba(34,211,238,0.03)", border: `1px solid ${CY}22`,
                borderRadius: 6, display: "flex", gap: 12, flexWrap: "wrap",
              }}>
                {/* Contacts */}
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ color: CY, fontSize: 9, letterSpacing: 2, marginBottom: 4 }}>
                    CONTACTS ({row.matchedContacts.length})
                  </div>
                  {row.matchedContacts.length === 0
                    ? <div style={{ color: "#6E8AA0", fontSize: 9 }}>none matched</div>
                    : row.matchedContacts.map((c, i) => (
                      <div key={i} style={{ marginBottom: 3 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#DCEBF5" }}>
                          <span>{c.name || c.full_name || c.email || `Contact ${i + 1}`}</span>
                          <span style={{ color: CY }}>{c.score}</span>
                        </div>
                        <div style={{ height: 3, background: `${CY}22`, borderRadius: 2, marginTop: 1 }}>
                          <div style={{ height: "100%", width: `${Math.min(100, c.score * 20)}%`,
                            background: CY, borderRadius: 2 }} />
                        </div>
                      </div>
                    ))
                  }
                </div>
                {/* KB Articles */}
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ color: AM, fontSize: 9, letterSpacing: 2, marginBottom: 4 }}>
                    KB ARTICLES ({row.matchedArticles.length})
                  </div>
                  {row.matchedArticles.length === 0
                    ? <div style={{ color: "#6E8AA0", fontSize: 9 }}>none matched</div>
                    : row.matchedArticles.map((a, i) => (
                      <div key={i} style={{ marginBottom: 3 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#DCEBF5" }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "80%" }}>
                            {a.title}
                          </span>
                          <span style={{ color: AM }}>{a.score}</span>
                        </div>
                        <div style={{ height: 3, background: `${AM}22`, borderRadius: 2, marginTop: 1 }}>
                          <div style={{ height: "100%", width: `${Math.min(100, a.score * 20)}%`,
                            background: AM, borderRadius: 2 }} />
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}
          </div>
        ))}
        {!loading && visible.length === 0 && (
          <div style={{ color: "#6E8AA0", textAlign: "center", padding: "12px 0" }}>
            No jobs match current filter.
          </div>
        )}
      </div>

      {/* Assess button + result */}
      <div style={{ marginTop: 10 }}>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? "rgba(34,211,238,0.1)" : `${CY}18`,
          border: `1px solid ${CY}55`, borderRadius: 5, padding: "4px 12px",
          cursor: assessing ? "default" : "pointer", color: CY, fontSize: 10,
          fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1,
        }}>
          {assessing ? "⟳ assessing…" : "▶ ASSESS"}
        </button>
        {assessment && (
          <div style={{
            marginTop: 8, padding: "7px 10px", background: "rgba(34,211,238,0.05)",
            border: `1px solid ${CY}33`, borderRadius: 6, fontSize: 11,
            color: "#DCEBF5", lineHeight: 1.5,
          }}>
            {assessment}
          </div>
        )}
      </div>

      <div style={{ marginTop: 8, color: "#334F62", fontSize: 9 }}>
        auto-refresh {POLL_MS / 1000}s · {rows.length} jobs · {contacts.length} contacts · {articles.length} KB articles
      </div>
    </div>
  );
}
