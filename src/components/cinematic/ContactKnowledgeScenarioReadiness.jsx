/**
 * F82 — Contact × Knowledge × Scenario Intelligence Readiness Index (CKIRI)
 * Endpoints: /entities/Contact × /knowledge/ × /v1/scenario/list
 * Classification: FULLY_BRIEFED  (KB article + scenario both matched)
 *                 KB_INFORMED    (KB match only)
 *                 SCENARIO_PLACED (scenario match only)
 *                 UNINFORMED     (no match in either source)
 */
import { useEffect, useState, useRef } from "react";

const BTN_LEFT = 989_400;
const POLL_MS  = 90_000;
const Z_INDEX  = 145;

const API_KEY =
  (typeof window !== "undefined" && window.__JARVIS_API_KEY__) ||
  import.meta.env?.VITE_API_KEY ||
  "";

function apiBase() {
  return (
    (typeof window !== "undefined" && window.__JARVIS_API_BASE__) ||
    import.meta.env?.VITE_API_BASE ||
    ""
  );
}

const CKIRI_RE =
  /\b(ckiri|contact\s*(intelligence|briefing|readiness|knowledge|scenario)|personnel\s*(readiness|briefing|intelligence)|briefed\s*contacts?|uninformed\s*contacts?|knowledge\s*(briefing|readiness)|readiness\s*index)\b/i;

export function isCkiriQuery(t) {
  return CKIRI_RE.test(t || "");
}

function normaliseContact(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.contact_id || raw._id || String(Math.random()),
    name: raw.name || raw.full_name || raw.display_name || "Unknown Contact",
    role: raw.role || raw.title || raw.position || "",
    org: raw.org || raw.organisation || raw.organization || raw.company || "",
    description: raw.description || raw.bio || raw.notes || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
  };
}

function normaliseArticle(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.article_id || raw._id || String(Math.random()),
    title: raw.title || raw.name || raw.headline || "Untitled Article",
    content: raw.content || raw.body || raw.summary || raw.description || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    type: raw.type || raw.category || "",
  };
}

function normaliseScenario(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.scenario_id || raw._id || String(Math.random()),
    name: raw.name || raw.title || raw.scenario_name || "Untitled Scenario",
    description: raw.description || raw.summary || raw.details || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
  };
}

function tokenize(s) {
  if (!s) return [];
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function scoreMatch(contactTokens, item) {
  const itemTokens = tokenize(
    `${item.title || item.name || ""} ${item.content || item.description || ""} ${(item.tags || []).join(" ")} ${item.type || ""}`
  );
  if (!contactTokens.length || !itemTokens.length) return 0;
  const set = new Set(itemTokens);
  return contactTokens.filter((t) => set.has(t)).length;
}

const CY = "#00e5ff";
const AM = "#ffc107";
const GR = "#4ade80";
const PU = "#a78bfa";

const CLASS_META = {
  FULLY_BRIEFED:    { label: "FULLY BRIEFED",    color: GR,    desc: "Contact has both KB knowledge and a scenario placement" },
  KB_INFORMED:      { label: "KB INFORMED",      color: CY,    desc: "Contact matched in knowledge base, no scenario" },
  SCENARIO_PLACED:  { label: "SCENARIO PLACED",  color: PU,    desc: "Contact placed in a scenario, no KB knowledge" },
  UNINFORMED:       { label: "UNINFORMED",        color: "#555", desc: "No KB or scenario coverage — intelligence gap" },
};

const TABS = ["ALL", "FULLY_BRIEFED", "KB_INFORMED", "SCENARIO_PLACED", "UNINFORMED"];

export async function buildCkiriScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [ctRes, kbRes, scRes] = await Promise.allSettled([
    fetch(`${base}/entities/Contact`, { headers }).then((r) => r.json()),
    fetch(`${base}/knowledge/`,       { headers }).then((r) => r.json()),
    fetch(`${base}/v1/scenario/list`, { headers }).then((r) => r.json()),
  ]);

  const contacts  = ctRes.status === "fulfilled" ? ctRes.value : [];
  const knowledge = kbRes.status === "fulfilled" ? kbRes.value : [];
  const scenarios = scRes.status === "fulfilled" ? scRes.value : [];

  const ctArr = (Array.isArray(contacts)  ? contacts  : contacts?.items  || contacts?.data  || []).map(normaliseContact).filter(Boolean);
  const kbArr = (Array.isArray(knowledge) ? knowledge : knowledge?.items || knowledge?.data || []).map(normaliseArticle).filter(Boolean);
  const scArr = (Array.isArray(scenarios) ? scenarios : scenarios?.items || scenarios?.data || []).map(normaliseScenario).filter(Boolean);

  const counts = { FULLY_BRIEFED: 0, KB_INFORMED: 0, SCENARIO_PLACED: 0, UNINFORMED: 0 };
  for (const ct of ctArr) {
    const tok  = tokenize(`${ct.name} ${ct.role} ${ct.org} ${ct.description} ${ct.tags.join(" ")}`);
    const hasKb = kbArr.some((a) => scoreMatch(tok, a) > 0);
    const hasSc = scArr.some((s) => scoreMatch(tok, s) > 0);
    if (hasKb && hasSc)   counts.FULLY_BRIEFED++;
    else if (hasKb)        counts.KB_INFORMED++;
    else if (hasSc)        counts.SCENARIO_PLACED++;
    else                   counts.UNINFORMED++;
  }

  const readyPct = ctArr.length
    ? Math.round((counts.FULLY_BRIEFED / ctArr.length) * 100)
    : 0;

  return `Contact Intelligence Readiness Index online, sir. ${ctArr.length} contacts cross-referenced against ${kbArr.length} knowledge articles and ${scArr.length} scenarios — ${counts.FULLY_BRIEFED} contacts are fully briefed with both knowledge base coverage and scenario placement, ${counts.KB_INFORMED} have knowledge base coverage only, ${counts.SCENARIO_PLACED} are placed in scenarios without KB backing, and ${counts.UNINFORMED} contacts have no intelligence coverage whatsoever. Full readiness stands at ${readyPct}%.`.trim();
}

export default function ContactKnowledgeScenarioReadiness() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [brief, setBrief]         = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const base = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [ctRes, kbRes, scRes] = await Promise.allSettled([
        fetch(`${base}/entities/Contact`, { headers }).then((r) => r.json()),
        fetch(`${base}/knowledge/`,       { headers }).then((r) => r.json()),
        fetch(`${base}/v1/scenario/list`, { headers }).then((r) => r.json()),
      ]);

      const contacts  = ctRes.status === "fulfilled" ? ctRes.value : [];
      const knowledge = kbRes.status === "fulfilled" ? kbRes.value : [];
      const scenarios = scRes.status === "fulfilled" ? scRes.value : [];

      const ctArr = (Array.isArray(contacts)  ? contacts  : contacts?.items  || contacts?.data  || []).map(normaliseContact).filter(Boolean);
      const kbArr = (Array.isArray(knowledge) ? knowledge : knowledge?.items || knowledge?.data || []).map(normaliseArticle).filter(Boolean);
      const scArr = (Array.isArray(scenarios) ? scenarios : scenarios?.items || scenarios?.data || []).map(normaliseScenario).filter(Boolean);

      const mapped = ctArr.map((ct) => {
        const tok = tokenize(`${ct.name} ${ct.role} ${ct.org} ${ct.description} ${ct.tags.join(" ")}`);
        const matchedArticles = kbArr
          .map((a) => ({ ...a, score: scoreMatch(tok, a) }))
          .filter((a) => a.score > 0)
          .sort((a, b) => b.score - a.score);
        const matchedScenarios = scArr
          .map((s) => ({ ...s, score: scoreMatch(tok, s) }))
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score);
        const hasKb = matchedArticles.length  > 0;
        const hasSc = matchedScenarios.length > 0;
        const cls =
          hasKb && hasSc ? "FULLY_BRIEFED"   :
          hasKb           ? "KB_INFORMED"     :
          hasSc           ? "SCENARIO_PLACED" :
                            "UNINFORMED";
        return { ct, matchedArticles, matchedScenarios, cls };
      });

      setRows(mapped);
    } catch (e) {
      setError(e?.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("jarvis:ckiri-toggle", handler);
    return () => window.removeEventListener("jarvis:ckiri-toggle", handler);
  }, []);

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
      const counts = {};
      for (const cls of ["FULLY_BRIEFED", "KB_INFORMED", "SCENARIO_PLACED", "UNINFORMED"]) {
        counts[cls] = rows.filter((r) => r.cls === cls).length;
      }
      const prompt = `JARVIS CKIRI Assessment: ${rows.length} contacts cross-referenced against knowledge base and scenarios. FULLY_BRIEFED: ${counts.FULLY_BRIEFED}, KB_INFORMED: ${counts.KB_INFORMED}, SCENARIO_PLACED: ${counts.SCENARIO_PLACED}, UNINFORMED: ${counts.UNINFORMED}. Provide a 2-sentence intelligence readiness assessment and top recommendation.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = (d.answer || "Assessment complete.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(text);
      try {
        await fetch(`${base}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text, voice: (typeof window !== "undefined" && window.__JARVIS_VOICE__) || "ash" }),
        }).then(async (res) => {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.play();
        });
      } catch { /* TTS optional */ }
    } catch (e) {
      setBrief(e?.message || "Assessment error.");
    } finally {
      setAssessing(false);
    }
  }

  const counts = {};
  for (const cls of ["FULLY_BRIEFED", "KB_INFORMED", "SCENARIO_PLACED", "UNINFORMED"]) {
    counts[cls] = rows.filter((r) => r.cls === cls).length;
  }
  const uninformedCount = counts.UNINFORMED || 0;
  const readyPct = rows.length ? Math.round((counts.FULLY_BRIEFED / rows.length) * 100) : 0;

  const visible = rows.filter((r) => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.ct.name.toLowerCase().includes(q) ||
        r.ct.role.toLowerCase().includes(q) ||
        r.ct.org.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const BTN_STYLE = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 8,
    zIndex: Z_INDEX,
    padding: "4px 10px",
    fontSize: 11,
    letterSpacing: 1,
    border: `1px solid ${uninformedCount > 0 ? AM : CY}55`,
    borderRadius: 6,
    background: "rgba(5,8,13,0.7)",
    color: uninformedCount > 0 ? AM : CY,
    cursor: "pointer",
    backdropFilter: "blur(4px)",
    fontFamily: "'JetBrains Mono',monospace",
    whiteSpace: "nowrap",
  };

  return (
    <>
      <button style={BTN_STYLE} onClick={() => setOpen((v) => !v)} title="Contact × Knowledge × Scenario Readiness Index">
        ◈ CKIRI{uninformedCount > 0 && <span style={{ marginLeft: 4, color: AM }}>({uninformedCount})</span>}
      </button>

      {open && (
        <div style={{
          position: "fixed", top: 60, right: 18, zIndex: Z_INDEX + 1,
          width: "min(700px,94vw)", maxHeight: "80vh",
          background: "rgba(6,10,16,0.95)", border: `1px solid ${CY}33`,
          borderRadius: 14, padding: "16px 18px", backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${CY}18`, fontFamily: "'JetBrains Mono',monospace",
          color: "#DCEBF5", display: "flex", flexDirection: "column", gap: 12,
          overflowY: "auto",
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <span style={{ color: CY, letterSpacing: 2, fontSize: 13, fontWeight: 700 }}>◈ CKIRI</span>
              <span style={{ marginLeft: 10, fontSize: 11, color: "#6E8AA0" }}>Contact × Knowledge × Scenario Intelligence Readiness</span>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 18 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { label: "CONTACTS",   val: rows.length,             color: CY  },
              { label: "FULLY BRIEFED", val: counts.FULLY_BRIEFED, color: GR  },
              { label: "KB ONLY",    val: counts.KB_INFORMED,      color: CY  },
              { label: "SC ONLY",    val: counts.SCENARIO_PLACED,  color: PU  },
              { label: "UNINFORMED", val: uninformedCount,         color: AM  },
              { label: "READINESS",  val: `${readyPct}%`,          color: readyPct >= 60 ? GR : AM },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                padding: "6px 12px", borderRadius: 8,
                border: `1px solid ${color}44`, background: `${color}11`, textAlign: "center",
              }}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Coverage bar */}
          {rows.length > 0 && (
            <div style={{ height: 6, borderRadius: 4, background: "#1a2433", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${readyPct}%`, background: GR, transition: "width 0.6s" }} />
            </div>
          )}

          {/* Filter tabs + search */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "3px 10px", borderRadius: 20, fontSize: 10, letterSpacing: 1, cursor: "pointer",
                border: `1px solid ${tab === t ? CY : "#2a3a4a"}`,
                background: tab === t ? `${CY}22` : "transparent",
                color: tab === t ? CY : "#6E8AA0",
              }}>{t.replace("_", " ")}</button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search contacts…"
              style={{
                marginLeft: "auto", padding: "3px 10px", borderRadius: 20, fontSize: 11,
                background: "rgba(0,229,255,0.06)", border: `1px solid ${CY}33`,
                color: "#DCEBF5", outline: "none", width: 160,
              }}
            />
          </div>

          {/* Body */}
          {loading && <div style={{ color: "#6E8AA0", fontSize: 12 }}>Loading contacts…</div>}
          {error   && <div style={{ color: "#ff4444", fontSize: 12 }}>{error}</div>}

          {!loading && visible.map(({ ct, matchedArticles, matchedScenarios, cls }) => {
            const meta = CLASS_META[cls];
            const isExpanded = expanded === ct.id;
            const topScore = Math.max(
              ...(matchedArticles.map((a) => a.score)),
              ...(matchedScenarios.map((s) => s.score)),
              1
            );
            return (
              <div key={ct.id} style={{
                border: `1px solid ${meta.color}33`, borderRadius: 10, padding: "10px 14px",
                background: `${meta.color}08`,
              }}>
                <div
                  style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                  onClick={() => setExpanded(isExpanded ? null : ct.id)}
                >
                  <span style={{
                    fontSize: 9, letterSpacing: 1, padding: "2px 7px", borderRadius: 4,
                    border: `1px solid ${meta.color}66`, color: meta.color, background: `${meta.color}18`, whiteSpace: "nowrap",
                  }}>{meta.label}</span>
                  <span style={{ fontSize: 13, flex: 1 }}>{ct.name}</span>
                  {ct.role && <span style={{ fontSize: 10, color: "#6E8AA0" }}>{ct.role}</span>}
                  {ct.org  && <span style={{ fontSize: 10, color: "#4a6070" }}>{ct.org}</span>}
                  <span style={{ fontSize: 11, color: "#4a6070" }}>{isExpanded ? "▲" : "▼"}</span>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                    {matchedArticles.length === 0 && matchedScenarios.length === 0 && (
                      <div style={{ fontSize: 11, color: "#4a6070", fontStyle: "italic" }}>No knowledge or scenario coverage found for this contact.</div>
                    )}

                    {matchedArticles.length > 0 && (
                      <>
                        <div style={{ fontSize: 10, color: GR, letterSpacing: 1, marginBottom: 2 }}>KB ARTICLES ({matchedArticles.length})</div>
                        {matchedArticles.slice(0, 4).map((a) => (
                          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 6, background: `${GR}11`, border: `1px solid ${GR}22` }}>
                            <span style={{ fontSize: 11, flex: 1 }}>{a.title}</span>
                            <div style={{ width: 80, height: 4, borderRadius: 2, background: "#1a2433", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${Math.round((a.score / topScore) * 100)}%`, background: GR }} />
                            </div>
                          </div>
                        ))}
                      </>
                    )}

                    {matchedScenarios.length > 0 && (
                      <>
                        <div style={{ fontSize: 10, color: PU, letterSpacing: 1, marginTop: 4, marginBottom: 2 }}>SCENARIOS ({matchedScenarios.length})</div>
                        {matchedScenarios.slice(0, 4).map((s) => (
                          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 6, background: `${PU}11`, border: `1px solid ${PU}22` }}>
                            <span style={{ fontSize: 11, flex: 1 }}>{s.name}</span>
                            <div style={{ width: 80, height: 4, borderRadius: 2, background: "#1a2433", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${Math.round((s.score / topScore) * 100)}%`, background: PU }} />
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Assess button + brief */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 4 }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{
                padding: "6px 16px", borderRadius: 8, fontSize: 11, letterSpacing: 1, cursor: "pointer",
                border: `1px solid ${CY}66`, background: assessing ? `${CY}22` : `${CY}11`,
                color: CY, whiteSpace: "nowrap",
              }}
            >
              {assessing ? "◍ assessing…" : "▶ ASSESS READINESS"}
            </button>
            {brief && <div style={{ fontSize: 12, color: "#DCEBF5", lineHeight: 1.5, flex: 1 }}>{brief}</div>}
          </div>
        </div>
      )}
    </>
  );
}
