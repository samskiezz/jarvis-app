/**
 * F744 — Intel Profile × Investment × Knowledge Triple Nexus (IIPKVTRI)
 *
 * Cross-references /entities/IntelProfile × /entities/Investment × /knowledge/articles
 * to surface threat actors with no portfolio exposure or knowledge documentation.
 *
 *   FULLY_CONTEXTUALIZED — profile matches ≥1 investment AND ≥1 KB article
 *   INVESTMENT_ONLY      — investment match but no KB article
 *   KB_ONLY              — KB article exists, no investment overlap
 *   DARK                 — no investment or KB coverage
 *
 * Stat tiles: PROFILES | FULLY CONTEXTUALIZED | INV ONLY | KB ONLY | DARK | COVERAGE %
 * Filter tabs: ALL | FULLY_CONTEXTUALIZED | INVESTMENT_ONLY | KB_ONLY | DARK + search
 * Expand profile → matched investments (sector badge + hits) + matched KB articles (kind badge + hits)
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence threat-investment brief + TTS
 *
 * Button: ◈ IIPKVTRI  left:911660 bottom:8 zIndex:603
 * Event:  jarvis:iipkvtri-toggle
 * Refresh: 90 s auto-poll
 * Voice:  "iipkvtri / intel profile investment knowledge / threat actor investment /
 *          profile portfolio / dark intel profile / intel investment coverage /
 *          covered intel profile / intel profile knowledge / threat investment nexus"
 */
import { useCallback, useEffect, useRef, useState } from "react";

const CY  = "#29E7FF";
const AM  = "#FFB347";
const GN  = "#39FF14";
const RD  = "#FF4444";
const PR  = "#B47FFF";
const DIM = "#8899AA";
const DK  = "#556677";

const BTN_LEFT = 911_660;
const Z_IDX    = 603;
const POLL_MS  = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const IIPKVTRI_RE =
  /\b(iipkvtri|intel[\s._-]?profile[\s._-]?investment[\s._-]?knowledge|threat[\s._-]?actor[\s._-]?investment|profile[\s._-]?portfolio|dark[\s._-]?intel[\s._-]?profile|intel[\s._-]?investment[\s._-]?coverage|covered[\s._-]?intel[\s._-]?profile|intel[\s._-]?profile[\s._-]?knowledge|threat[\s._-]?investment[\s._-]?nexus)\b/i;

export function isIipkvtriQuery(t) {
  return IIPKVTRI_RE.test(t || "");
}

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  return (env.VITE_API_BASE_URL || "").replace(/\/$/, "") || "http://localhost:8000";
}

function tokenise(str = "") {
  return String(str).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function overlap(keyA, keyB) {
  const sa = new Set(tokenise(keyA));
  return tokenise(keyB).filter(t => sa.has(t)).length;
}

function profileKey(p) {
  return [p.name, p.full_name, p.alias, p.description, p.threat_type, p.category,
          ...(p.tags || [])].filter(Boolean).join(" ");
}
function investmentKey(inv) {
  return [inv.name, inv.ticker, inv.sector, inv.description, inv.category, inv.type,
          ...(inv.tags || [])].filter(Boolean).join(" ");
}
function articleKey(a) {
  return [a.title, a.name, a.subject, a.kind, a.category,
          ...(a.tags || [])].filter(Boolean).join(" ");
}

function classifyProfile(profile, investments, articles) {
  const pk = profileKey(profile);
  const matchedInv = investments
    .map(inv => ({ ...inv, hits: overlap(pk, investmentKey(inv)) }))
    .filter(inv => inv.hits > 0);
  const matchedArt = articles
    .map(art => ({ ...art, hits: overlap(pk, articleKey(art)) }))
    .filter(art => art.hits > 0);

  let classification;
  if (matchedInv.length && matchedArt.length) classification = "FULLY_CONTEXTUALIZED";
  else if (matchedInv.length)                 classification = "INVESTMENT_ONLY";
  else if (matchedArt.length)                 classification = "KB_ONLY";
  else                                        classification = "DARK";

  return { ...profile, classification, matchedInv, matchedArt };
}

export async function buildIipkvtriScript() {
  try {
    const h = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
    const base = apiBase();
    const [prR, invR, artR] = await Promise.all([
      fetch(`${base}/entities/IntelProfile`, { headers: h }),
      fetch(`${base}/entities/Investment`, { headers: h }),
      fetch(`${base}/knowledge/articles?limit=200`, { headers: h }),
    ]);
    const prData  = await prR.json();
    const invData = await invR.json();
    const artData = await artR.json();

    const profiles     = Array.isArray(prData)  ? prData  : (prData.profiles  || prData.items  || []);
    const investments  = Array.isArray(invData)  ? invData : (invData.investments || invData.items || []);
    const articles     = Array.isArray(artData)  ? artData : (artData.articles || artData.items  || []);

    let fully = 0, invOnly = 0, kbOnly = 0, dark = 0;
    for (const p of profiles) {
      const cl = classifyProfile(p, investments, articles).classification;
      if      (cl === "FULLY_CONTEXTUALIZED") fully++;
      else if (cl === "INVESTMENT_ONLY")      invOnly++;
      else if (cl === "KB_ONLY")              kbOnly++;
      else                                    dark++;
    }
    const pct = profiles.length ? Math.round((fully / profiles.length) * 100) : 0;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST", headers: h,
      body: JSON.stringify({
        message: `Intel profile coverage: ${profiles.length} profiles total, ${fully} fully contextualized (investment+KB), ${invOnly} investment-only, ${kbOnly} KB-only, ${dark} dark (no coverage), ${pct}% full coverage. Using ${investments.length} investments and ${articles.length} knowledge articles. In 2 sentences, assess which threat actors lack investment-portfolio overlap or intelligence documentation.`,
      }),
    });
    const d = await r.json();
    return (d.answer || d.response || d.reply || "Intel profile coverage assessed.").replace(/<<ACTION:[^>]*>>/g, "").trim();
  } catch {
    return "Intel profile × investment × knowledge triple coverage unavailable.";
  }
}

// ── Classification colour map ──────────────────────────────────────────────
const CLS_COLOR = {
  FULLY_CONTEXTUALIZED: GN,
  INVESTMENT_ONLY:      AM,
  KB_ONLY:              PR,
  DARK:                 DK,
};

// ── Sector colour for investment badges ───────────────────────────────────
const SECTOR_COLOR = {
  TECH:    CY,
  FINANCE: AM,
  ENERGY:  GN,
  DEFENSE: RD,
  HEALTH:  PR,
  DEFAULT: DIM,
};

function sectorColor(sector = "") {
  return SECTOR_COLOR[(sector || "").toUpperCase()] || SECTOR_COLOR.DEFAULT;
}

const TABS = ["ALL", "FULLY_CONTEXTUALIZED", "INVESTMENT_ONLY", "KB_ONLY", "DARK"];

// ── Component ──────────────────────────────────────────────────────────────
export default function IntelProfileInvestmentKnowledgeTriple() {
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState(null);
  const [profiles, setProfiles]       = useState([]);
  const [investments, setInvestments] = useState([]);
  const [articles, setArticles]       = useState([]);
  const [classified, setClassified]   = useState([]);
  const [tab, setTab]         = useState("ALL");
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const h = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
      const base = apiBase();
      const [prR, invR, artR] = await Promise.all([
        fetch(`${base}/entities/IntelProfile`, { headers: h }),
        fetch(`${base}/entities/Investment`, { headers: h }),
        fetch(`${base}/knowledge/articles?limit=200`, { headers: h }),
      ]);
      const prData  = prR.ok  ? await prR.json()  : {};
      const invData = invR.ok ? await invR.json() : {};
      const artData = artR.ok ? await artR.json() : {};

      const pr  = Array.isArray(prData)  ? prData  : (prData.profiles  || prData.items  || []);
      const inv = Array.isArray(invData)  ? invData : (invData.investments || invData.items || []);
      const art = Array.isArray(artData)  ? artData : (artData.articles || artData.items  || []);

      setProfiles(pr);
      setInvestments(inv);
      setArticles(art);
      setClassified(pr.map(p => classifyProfile(p, inv, art)));
    } catch (e) {
      setErr(e.message || "Fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener("jarvis:iipkvtri-toggle", toggle);
    return () => window.removeEventListener("jarvis:iipkvtri-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fully   = classified.filter(p => p.classification === "FULLY_CONTEXTUALIZED").length;
  const invOnly = classified.filter(p => p.classification === "INVESTMENT_ONLY").length;
  const kbOnly  = classified.filter(p => p.classification === "KB_ONLY").length;
  const dark    = classified.filter(p => p.classification === "DARK").length;
  const pct     = profiles.length ? Math.round((fully / profiles.length) * 100) : 0;

  const visible = classified.filter(row => {
    const matchTab = tab === "ALL" || row.classification === tab;
    const s = search.toLowerCase();
    const matchSearch = !s
      || (row.name || "").toLowerCase().includes(s)
      || (row.threat_type || "").toLowerCase().includes(s)
      || (row.category || "").toLowerCase().includes(s);
    return matchTab && matchSearch;
  });

  async function assess(row) {
    setAssessing(row.id || row.name);
    const h = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
    const base = apiBase();
    const prompt = `Intel profile "${row.name || row.full_name}" (type: ${row.threat_type || "unknown"}, classification: ${row.classification}). Matched investments: ${row.matchedInv.map(i => i.name || i.ticker).join(", ") || "none"}. Matched KB articles: ${row.matchedArt.map(a => a.title || a.name).join(", ") || "none"}. In 2 sentences, assess this profile's investment-portfolio exposure and knowledge documentation gap.`;
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
    { label: "PROFILES",           value: profiles.length, color: CY },
    { label: "FULLY CONTEXTUALIZED", value: fully,         color: GN },
    { label: "INV ONLY",           value: invOnly,         color: AM },
    { label: "KB ONLY",            value: kbOnly,          color: PR },
    { label: "DARK",               value: dark,            color: DK },
    { label: "COVERAGE %",         value: `${pct}%`,
      color: pct >= 70 ? GN : pct >= 40 ? AM : RD },
  ];

  const panel = {
    position: "fixed", bottom: 60, left: Math.max(8, BTN_LEFT - 620), width: 680,
    maxHeight: "80vh", overflowY: "auto",
    background: "rgba(4,14,24,0.97)",
    border: `1px solid ${CY}44`,
    borderRadius: 8, padding: 18, zIndex: Z_IDX,
    fontFamily: "monospace", fontSize: 12, color: CY,
    display: open ? "flex" : "none", flexDirection: "column", gap: 10,
  };

  return (
    <>
      {/* ── Trigger button ── */}
      <button
        onClick={() => { setOpen(o => { if (!o) load(); return !o; }); }}
        title="Intel Profile × Investment × Knowledge Triple Nexus"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_IDX,
          background: open ? `${CY}22` : "rgba(4,14,24,0.85)",
          border: `1px solid ${open ? CY : CY + "55"}`,
          color: open ? CY : DIM, borderRadius: 4, padding: "3px 8px",
          cursor: "pointer", fontSize: 11, fontFamily: "monospace", letterSpacing: 1,
        }}
      >
        ◈ IIPKVTRI
        {dark > 0 && (
          <span style={{
            marginLeft: 5, background: DK, color: "#fff",
            borderRadius: "50%", padding: "0 4px", fontSize: 9,
          }}>{dark}</span>
        )}
      </button>

      {/* ── Panel ── */}
      <div style={panel}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: CY, fontWeight: "bold", letterSpacing: 2 }}>
            INTEL PROFILE × INVESTMENT × KNOWLEDGE
          </span>
          {loading && <span style={{ color: AM, fontSize: 10 }}>LOADING…</span>}
          <button onClick={() => setOpen(false)}
            style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>

        {err && <div style={{ color: RD, fontSize: 11 }}>Error: {err}</div>}

        {/* Stat tiles */}
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

        {/* Filter tabs + search */}
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
            placeholder="search profiles…"
            style={{
              background: "none", border: `1px solid ${CY}33`, color: CY,
              borderRadius: 3, padding: "2px 8px", fontSize: 10,
              fontFamily: "monospace", flex: 1, minWidth: 100, outline: "none",
            }}
          />
        </div>

        {/* Rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {visible.length === 0 && !loading && (
            <div style={{ color: DIM, textAlign: "center", padding: 20 }}>No profiles match filter.</div>
          )}
          {visible.map(row => {
            const rowId   = row.id || row.name || Math.random();
            const isExp   = expanded === rowId;
            const cCol    = CLS_COLOR[row.classification] || DK;
            const label   = (row.name || row.full_name || "Unknown").slice(0, 50);
            const typeTag = row.threat_type || row.category || "";
            return (
              <div key={rowId} style={{
                border: `1px solid ${cCol}33`, borderRadius: 4, padding: "6px 10px",
                background: `${cCol}08`, cursor: "pointer",
              }} onClick={() => setExpanded(isExp ? null : rowId)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: CY, flex: 1 }}>{label}</span>
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {typeTag && (
                      <span style={{
                        background: `${AM}22`, border: `1px solid ${AM}55`,
                        color: AM, borderRadius: 3, padding: "1px 5px", fontSize: 9,
                      }}>{typeTag}</span>
                    )}
                    <span style={{
                      background: `${cCol}22`, border: `1px solid ${cCol}55`,
                      color: cCol, borderRadius: 3, padding: "1px 6px", fontSize: 9,
                    }}>{row.classification.replace(/_/g, " ")}</span>
                    <span style={{ color: DIM, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                  </span>
                </div>

                {isExp && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                    {row.matchedInv.length > 0 && (
                      <div>
                        <div style={{ color: AM, fontSize: 10, marginBottom: 3 }}>MATCHED INVESTMENTS</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {row.matchedInv.slice(0, 8).map((inv, idx) => {
                            const sc = sectorColor(inv.sector);
                            return (
                              <span key={inv.id || idx} style={{
                                background: `${sc}18`, border: `1px solid ${sc}44`,
                                color: sc, borderRadius: 3, padding: "1px 6px", fontSize: 9,
                              }}>
                                {(inv.name || inv.ticker || "?").slice(0, 28)} ({inv.hits})
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {row.matchedArt.length > 0 && (
                      <div>
                        <div style={{ color: PR, fontSize: 10, marginBottom: 3 }}>MATCHED KB ARTICLES</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {row.matchedArt.slice(0, 6).map((art, idx) => (
                            <span key={art.id || idx} style={{
                              background: `${PR}18`, border: `1px solid ${PR}44`,
                              color: PR, borderRadius: 3, padding: "1px 6px", fontSize: 9,
                            }}>
                              {(art.title || art.name || "?").slice(0, 30)} ({art.hits})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {row.matchedInv.length === 0 && row.matchedArt.length === 0 && (
                      <div style={{ color: DK, fontSize: 10 }}>No investment or KB coverage found.</div>
                    )}
                    <button
                      disabled={assessing === (row.id || row.name)}
                      onClick={e => { e.stopPropagation(); assess(row); }}
                      style={{
                        alignSelf: "flex-start",
                        background: assessing === (row.id || row.name) ? `${DIM}22` : `${GN}22`,
                        border: `1px solid ${assessing === (row.id || row.name) ? DIM : GN}`,
                        color: assessing === (row.id || row.name) ? DIM : GN,
                        borderRadius: 3, padding: "3px 10px",
                        cursor: assessing === (row.id || row.name) ? "wait" : "pointer",
                        fontSize: 10, fontFamily: "monospace",
                      }}
                    >▶ {assessing === (row.id || row.name) ? "ASSESSING…" : "ASSESS"}</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ color: DK, fontSize: 9, textAlign: "right", marginTop: 4 }}>
          IIPKVTRI · {profiles.length} profiles · {investments.length} investments · {articles.length} articles · auto-refresh 90s
        </div>
      </div>
    </>
  );
}
