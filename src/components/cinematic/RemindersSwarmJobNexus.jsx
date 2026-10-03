/**
 * RemindersSwarmJobNexus — F627
 * "JARVIS, reminders swarm / swarm reminders / remswrm / automated reminders / swarm-backed notes"
 * Cross-references /reminders/list against /entities/SwarmJob.
 * AUTOMATED reminders (≥1 swarm job keyword-matches) vs UNAUTOMATED (no swarm backing).
 * Coverage % tile; ALL/AUTOMATED/UNAUTOMATED filter tabs + search; click-to-expand matched jobs.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4444";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS = 90_000;

const REMSWRM_RE =
  /\bremswrm\b|\breminders?.swarm\b|\bswarm.?reminders?\b|\bautomated.?reminders?\b|\bunautomated.?reminders?\b|\bswarm.?backed.?notes?\b|\breminder.?swarm.?coverage\b|\bswarm.?note\b/i;

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

function normaliseSwarmJobs(data) {
  if (!data) return [];
  const arr = Array.isArray(data)           ? data
    : Array.isArray(data?.swarm_jobs)       ? data.swarm_jobs
    : Array.isArray(data?.jobs)             ? data.jobs
    : Array.isArray(data?.items)            ? data.items
    : Array.isArray(data?.results)          ? data.results
    : [];
  return arr.map((j, i) => ({
    id:       j.id          || String(i),
    name:     j.name        || j.title       || `SwarmJob ${i + 1}`,
    status:   (j.status     || "UNKNOWN").toUpperCase(),
    progress: typeof j.progress === "number" ? j.progress : null,
    desc:     (j.description || j.objective  || "").toString().slice(0, 150),
    tags:     Array.isArray(j.tags) ? j.tags.join(" ") : (j.tags || ""),
  }));
}

function crossRef(reminders, jobs) {
  return reminders.map((rem) => {
    const haystack = `${rem.content} ${(rem.tags || []).join(" ")}`;
    const matches = jobs
      .map((j) => {
        const hits = overlap(haystack, `${j.name} ${j.desc} ${j.tags}`);
        return hits > 0 ? { ...j, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 5);
    return { ...rem, jobs: matches, automated: matches.length > 0 };
  });
}

export async function buildRemswrmScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [remRes, jobRes] = await Promise.all([
      fetch(`${base}/reminders/list`,   { headers: hdr }),
      fetch(`${base}/entities/SwarmJob`, { headers: hdr }),
    ]);
    const [remData, jobData] = await Promise.all([remRes.json(), jobRes.json()]);
    const reminders = normaliseReminders(remData);
    const jobs      = normaliseSwarmJobs(jobData);
    const rows      = crossRef(reminders, jobs);
    const automated   = rows.filter((r) => r.automated).length;
    const unautomated = rows.length - automated;
    const pct         = rows.length ? Math.round((automated / rows.length) * 100) : 0;
    if (!rows.length) return "No reminders found in the system, sir.";
    const topUnautomated = rows
      .filter((r) => !r.automated)
      .slice(0, 2)
      .map((r) => r.content.slice(0, 40))
      .join("; ");
    return (
      `${automated} of ${rows.length} reminders are backed by active swarm jobs (${pct}% automation coverage). ` +
      (unautomated > 0
        ? `${unautomated} reminder${unautomated !== 1 ? "s" : ""} have no matching swarm job — unautomated notes: ${topUnautomated || "unknown"}.`
        : "All reminders have at least one matching swarm job.")
    );
  } catch {
    return "Unable to reach reminders or swarm jobs endpoints, sir.";
  }
}

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
      setRows(crossRef(normaliseReminders(remData), normaliseSwarmJobs(jobData)));
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

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try {
      const base      = apiBase();
      const automated   = rows.filter((r) => r.automated);
      const unautomated = rows.filter((r) => !r.automated);
      const resp = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message:
            `Assess reminder-to-swarm-job linkage: ${rows.length} reminders total, ` +
            `${automated.length} are backed by active swarm jobs, ` +
            `${unautomated.length} have no swarm automation. ` +
            `Top unautomated: ${unautomated.slice(0, 3).map((r) => r.content.slice(0, 40)).join("; ") || "none"}. ` +
            "Give a 2-sentence operational automation coverage assessment with recommended action.",
        }),
      });
      const d = await resp.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(text);
      if (text) {
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }, [rows]);

  const automated   = rows.filter((r) => r.automated).length;
  const unautomated = rows.length - automated;
  const pct         = rows.length ? Math.round((automated / rows.length) * 100) : 0;

  const visible = rows
    .filter((r) => {
      if (tab === "AUTOMATED")   return r.automated;
      if (tab === "UNAUTOMATED") return !r.automated;
      return true;
    })
    .filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        r.content.toLowerCase().includes(q) ||
        r.kind.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q)
      );
    });

  const KIND_COLOR = {
    note: CY, task: GRN, alert: RED, reminder: AMB,
  };

  const STATUS_COLOR = {
    RUNNING: GRN, COMPLETED: CY, PENDING: AMB, FAILED: RED, STOPPED: DIM,
  };

  const BTN_LEFT = 98_500;
  const BTN_STYLE = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 8,
    zIndex: 173,
    padding: "4px 10px",
    background: "rgba(5,8,13,0.82)",
    border: `1px solid ${unautomated > 0 ? AMB : CY}55`,
    borderRadius: 6,
    cursor: "pointer",
    color: CY,
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 10,
    letterSpacing: 1,
    display: "flex",
    alignItems: "center",
    gap: 5,
    backdropFilter: "blur(6px)",
  };

  const PANEL = {
    position: "fixed",
    left: BTN_LEFT - 340,
    bottom: 38,
    zIndex: 173,
    width: 400,
    maxHeight: "70vh",
    overflowY: "auto",
    background: "rgba(6,10,16,0.94)",
    border: `1px solid ${CY}44`,
    borderRadius: 10,
    padding: 14,
    fontFamily: "'JetBrains Mono',monospace",
    color: "#DCEBF5",
    backdropFilter: "blur(10px)",
    boxShadow: `0 0 40px ${CY}18`,
  };

  const tabStyle = (t) => ({
    padding: "3px 8px",
    border: `1px solid ${tab === t ? CY : CY + "33"}`,
    borderRadius: 4,
    cursor: "pointer",
    background: tab === t ? CY + "22" : "transparent",
    color: tab === t ? CY : DIM,
    fontSize: 10,
    letterSpacing: 1,
  });

  return (
    <>
      <button
        style={BTN_STYLE}
        onClick={() => setOpen((o) => !o)}
        title="Reminders × SwarmJob Nexus (REMSWRM)"
      >
        ◈ REMSWRM
        {unautomated > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 4, padding: "1px 5px", fontSize: 9 }}>
            {unautomated}
          </span>
        )}
      </button>

      {open && (
        <div style={PANEL}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>REMINDERS × SWARM NEXUS</span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
            >✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              { label: "REMINDERS",    value: rows.length,  color: CY },
              { label: "AUTOMATED",    value: automated,    color: automated > 0 ? GRN : DIM },
              { label: "UNAUTOMATED",  value: unautomated,  color: unautomated > 0 ? AMB : GRN },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${color}33`, borderRadius: 6, padding: "6px 8px", textAlign: "center" }}
              >
                <div style={{ color, fontSize: 16, fontWeight: "bold" }}>{loading ? "…" : value}</div>
                <div style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* coverage bar */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>SWARM COVERAGE</span>
              <span style={{ color: pct >= 70 ? GRN : pct >= 40 ? AMB : RED, fontSize: 10, fontWeight: "bold" }}>{pct}%</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct >= 70 ? GRN : pct >= 40 ? AMB : RED, borderRadius: 2, transition: "width 0.4s" }} />
            </div>
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
            {["ALL", "AUTOMATED", "UNAUTOMATED"].map((t) => (
              <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search reminders…"
            style={{ width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.4)", border: `1px solid ${CY}33`, borderRadius: 5, color: "#DCEBF5", padding: "5px 8px", fontSize: 11, marginBottom: 8, outline: "none" }}
          />

          {/* list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 12 }}>No reminders match.</div>
            )}
            {visible.map((rem) => (
              <div
                key={rem.id}
                style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${rem.automated ? GRN : AMB}33`, borderRadius: 6, padding: "7px 9px", cursor: "pointer" }}
                onClick={() => setExpanded(expanded === rem.id ? null : rem.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ color: rem.automated ? GRN : AMB, fontSize: 10 }}>{rem.automated ? "●" : "○"}</span>
                  <span style={{ color: KIND_COLOR[rem.kind] || CY, fontSize: 9, border: `1px solid ${(KIND_COLOR[rem.kind] || CY)}44`, borderRadius: 3, padding: "1px 4px" }}>{rem.kind}</span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>{rem.content.slice(0, 60)}{rem.content.length > 60 ? "…" : ""}</span>
                  <span style={{ color: rem.automated ? GRN : DIM, fontSize: 9 }}>
                    {rem.automated ? `${rem.jobs.length} job${rem.jobs.length !== 1 ? "s" : ""}` : "UNAUTOMATED"}
                  </span>
                </div>

                {expanded === rem.id && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${CY}22`, paddingTop: 6 }}>
                    {rem.automated ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {rem.jobs.map((j) => (
                          <div key={j.id} style={{ background: "rgba(0,229,160,0.04)", border: `1px solid ${GRN}33`, borderRadius: 4, padding: "5px 7px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ color: STATUS_COLOR[j.status] || DIM, fontSize: 9, border: `1px solid ${(STATUS_COLOR[j.status] || DIM)}44`, borderRadius: 3, padding: "1px 4px" }}>{j.status}</span>
                              <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{j.name}</span>
                              {j.progress !== null && (
                                <span style={{ color: DIM, fontSize: 9 }}>{j.progress}%</span>
                              )}
                              <span style={{ color: DIM, fontSize: 9, marginLeft: 4 }}>hits: {j.hits}</span>
                            </div>
                            {j.desc && (
                              <div style={{ color: DIM, fontSize: 9, marginTop: 3, lineHeight: 1.4 }}>{j.desc.slice(0, 100)}{j.desc.length > 100 ? "…" : ""}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No swarm jobs matched this reminder — note has no automation backing.</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* assess */}
          <div style={{ marginTop: 10, borderTop: `1px solid ${CY}22`, paddingTop: 8 }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{ background: `${CY}18`, border: `1px solid ${CY}55`, borderRadius: 5, color: CY, padding: "5px 12px", cursor: "pointer", fontSize: 10, letterSpacing: 1, width: "100%", opacity: assessing ? 0.6 : 1 }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, color: "#DCEBF5", fontSize: 10, lineHeight: 1.5, borderLeft: `2px solid ${CY}`, paddingLeft: 8 }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
