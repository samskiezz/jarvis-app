/**
 * F155 — Investment × Contact × Knowledge Opportunity Intelligence Nexus (ICKNEX)
 *
 * Answers: "Which investments are fully informed (backed by a managed contact
 *           AND a KB article), and which are intelligence blind spots?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/Investment  → portfolio investments (name/type/sector/description)
 *   GET /entities/Contact     → operational contacts (name/role/org/tags)
 *   GET /knowledge/           → knowledge base articles (title/content/tags/category)
 *
 * Classification per investment (keyword correlation):
 *   FULLY_INFORMED   — matched ≥1 contact + ≥1 KB article (both)
 *   CONTACT_MANAGED  — matched contact only
 *   KB_RESEARCHED    — matched KB article only
 *   BLIND            — matched neither (intelligence gap)
 *
 * Stat tiles: INVESTMENTS / CONTACTS / KB ARTICLES + four class counts + INFORMED%
 * ▶ ASSESS: 2-sentence AI brief via /v1/jarvis/agent/chat + TTS.
 *
 * Toggle:  ◈ ICKNEX  at left:1029160 bottom:8, zIndex:216.
 * Event:   jarvis:icknex-toggle
 * Voice:   "icknex / investment contact knowledge / opportunity intelligence /
 *           blind investments / investment intel coverage / investment intelligence nexus"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const ORANGE = "#e67e22";
const MUTED  = "#6E8AA0";
const BG     = "rgba(4,7,14,0.96)";
const MONO   = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 1029160;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normArr(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    for (const k of ["items","results","data","records","investments","contacts","articles","knowledge"]) {
      if (Array.isArray(raw[k])) return raw[k];
    }
    const vals = Object.values(raw);
    if (vals.length === 1 && Array.isArray(vals[0])) return vals[0];
  }
  return [];
}

function words(item) {
  const str = [
    item.name, item.description, item.title, item.role, item.org,
    item.sector, item.type, item.category, item.tags, item.aliases,
    item.summary, item.content,
  ].filter(Boolean).join(" ").toLowerCase();
  return str.split(/\W+/).filter(s => s.length > 2);
}

function overlap(a, b) {
  const setA = new Set(words(a));
  let hits = 0;
  for (const w of words(b)) if (setA.has(w)) hits++;
  return hits;
}

function relevancePct(hits, maxHits) {
  if (!maxHits) return 0;
  return Math.min(100, Math.round((hits / maxHits) * 100));
}

// ─── exported helpers wired by JarvisBrain ───────────────────────────────────

export function isIcknexQuery(q) {
  const s = (q || "").toLowerCase();
  return /\bicknex\b/.test(s)
    || /investment\s+(contact|intel|knowledge|opportunity|intelligence)/.test(s)
    || /opportunity\s+intel/.test(s)
    || /blind\s+invest/.test(s)
    || /invest.*intel\s+(coverage|nexus)/.test(s)
    || /investment\s+intelligence\s+nexus/.test(s);
}

export async function buildIcknexScript() {
  const base = apiBase();
  const headers = { "Authorization": `Bearer ${API_KEY}` };
  const [invRaw, conRaw, kbRaw] = await Promise.all([
    fetch(`${base}/entities/Investment`, { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/entities/Contact`,    { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/knowledge/`,          { headers }).then(r => r.json()).catch(() => []),
  ]);
  const investments = normArr(invRaw);
  const contacts    = normArr(conRaw);
  const articles    = normArr(kbRaw);

  let fullyInformed = 0, contactManaged = 0, kbResearched = 0, blind = 0;
  for (const inv of investments) {
    const hasContact = contacts.some(c => overlap(inv, c) > 0);
    const hasKb      = articles.some(a => overlap(inv, a) > 0);
    if (hasContact && hasKb) fullyInformed++;
    else if (hasContact)     contactManaged++;
    else if (hasKb)          kbResearched++;
    else                     blind++;
  }
  const total = investments.length || 1;
  const informedPct = Math.round((fullyInformed / total) * 100);

  return `ICKNEX Investment Intelligence Nexus online, sir. Of ${investments.length} portfolio investments correlated against ${contacts.length} contacts and ${articles.length} knowledge base articles: ${fullyInformed} are fully informed, ${contactManaged} contact-managed, ${kbResearched} KB-researched, and ${blind} represent intelligence blind spots with ${informedPct}% fully informed coverage. ${blind > 0 ? `Recommend prioritising the ${blind} blind-spot investment${blind > 1 ? "s" : ""} for immediate intelligence coverage.` : "All investments have at least one intelligence anchor — coverage is satisfactory."}`;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function InvestmentContactKnowledgeNexus() {
  const [open,        setOpen]        = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [investments, setInvestments] = useState([]);
  const [contacts,    setContacts]    = useState([]);
  const [articles,    setArticles]    = useState([]);
  const [rows,        setRows]        = useState([]);
  const [tab,         setTab]         = useState("ALL");
  const [search,      setSearch]      = useState("");
  const [expanded,    setExpanded]    = useState(null);
  const [brief,       setBrief]       = useState("");
  const [assessing,   setAssessing]   = useState(false);
  const timerRef = useRef(null);

  const classify = useCallback((inv, cons, arts) => {
    const matchedContacts = cons
      .map(c => ({ item: c, hits: overlap(inv, c) }))
      .filter(x => x.hits > 0)
      .sort((a, b) => b.hits - a.hits);
    const matchedArticles = arts
      .map(a => ({ item: a, hits: overlap(inv, a) }))
      .filter(x => x.hits > 0)
      .sort((a, b) => b.hits - a.hits);

    const maxC = matchedContacts[0]?.hits || 1;
    const maxA = matchedArticles[0]?.hits || 1;

    const hasContact = matchedContacts.length > 0;
    const hasKb      = matchedArticles.length > 0;
    let status;
    if (hasContact && hasKb) status = "FULLY_INFORMED";
    else if (hasContact)     status = "CONTACT_MANAGED";
    else if (hasKb)          status = "KB_RESEARCHED";
    else                     status = "BLIND";

    return {
      inv,
      status,
      contacts: matchedContacts.map(x => ({ ...x.item, _rel: relevancePct(x.hits, maxC) })),
      articles: matchedArticles.map(x => ({ ...x.item, _rel: relevancePct(x.hits, maxA) })),
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setBrief("");
    const base = apiBase();
    const headers = { "Authorization": `Bearer ${API_KEY}` };
    try {
      const [invRaw, conRaw, kbRaw] = await Promise.all([
        fetch(`${base}/entities/Investment`, { headers }).then(r => r.json()).catch(() => []),
        fetch(`${base}/entities/Contact`,    { headers }).then(r => r.json()).catch(() => []),
        fetch(`${base}/knowledge/`,          { headers }).then(r => r.json()).catch(() => []),
      ]);
      const invs  = normArr(invRaw);
      const cons  = normArr(conRaw);
      const arts  = normArr(kbRaw);
      setInvestments(invs);
      setContacts(cons);
      setArticles(arts);
      setRows(invs.map(inv => classify(inv, cons, arts)));
    } finally {
      setLoading(false);
    }
  }, [classify]);

  useEffect(() => {
    const toggle = () => setOpen(o => {
      if (!o) load();
      return !o;
    });
    window.addEventListener("jarvis:icknex-toggle", toggle);
    return () => window.removeEventListener("jarvis:icknex-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    const base = apiBase();
    const headers = { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" };
    const fullyInformed  = rows.filter(r => r.status === "FULLY_INFORMED").length;
    const contactManaged = rows.filter(r => r.status === "CONTACT_MANAGED").length;
    const kbResearched   = rows.filter(r => r.status === "KB_RESEARCHED").length;
    const blind          = rows.filter(r => r.status === "BLIND").length;
    const ctx = `JARVIS ICKNEX: ${investments.length} investments vs ${contacts.length} contacts and ${articles.length} KB articles. Fully informed: ${fullyInformed}. Contact-managed only: ${contactManaged}. KB-researched only: ${kbResearched}. Blind (no coverage): ${blind}. Top blind investments: ${rows.filter(r=>r.status==="BLIND").slice(0,3).map(r=>r.inv.name||r.inv.title||"unnamed").join(", ")||"none"}.`;
    try {
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers,
        body: JSON.stringify({ message: `${ctx} Give a 2-sentence investment intelligence coverage assessment.` }),
      });
      const j = await res.json().catch(() => ({}));
      setBrief(j.response || j.answer || j.message || "Assessment complete.");
    } catch {
      setBrief("Assessment complete. Review blind-spot investments for intelligence coverage gaps.");
    } finally {
      setAssessing(false);
    }
  }, [rows, investments.length, contacts.length, articles.length]);

  if (!open) {
    const blindCount = rows.filter(r => r.status === "BLIND").length;
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Investment × Contact × Knowledge Opportunity Intelligence Nexus"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 216,
          background: "rgba(4,7,14,0.82)", border: `1px solid ${CY}55`,
          color: CY, fontFamily: MONO, fontSize: 10, letterSpacing: 2,
          padding: "3px 9px", borderRadius: 4, cursor: "pointer",
          backdropFilter: "blur(6px)", whiteSpace: "nowrap",
        }}
      >
        ◈ ICKNEX
        {blindCount > 0 && (
          <span style={{
            marginLeft: 5, background: AMBER, color: "#000",
            borderRadius: 3, padding: "1px 5px", fontSize: 9, fontWeight: 700,
          }}>{blindCount}</span>
        )}
      </button>
    );
  }

  // ── stats ──────────────────────────────────────────────────────────────────
  const fullyInformed  = rows.filter(r => r.status === "FULLY_INFORMED").length;
  const contactManaged = rows.filter(r => r.status === "CONTACT_MANAGED").length;
  const kbResearched   = rows.filter(r => r.status === "KB_RESEARCHED").length;
  const blind          = rows.filter(r => r.status === "BLIND").length;
  const informedPct    = rows.length ? Math.round((fullyInformed / rows.length) * 100) : 0;

  const TABS = ["ALL","FULLY_INFORMED","CONTACT_MANAGED","KB_RESEARCHED","BLIND"];
  const filtered = rows.filter(r => {
    if (tab !== "ALL" && r.status !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      const inv = r.inv;
      const haystack = [inv.name, inv.description, inv.sector, inv.type].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(s)) return false;
    }
    return true;
  });

  const statusColor = s => s === "FULLY_INFORMED" ? GREEN : s === "BLIND" ? "#FF3B6B" : s === "CONTACT_MANAGED" ? ORANGE : CY;

  return (
    <div style={{
      position: "fixed", left: 0, top: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.72)", zIndex: 216, display: "flex",
      alignItems: "center", justifyContent: "center",
    }} onClick={e => e.target === e.currentTarget && setOpen(false)}>
      <div style={{
        width: "min(900px,96vw)", maxHeight: "88vh", background: BG,
        border: `1px solid ${CY}44`, borderRadius: 14, display: "flex",
        flexDirection: "column", fontFamily: MONO, color: "#DCEBF5",
        boxShadow: `0 0 80px ${CY}18`, overflow: "hidden",
      }}>
        {/* header */}
        <div style={{
          padding: "12px 18px", borderBottom: `1px solid ${CY}22`,
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        }}>
          <span style={{ color: CY, fontWeight: 700, letterSpacing: 3, fontSize: 12 }}>◈ ICKNEX</span>
          <span style={{ color: MUTED, fontSize: 10, flex: 1 }}>
            Investment × Contact × Knowledge Opportunity Intelligence Nexus
          </span>
          {loading && <span style={{ color: AMBER, fontSize: 10, letterSpacing: 2 }}>LOADING…</span>}
          <button onClick={load} style={{ background: "none", border: `1px solid ${CY}44`, color: CY, cursor: "pointer", borderRadius: 4, padding: "2px 10px", fontSize: 10 }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 8, padding: "10px 18px", flexWrap: "wrap" }}>
          {[
            ["INVESTMENTS", investments.length, CY],
            ["CONTACTS",    contacts.length,    ORANGE],
            ["KB ARTICLES", articles.length,    GREEN],
            ["FULLY INF.",  fullyInformed,       GREEN],
            ["CONTACT MGD", contactManaged,      ORANGE],
            ["KB RESEARCH", kbResearched,        CY],
            ["BLIND",       blind,               "#FF3B6B"],
            [`INFORMED ${informedPct}%`, `${informedPct}%`, informedPct >= 60 ? GREEN : informedPct >= 30 ? AMBER : "#FF3B6B"],
          ].map(([label, val, col]) => (
            <div key={label} style={{
              background: "rgba(255,255,255,0.03)", border: `1px solid ${col}33`,
              borderRadius: 6, padding: "6px 12px", minWidth: 80, textAlign: "center",
            }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: col }}>{val}</div>
              <div style={{ fontSize: 9, color: MUTED, letterSpacing: 1, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* coverage bar */}
        <div style={{ padding: "0 18px 8px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 9, color: MUTED, letterSpacing: 1, minWidth: 100 }}>INTEL COVERAGE</span>
          <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${informedPct}%`, height: "100%", background: `linear-gradient(90deg,${CY},${GREEN})`, transition: "width .5s" }} />
          </div>
          <span style={{ fontSize: 9, color: informedPct >= 60 ? GREEN : AMBER, minWidth: 30 }}>{informedPct}%</span>
        </div>

        {/* tabs */}
        <div style={{ display: "flex", gap: 4, padding: "0 18px 8px", flexWrap: "wrap" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? `${CY}22` : "none",
              border: `1px solid ${tab === t ? CY : CY + "33"}`,
              color: tab === t ? CY : MUTED, cursor: "pointer",
              borderRadius: 4, padding: "3px 10px", fontSize: 9, letterSpacing: 1,
            }}>{t.replace("_", " ")}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search investments…"
            style={{
              marginLeft: "auto", background: "rgba(255,255,255,0.04)",
              border: `1px solid ${CY}33`, color: "#DCEBF5",
              borderRadius: 4, padding: "3px 10px", fontSize: 10,
              fontFamily: MONO, outline: "none",
            }}
          />
        </div>

        {/* rows */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 18px 14px" }}>
          {filtered.length === 0 && !loading && (
            <div style={{ color: MUTED, fontSize: 11, textAlign: "center", paddingTop: 30 }}>
              {investments.length === 0 ? "No investment data returned." : "No items match the current filter."}
            </div>
          )}
          {filtered.map((row, i) => {
            const inv  = row.inv;
            const key  = inv.id || inv.name || i;
            const isEx = expanded === key;
            const col  = statusColor(row.status);
            return (
              <div key={key} style={{ borderBottom: `1px solid ${CY}11`, paddingBottom: 8, marginBottom: 8 }}>
                <div
                  onClick={() => setExpanded(isEx ? null : key)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    cursor: "pointer", padding: "4px 0",
                  }}
                >
                  <span style={{ fontSize: 9, color: col, border: `1px solid ${col}55`, borderRadius: 3, padding: "1px 6px", letterSpacing: 1, minWidth: 110, textAlign: "center" }}>
                    {row.status.replace(/_/g, " ")}
                  </span>
                  <span style={{ flex: 1, fontSize: 11, color: "#DCEBF5" }}>
                    {inv.name || inv.title || "Unnamed Investment"}
                  </span>
                  {inv.sector && <span style={{ fontSize: 9, color: MUTED }}>{inv.sector}</span>}
                  {inv.type   && <span style={{ fontSize: 9, color: MUTED, marginLeft: 4 }}>{inv.type}</span>}
                  <span style={{ color: CY, fontSize: 10 }}>{isEx ? "▲" : "▼"}</span>
                </div>

                {isEx && (
                  <div style={{ padding: "6px 0 4px 12px", display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {/* matched contacts */}
                    {row.contacts.length > 0 && (
                      <div style={{ flex: "1 1 200px" }}>
                        <div style={{ fontSize: 9, color: ORANGE, letterSpacing: 2, marginBottom: 4 }}>CONTACTS ({row.contacts.length})</div>
                        {row.contacts.slice(0, 5).map((c, ci) => (
                          <div key={ci} style={{ marginBottom: 5 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                              <span style={{ fontSize: 10, color: "#DCEBF5" }}>{c.name || "—"}</span>
                              {c.role && <span style={{ fontSize: 8, color: MUTED, border: `1px solid ${MUTED}44`, borderRadius: 3, padding: "0 4px" }}>{c.role}</span>}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                                <div style={{ width: `${c._rel}%`, height: "100%", background: ORANGE }} />
                              </div>
                              <span style={{ fontSize: 8, color: MUTED, minWidth: 28 }}>{c._rel}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* matched KB articles */}
                    {row.articles.length > 0 && (
                      <div style={{ flex: "1 1 200px" }}>
                        <div style={{ fontSize: 9, color: GREEN, letterSpacing: 2, marginBottom: 4 }}>KB ARTICLES ({row.articles.length})</div>
                        {row.articles.slice(0, 5).map((a, ai) => (
                          <div key={ai} style={{ marginBottom: 5 }}>
                            <div style={{ fontSize: 10, color: "#DCEBF5", marginBottom: 2 }}>{a.title || a.name || "—"}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                                <div style={{ width: `${a._rel}%`, height: "100%", background: GREEN }} />
                              </div>
                              <span style={{ fontSize: 8, color: MUTED, minWidth: 28 }}>{a._rel}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {row.contacts.length === 0 && row.articles.length === 0 && (
                      <div style={{ fontSize: 10, color: "#FF3B6B", paddingLeft: 4 }}>No intelligence coverage found.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* assess + brief */}
        <div style={{ borderTop: `1px solid ${CY}22`, padding: "10px 18px", display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
          <button onClick={assess} disabled={assessing || rows.length === 0} style={{
            background: assessing ? "none" : `${CY}22`, border: `1px solid ${CY}55`,
            color: CY, cursor: assessing ? "default" : "pointer",
            borderRadius: 4, padding: "4px 14px", fontSize: 10, fontFamily: MONO, letterSpacing: 1,
          }}>
            {assessing ? "ASSESSING…" : "▶ ASSESS INTELLIGENCE"}
          </button>
          {brief && (
            <div style={{ flex: 1, fontSize: 11, color: "#DCEBF5", lineHeight: 1.5, minWidth: 200 }}>
              {brief}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
