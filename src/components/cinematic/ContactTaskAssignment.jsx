/**
 * F84 — Contact × Task Assignment (CTASK)
 *
 * Parallel-fetches /entities/Contact + /entities/Task every 90 s.
 * Keyword-correlates each contact (name/role/dept) against open tasks:
 *   ASSIGNED   — ≥1 task keyword-matches this contact
 *   UNASSIGNED — 0 tasks match (contact has no visible workload)
 *
 * Stat tiles:  contacts / tasks / assigned / unassigned
 * Filter tabs: ALL | ASSIGNED | UNASSIGNED
 * Text search: across contact name / role / dept.
 * Expand row → matched task cards with status badge + relevance score bar.
 * Amber badge on UNASSIGNED count.
 * ▶ ASSESS: 2-sentence people-task brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ CTASK  at left:25240, bottom:8, zIndex:86.
 * Event:   jarvis:ctask-toggle
 * Voice:   "contact task" / "ctask" / "people tasks" /
 *          "assigned contacts" / "task owners" /
 *          "who has tasks" / "contact assignment" /
 *          "unassigned contacts" / "task people"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 25240;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise ────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseContacts(raw) {
  return normaliseArray(raw).map((c, i) => ({
    id:   String(c.id ?? c.contact_id ?? i),
    name: c.name ?? c.full_name ?? c.display_name ?? `Contact ${i + 1}`,
    role: c.role ?? c.title ?? c.position ?? null,
    dept: c.department ?? c.dept ?? c.org ?? null,
    body: [c.name, c.full_name, c.role, c.title, c.position,
           c.department, c.tags, c.skills, c.notes]
            .filter(Boolean).join(" "),
  }));
}

function normaliseTasks(raw) {
  return normaliseArray(raw).map((t, i) => ({
    id:       String(t.id ?? t.task_id ?? i),
    title:    t.title ?? t.name ?? t.summary ?? `Task ${i + 1}`,
    status:   t.status ?? t.state ?? null,
    priority: t.priority ?? t.severity ?? null,
    body:     [t.title, t.name, t.summary, t.description, t.assignee,
               t.owner, t.tags, t.labels]
                .filter(Boolean).join(" "),
  }));
}

// ─── keyword scoring ──────────────────────────────────────────────────────────

function buildKeywords(strings) {
  return strings
    .flatMap(s => String(s).toLowerCase().split(/[^a-z0-9]+/))
    .filter(t => t.length >= 3);
}

function scoreMatch(keywords, haystack) {
  const h = haystack.toLowerCase();
  let hits = 0;
  for (const kw of keywords) if (h.includes(kw)) hits++;
  return hits;
}

// ─── fetch ────────────────────────────────────────────────────────────────────

async function fetchAll() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [ctRes, taskRes] = await Promise.all([
    fetch(`${base}/entities/Contact`, { headers: hdr }),
    fetch(`${base}/entities/Task`,    { headers: hdr }),
  ]);
  return {
    contacts: normaliseContacts(ctRes.ok   ? await ctRes.json()   : []),
    tasks:    normaliseTasks(taskRes.ok     ? await taskRes.json() : []),
  };
}

// ─── correlation ──────────────────────────────────────────────────────────────

function correlate(contacts, tasks) {
  return contacts.map(contact => {
    const kws = buildKeywords([contact.name, contact.role ?? "", contact.dept ?? "", contact.body]);
    const matched = tasks
      .map(t => ({ t, score: scoreMatch(kws, `${t.title} ${t.body}`) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    const cls = matched.length >= 1 ? "ASSIGNED" : "UNASSIGNED";
    return { ...contact, matched, classification: cls };
  });
}

// ─── exported intent helpers ──────────────────────────────────────────────────

const CTASK_RE =
  /\b(ctask|contact[\s_-]?task[s]?|task[\s_-]?contact[s]?|people[\s_-]?task[s]?|assigned[\s_-]?contact[s]?|task[\s_-]?owner[s]?|who[\s_-]?has[\s_-]?tasks?|contact[\s_-]?assignment|unassigned[\s_-]?contact[s]?|task[\s_-]?people|task[\s_-]?assignment)\b/i;

export function isCtaskQuery(q) { return CTASK_RE.test(q); }

export async function buildCtaskScript() {
  try {
    const { contacts, tasks } = await fetchAll();
    const rows       = correlate(contacts, tasks);
    const assigned   = rows.filter(r => r.classification === "ASSIGNED").length;
    const unassigned = rows.filter(r => r.classification === "UNASSIGNED").length;
    const prompt =
      `People task assignment analysis: ${contacts.length} contacts cross-referenced ` +
      `against ${tasks.length} active tasks. ` +
      `${assigned} contacts have at least one task linked to them, ` +
      `while ${unassigned} contacts are UNASSIGNED — no visible task workload. ` +
      `In 2 sentences, assess overall task coverage across the team and flag ` +
      `key personnel with no task assignments who may be underutilised or overlooked.`;
    const base = apiBase();
    const res  = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body:    JSON.stringify({ message: prompt }),
    });
    const data = await res.json();
    window.dispatchEvent(new CustomEvent("jarvis:ctask-toggle"));
    return (data.answer || "Contact task assignment panel is now open, sir.").replace(/<<ACTION:[^>]*>>/g, "").trim();
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:ctask-toggle"));
    return "Contact task assignment panel is standing by, sir.";
  }
}

// ─── sub-components ───────────────────────────────────────────────────────────

function ClsBadge({ cls }) {
  const colour = cls === "ASSIGNED" ? GREEN : AMBER;
  return (
    <span style={{
      fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: 1,
      padding: "1px 6px", borderRadius: 3,
      border: `1px solid ${colour}`, color: colour,
    }}>{cls}</span>
  );
}

function StatusBadge({ status }) {
  if (!status) return null;
  const s = String(status).toLowerCase();
  const colour =
    s.includes("done") || s.includes("complet") ? GREEN :
    s.includes("critical") || s.includes("block") ? "#e05" :
    AMBER;
  return (
    <span style={{
      fontSize: 9, padding: "1px 5px", borderRadius: 3,
      border: `1px solid ${colour}44`, color: colour,
    }}>{status}</span>
  );
}

function RelevanceBar({ score, max }) {
  const pct = max > 0 ? Math.min(100, Math.round((score / max) * 100)) : 0;
  return (
    <div style={{ height: 3, background: "#0d1927", borderRadius: 2, marginTop: 3 }}>
      <div style={{ height: 3, width: `${pct}%`, borderRadius: 2, background: CY }} />
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function ContactTaskAssignment() {
  const [visible_, setVisible_] = useState(false);
  const [rows,     setRows]     = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [tab,      setTab]      = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing,setAssessing]= useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { contacts, tasks } = await fetchAll();
      setRows(correlate(contacts, tasks));
    } catch {
      setRows([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setVisible_(v => {
      if (!v) load();
      return !v;
    });
    window.addEventListener("jarvis:ctask-toggle", toggle);
    return () => window.removeEventListener("jarvis:ctask-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!visible_) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [visible_, load]);

  const assigned   = rows.filter(r => r.classification === "ASSIGNED").length;
  const unassigned = rows.filter(r => r.classification === "UNASSIGNED").length;
  const totalTasks = rows.reduce((s, r) => s + r.matched.length, 0);

  const filtered = rows.filter(r => {
    if (tab === "ASSIGNED"   && r.classification !== "ASSIGNED")   return false;
    if (tab === "UNASSIGNED" && r.classification !== "UNASSIGNED") return false;
    if (search) {
      const hay = `${r.name} ${r.role ?? ""} ${r.dept ?? ""}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const maxScore = Math.max(1, ...filtered.flatMap(r => r.matched.map(x => x.score)));

  const assess = async () => {
    setAssessing(true);
    try { await buildCtaskScript(); } catch {}
    setAssessing(false);
  };

  if (!visible_) {
    return (
      <button
        onClick={() => { setVisible_(true); load(); }}
        title="Contact Task Assignment — who has tasks"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 86,
          fontFamily: MONO, fontSize: 10, letterSpacing: 1,
          padding: "4px 10px", borderRadius: 4, cursor: "pointer",
          border: `1px solid ${CY}55`, color: CY, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", gap: 5,
        }}
      >
        ◈ CTASK
        {unassigned > 0 && (
          <span style={{
            background: AMBER, color: "#000", borderRadius: 3,
            fontSize: 9, fontWeight: 700, padding: "0 4px",
          }}>{unassigned}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: 16, top: 16, width: 540, maxHeight: "80vh",
      background: BG, border: `1px solid ${CY}33`, borderRadius: 12,
      zIndex: 9100, display: "flex", flexDirection: "column",
      fontFamily: MONO, boxShadow: `0 0 32px ${CY}18`,
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px", borderBottom: `1px solid ${CY}1A`,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: CY, letterSpacing: 2 }}>
          ◈ CONTACT × TASK ASSIGNMENT
        </span>
        <button
          onClick={() => setVisible_(false)}
          style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 16 }}
        >✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 16px" }}>
        {[
          { label: "CONTACTS",   value: rows.length,   colour: CY },
          { label: "TASK LINKS", value: totalTasks,     colour: CY },
          { label: "ASSIGNED",   value: assigned,       colour: GREEN },
          { label: "UNASSIGNED", value: unassigned,     colour: AMBER },
        ].map(({ label, value, colour }) => (
          <div key={label} style={{
            flex: 1, background: "rgba(10,20,35,0.7)", borderRadius: 8,
            border: `1px solid ${colour}33`, padding: "6px 8px", textAlign: "center",
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: colour }}>{value}</div>
            <div style={{ fontSize: 8, color: MUTED, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 6, padding: "0 16px 8px" }}>
        {["ALL", "ASSIGNED", "UNASSIGNED"].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: "3px 8px",
              borderRadius: 4, cursor: "pointer",
              border: `1px solid ${tab === t ? CY : CY + "44"}`,
              color: tab === t ? CY : MUTED,
              background: tab === t ? `${CY}18` : "transparent",
            }}
          >{t}</button>
        ))}
      </div>

      {/* search + assess */}
      <div style={{ display: "flex", gap: 8, padding: "0 16px 10px" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search contacts…"
          style={{
            flex: 1, minWidth: 140, fontFamily: MONO, fontSize: 11,
            background: "rgba(10,20,35,0.7)", border: `1px solid ${CY}33`,
            borderRadius: 4, color: "#DCEBF5", padding: "3px 8px", outline: "none",
          }}
        />
        <button onClick={assess} disabled={assessing} style={{
          fontFamily: MONO, fontSize: 10, letterSpacing: 1,
          padding: "3px 12px", borderRadius: 4, cursor: "pointer",
          border: `1px solid ${CY}`, color: CY, background: "transparent",
          opacity: assessing ? 0.5 : 1,
        }}>
          {assessing ? "assessing…" : "▶ ASSESS"}
        </button>
      </div>

      {/* rows */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px 16px" }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", color: MUTED, marginTop: 24, fontSize: 12 }}>
            {loading ? "loading contacts…" : "no contacts match current filter"}
          </div>
        )}
        {filtered.map(row => (
          <div key={row.id} style={{ marginBottom: 6 }}>
            <div
              onClick={() => setExpanded(expanded === row.id ? null : row.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                background: "rgba(10,20,35,0.5)", borderRadius: 8,
                border: `1px solid ${CY}22`, padding: "8px 12px", cursor: "pointer",
              }}
            >
              <ClsBadge cls={row.classification} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#DCEBF5" }}>
                  {row.name}
                </div>
                {(row.role || row.dept) && (
                  <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>
                    {[row.role, row.dept].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
              <span style={{ fontSize: 10, color: MUTED }}>
                {row.matched.length} task{row.matched.length !== 1 ? "s" : ""}
              </span>
              <span style={{ color: MUTED, fontSize: 12 }}>
                {expanded === row.id ? "▲" : "▼"}
              </span>
            </div>

            {expanded === row.id && (
              <div style={{
                background: "rgba(5,10,20,0.7)", borderRadius: "0 0 8px 8px",
                border: `1px solid ${CY}18`, borderTop: "none",
                padding: "10px 12px",
              }}>
                {row.matched.length === 0 ? (
                  <div style={{ fontSize: 11, color: MUTED }}>
                    No tasks keyword-match this contact — they may be unassigned or under a different name.
                  </div>
                ) : (
                  row.matched.map(({ t, score }) => (
                    <div key={t.id} style={{
                      marginBottom: 8, padding: "6px 10px",
                      background: "rgba(10,20,35,0.5)", borderRadius: 6,
                      border: `1px solid ${CY}18`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#DCEBF5", flex: 1 }}>
                          {t.title}
                        </span>
                        {t.status && <StatusBadge status={t.status} />}
                        {t.priority && (
                          <span style={{ fontSize: 9, color: MUTED }}>{t.priority}</span>
                        )}
                        <span style={{ fontSize: 10, color: MUTED }}>×{score}</span>
                      </div>
                      <RelevanceBar score={score} max={maxScore} />
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
