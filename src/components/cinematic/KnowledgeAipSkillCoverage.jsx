/**
 * F92 — Knowledge × AIP Skill Coverage (KASC)
 *
 * Parallel-fetches /knowledge/ + /v1/aip/skill every 90 s.
 * Keyword-correlates each KB article (title/summary/content/tags)
 * against AIP skills (name/description/category/tags) to classify:
 *   SKILLED    — at least one AIP skill covers this KB article
 *   UNSUPPORTED — no skill representation for this knowledge piece
 *
 * Amber badge on UNSUPPORTED count.
 *
 * Voice intents: "knowledge skill / skill knowledge / kasc /
 *                kb aip / aip knowledge / knowledge aip skill /
 *                knowledge coverage / skill knowledge gap"
 * Strip button: ◈ KASC  left:3000 bottom:18 zIndex:68
 * Custom event: jarvis:kasc-toggle
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AMB = "#FFD700";
const GRN = "#00E5A0";
const DIM = "#5A7A9A";
const POLL = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const hdrs = { Authorization: `Bearer ${API_KEY}` };

const KASC_RE =
  /\b(knowledge[._\s]?skill|skill[._\s]?knowledge|kasc|kb[._\s]?aip|aip[._\s]?knowledge|knowledge[._\s]?aip[._\s]?skill|knowledge[._\s]?coverage|skill[._\s]?knowledge[._\s]?gap)\b/i;

export function isKascQuery(t) { return KASC_RE.test(t || ""); }

function tokenize(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function relevance(article, skill) {
  const a = tokenize([
    article.title, article.summary, article.content,
    (article.tags || []).join(" "), article.topic || "",
  ].join(" "));
  const b = tokenize([
    skill.name, skill.description,
    skill.category || "", (skill.tags || []).join(" "),
  ].join(" "));
  const setB = new Set(b);
  const hits = a.filter(w => setB.has(w)).length;
  if (!hits) return 0;
  return Math.round((hits / Math.max(a.length, 1)) * 100);
}

export async function buildKascScript() {
  try {
    const base = apiBase();
    const [kr, sr] = await Promise.all([
      fetch(`${base}/knowledge/`, { headers: hdrs }),
      fetch(`${base}/v1/aip/skill`, { headers: hdrs }),
    ]);
    const [kd, sd] = await Promise.all([kr.json(), sr.json()]);
    const articles = (Array.isArray(kd) ? kd : kd.articles || kd.results || kd.items || []);
    const skills = Array.isArray(sd) ? sd : sd.skills || sd.results || [];
    const skilled = articles.filter(a => skills.some(s => relevance(a, s) > 0)).length;
    const unsupported = articles.length - skilled;
    return `Knowledge × AIP Skill Coverage: ${articles.length} KB articles analysed against ${skills.length} AIP skills. ${skilled} articles are SKILLED (matched), ${unsupported} are UNSUPPORTED (no skill coverage). ${unsupported > 0 ? `Recommend creating AIP skills for the ${unsupported} uncovered knowledge areas to close the skill gap.` : "Full skill coverage across all KB articles — well deployed."}`;
  } catch {
    return "Knowledge and AIP skill data temporarily unavailable.";
  }
}

const BTN = {
  position: "fixed", left: 3000, bottom: 18, zIndex: 68,
  background: "rgba(0,20,40,0.82)", border: `1px solid ${CY}44`,
  color: CY, fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
  letterSpacing: 1.4, padding: "4px 8px", cursor: "pointer",
  borderRadius: 3, userSelect: "none",
};
const PANEL = {
  position: "fixed", bottom: 52, left: 2890, width: 420,
  background: "rgba(0,10,24,0.97)", border: `1px solid ${CY}55`,
  borderRadius: 6, zIndex: 200, fontFamily: "'JetBrains Mono',monospace",
  color: CY, fontSize: 10, padding: 14, maxHeight: 520, overflowY: "auto",
};
const ROW_ST = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "4px 0", borderBottom: `1px solid ${CY}18`, cursor: "pointer",
};
const BADGE = (c) => ({
  fontSize: 8, letterSpacing: 1, padding: "1px 5px",
  borderRadius: 2, background: c + "22", border: `1px solid ${c}55`, color: c,
});

export default function KnowledgeAipSkillCoverage() {
  const [open, setOpen] = useState(false);
  const [articles, setArticles] = useState([]);
  const [skills, setSkills] = useState([]);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const base = apiBase();
      const [kr, sr] = await Promise.all([
        fetch(`${base}/knowledge/`, { headers: hdrs }),
        fetch(`${base}/v1/aip/skill`, { headers: hdrs }),
      ]);
      const [kd, sd] = await Promise.all([kr.json(), sr.json()]);
      const rawArticles = Array.isArray(kd) ? kd : kd.articles || kd.results || kd.items || [];
      const rawSkills = Array.isArray(sd) ? sd : sd.skills || sd.results || [];
      setArticles(rawArticles.map(a => ({
        ...a,
        matches: rawSkills
          .map(s => ({ ...s, score: relevance(a, s) }))
          .filter(s => s.score > 0)
          .sort((x, y) => y.score - x.score),
      })));
      setSkills(rawSkills);
    } catch {}
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.query && !isKascQuery(e.detail.query)) return;
      setOpen(v => !v);
    };
    window.addEventListener("jarvis:kasc-toggle", handler);
    return () => window.removeEventListener("jarvis:kasc-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const classified = articles.map(a => ({ ...a, status: a.matches?.length > 0 ? "SKILLED" : "UNSUPPORTED" }));
  const filtered = classified
    .filter(a => tab === "ALL" || a.status === tab)
    .filter(a => !search || [a.title, a.topic, (a.tags || []).join(" ")].join(" ").toLowerCase().includes(search.toLowerCase()));

  const skilled = classified.filter(a => a.status === "SKILLED").length;
  const unsupported = classified.filter(a => a.status === "UNSUPPORTED").length;

  const assess = async () => {
    setAssessing(true); setAssessment("");
    const script = await buildKascScript();
    setAssessment(script);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
  };

  if (!open) {
    return (
      <button style={BTN} onClick={() => setOpen(true)} title="Knowledge × AIP Skill Coverage">
        ◈ KASC{unsupported > 0 && <span style={{ marginLeft: 4, color: AMB }}>▲{unsupported}</span>}
      </button>
    );
  }

  return (
    <>
      <button style={{ ...BTN, borderColor: CY }} onClick={() => setOpen(false)}>◈ KASC ✕</button>
      <div style={PANEL}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ color: CY, letterSpacing: 2, fontSize: 9 }}>KNOWLEDGE × AIP SKILL</span>
          <button onClick={assess} disabled={assessing}
            style={{ fontSize: 8, color: GRN, background: "none", border: `1px solid ${GRN}44`, borderRadius: 2, padding: "1px 6px", cursor: "pointer" }}>
            {assessing ? "…" : "▶ ASSESS"}
          </button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4, marginBottom: 8 }}>
          {[
            ["ARTICLES", articles.length, CY],
            ["SKILLS", skills.length, CY],
            ["SKILLED", skilled, GRN],
            ["UNSUPPORTED", unsupported, AMB],
          ].map(([label, val, c]) => (
            <div key={label} style={{ background: "#0a1628", borderRadius: 3, padding: "4px 6px", textAlign: "center" }}>
              <div style={{ color: c, fontSize: 13, fontWeight: 700 }}>{val}</div>
              <div style={{ color: DIM, fontSize: 7, letterSpacing: 1 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
          {["ALL", "SKILLED", "UNSUPPORTED"].map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ fontSize: 8, padding: "2px 7px", borderRadius: 2, cursor: "pointer",
                background: tab === t ? CY + "22" : "none",
                color: tab === t ? CY : DIM,
                border: `1px solid ${tab === t ? CY + "55" : DIM + "33"}` }}>
              {t}
            </button>
          ))}
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search articles…"
            style={{ marginLeft: "auto", fontSize: 8, background: "#0a1628", border: `1px solid ${CY}33`,
              borderRadius: 2, color: CY, padding: "2px 6px", width: 110, outline: "none" }} />
        </div>

        {/* Article rows */}
        {filtered.length === 0 && (
          <div style={{ color: DIM, fontSize: 9, textAlign: "center", padding: 12 }}>No data yet — fetching…</div>
        )}
        {filtered.map((a, i) => {
          const isExp = expanded === i;
          const sc = a.status === "SKILLED" ? GRN : AMB;
          return (
            <div key={a.id || a.title || i}>
              <div style={ROW_ST} onClick={() => setExpanded(isExp ? null : i)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ color: CY, fontSize: 9 }}>{a.title || a.id}</span>
                  {a.topic && <span style={{ color: DIM, fontSize: 8, marginLeft: 4 }}>{a.topic}</span>}
                </div>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <span style={BADGE(sc)}>{a.status}</span>
                  <span style={{ color: DIM, fontSize: 8 }}>{isExp ? "▲" : "▼"}</span>
                </div>
              </div>
              {isExp && (
                <div style={{ background: "#060f1e", borderRadius: 3, padding: "6px 8px", marginBottom: 4 }}>
                  {a.matches?.length > 0 ? (
                    a.matches.slice(0, 8).map((s, j) => (
                      <div key={j} style={{ marginBottom: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                          <span style={{ color: CY, fontSize: 8 }}>{s.name}</span>
                          <div style={{ display: "flex", gap: 4 }}>
                            {s.category && <span style={BADGE(DIM)}>{s.category}</span>}
                            <span style={{ color: GRN, fontSize: 8 }}>{s.score}%</span>
                          </div>
                        </div>
                        <div style={{ height: 3, background: CY + "18", borderRadius: 2 }}>
                          <div style={{ height: "100%", width: `${s.score}%`, background: GRN, borderRadius: 2 }} />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: AMB, fontSize: 8 }}>No AIP skill coverage for this KB article.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {assessment && (
          <div style={{ marginTop: 8, background: "#0a1628", borderRadius: 3, padding: 8, color: GRN, fontSize: 8, lineHeight: 1.5 }}>
            {assessment}
          </div>
        )}
      </div>
    </>
  );
}
