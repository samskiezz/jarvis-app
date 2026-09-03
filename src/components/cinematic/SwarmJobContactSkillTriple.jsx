import { useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const LM = "#A3E635";
const AM = "#FFB300";
const RD = "#FF4444";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_KEY) ||
  "dev-key";

const SJCSK_RE =
  /\b(sjcsk|swarm[._-]?job[._-]?contact[._-]?skill|swarm[._-]?staffing|swarm[._-]?support[._-]?triple|swarm[._-]?skill[._-]?staffing|staffed[._-]?swarm|unsupported[._-]?swarm|swarm[._-]?capability[._-]?coverage|swarm[._-]?contact[._-]?skill|swarm[._-]?skill[._-]?contact|swarm[._-]?coverage[._-]?triple)\b/i;

export function isSjcskQuery(t) {
  return SJCSK_RE.test(t || "");
}

function tok(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter((w) => w.length > 2);
}

function overlap(a, b) {
  const sa = new Set(tok(a));
  const sb = new Set(tok(b));
  let hits = 0;
  for (const w of sa) if (sb.has(w)) hits++;
  return sa.size ? hits / sa.size : 0;
}

function jobHaystack(j) {
  return [j.name, j.title, j.description, j.type, j.domain, ...(j.tags || [])].join(" ");
}

function contactNeedle(c) {
  return [c.name, c.title, c.email, c.company, c.description, c.role, ...(c.tags || [])].join(" ");
}

function skillNeedle(sk) {
  return [sk.name, sk.title, sk.description, sk.category, sk.domain, ...(sk.tags || [])].join(" ");
}

function bestScore(job, items, needleFn) {
  const hay = jobHaystack(job);
  let best = 0;
  for (const it of items) {
    const s = overlap(hay, needleFn(it));
    if (s > best) best = s;
  }
  return best;
}

function normaliseJobs(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ["swarm_jobs", "jobs", "items", "results", "data", "records", "entities"]) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseContacts(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ["contacts", "items", "results", "data", "records", "entities"]) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseSkills(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ["skills", "items", "results", "data", "records"]) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

export async function buildSjcskScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [jr, cr, sr] = await Promise.allSettled([
      fetch(`${base}/entities/SwarmJob`, { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/entities/Contact`, { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/v1/aip/skill`, { headers: hdr }).then((r) => r.json()),
    ]);
    const jobs = normaliseJobs(jr.status === "fulfilled" ? jr.value : []).slice(0, 100);
    const contacts = normaliseContacts(cr.status === "fulfilled" ? cr.value : []).slice(0, 200);
    const skills = normaliseSkills(sr.status === "fulfilled" ? sr.value : []).slice(0, 200);

    let fully = 0, staffed = 0, skilled = 0, unsupported = 0;
    for (const j of jobs) {
      const hasContact = bestScore(j, contacts, contactNeedle) > 0.15;
      const hasSkill = bestScore(j, skills, skillNeedle) > 0.15;
      if (hasContact && hasSkill) fully++;
      else if (hasContact) staffed++;
      else if (hasSkill) skilled++;
      else unsupported++;
    }
    const total = jobs.length;
    return (
      `SwarmJob staffing and capability coverage: ${total} swarm jobs assessed — ` +
      `${fully} FULLY SUPPORTED (contact + skill backing), ` +
      `${staffed} STAFFED (contact found, no skill alignment), ` +
      `${skilled} SKILLED (capability found, no contact backing), ` +
      `${unsupported} UNSUPPORTED (neither contact nor skill coverage — automation gap). ` +
      `${unsupported > 0 ? `${unsupported} swarm job${unsupported > 1 ? "s" : ""} lack both contact ownership and skill coverage — recommend resourcing action.` : "All swarm jobs have at least contact or skill backing."}`
    );
  } catch {
    return "SwarmJob contact-skill coverage assessment unavailable.";
  }
}

const ScoreBar = ({ sc, color }) => (
  <div style={{ background: "#111", borderRadius: 2, height: 3, width: "100%", overflow: "hidden" }}>
    <div style={{ width: `${Math.round(sc * 100)}%`, background: color, height: "100%", transition: "width .3s" }} />
  </div>
);

const chip = (label, color = CY) => (
  <span
    style={{
      display: "inline-block",
      padding: "1px 6px",
      border: `1px solid ${color}`,
      borderRadius: 3,
      color,
      fontSize: 9,
      letterSpacing: 1,
      marginRight: 4,
    }}
  >
    {label}
  </span>
);

const TABS = ["ALL", "FULLY SUPPORTED", "STAFFED", "SKILLED", "UNSUPPORTED"];

export default function SwarmJobContactSkillTriple() {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");
  const [err, setErr] = useState("");
  const timerRef = useRef(null);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [jr, cr, sr] = await Promise.allSettled([
        fetch(`${base}/entities/SwarmJob`, { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/entities/Contact`, { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/v1/aip/skill`, { headers: hdr }).then((r) => r.json()),
      ]);
      setJobs(normaliseJobs(jr.status === "fulfilled" ? jr.value : []).slice(0, 100));
      setContacts(normaliseContacts(cr.status === "fulfilled" ? cr.value : []).slice(0, 200));
      setSkills(normaliseSkills(sr.status === "fulfilled" ? sr.value : []).slice(0, 200));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    function onToggle() {
      setOpen((o) => {
        if (!o) load();
        return !o;
      });
    }
    window.addEventListener("jarvis:sjcsk-toggle", onToggle);
    return () => window.removeEventListener("jarvis:sjcsk-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open]);

  function classify(j) {
    const hasContact = bestScore(j, contacts, contactNeedle) > 0.15;
    const hasSkill = bestScore(j, skills, skillNeedle) > 0.15;
    if (hasContact && hasSkill) return "FULLY SUPPORTED";
    if (hasContact) return "STAFFED";
    if (hasSkill) return "SKILLED";
    return "UNSUPPORTED";
  }

  function matchedContacts(j) {
    const hay = jobHaystack(j);
    return contacts
      .map((c) => ({ c, sc: overlap(hay, contactNeedle(c)) }))
      .filter((x) => x.sc > 0.05)
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 6);
  }

  function matchedSkills(j) {
    const hay = jobHaystack(j);
    return skills
      .map((sk) => ({ sk, sc: overlap(hay, skillNeedle(sk)) }))
      .filter((x) => x.sc > 0.05)
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 6);
  }

  const enriched = jobs.map((j) => ({ ...j, _class: classify(j) }));

  const fullyCount = enriched.filter((j) => j._class === "FULLY SUPPORTED").length;
  const staffedCount = enriched.filter((j) => j._class === "STAFFED").length;
  const skilledCount = enriched.filter((j) => j._class === "SKILLED").length;
  const unsupportedCount = enriched.filter((j) => j._class === "UNSUPPORTED").length;

  const filtered = enriched.filter((j) => {
    if (tab !== "ALL" && j._class !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (j.name || j.title || "").toLowerCase().includes(q) ||
        (j.description || "").toLowerCase().includes(q) ||
        (j.type || "").toLowerCase().includes(q) ||
        (j.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    setAssessText("");
    try {
      const script = await buildSjcskScript();
      const base = apiBase();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const answer = (d.answer || script).replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessText(answer);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch {
      setAssessText(await buildSjcskScript());
    } finally {
      setAssessing(false);
    }
  }

  const classColor = (cl) => {
    if (cl === "FULLY SUPPORTED") return CY;
    if (cl === "STAFFED") return LM;
    if (cl === "SKILLED") return AM;
    return RD;
  };

  const mono = { fontFamily: "'JetBrains Mono',monospace" };

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="SwarmJob × Contact × Skill Triple Coverage (SJCSK)"
        style={{
          position: "fixed",
          left: 728880,
          bottom: 8,
          zIndex: 330,
          background: unsupportedCount > 0 ? `${AM}22` : "#0a0a0a",
          border: `1px solid ${unsupportedCount > 0 ? AM : "#333"}`,
          color: unsupportedCount > 0 ? AM : "#888",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9,
          padding: "3px 7px",
          borderRadius: 3,
          cursor: "pointer",
          letterSpacing: 1,
        }}
      >
        ◈ SJCSK{unsupportedCount > 0 ? ` ▲${unsupportedCount}` : ""}
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 40,
        left: "50%",
        transform: "translateX(-50%)",
        width: 780,
        maxHeight: "85vh",
        overflowY: "auto",
        background: "#060810",
        border: "1px solid #1a2a3a",
        borderRadius: 6,
        zIndex: 9500,
        ...mono,
        fontSize: 11,
        color: "#ccc",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #1a2a3a", gap: 8 }}>
        <span style={{ color: AM, fontSize: 13, fontWeight: 700, flex: 1 }}>
          ◈ SWARMJOB × CONTACT × SKILL TRIPLE COVERAGE
        </span>
        {loading && <span style={{ color: "#555", fontSize: 9 }}>LOADING…</span>}
        <button
          onClick={assess}
          disabled={assessing}
          style={{ background: "#111", border: `1px solid ${CY}`, color: CY, fontSize: 9, padding: "2px 8px", borderRadius: 3, cursor: "pointer" }}
        >
          {assessing ? "ASSESSING…" : "▶ ASSESS"}
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer" }}
        >
          ✕
        </button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "10px 14px", borderBottom: "1px solid #111" }}>
        {[
          ["JOBS", jobs.length, "#888"],
          ["CONTACTS", contacts.length, "#888"],
          ["SKILLS", skills.length, "#888"],
          ["FULLY SUPPORTED", fullyCount, CY],
          ["STAFFED", staffedCount, LM],
          ["SKILLED", skilledCount, AM],
          ["UNSUPPORTED", unsupportedCount, RD],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: 1, background: "#0c0c0c", border: `1px solid #1a1a1a`, borderRadius: 3, padding: "6px 4px", textAlign: "center" }}>
            <div style={{ color, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#555", fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* coverage bar */}
      {jobs.length > 0 && (
        <div style={{ padding: "6px 14px", borderBottom: "1px solid #111" }}>
          <div style={{ display: "flex", height: 5, borderRadius: 3, overflow: "hidden" }}>
            {[
              [fullyCount, CY],
              [staffedCount, LM],
              [skilledCount, AM],
              [unsupportedCount, RD],
            ].map(([count, color], i) => (
              <div key={i} style={{ width: `${(count / jobs.length) * 100}%`, background: color }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 4, fontSize: 8, color: "#555" }}>
            {[["FULLY SUPPORTED", CY], ["STAFFED", LM], ["SKILLED", AM], ["UNSUPPORTED", RD]].map(([label, color]) => (
              <span key={label} style={{ color }}>{label}</span>
            ))}
          </div>
        </div>
      )}

      {/* assess text */}
      {assessText && (
        <div style={{ padding: "8px 14px", borderBottom: "1px solid #111", color: "#aaa", fontSize: 10, lineHeight: 1.6, background: "#080808" }}>
          {assessText}
        </div>
      )}

      {/* search + tabs */}
      <div style={{ padding: "8px 14px", borderBottom: "1px solid #111", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search swarm jobs…"
          style={{ background: "#0c0c0c", border: "1px solid #222", color: "#ccc", padding: "3px 8px", borderRadius: 3, fontSize: 10, flex: 1, minWidth: 120, outline: "none" }}
        />
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? `${AM}22` : "none",
              border: `1px solid ${tab === t ? AM : "#222"}`,
              color: tab === t ? AM : "#555",
              fontSize: 8,
              padding: "2px 6px",
              borderRadius: 3,
              cursor: "pointer",
              letterSpacing: 1,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* error */}
      {err && (
        <div style={{ padding: "6px 14px", color: RD, fontSize: 9 }}>ERROR: {err}</div>
      )}

      {/* rows */}
      <div style={{ padding: "6px 0" }}>
        {filtered.length === 0 && (
          <div style={{ padding: "16px 14px", color: "#444", textAlign: "center", fontSize: 10 }}>
            {loading ? "Loading…" : "No swarm jobs match the current filter."}
          </div>
        )}
        {filtered.map((j) => {
          const isExp = expanded === (j.id || j.name);
          const mc = matchedContacts(j);
          const ms = matchedSkills(j);
          return (
            <div
              key={j.id || j.name}
              style={{ borderBottom: "1px solid #0d0d0d" }}
            >
              <div
                onClick={() => setExpanded(isExp ? null : (j.id || j.name))}
                style={{ display: "flex", alignItems: "center", padding: "7px 14px", gap: 8, cursor: "pointer" }}
              >
                <span style={{ color: classColor(j._class), fontSize: 9, minWidth: 120, letterSpacing: 1 }}>
                  {j._class}
                </span>
                <span style={{ flex: 1, color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {j.name || j.title || "Unnamed Job"}
                </span>
                {j.type && chip(j.type, "#666")}
                {j.status && chip(j.status, j.status === "running" ? LM : "#555")}
                <span style={{ color: "#333", fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "0 14px 10px", display: "flex", gap: 10 }}>
                  {/* contacts pane */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: CY, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>
                      CONTACTS ({mc.length})
                    </div>
                    {mc.length === 0 ? (
                      <div style={{ color: "#333", fontSize: 9 }}>No contact alignment</div>
                    ) : (
                      mc.map(({ c, sc }, i) => (
                        <div key={i} style={{ marginBottom: 6 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ color: "#bbb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
                              {c.name || c.email || "Contact"}
                            </span>
                            <span style={{ color: CY, fontSize: 9 }}>{Math.round(sc * 100)}%</span>
                          </div>
                          {c.title && <div style={{ color: "#555", fontSize: 8 }}>{c.title}</div>}
                          <ScoreBar sc={sc} color={CY} />
                        </div>
                      ))
                    )}
                  </div>

                  {/* skills pane */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: LM, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>
                      SKILLS ({ms.length})
                    </div>
                    {ms.length === 0 ? (
                      <div style={{ color: "#333", fontSize: 9 }}>No skill alignment</div>
                    ) : (
                      ms.map(({ sk, sc }, i) => (
                        <div key={i} style={{ marginBottom: 6 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ color: "#bbb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
                              {sk.name || sk.title || "Skill"}
                            </span>
                            <span style={{ color: LM, fontSize: 9 }}>{Math.round(sc * 100)}%</span>
                          </div>
                          {sk.category && <div style={{ color: "#555", fontSize: 8 }}>{sk.category}</div>}
                          <ScoreBar sc={sc} color={LM} />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
