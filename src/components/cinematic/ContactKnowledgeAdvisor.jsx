/**
 * F77 — Contact × Knowledge Advisor
 *
 * Parallel-fetches /entities/Contact + /knowledge/, then keyword-correlates
 * each contact (name / role / department) against knowledge article titles
 * and content to surface whether a person is LINKED (at least one article
 * references them or their domain) or DARK (no knowledge backing found).
 *
 * Stat tiles: contacts / articles / linked / dark.
 * Filter tabs: ALL | LINKED | DARK.
 * Expand any contact → matched articles with relevance score.
 * ▶ ASSESS: sends a 2-sentence AI knowledge-coverage brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ CTKNOW  at bottom:8 left:9852, zIndex 69.
 * Voice:   "contact knowledge / knowledge contact / who has docs / ctknow"
 * Event:   jarvis:ctknow-toggle
 * Refresh: 120 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 9852;
const POLL_MS  = 120_000;

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ──────────────────────────────────────────────────

const CTKNOW_RE =
  /\b(contact\s+knowledge|knowledge\s+contacts?|who\s+has\s+(docs?|articles?|knowledge)|person\s+knowledge|people\s+knowledge|contact\s+docs?|ctknow)\b/i;

export function isCtknowQuery(q) { return CTKNOW_RE.test(q); }

export async function buildCtknowScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [cRes, kRes] = await Promise.all([
      fetch(`${base}/entities/Contact`, { headers: hdr }),
      fetch(`${base}/knowledge/`,       { headers: hdr }),
    ]);
    const cRaw = await cRes.json();
    const kRaw = await kRes.json();
    const contacts  = normaliseContacts(cRaw);
    const articles  = normaliseArticles(kRaw);

    const linked = contacts.filter((c) =>
      articles.some((a) => relevance(c, a) > 0)
    ).length;
    const dark = contacts.length - linked;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS contact-knowledge coverage: ${contacts.length} contacts, ` +
          `${articles.length} knowledge articles, ${linked} contacts with knowledge backing, ` +
          `${dark} contacts with no documented expertise. ` +
          `Give a 2-sentence knowledge-coverage brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Contact knowledge analysis complete, sir.").trim();
  } catch {
    return "Contact knowledge coverage analysis unavailable at this time, sir.";
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseContacts(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.data)             ? raw.data
    : Array.isArray(raw?.contacts)         ? raw.contacts
    : Array.isArray(raw?.items)            ? raw.items
    : Array.isArray(raw?.results)          ? raw.results
    : [];
  return arr.map((c, i) => ({
    id:         c.id           || String(i),
    name:       c.name         || c.full_name  || c.display_name || `Contact ${i + 1}`,
    role:       c.role         || c.job_title  || c.title        || "",
    department: c.department   || c.dept       || c.team         || "",
    email:      c.email        || "",
  }));
}

function normaliseArticles(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.data)             ? raw.data
    : Array.isArray(raw?.knowledge)        ? raw.knowledge
    : Array.isArray(raw?.articles)         ? raw.articles
    : Array.isArray(raw?.items)            ? raw.items
    : Array.isArray(raw?.results)          ? raw.results
    : Array.isArray(raw?.chunks)           ? raw.chunks
    : [];
  return arr.map((a, i) => ({
    id:      a.id      || String(i),
    title:   a.title   || a.name   || a.heading || `Article ${i + 1}`,
    content: (a.content || a.body || a.text || a.summary || a.description || "").toString().slice(0, 400),
    tags:    Array.isArray(a.tags) ? a.tags.join(" ") : (a.tags || ""),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()[\]]+/)
    .filter((w) => w.length >= 3);
}

function relevance(contact, article) {
  const cw = keywords(`${contact.name} ${contact.role} ${contact.department}`);
  const aw = keywords(`${article.title} ${article.content} ${article.tags}`);
  return cw.filter((w) => aw.some((a) => a.includes(w) || w.includes(a))).length;
}

function buildCorrelated(contacts, articles) {
  return contacts.map((c) => {
    const matched = articles
      .map((a) => ({ ...a, score: relevance(c, a) }))
      .filter((a) => a.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...c, articles: matched, linked: matched.length > 0 };
  });
}

// ── component ────────────────────────────────────────────────────────────────

const TABS = ["ALL", "LINKED", "DARK"];

export default function ContactKnowledgeAdvisor() {
  const [open,      setOpen]      = useState(false);
  const [contacts,  setContacts]  = useState([]);
  const [articles,  setArticles]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [cRes, kRes] = await Promise.all([
        fetch(`${base}/entities/Contact`, { headers: hdr }),
        fetch(`${base}/knowledge/`,       { headers: hdr }),
      ]);
      const cRaw = await cRes.json();
      const kRaw = await kRes.json();
      setContacts(normaliseContacts(cRaw));
      setArticles(normaliseArticles(kRaw));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:ctknow-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ctknow-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isCtknowQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const correlated = buildCorrelated(contacts, articles);
  const linked     = correlated.filter((c) => c.linked).length;
  const dark       = correlated.filter((c) => !c.linked).length;

  const visible = correlated.filter((c) => {
    if (filter === "LINKED") return c.linked;
    if (filter === "DARK")   return !c.linked;
    return true;
  });

  async function assess() {
    setAssessing(true);
    const text = await buildCtknowScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Contact–Knowledge Advisor (◈ CTKNOW)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 69,
          background: open ? "rgba(0,200,120,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? C.neon : S.border}`,
          borderRadius: S.radius, color: open ? C.neon : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${C.neon}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ CTKNOW{dark > 0 && (
          <span style={{
            marginLeft: 4, background: "#FF8800", color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{dark}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 68,
          bottom: 36, left: Math.max(8, BTN_LEFT - 260),
          width: 340,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${C.neon}`,
          borderRadius: S.radius,
          boxShadow: "0 4px 28px rgba(0,0,0,0.55)",
          fontFamily: S.mono, fontSize: S.fs.xs,
          display: "flex", flexDirection: "column",
          maxHeight: "68vh", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ color: C.neon, letterSpacing: 2, fontWeight: 700 }}>
              CONTACT–KNOWLEDGE ADVISOR
            </span>
            <button
              onClick={assess}
              disabled={assessing || contacts.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || contacts.length === 0) ? 0.4 : 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 6, padding: "8px 12px",
          }}>
            {[
              { label: "CONTACTS", val: contacts.length,  color: C.neon    },
              { label: "ARTICLES", val: articles.length,  color: C.blue    },
              { label: "LINKED",   val: linked,           color: "#4ADE80" },
              { label: "DARK",     val: dark,             color: "#FF8800" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                background: "rgba(0,0,0,0.3)", borderRadius: 6,
                padding: "5px 4px", textAlign: "center",
              }}>
                <div style={{ color, fontSize: S.fs.lg, fontWeight: 700 }}>{val}</div>
                <div style={{ color: S.text, fontSize: "8px", letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "0 12px 6px" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{
                flex: 1, background: filter === t ? `${C.neon}22` : "transparent",
                border: `1px solid ${filter === t ? C.neon : S.border}`,
                color: filter === t ? C.neon : S.text,
                borderRadius: S.radius, padding: "2px 0",
                fontFamily: S.mono, fontSize: "8px", letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Contact list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && contacts.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No contacts match.</div>
            ) : visible.map((c) => (
              <div key={c.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${c.linked ? "#4ADE80" : "#FF8800"}`,
                  }}
                >
                  <span style={{ color: c.linked ? "#4ADE80" : "#FF8800", fontSize: 10, width: 10 }}>
                    {c.linked ? "●" : "○"}
                  </span>
                  <span style={{ flex: 1, color: S.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name}
                  </span>
                  {c.role && (
                    <span style={{
                      fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                      background: `${C.blue}22`, color: C.blue,
                      border: `1px solid ${C.blue}44`,
                      maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {c.role}
                    </span>
                  )}
                  <span style={{ color: c.linked ? "#4ADE80" : "#FF8800", fontSize: "9px", minWidth: 40, textAlign: "right" }}>
                    {c.linked ? `${c.articles.length} ART` : "DARK"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === c.id ? "▴" : "▾"}</span>
                </div>

                {expanded === c.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {c.linked ? c.articles.map((a) => (
                      <div key={a.id} style={{
                        display: "flex", justifyContent: "space-between",
                        padding: "2px 0", borderBottom: `1px solid ${S.border}33`,
                      }}>
                        <span style={{ color: S.textHi, fontSize: "9px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {a.title}
                        </span>
                        <span style={{ color: C.blue, fontSize: "9px", marginLeft: 6, whiteSpace: "nowrap" }}>
                          rel:{a.score}
                        </span>
                      </div>
                    )) : (
                      <div style={{ color: S.text, fontSize: "9px", padding: "2px 0" }}>
                        No matching knowledge articles found for this contact.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding: "4px 12px", borderTop: `1px solid ${S.border}`,
            color: S.text, fontSize: "8px", letterSpacing: 0.5,
          }}>
            /entities/Contact · /knowledge/ · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
