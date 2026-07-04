/**
 * F156 — Skill × Investigation Coverage.
 * Parallel-fetches /v1/aip/skill + /v1/investigations;
 * keyword-correlates each open investigation against the skill catalog
 * to surface SKILLED (analyst expertise found) vs UNSUPPORTED (capability gap);
 * stat tiles: investigations / skills / skilled / unsupported;
 * ALL/SKILLED/UNSUPPORTED filter tabs + text search;
 * expand investigation → matched skills with category badge + relevance score;
 * amber badge on unsupported count;
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence skill-capability brief + TTS via jarvis:speak-dossier;
 * ◈ SKLINV button; "skill investigation"/"case skill gap"/"sklinv" voice trigger;
 * jarvis:sklinv-toggle event; 90-s auto-refresh.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AM  = "#FACC15";
const GR  = "#4ADE80";
const DIM = "#566878";
const BG  = "rgba(10,20,30,0.92)";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

export const isSklinvQuery =
  (q) => /\b(skill\s+invest|invest\w*\s+skill|case\s+skill|skill\s+case|sklinv|which\s+cases?\s+need\s+skill|capability\s+gap\s+invest|investigation\s+skill|skill\s+gap\s+case)\b/i.test(q || "");

export function buildSklinvScript(q) {
  return `Open the SKLINV — Skill × Investigation Coverage panel.\nQuery: "${q}"\nFetch /v1/aip/skill and /v1/investigations, correlate skills against open cases, identify unsupported investigations.`;
}

// ── data fetchers ─────────────────────────────────────────────────────────────

async function fetchSkills() {
  const r = await fetch(`${apiBase()}/v1/aip/skill`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.data) ? d.data
    : Array.isArray(d?.skills) ? d.skills
    : Array.isArray(d?.items) ? d.items
    : [];
}

async function fetchInvestigations() {
  const r = await fetch(`${apiBase()}/v1/investigations`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.data) ? d.data
    : Array.isArray(d?.investigations) ? d.investigations
    : Array.isArray(d?.items) ? d.items
    : [];
}

async function askAI(inv, matchedSkills) {
  const invTitle = inv.title || inv.name || inv.subject || "Investigation";
  const invStatus = inv.status || "";
  const skillNames = matchedSkills.slice(0, 3).map((s) => s.skill?.name || s.skill?.title || "skill").join(", ");
  const gap = matchedSkills.length === 0;

  let context = `Investigation: "${invTitle}"`;
  if (invStatus) context += `, status: ${invStatus}`;
  if (gap) {
    context += ". No matching skills were found in the current skill catalog for this investigation. Provide a 2-sentence assessment of the capability gap and recommend what skill areas should be developed or recruited.";
  } else {
    context += `. Matched skills: ${skillNames}. Provide a 2-sentence assessment of skill coverage for this investigation and identify any remaining gaps.`;
  }

  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ message: context }),
  });
  const d = await r.json();
  return (d.answer || d.response || d.text || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
}

// ── keyword correlation ───────────────────────────────────────────────────────

function tokenize(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);
}

function extractInvKeywords(inv) {
  return [
    inv.title, inv.name, inv.subject, inv.description,
    inv.case_type, inv.category, inv.priority,
    ...(Array.isArray(inv.tags) ? inv.tags : []),
  ]
    .flatMap((v) => tokenize(v))
    .filter(Boolean);
}

function extractSkillKeywords(skill) {
  return [
    skill.name, skill.title, skill.description, skill.category,
    skill.domain, skill.type,
    ...(Array.isArray(skill.tags) ? skill.tags : []),
  ]
    .flatMap((v) => tokenize(v))
    .filter(Boolean);
}

const STOPWORDS = new Set(["the", "and", "for", "with", "this", "that", "from", "are", "has", "have", "its"]);

function correlate(inv, skills) {
  const invKw = new Set(extractInvKeywords(inv).filter((w) => !STOPWORDS.has(w)));
  if (invKw.size === 0) return [];
  const results = [];
  for (const skill of skills) {
    const skillKw = extractSkillKeywords(skill).filter((w) => !STOPWORDS.has(w));
    const hits = skillKw.filter((w) => invKw.has(w));
    if (hits.length > 0) {
      const score = Math.min(100, Math.round((hits.length / Math.max(invKw.size, skillKw.length)) * 200));
      results.push({ skill, score, hits });
    }
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 6);
}

// ── sub-components ────────────────────────────────────────────────────────────

function StatTile({ label, value, color }) {
  return (
    <div style={{ flex: 1, minWidth: 80, background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "8px 10px", textAlign: "center" }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || CY, fontFamily: "monospace" }}>{value}</div>
      <div style={{ fontSize: 10, color: DIM, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function InvRow({ inv, skills, onAssess }) {
  const [open, setOpen] = useState(false);
  const [aiText, setAiText] = useState("");
  const [loading, setLoading] = useState(false);
  const matches = correlate(inv, skills);
  const skilled = matches.length > 0;
  const title = inv.title || inv.name || inv.subject || "Untitled";
  const status = inv.status || "";
  const priority = inv.priority || "";

  async function handleAssess(e) {
    e.stopPropagation();
    setLoading(true);
    try {
      const text = await askAI(inv, matches);
      setAiText(text);
      onAssess(text);
    } catch (_) {
      setAiText("Assessment unavailable.");
    }
    setLoading(false);
  }

  return (
    <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "8px 10px" }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
      >
        <span style={{ color: skilled ? GR : AM, fontSize: 11, fontWeight: 700, minWidth: 80 }}>
          {skilled ? "SKILLED" : "UNSUPPORTED"}
        </span>
        <span style={{ flex: 1, color: "#d0e0e8", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </span>
        {status && (
          <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: "rgba(41,231,255,0.12)", color: CY }}>
            {status}
          </span>
        )}
        {priority && (
          <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: "rgba(250,204,21,0.12)", color: AM }}>
            {priority}
          </span>
        )}
        <span style={{ color: DIM, fontSize: 11 }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div style={{ marginTop: 8, paddingLeft: 10 }}>
          {matches.length === 0 ? (
            <div style={{ color: AM, fontSize: 11, marginBottom: 6 }}>No skill matches found — capability gap detected.</div>
          ) : (
            matches.map(({ skill, score, hits }) => (
              <div key={skill.id || skill.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: "rgba(74,222,128,0.12)", color: GR, minWidth: 60, textAlign: "center" }}>
                  {skill.category || skill.domain || "skill"}
                </span>
                <span style={{ flex: 1, color: "#d0e0e8", fontSize: 11 }}>{skill.name || skill.title}</span>
                <div style={{ width: 60, height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${score}%`, height: "100%", background: score > 60 ? GR : AM }} />
                </div>
                <span style={{ fontSize: 10, color: DIM, minWidth: 28, textAlign: "right" }}>{score}%</span>
              </div>
            ))
          )}
          <button
            onClick={handleAssess}
            disabled={loading}
            style={{
              marginTop: 6, padding: "4px 10px", fontSize: 10, background: "rgba(41,231,255,0.1)",
              border: `1px solid ${CY}44`, borderRadius: 4, color: CY, cursor: "pointer", letterSpacing: 1,
            }}
          >
            {loading ? "ASSESSING…" : "▶ ASSESS"}
          </button>
          {aiText && (
            <div style={{ marginTop: 6, color: "#b0c8d8", fontSize: 11, lineHeight: 1.5, borderLeft: `2px solid ${CY}44`, paddingLeft: 8 }}>
              {aiText}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── main panel ────────────────────────────────────────────────────────────────

export default function SkillInvestigationCoverage() {
  const [open, setOpen] = useState(false);
  const [skills, setSkills] = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [sk, inv] = await Promise.all([fetchSkills(), fetchInvestigations()]);
      setSkills(sk);
      setInvestigations(inv);
    } catch (e) {
      setError(e.message || "Fetch failed");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) {
      load();
      timerRef.current = setInterval(load, 90_000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    const onAsk = (e) => {
      const q = (e.detail?.query || "").toLowerCase();
      if (isSklinvQuery(q)) {
        setOpen(true);
        setTimeout(() => window.dispatchEvent(new CustomEvent("jarvis:ask", { detail: { query: buildSklinvScript(q) } })), 0);
      }
    };
    window.addEventListener("jarvis:sklinv-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:sklinv-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  function speakDossier(text) {
    if (text) window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const categorized = investigations.map((inv) => ({
    inv,
    skilled: correlate(inv, skills).length > 0,
  }));

  const q = search.toLowerCase();
  const filtered = categorized.filter(({ inv, skilled }) => {
    if (filter === "SKILLED" && !skilled) return false;
    if (filter === "UNSUPPORTED" && skilled) return false;
    if (q) {
      const hay = (inv.title || inv.name || inv.subject || "").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const skilledCount = categorized.filter((c) => c.skilled).length;
  const unsupportedCount = categorized.length - skilledCount;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Skill × Investigation Coverage"
        style={{
          position: "fixed",
          left: 51400,
          bottom: 8,
          zIndex: 102,
          background: "rgba(10,20,30,0.82)",
          border: `1px solid ${CY}55`,
          borderRadius: 4,
          color: CY,
          fontSize: 10,
          padding: "3px 7px",
          cursor: "pointer",
          letterSpacing: 1,
          fontFamily: "monospace",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        ◈ SKLINV
        {unsupportedCount > 0 && (
          <span style={{ background: AM, color: "#000", borderRadius: 3, padding: "0 4px", fontSize: 9, fontWeight: 700 }}>
            {unsupportedCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: "8vh",
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(680px, 96vw)",
        maxHeight: "80vh",
        background: BG,
        border: `1px solid ${CY}44`,
        borderRadius: 10,
        zIndex: 1200,
        display: "flex",
        flexDirection: "column",
        fontFamily: "monospace",
        boxShadow: `0 0 32px ${CY}22`,
        overflow: "hidden",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${CY}22`, gap: 8 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 12, letterSpacing: 2, flex: 1 }}>
          ◈ SKILL × INVESTIGATION COVERAGE
        </span>
        {loading && <span style={{ color: DIM, fontSize: 10 }}>LOADING…</span>}
        <button onClick={load} title="Refresh" style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>⟳</button>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px 4px" }}>
        <StatTile label="Investigations" value={investigations.length} color={CY} />
        <StatTile label="Skills" value={skills.length} color={GR} />
        <StatTile label="Skilled" value={skilledCount} color={GR} />
        <StatTile label="Unsupported" value={unsupportedCount} color={AM} />
      </div>

      {/* filter + search */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", alignItems: "center" }}>
        {["ALL", "SKILLED", "UNSUPPORTED"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              fontSize: 10, padding: "3px 8px", borderRadius: 4, cursor: "pointer",
              background: filter === f ? `${CY}22` : "rgba(255,255,255,0.04)",
              border: `1px solid ${filter === f ? CY : DIM}55`,
              color: filter === f ? CY : DIM,
              letterSpacing: 1,
            }}
          >
            {f}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search investigations…"
          style={{
            flex: 1, background: "rgba(255,255,255,0.04)", border: `1px solid ${DIM}44`,
            borderRadius: 4, padding: "3px 8px", color: "#d0e0e8", fontSize: 11, outline: "none",
          }}
        />
      </div>

      {/* error */}
      {error && (
        <div style={{ margin: "0 14px", padding: "6px 10px", background: "rgba(255,68,68,0.1)", borderRadius: 4, color: "#FF4444", fontSize: 11 }}>
          {error}
        </div>
      )}

      {/* list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 4px 8px" }}>
        {filtered.length === 0 && !loading && (
          <div style={{ color: DIM, fontSize: 11, padding: "16px", textAlign: "center" }}>No investigations match the current filter.</div>
        )}
        {filtered.map(({ inv }) => (
          <InvRow key={inv.id || inv.title || Math.random()} inv={inv} skills={skills} onAssess={speakDossier} />
        ))}
      </div>
    </div>
  );
}
