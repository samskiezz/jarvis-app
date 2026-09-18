/**
 * RemindersSkillNexus — F609
 * "JARVIS, remskl / reminders skill / skill reminders / skill-backed reminders / unskilled reminders"
 * Cross-references /reminders/list against /v1/aip/skill.
 * SKILL-BACKED reminders (≥1 skill keyword-matches) vs UNSKILLED (no skill backing).
 * Coverage % tile; ALL/SKILL-BACKED/UNSKILLED filter tabs + search; click-to-expand matched skills.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence operational skill-coverage brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 89_040;
const Z_INDEX  = 162;

const REMSKL_RE =
  /\bremskl\b|\breminders?.skill\b|\bskill.?reminders?\b|\bskill.?backed.?reminders?\b|\bunskilled.?reminders?\b|\breminder.?skill.?coverage\b/i;

export function isRemslkQuery(text) {
  return REMSKL_RE.test(text || "");
}

function keywords(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function overlap(a, b) {
  const sa = new Set(keywords(a));
  return keywords(b).filter((w) => sa.has(w)).length;
}

function normaliseReminders(data) {
  if (!data) return [];
  const raw =
    data.reminders || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((r, i) => ({
    id:      r.id || `rem-${i}`,
    content: r.content || r.text || r.title || r.note || `Reminder ${i + 1}`,
    kind:    (r.kind || r.type || "reminder").toLowerCase(),
    status:  (r.status || "pending").toLowerCase(),
    tags:    r.tags || [],
  }));
}

function normaliseSkills(data) {
  if (!data) return [];
  const raw =
    data.skills || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((s, i) => ({
    id:     s.id || `skill-${i}`,
    name:   s.name || s.skill_name || s.title || `Skill ${i + 1}`,
    domain: s.domain || s.category || s.type || "general",
    score:  typeof s.score === "number" ? s.score : (s.level || 0),
    description: s.description || s.summary || "",
  }));
}

function crossRef(reminders, skills) {
  return reminders.map((rem) => {
    const haystack = `${rem.content} ${(rem.tags || []).join(" ")}`;
    const matches = skills
      .map((s) => {
        const hits = overlap(haystack, `${s.name} ${s.domain} ${s.description}`);
        return hits > 0 ? { ...s, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 5);
    return { ...rem, skills: matches, backed: matches.length > 0 };
  });
}

export async function buildRemslkScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [remRes, skillRes] = await Promise.all([
      fetch(`${base}/reminders/list`, { headers: hdr }),
      fetch(`${base}/v1/aip/skill`,   { headers: hdr }),
    ]);
    const [remData, skillData] = await Promise.all([remRes.json(), skillRes.json()]);
    const reminders = normaliseReminders(remData);
    const skills    = normaliseSkills(skillData);
    const rows      = crossRef(reminders, skills);
    const backed    = rows.filter((r) => r.backed).length;
    const unskilled = rows.length - backed;
    const pct       = rows.length ? Math.round((backed / rows.length) * 100) : 0;
    if (!rows.length) return "No reminders found in the system, sir.";
    const topUnskilled = rows
      .filter((r) => !r.backed)
      .slice(0, 2)
      .map((r) => r.content.slice(0, 40))
      .join("; ");
    return (
      `${backed} of ${rows.length} reminders are skill-backed (${pct}% skill coverage). ` +
      (unskilled > 0
        ? `${unskilled} reminder${unskilled !== 1 ? "s" : ""} have no matching AIP skill — unskilled notes: ${topUnskilled || "unknown"}.`
        : "All reminders are backed by registered AIP skills.")
    );
  } catch {
    return "Unable to reach reminders or skill endpoints, sir.";
  }
}

export default function RemindersSkillNexus() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [remRes, skillRes] = await Promise.all([
        fetch(`${base}/reminders/list`, { headers: hdr }),
        fetch(`${base}/v1/aip/skill`,   { headers: hdr }),
      ]);
      const [remData, skillData] = await Promise.all([remRes.json(), skillRes.json()]);
      setRows(crossRef(normaliseReminders(remData), normaliseSkills(skillData)));
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:remskl-toggle", toggle);
    return () => window.removeEventListener("jarvis:remskl-toggle", toggle);
  }, []);

  const backed    = rows.filter((r) => r.backed).length;
  const unskilled = rows.length - backed;
  const pct       = rows.length ? Math.round((backed / rows.length) * 100) : 0;

  const filtered = rows.filter((r) => {
    const matchTab =
      tab === "ALL"          ? true :
      tab === "SKILL-BACKED" ? r.backed :
                               !r.backed;
    const q = search.toLowerCase();
    const matchSearch =
      !q || r.content.toLowerCase().includes(q) || r.kind.includes(q);
    return matchTab && matchSearch;
  });

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    setBrief("");
    try {
      const base   = apiBase();
      const script = await buildRemslkScript();
      const res    = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ message: script }),
      });
      const d   = await res.json();
      const txt = d.response || d.message || d.reply || script;
      setBrief(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }, [assessing]);

  const panelStyle = {
    position:      "fixed",
    right:         16,
    top:           60,
    width:         480,
    maxHeight:     "80vh",
    overflowY:     "auto",
    background:    "rgba(6,20,35,0.97)",
    border:        `1px solid ${AMB}44`,
    borderRadius:  10,
    padding:       16,
    zIndex:        Z_INDEX + 1,
    fontFamily:    "monospace",
    color:         CY,
    display:       open ? "flex" : "none",
    flexDirection: "column",
    gap:           10,
  };

  const btnStyle = {
    position:     "fixed",
    left:         BTN_LEFT,
    bottom:       8,
    zIndex:       Z_INDEX,
    background:   unskilled > 0 ? `${AMB}22` : `${GRN}22`,
    border:       `1px solid ${unskilled > 0 ? AMB : GRN}88`,
    borderRadius: 4,
    color:        unskilled > 0 ? AMB : GRN,
    fontSize:     10,
    padding:      "2px 7px",
    cursor:       "pointer",
    whiteSpace:   "nowrap",
  };

  const tabStyle = (active) => ({
    padding:      "2px 8px",
    borderRadius: 4,
    border:       `1px solid ${active ? CY : DIM}88`,
    background:   active ? `${CY}22` : "transparent",
    color:        active ? CY : DIM,
    cursor:       "pointer",
    fontSize:     10,
  });

  const TABS = ["ALL", "SKILL-BACKED", "UNSKILLED"];

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen((o) => !o)} title="Reminders × AIP Skill Nexus">
        ◈ REMSKL{unskilled > 0 && ` [${unskilled}]`}
      </button>

      <div style={panelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: CY, fontWeight: "bold" }}>
            REMINDERS × AIP SKILL NEXUS
          </span>
          <button
            onClick={() => setOpen(false)}
            style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
          >✕</button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { label: "REMINDERS",    val: rows.length, col: CY  },
            { label: "SKILL-BACKED", val: backed,       col: GRN },
            { label: "UNSKILLED",    val: unskilled,    col: AMB },
            { label: "COVERAGE",     val: `${pct}%`,   col: CY  },
          ].map(({ label, val, col }) => (
            <div
              key={label}
              style={{
                flex: "1 1 80px", padding: "6px 8px", borderRadius: 6,
                border: `1px solid ${col}44`, background: `${col}11`,
                textAlign: "center",
              }}
            >
              <div style={{ color: col, fontSize: 18, fontWeight: "bold" }}>{val}</div>
              <div style={{ color: DIM, fontSize: 9 }}>{label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TABS.map((t) => (
            <button key={t} style={tabStyle(tab === t)} onClick={() => setTab(t)}>{t}</button>
          ))}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search reminders…"
            style={{
              flex: 1, minWidth: 120, background: "transparent",
              border: `1px solid ${DIM}55`, borderRadius: 4,
              color: CY, fontSize: 10, padding: "2px 6px",
            }}
          />
        </div>

        {loading && (
          <div style={{ color: DIM, fontSize: 10, textAlign: "center" }}>Loading…</div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map((row) => (
            <div
              key={row.id}
              style={{
                borderRadius: 6,
                border:       `1px solid ${row.backed ? GRN : AMB}44`,
                background:   `${row.backed ? GRN : AMB}09`,
                padding:      "6px 8px",
              }}
            >
              <div
                style={{
                  display: "flex", justifyContent: "space-between",
                  alignItems: "center", cursor: "pointer",
                }}
                onClick={() => setExpanded(expanded === row.id ? null : row.id)}
              >
                <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: 9, padding: "1px 5px", borderRadius: 3,
                      background: `${row.backed ? GRN : AMB}33`,
                      color: row.backed ? GRN : AMB, whiteSpace: "nowrap",
                    }}
                  >
                    {row.backed ? "SKILL-BACKED" : "UNSKILLED"}
                  </span>
                  <span
                    style={{
                      fontSize: 9, padding: "1px 4px", borderRadius: 3,
                      background: `${CY}22`, color: CY, whiteSpace: "nowrap",
                    }}
                  >
                    {row.kind}
                  </span>
                  <span style={{ fontSize: 11, color: CY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.content.slice(0, 60)}{row.content.length > 60 ? "…" : ""}
                  </span>
                </div>
                <span style={{ color: DIM, fontSize: 9 }}>{expanded === row.id ? "▲" : "▼"}</span>
              </div>

              {expanded === row.id && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                  {row.skills.length === 0 ? (
                    <div style={{ color: DIM, fontSize: 10 }}>No matching AIP skills found.</div>
                  ) : (
                    row.skills.map((s) => (
                      <div
                        key={s.id}
                        style={{
                          borderRadius: 4, border: `1px solid ${CY}33`,
                          background: `${CY}09`, padding: "4px 6px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: CY }}>{s.name}</span>
                          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            <span
                              style={{
                                fontSize: 9, padding: "1px 4px", borderRadius: 3,
                                background: `${GRN}33`, color: GRN,
                              }}
                            >
                              {s.domain}
                            </span>
                            {typeof s.score === "number" && s.score > 0 && (
                              <span style={{ fontSize: 9, color: AMB }}>{s.score.toFixed ? s.score.toFixed(1) : s.score}</span>
                            )}
                            <span style={{ fontSize: 9, color: DIM }}>{s.hits} hit{s.hits !== 1 ? "s" : ""}</span>
                          </div>
                        </div>
                        {s.description && (
                          <div style={{ fontSize: 9, color: DIM, marginTop: 2 }}>
                            {s.description.slice(0, 100)}{s.description.length > 100 ? "…" : ""}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
          {!loading && filtered.length === 0 && (
            <div style={{ color: DIM, fontSize: 10, textAlign: "center" }}>No reminders match the current filter.</div>
          )}
        </div>

        {brief && (
          <div style={{
            background: `${CY}11`, border: `1px solid ${CY}44`,
            borderRadius: 6, padding: "8px 10px", fontSize: 11, color: CY,
          }}>
            {brief}
          </div>
        )}

        <button
          onClick={assess}
          disabled={assessing}
          style={{
            background: `${CY}22`, border: `1px solid ${CY}66`,
            borderRadius: 4, color: CY, fontSize: 11,
            padding: "4px 10px", cursor: assessing ? "wait" : "pointer",
          }}
        >
          {assessing ? "Assessing…" : "▶ ASSESS"}
        </button>
      </div>
    </>
  );
}
