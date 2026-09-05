/**
 * RemindersSwarmJobNexus — F602
 * "JARVIS, reminders swarm / swarm reminders / remswrm / swarm-backed reminders / unautomated reminders"
 * Cross-references /reminders/list against /entities/SwarmJob.
 * SWARM-BACKED reminders (≥1 swarm job keyword-matches) vs UNAUTOMATED (no swarm backing).
 * Coverage % tile; ALL/SWARM-BACKED/UNAUTOMATED filter tabs + search; click-to-expand matched jobs.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence operational automation brief + TTS.
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
const BTN_LEFT = 83_020;
const Z_INDEX  = 155;

const REMSWRM_RE =
  /\bremswrm\b|\breminders?.swarm\b|\bswarm.?reminders?\b|\bswarm.?backed.?reminders?\b|\bunautomated.?reminders?\b|\breminder.?automation\b|\bswarm.?reminder.?coverage\b/i;

export function isRemswrmQuery(text) {
  return REMSWRM_RE.test(text || "");
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

function normaliseJobs(data) {
  if (!data) return [];
  const raw =
    data.jobs || data.swarm_jobs || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((j, i) => ({
    id:          j.id || `job-${i}`,
    name:        j.name || j.title || j.job_name || `Job ${i + 1}`,
    status:      (j.status || j.state || "UNKNOWN").toUpperCase(),
    description: j.description || j.summary || "",
    tags:        Array.isArray(j.tags) ? j.tags.join(" ") : String(j.tags || ""),
  }));
}

function crossRef(reminders, jobs) {
  return reminders.map((rem) => {
    const haystack = `${rem.content} ${(rem.tags || []).join(" ")}`;
    const matches = jobs
      .map((j) => {
        const hits = overlap(haystack, `${j.name} ${j.description} ${j.tags}`);
        return hits > 0 ? { ...j, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 5);
    return { ...rem, jobs: matches, backed: matches.length > 0 };
  });
}

export async function buildRemswrmScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [remRes, jobRes] = await Promise.all([
      fetch(`${base}/reminders/list`,    { headers: hdr }),
      fetch(`${base}/entities/SwarmJob`, { headers: hdr }),
    ]);
    const [remData, jobData] = await Promise.all([remRes.json(), jobRes.json()]);
    const reminders = normaliseReminders(remData);
    const jobs      = normaliseJobs(jobData);
    const rows      = crossRef(reminders, jobs);
    const backed      = rows.filter((r) => r.backed).length;
    const unautomated = rows.length - backed;
    const pct         = rows.length ? Math.round((backed / rows.length) * 100) : 0;
    if (!rows.length) return "No reminders found in the system, sir.";
    const topUnautomated = rows
      .filter((r) => !r.backed)
      .slice(0, 2)
      .map((r) => r.content.slice(0, 40))
      .join("; ");
    return (
      `${backed} of ${rows.length} reminders are swarm-backed (${pct}% automation coverage). ` +
      (unautomated > 0
        ? `${unautomated} reminder${unautomated !== 1 ? "s" : ""} have no matching swarm job — unautomated notes: ${topUnautomated || "unknown"}.`
        : "All reminders are backed by active swarm jobs.")
    );
  } catch {
    return "Unable to reach reminders or swarm job endpoints, sir.";
  }
}

const STATUS_COLOR = {
  RUNNING:   GRN,
  ACTIVE:    GRN,
  COMPLETED: CY,
  PENDING:   AMB,
  FAILED:    "#FF4444",
  UNKNOWN:   DIM,
};

export default function RemindersSwarmJobNexus() {
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
      const [remRes, jobRes] = await Promise.all([
        fetch(`${base}/reminders/list`,    { headers: hdr }),
        fetch(`${base}/entities/SwarmJob`, { headers: hdr }),
      ]);
      const [remData, jobData] = await Promise.all([remRes.json(), jobRes.json()]);
      setRows(crossRef(normaliseReminders(remData), normaliseJobs(jobData)));
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
    window.addEventListener("jarvis:remswrm-toggle", toggle);
    return () => window.removeEventListener("jarvis:remswrm-toggle", toggle);
  }, []);

  const backed      = rows.filter((r) => r.backed).length;
  const unautomated = rows.length - backed;
  const pct         = rows.length ? Math.round((backed / rows.length) * 100) : 0;

  const filtered = rows.filter((r) => {
    const matchTab =
      tab === "ALL"          ? true :
      tab === "SWARM-BACKED" ? r.backed :
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
      const base = apiBase();
      const script = await buildRemswrmScript();
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ message: script }),
      });
      const d = await res.json();
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
    position:    "fixed",
    right:       16,
    top:         60,
    width:       480,
    maxHeight:   "80vh",
    overflowY:   "auto",
    background:  "rgba(6,20,35,0.97)",
    border:      `1px solid ${AMB}44`,
    borderRadius: 10,
    padding:     16,
    zIndex:      Z_INDEX + 1,
    fontFamily:  "monospace",
    color:       CY,
    display:     open ? "flex" : "none",
    flexDirection: "column",
    gap:         10,
  };

  const btnStyle = {
    position:  "fixed",
    left:      BTN_LEFT,
    bottom:    8,
    zIndex:    Z_INDEX,
    background: unautomated > 0 ? `${AMB}22` : `${GRN}22`,
    border:    `1px solid ${unautomated > 0 ? AMB : GRN}88`,
    borderRadius: 4,
    color:     unautomated > 0 ? AMB : GRN,
    fontSize:  10,
    padding:   "2px 7px",
    cursor:    "pointer",
    whiteSpace: "nowrap",
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

  const TABS = ["ALL", "SWARM-BACKED", "UNAUTOMATED"];

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen((o) => !o)} title="Reminders × SwarmJob Nexus">
        ◈ REMSWRM{unautomated > 0 && ` [${unautomated}]`}
      </button>

      <div style={panelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: CY, fontWeight: "bold" }}>
            REMINDERS × SWARM NEXUS
          </span>
          <button
            onClick={() => setOpen(false)}
            style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
          >✕</button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { label: "REMINDERS",    val: rows.length,  col: CY  },
            { label: "SWARM-BACKED", val: backed,        col: GRN },
            { label: "UNAUTOMATED",  val: unautomated,  col: AMB },
            { label: "COVERAGE",     val: `${pct}%`,    col: CY  },
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
                border: `1px solid ${row.backed ? GRN : AMB}44`,
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
                    {row.backed ? "SWARM-BACKED" : "UNAUTOMATED"}
                  </span>
                  <span
                    style={{
                      fontSize: 10, padding: "1px 4px", borderRadius: 3,
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
                  {row.jobs.length === 0 ? (
                    <div style={{ color: DIM, fontSize: 10 }}>No matching swarm jobs found.</div>
                  ) : (
                    row.jobs.map((j) => (
                      <div
                        key={j.id}
                        style={{
                          borderRadius: 4, border: `1px solid ${CY}33`,
                          background: `${CY}09`, padding: "4px 6px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: CY }}>{j.name}</span>
                          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            <span
                              style={{
                                fontSize: 9, padding: "1px 4px", borderRadius: 3,
                                background: `${STATUS_COLOR[j.status] || DIM}33`,
                                color: STATUS_COLOR[j.status] || DIM,
                              }}
                            >
                              {j.status}
                            </span>
                            <span style={{ fontSize: 9, color: DIM }}>{j.hits} hit{j.hits !== 1 ? "s" : ""}</span>
                          </div>
                        </div>
                        {j.description && (
                          <div style={{ fontSize: 9, color: DIM, marginTop: 2 }}>
                            {j.description.slice(0, 100)}{j.description.length > 100 ? "…" : ""}
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
