/**
 * F119 — Swarm Job × Contact Accountability Linker
 *
 * Parallel-fetches /entities/SwarmJob + /entities/Contact, then
 * keyword-correlates each swarm job (name/objective/type) against
 * contacts (name/role/department/tags) to surface ASSIGNED jobs
 * (human accountability found) vs UNASSIGNED (no contact match —
 * governance gap).
 *
 * Stat tiles: jobs / contacts / assigned / unassigned.
 * Filter tabs: ALL | ASSIGNED | UNASSIGNED.
 * Expand job → matched contacts with role + dept badge + relevance score.
 * Amber badge on unassigned-job count.
 * ▶ ASSESS: 2-sentence accountability brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SWCON  at bottom:8 left:35160, zIndex 74.
 * Voice:   "swarm contact / swarm accountability / who owns swarm /
 *           swcon / unassigned swarm jobs"
 * Event:   jarvis:swcon-toggle
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 35160;
const POLL_MS  = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

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

const SWCON_RE =
  /\b(swarm\s+contact|contact\s+swarm|swarm\s+accountability|who\s+owns?\s+swarm|swcon|unassigned\s+swarm\s+jobs?|swarm\s+owner|accountability\s+swarm)\b/i;

export function isSwconQuery(q) { return SWCON_RE.test(q); }

export async function buildSwconScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [swRes, ctRes] = await Promise.all([
      fetch(`${base}/entities/SwarmJob`, { headers: hdr }),
      fetch(`${base}/entities/Contact`,  { headers: hdr }),
    ]);
    const jobs     = normaliseJobs(await swRes.json());
    const contacts = normaliseContacts(await ctRes.json());

    const assignedCount   = jobs.filter((j) =>
      contacts.some((c) => relevance(j, c) > 0)
    ).length;
    const unassignedCount = jobs.length - assignedCount;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS swarm accountability briefing: ${jobs.length} active swarm jobs reviewed ` +
          `against ${contacts.length} contacts. ${assignedCount} jobs have identifiable human ` +
          `accountability (contact match found), ${unassignedCount} jobs are unassigned ` +
          `(governance gap — no responsible contact identified). Give a 2-sentence accountability ` +
          `assessment — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Swarm accountability analysis complete, sir.").trim();
  } catch {
    return "Swarm accountability analysis unavailable at this time, sir.";
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseJobs(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.data)            ? raw.data
    : Array.isArray(raw?.items)           ? raw.items
    : Array.isArray(raw?.results)         ? raw.results
    : Array.isArray(raw?.jobs)            ? raw.jobs
    : [];
  return arr.map((j, i) => ({
    id:        j.id        || String(i),
    name:      j.name      || j.title      || `Job ${i + 1}`,
    objective: (j.objective || j.description || j.goal || "").toString().slice(0, 300),
    type:      j.type      || j.category   || "",
    status:    j.status    || j.state      || "unknown",
    progress:  typeof j.progress === "number" ? j.progress : null,
  }));
}

function normaliseContacts(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.results)            ? raw.results
    : Array.isArray(raw?.contacts)           ? raw.contacts
    : [];
  return arr.map((c, i) => ({
    id:         c.id         || String(i),
    name:       c.name       || c.full_name  || `Contact ${i + 1}`,
    role:       c.role       || c.title      || "",
    department: c.department || c.dept       || c.org || "",
    tags:       Array.isArray(c.tags) ? c.tags.join(" ") : (c.tags || ""),
    notes:      (c.notes     || c.bio        || "").toString().slice(0, 200),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()[\]]+/)
    .filter((w) => w.length >= 3);
}

function relevance(job, contact) {
  const jw = keywords(`${job.name} ${job.objective} ${job.type}`);
  const cw = keywords(`${contact.name} ${contact.role} ${contact.department} ${contact.tags} ${contact.notes}`);
  return jw.filter((w) => cw.some((cv) => cv.includes(w) || w.includes(cv))).length;
}

function buildMatrix(jobs, contacts) {
  return jobs.map((j) => {
    const matched = contacts
      .map((c) => ({ ...c, score: relevance(j, c) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...j, contacts: matched, assigned: matched.length > 0 };
  });
}

function statusColor(st) {
  const u = (st || "").toUpperCase();
  if (u === "RUNNING" || u === "ACTIVE")         return "#4ADE80";
  if (u === "COMPLETED" || u === "DONE")          return C.blue;
  if (u === "FAILED")                             return "#FF3030";
  if (u === "PENDING" || u === "QUEUED")          return "#FFD700";
  return S.textMuted;
}

// ── component ────────────────────────────────────────────────────────────────

const TABS = ["ALL", "ASSIGNED", "UNASSIGNED"];

export default function SwarmContactLinker() {
  const [open,        setOpen]        = useState(false);
  const [jobs,        setJobs]        = useState([]);
  const [contacts,    setContacts]    = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [filter,      setFilter]      = useState("ALL");
  const [query,       setQuery]       = useState("");
  const [expanded,    setExpanded]    = useState(null);
  const [assessing,   setAssessing]   = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [swRes, ctRes] = await Promise.all([
        fetch(`${base}/entities/SwarmJob`, { headers: hdr }),
        fetch(`${base}/entities/Contact`,  { headers: hdr }),
      ]);
      setJobs(normaliseJobs(await swRes.json()));
      setContacts(normaliseContacts(await ctRes.json()));
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
    window.addEventListener("jarvis:swcon-toggle", onToggle);
    return () => window.removeEventListener("jarvis:swcon-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isSwconQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const matrix        = buildMatrix(jobs, contacts);
  const assignedCount = matrix.filter((j) => j.assigned).length;
  const unassignedCnt = matrix.length - assignedCount;

  const visible = matrix.filter((j) => {
    if (filter === "ASSIGNED"   && !j.assigned) return false;
    if (filter === "UNASSIGNED" &&  j.assigned) return false;
    if (query) {
      const q = query.toLowerCase();
      return j.name.toLowerCase().includes(q) ||
             j.objective.toLowerCase().includes(q) ||
             j.type.toLowerCase().includes(q);
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    try {
      const answer = await buildSwconScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } finally {
      setAssessing(false);
    }
  }

  const STAT = {
    color: C.textB, fontSize: 10, letterSpacing: 1, textAlign: "center",
    fontFamily: "'JetBrains Mono',monospace",
  };
  const BADGE = (bg, label) => (
    <span style={{
      background: bg + "22", border: `1px solid ${bg}55`,
      color: bg, borderRadius: 3, padding: "1px 6px",
      fontSize: 9, letterSpacing: 1, fontFamily: "'JetBrains Mono',monospace",
    }}>{label}</span>
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="F119: Swarm Job × Contact Accountability Linker"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 74,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${unassignedCnt > 0 ? C.gold : C.border}`,
          color: unassignedCnt > 0 ? C.gold : C.textB,
          borderRadius: 4, padding: "4px 10px",
          fontSize: 9, letterSpacing: 2, cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace",
          backdropFilter: "blur(6px)",
          boxShadow: unassignedCnt > 0 ? `0 0 10px ${C.gold}44` : "none",
        }}
      >
        ◈ SWCON{unassignedCnt > 0 && ` [${unassignedCnt}]`}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed",
      bottom: 36, left: Math.max(8, BTN_LEFT - 280),
      zIndex: 74, width: "min(560px, 94vw)", maxHeight: "72vh",
      background: "rgba(6,10,18,0.94)", border: `1px solid ${C.border}`,
      borderRadius: 8, display: "flex", flexDirection: "column",
      backdropFilter: "blur(12px)", boxShadow: `0 0 40px rgba(0,200,120,0.12)`,
      fontFamily: "'JetBrains Mono',monospace",
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 14px 8px",
        borderBottom: `1px solid ${C.borderB}`,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ color: C.neon, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
          SWARM × CONTACT ACCOUNTABILITY
        </span>
        {loading && (
          <span style={{ color: S.textMuted, fontSize: 9, letterSpacing: 1 }}>POLLING…</span>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            background: "none", border: `1px solid ${C.neon}55`, color: C.neon,
            borderRadius: 3, padding: "3px 8px", fontSize: 9, letterSpacing: 1,
            cursor: assessing ? "default" : "pointer", fontFamily: "inherit",
            opacity: assessing ? 0.5 : 1,
          }}
        >
          {assessing ? "ASSESSING…" : "▶ ASSESS"}
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: "none", border: "none", color: S.textMuted,
            cursor: "pointer", fontSize: 13, padding: "0 4px",
          }}
        >
          ×
        </button>
      </div>

      {/* Stat tiles */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4,1fr)",
        gap: 6, padding: "8px 14px",
        borderBottom: `1px solid ${C.borderB}`,
      }}>
        {[
          { label: "JOBS",       val: jobs.length,     col: C.textB },
          { label: "CONTACTS",   val: contacts.length, col: C.blue  },
          { label: "ASSIGNED",   val: assignedCount,   col: C.neon  },
          { label: "UNASSIGNED", val: unassignedCnt,   col: unassignedCnt > 0 ? C.gold : S.textMuted },
        ].map(({ label, val, col }) => (
          <div key={label} style={{
            background: "rgba(0,0,0,0.3)", borderRadius: 4, padding: "5px 4px",
            textAlign: "center", border: `1px solid ${C.borderB}`,
          }}>
            <div style={{ ...STAT, color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ ...STAT, fontSize: 8, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs + search */}
      <div style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "6px 14px", borderBottom: `1px solid ${C.borderB}`,
        flexWrap: "wrap",
      }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              background: filter === t ? C.neon + "22" : "none",
              border: `1px solid ${filter === t ? C.neon : C.borderB}`,
              color: filter === t ? C.neon : S.textMuted,
              borderRadius: 3, padding: "3px 8px", fontSize: 9,
              letterSpacing: 1, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search swarm jobs…"
          style={{
            flex: 1, minWidth: 80, background: "rgba(0,0,0,0.4)",
            border: `1px solid ${C.borderB}`, color: C.textB,
            borderRadius: 3, padding: "3px 8px", fontSize: 9,
            fontFamily: "inherit", outline: "none",
          }}
        />
      </div>

      {/* Job list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "6px 8px" }}>
        {visible.length === 0 && (
          <div style={{ color: S.textMuted, fontSize: 10, padding: "12px 6px", textAlign: "center" }}>
            {loading ? "Loading…" : "No jobs match current filter."}
          </div>
        )}
        {visible.map((j) => (
          <div key={j.id} style={{ marginBottom: 4 }}>
            {/* Job row */}
            <div
              onClick={() => setExpanded(expanded === j.id ? null : j.id)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 8px", borderRadius: 4, cursor: "pointer",
                background: expanded === j.id
                  ? "rgba(0,200,120,0.06)"
                  : "rgba(0,0,0,0.25)",
                border: `1px solid ${j.assigned ? C.borderB : C.gold + "44"}`,
                transition: "background 0.15s",
              }}
            >
              <span style={{
                fontSize: 8, color: j.assigned ? C.neon : C.gold,
                width: 64, flexShrink: 0, letterSpacing: 1,
              }}>
                {j.assigned ? "ASSIGNED" : "UNASSIGNED"}
              </span>
              <span style={{
                flex: 1, color: C.textB, fontSize: 10, letterSpacing: 0.5,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {j.name}
              </span>
              {j.type && BADGE(C.blue, j.type)}
              {BADGE(statusColor(j.status), j.status || "—")}
              {j.assigned && (
                <span style={{ color: S.textMuted, fontSize: 9 }}>
                  {j.contacts.length} ct
                </span>
              )}
              <span style={{ color: S.textMuted, fontSize: 10 }}>
                {expanded === j.id ? "▲" : "▼"}
              </span>
            </div>

            {/* Expanded: matched contacts */}
            {expanded === j.id && (
              <div style={{
                padding: "6px 10px 6px 16px",
                background: "rgba(0,0,0,0.15)",
                borderLeft: `2px solid ${C.borderB}`,
                marginTop: 2, borderRadius: "0 0 4px 4px",
              }}>
                {j.objective && (
                  <div style={{
                    color: S.textMuted, fontSize: 9, letterSpacing: 0.5,
                    marginBottom: 6, lineHeight: 1.5,
                  }}>
                    {j.objective.slice(0, 180)}
                  </div>
                )}
                {j.contacts.length === 0 ? (
                  <div style={{ color: C.gold, fontSize: 9, letterSpacing: 1 }}>
                    No matching contacts — accountability undocumented.
                  </div>
                ) : (
                  j.contacts.map((c, idx) => (
                    <div key={idx} style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "4px 0", borderBottom: idx < j.contacts.length - 1
                        ? `1px solid ${C.borderB}` : "none",
                    }}>
                      <span style={{ color: C.neon, fontSize: 10, letterSpacing: 0.5, flex: 1 }}>
                        {c.name}
                      </span>
                      {c.role       && BADGE(C.blue,  c.role)}
                      {c.department && BADGE(S.textMuted, c.department)}
                      <span style={{ color: S.textMuted, fontSize: 8, letterSpacing: 1 }}>
                        score:{c.score}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        padding: "5px 14px",
        borderTop: `1px solid ${C.borderB}`,
        color: S.textMuted, fontSize: 8, letterSpacing: 1,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span>AUTO-POLL 90s</span>
        <span>·</span>
        <span>/entities/SwarmJob × /entities/Contact</span>
        <div style={{ flex: 1 }} />
        <span>{visible.length} of {matrix.length}</span>
      </div>
    </div>
  );
}
