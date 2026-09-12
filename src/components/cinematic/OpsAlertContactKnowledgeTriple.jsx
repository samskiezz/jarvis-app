/**
 * F738 — Ops Alerts × Contact × Knowledge Triple Nexus (OALCKTRI)
 *
 * Cross-references /v1/ops/alerts × /entities/Contact × /knowledge/articles.
 * Keyword-matches each ops alert against known contacts and knowledge articles
 * to surface alerts with no owner and no documented runbook.
 *
 *   FULLY_COVERED — alert matches ≥1 contact AND ≥1 KB article
 *   CONTACT_ONLY  — a contact owns this alert, but no KB article exists
 *   KB_ONLY       — KB article exists, no contact assigned
 *   DARK          — no contact or KB coverage for this alert
 *
 * Stat tiles: ALERTS | FULLY COVERED | CONTACT ONLY | KB ONLY | DARK | COVERAGE %
 * Filter tabs: ALL | FULLY_COVERED | CONTACT_ONLY | KB_ONLY | DARK + search
 * Expand alert → matched contacts (role badge + hits) + matched articles (kind badge + hits)
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence ops brief + TTS
 *
 * Button: ◈ OALCKTRI  left:907260 bottom:8 zIndex:597
 * Event:  jarvis:oalcktri-toggle
 * Refresh: 90 s auto-poll
 * Voice:  "oalcktri / ops alert contact knowledge / alert contact coverage /
 *          alert runbook / ops alert knowledge / dark alert / unowned alert /
 *          contact alert nexus / ops triple nexus / alert documentation"
 */
import { useCallback, useEffect, useRef, useState } from "react";

const CY  = "#29E7FF";
const AM  = "#FFB347";
const GN  = "#39FF14";
const RD  = "#FF4444";
const PR  = "#B47FFF";
const DIM = "#8899AA";
const DK  = "#556677";

const BTN_LEFT = 907260;
const POLL_MS  = 90_000;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const OALCKTRI_RE =
  /\b(oalcktri|ops[\s._-]?alert[\s._-]?contact[\s._-]?knowledge|alert[\s._-]?contact[\s._-]?coverage|alert[\s._-]?runbook|ops[\s._-]?alert[\s._-]?knowledge|dark[\s._-]?alert|unowned[\s._-]?alert|contact[\s._-]?alert[\s._-]?nexus|ops[\s._-]?triple[\s._-]?nexus|alert[\s._-]?documentation)\b/i;

export function isOalcktriQuery(t) {
  return OALCKTRI_RE.test(t || "");
}

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  return (env.VITE_API_BASE_URL || "").replace(/\/$/, "") || "http://localhost:8000";
}

function normaliseAlerts(data) {
  if (!data) return [];
  const raw = data.alerts || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((a, i) => ({
    id:       a.id       || `alt-${i}`,
    title:    a.title    || a.name || a.message || a.description || `Alert ${i + 1}`,
    severity: (a.severity || a.level || a.priority || "INFO").toUpperCase(),
    kind:     a.kind     || a.type  || a.category || "",
    tags:     [a.title, a.name, a.message, a.kind, a.type, ...(a.tags || [])].filter(Boolean).map(t => String(t).toLowerCase()),
  }));
}

function normaliseContacts(data) {
  if (!data) return [];
  const raw = data.contacts || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((c, i) => ({
    id:   c.id   || `cnt-${i}`,
    name: c.name || c.full_name || c.display_name || `Contact ${i + 1}`,
    role: c.role || c.title    || c.position      || "",
    tags: [c.name, c.full_name, c.role, c.title, c.email, ...(c.tags || [])].filter(Boolean).map(t => String(t).toLowerCase()),
  }));
}

function normaliseArticles(data) {
  if (!data) return [];
  const raw = data.articles || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((a, i) => ({
    id:   a.id   || `art-${i}`,
    name: a.title || a.name || a.subject || `Article ${i + 1}`,
    kind: a.kind || a.type  || a.category || "",
    tags: [a.title, a.name, a.subject, a.kind, a.tags?.join(" ")].filter(Boolean).map(t => String(t).toLowerCase()),
  }));
}

function kw(obj) {
  return [obj.name || obj.title, ...(obj.tags || [])].filter(Boolean).join(" ").toLowerCase();
}

function scoreMatch(aKw, bKw) {
  const words = aKw.split(/\s+/).filter(w => w.length > 3);
  let hits = 0;
  for (const w of words) if (bKw.includes(w)) hits++;
  return hits;
}

function classifyAlert(alert, contacts, articles) {
  const ak = kw(alert);
  const matchedContacts = contacts.filter(c => scoreMatch(ak, kw(c)) > 0).map(c => ({ ...c, hits: scoreMatch(ak, kw(c)) }));
  const matchedArticles = articles.filter(a => scoreMatch(ak, kw(a)) > 0).map(a => ({ ...a, hits: scoreMatch(ak, kw(a)) }));
  const hasCnt = matchedContacts.length > 0;
  const hasKb  = matchedArticles.length > 0;
  let classification;
  if (hasCnt && hasKb)  classification = "FULLY_COVERED";
  else if (hasCnt)      classification = "CONTACT_ONLY";
  else if (hasKb)       classification = "KB_ONLY";
  else                  classification = "DARK";
  return { ...alert, classification, matchedContacts, matchedArticles };
}

const SEV_COLOR = { CRITICAL: RD, HIGH: AM, MEDIUM: CY, LOW: GN, INFO: DIM, UNKNOWN: DK };
const ROLE_COLOR = { OWNER: CY, ENGINEER: GN, ANALYST: AM, MANAGER: PR, DEFAULT: DIM };
const CLS_COLOR  = { FULLY_COVERED: GN, CONTACT_ONLY: CY, KB_ONLY: PR, DARK: DK };
const TABS = ["ALL", "FULLY_COVERED", "CONTACT_ONLY", "KB_ONLY", "DARK"];

export async function buildOalcktriScript() {
  const base = apiBase();
  const h = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
  try {
    const [aRes, cRes, kRes] = await Promise.all([
      fetch(`${base}/v1/ops/alerts`, { headers: h }),
      fetch(`${base}/entities/Contact`, { headers: h }),
      fetch(`${base}/knowledge/articles?limit=200`, { headers: h }),
    ]);
    const [aData, cData, kData] = await Promise.all([
      aRes.ok ? aRes.json() : {},
      cRes.ok ? cRes.json() : {},
      kRes.ok ? kRes.json() : {},
    ]);
    const alerts   = normaliseAlerts(aData);
    const contacts = normaliseContacts(cData);
    const articles = normaliseArticles(kData);
    const classified = alerts.map(a => classifyAlert(a, contacts, articles));
    const fully   = classified.filter(c => c.classification === "FULLY_COVERED").length;
    const cntOnly = classified.filter(c => c.classification === "CONTACT_ONLY").length;
    const kbOnly  = classified.filter(c => c.classification === "KB_ONLY").length;
    const dark    = classified.filter(c => c.classification === "DARK").length;
    const pct     = alerts.length ? Math.round((fully / alerts.length) * 100) : 0;
    const top3    = classified.filter(c => c.classification === "DARK").slice(0, 3).map(c => c.title).join(", ");
    const prompt  = `Ops alert contact-knowledge triple nexus: ${alerts.length} alerts; ${fully} fully covered (contact + KB), ${cntOnly} contact-only, ${kbOnly} KB-only, ${dark} dark (no contact or runbook; ${pct}% fully covered). Dark alerts: ${top3 || "none"}. In 2 sentences, summarise the alert ownership and runbook gaps and highest-risk unowned alerts.`;
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ message: prompt }),
    });
    const rd = r.ok ? await r.json() : {};
    return rd.response || rd.reply || rd.answer || prompt;
  } catch (e) {
    return `OALCKTRI error: ${e.message}`;
  }
}

export default function OpsAlertContactKnowledgeTriple() {
  const [open, setOpen]           = useState(false);
  const [alerts, setAlerts]       = useState([]);
  const [contacts, setContacts]   = useState([]);
  const [articles, setArticles]   = useState([]);
  const [classified, setClassified] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState(null);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    const base = apiBase();
    const h = { Authorization: `Bearer ${API_KEY}` };
    try {
      const [aRes, cRes, kRes] = await Promise.all([
        fetch(`${base}/v1/ops/alerts`, { headers: h }),
        fetch(`${base}/entities/Contact`, { headers: h }),
        fetch(`${base}/knowledge/articles?limit=200`, { headers: h }),
      ]);
      const [aData, cData, kData] = await Promise.all([
        aRes.ok ? aRes.json() : {},
        cRes.ok ? cRes.json() : {},
        kRes.ok ? kRes.json() : {},
      ]);
      const a = normaliseAlerts(aData);
      const c = normaliseContacts(cData);
      const k = normaliseArticles(kData);
      setAlerts(a); setContacts(c); setArticles(k);
      setClassified(a.map(al => classifyAlert(al, c, k)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener("jarvis:oalcktri-toggle", handler);
    return () => window.removeEventListener("jarvis:oalcktri-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fully   = classified.filter(c => c.classification === "FULLY_COVERED").length;
  const cntOnly = classified.filter(c => c.classification === "CONTACT_ONLY").length;
  const kbOnly  = classified.filter(c => c.classification === "KB_ONLY").length;
  const dark    = classified.filter(c => c.classification === "DARK").length;
  const pct     = alerts.length ? Math.round((fully / alerts.length) * 100) : 0;

  const visible = classified.filter(row => {
    const matchTab = tab === "ALL" || row.classification === tab;
    const s = search.toLowerCase();
    const matchSearch = !s || row.title.toLowerCase().includes(s) || row.kind.toLowerCase().includes(s);
    return matchTab && matchSearch;
  });

  async function assess(row) {
    setAssessing(row.id);
    const base = apiBase();
    const h = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
    const prompt = `Ops alert "${row.title}" (severity: ${row.severity}, kind: ${row.kind}, classification: ${row.classification}). Matched contacts: ${row.matchedContacts.map(c => c.name).join(", ") || "none"}. Matched KB articles: ${row.matchedArticles.map(a => a.name).join(", ") || "none"}. In 2 sentences, assess this alert's ownership and runbook coverage.`;
    try {
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers: h, body: JSON.stringify({ message: prompt }),
      });
      const data = r.ok ? await r.json() : {};
      const text = data.response || data.reply || data.answer || "No response.";
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST", headers: h, body: JSON.stringify({ text }),
      }).catch(() => {});
    } catch (_) {}
    setAssessing(null);
  }

  const TILES = [
    { label: "ALERTS",        value: alerts.length, color: CY },
    { label: "FULLY COVERED", value: fully,          color: GN },
    { label: "CONTACT ONLY",  value: cntOnly,        color: CY },
    { label: "KB ONLY",       value: kbOnly,         color: PR },
    { label: "DARK",          value: dark,           color: DK },
    { label: "COVERAGE %",    value: `${pct}%`,      color: pct >= 70 ? GN : pct >= 40 ? AM : RD },
  ];

  const panel = {
    position: "fixed", bottom: 60, left: BTN_LEFT - 580, width: 660,
    maxHeight: "80vh", overflowY: "auto",
    background: "rgba(4,14,24,0.97)",
    border: `1px solid ${CY}44`,
    borderRadius: 8, padding: 18, zIndex: 597,
    fontFamily: "monospace", fontSize: 12, color: CY,
    display: open ? "flex" : "none", flexDirection: "column", gap: 10,
  };

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Ops Alert × Contact × Knowledge Triple Nexus"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 597,
          background: open ? `${CY}22` : "rgba(4,14,24,0.85)",
          border: `1px solid ${open ? CY : CY + "55"}`,
          color: open ? CY : DIM, borderRadius: 4, padding: "3px 8px",
          cursor: "pointer", fontSize: 11, fontFamily: "monospace", letterSpacing: 1,
        }}
      >◈ OALCKTRI</button>

      <div style={panel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: CY, fontWeight: "bold", letterSpacing: 2 }}>
            OPS ALERT × CONTACT × KNOWLEDGE
          </span>
          {loading && <span style={{ color: AM, fontSize: 10 }}>LOADING…</span>}
          <button onClick={() => setOpen(false)}
            style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>

        {err && <div style={{ color: RD, fontSize: 11 }}>Error: {err}</div>}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {TILES.map(t => (
            <div key={t.label} style={{
              flex: "1 1 80px", background: `${t.color}11`, border: `1px solid ${t.color}44`,
              borderRadius: 4, padding: "6px 10px", textAlign: "center",
            }}>
              <div style={{ color: t.color, fontSize: 16, fontWeight: "bold" }}>{t.value}</div>
              <div style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>{t.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                background: tab === t ? `${CY}22` : "none",
                border: `1px solid ${tab === t ? CY : CY + "33"}`,
                color: tab === t ? CY : DIM, borderRadius: 3,
                padding: "2px 8px", cursor: "pointer", fontSize: 10, fontFamily: "monospace",
              }}>
              {t.replace(/_/g, " ")}
            </button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search alerts…"
            style={{
              background: "none", border: `1px solid ${CY}33`, color: CY,
              borderRadius: 3, padding: "2px 8px", fontSize: 10,
              fontFamily: "monospace", flex: 1, minWidth: 100, outline: "none",
            }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {visible.length === 0 && !loading && (
            <div style={{ color: DIM, textAlign: "center", padding: 20 }}>No alerts match filter.</div>
          )}
          {visible.map(row => {
            const isExp = expanded === row.id;
            const sCol = SEV_COLOR[row.severity] || SEV_COLOR.UNKNOWN;
            const cCol = CLS_COLOR[row.classification] || DK;
            return (
              <div key={row.id} style={{
                border: `1px solid ${cCol}33`, borderRadius: 4, padding: "6px 10px",
                background: `${cCol}08`, cursor: "pointer",
              }} onClick={() => setExpanded(isExp ? null : row.id)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: CY, flex: 1 }} title={row.title}>
                    {row.title.length > 52 ? row.title.slice(0, 52) + "…" : row.title}
                  </span>
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{
                      background: `${sCol}22`, border: `1px solid ${sCol}55`,
                      color: sCol, borderRadius: 3, padding: "1px 6px", fontSize: 9,
                    }}>{row.severity}</span>
                    <span style={{
                      background: `${cCol}22`, border: `1px solid ${cCol}55`,
                      color: cCol, borderRadius: 3, padding: "1px 6px", fontSize: 9,
                    }}>{row.classification.replace(/_/g, " ")}</span>
                    <span style={{ color: DIM, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                  </span>
                </div>

                {isExp && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                    {row.matchedContacts.length > 0 && (
                      <div>
                        <div style={{ color: AM, fontSize: 10, marginBottom: 3 }}>MATCHED CONTACTS</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {row.matchedContacts.slice(0, 8).map(c => {
                            const rc = ROLE_COLOR[c.role?.toUpperCase()] || ROLE_COLOR.DEFAULT;
                            return (
                              <span key={c.id} style={{
                                background: `${rc}18`, border: `1px solid ${rc}44`,
                                color: rc, borderRadius: 3, padding: "1px 6px", fontSize: 9,
                              }}>{c.name} ({c.hits})</span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {row.matchedArticles.length > 0 && (
                      <div>
                        <div style={{ color: PR, fontSize: 10, marginBottom: 3 }}>MATCHED KB ARTICLES</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {row.matchedArticles.slice(0, 6).map(a => (
                            <span key={a.id} style={{
                              background: `${PR}18`, border: `1px solid ${PR}44`,
                              color: PR, borderRadius: 3, padding: "1px 6px", fontSize: 9,
                            }}>{a.name.length > 30 ? a.name.slice(0, 30) + "…" : a.name} ({a.hits})</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {row.matchedContacts.length === 0 && row.matchedArticles.length === 0 && (
                      <div style={{ color: DK, fontSize: 10 }}>No contact or KB coverage found.</div>
                    )}
                    <button
                      disabled={assessing === row.id}
                      onClick={e => { e.stopPropagation(); assess(row); }}
                      style={{
                        alignSelf: "flex-start",
                        background: assessing === row.id ? `${DIM}22` : `${GN}22`,
                        border: `1px solid ${assessing === row.id ? DIM : GN}`,
                        color: assessing === row.id ? DIM : GN,
                        borderRadius: 3, padding: "3px 10px", cursor: assessing === row.id ? "wait" : "pointer",
                        fontSize: 10, fontFamily: "monospace",
                      }}
                    >▶ {assessing === row.id ? "ASSESSING…" : "ASSESS"}</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ color: DK, fontSize: 9, textAlign: "right", marginTop: 4 }}>
          OALCKTRI · {alerts.length} alerts · {contacts.length} contacts · {articles.length} articles · auto-refresh 90s
        </div>
      </div>
    </>
  );
}
