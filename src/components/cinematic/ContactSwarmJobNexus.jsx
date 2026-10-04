/**
 * ContactSwarmJobNexus — F629
 * "JARVIS, cntswrm / contact swarm / swarm contact / automated contact /
 *  who has swarm / contact automation / swarm-backed contact / contact job"
 * Cross-references /entities/Contact against /entities/SwarmJob.
 * AUTOMATED contacts (≥1 swarm job keyword-matches) vs UNAUTOMATED (no swarm backing).
 * Coverage % tile; ALL/AUTOMATED/UNAUTOMATED filter tabs + search; click-to-expand matched jobs.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence automation-contact brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4444";
const DIM = "#8899AA";
const PRP = "#B06EFF";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 100_220;
const Z_INDEX  = 175;

const CNTSWRM_RE =
  /\bcntswrm\b|\bcontact.?swarm\b|\bswarm.?contact\b|\bautomated.?contact\b|\bwho.?has.?swarm\b|\bcontact.?automat\b|\bswarm.?backed.?contact\b|\bcontact.?job\b|\bjob.?contact\b/i;

export function isCntswrmQuery(text) {
  return CNTSWRM_RE.test(text || "");
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

function normaliseContacts(data) {
  if (!data) return [];
  const raw =
    data.contacts || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((c, i) => ({
    id:   c.id || `cnt-${i}`,
    name: c.name || c.full_name || c.title || `Contact ${i + 1}`,
    role: c.role || c.job_title || c.position || "",
    org:  c.org || c.organization || c.company || "",
    tags: c.tags || [],
  }));
}

function normaliseSwarmJobs(data) {
  if (!data) return [];
  const raw =
    data.jobs || data.swarm_jobs || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((j, i) => ({
    id:       j.id || `swrm-${i}`,
    name:     j.name || j.title || j.description || `Job ${i + 1}`,
    status:   (j.status || "UNKNOWN").toUpperCase(),
    progress: j.progress ?? j.completion_pct ?? null,
    tags:     j.tags || [],
  }));
}

function crossRef(contacts, jobs) {
  return contacts.map((cnt) => {
    const haystack = `${cnt.name} ${cnt.role} ${cnt.org} ${(cnt.tags || []).join(" ")}`;
    const matches = jobs
      .map((j) => {
        const needle = `${j.name} ${(j.tags || []).join(" ")}`;
        const hits = overlap(haystack, needle);
        return hits > 0 ? { ...j, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits);
    return { ...cnt, automated: matches.length > 0, jobs: matches };
  });
}

export async function buildCntswrmScript() {
  try {
    const base = apiBase();
    const [cntRes, jRes] = await Promise.all([
      fetch(`${base}/entities/Contact`,  { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/entities/SwarmJob`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const [cntData, jData] = await Promise.all([cntRes.json(), jRes.json()]);
    const contacts = normaliseContacts(cntData);
    const jobs     = normaliseSwarmJobs(jData);
    const rows     = crossRef(contacts, jobs);
    const automated   = rows.filter((r) => r.automated).length;
    const unautomated = rows.length - automated;
    const pct = rows.length ? Math.round((automated / rows.length) * 100) : 0;
    if (!rows.length) return "No contacts found in the system, sir.";
    const topUnautomated = rows
      .filter((r) => !r.automated)
      .slice(0, 2)
      .map((r) => r.name)
      .join("; ");
    return (
      `${automated} of ${rows.length} contacts have swarm job automation backing (${pct}% coverage). ` +
      (unautomated > 0
        ? `${unautomated} contact${unautomated !== 1 ? "s" : ""} have no matching swarm job — these relationships lack automated monitoring: ${topUnautomated || "unknown"}.`
        : "All contacts have at least one swarm job assigned — full automation coverage achieved.")
    );
  } catch {
    return "Unable to reach contacts or swarm job endpoints, sir.";
  }
}

const STATUS_COLOR = {
  RUNNING:   GRN,
  COMPLETED: CY,
  FAILED:    RED,
  PENDING:   AMB,
  PAUSED:    DIM,
};

export default function ContactSwarmJobNexus() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [brief,     setBrief]     = useState("");
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const [cntRes, jRes] = await Promise.all([
        fetch(`${base}/entities/Contact`,  { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/entities/SwarmJob`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const [cntData, jData] = await Promise.all([cntRes.json(), jRes.json()]);
      setRows(crossRef(normaliseContacts(cntData), normaliseSwarmJobs(jData)));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen((v) => !v); };
    window.addEventListener("jarvis:cntswrm-toggle", handler);
    return () => window.removeEventListener("jarvis:cntswrm-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const automated   = rows.filter((r) => r.automated).length;
  const unautomated = rows.length - automated;
  const pct = rows.length ? Math.round((automated / rows.length) * 100) : 0;

  const visible = rows.filter((r) => {
    const matchTab =
      tab === "ALL"         ? true :
      tab === "AUTOMATED"   ? r.automated :
      !r.automated;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      r.name.toLowerCase().includes(q) ||
      r.role.toLowerCase().includes(q) ||
      r.org.toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  async function assess() {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const script = await buildCntswrmScript();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Contact-swarm automation coverage assessment: ${script}. Provide a concise 2-sentence operational brief.` }),
      });
      const d = await r.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(text);
      if (text) {
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch {
      setBrief("Unable to reach reasoning core, sir.");
    } finally {
      setAssessing(false);
    }
  }

  const tabStyle = (t) => ({
    background: tab === t ? `${PRP}22` : "transparent",
    border: `1px solid ${tab === t ? PRP : DIM}44`,
    borderRadius: 4,
    color: tab === t ? PRP : DIM,
    cursor: "pointer",
    fontSize: 9,
    letterSpacing: 1,
    padding: "3px 7px",
  });

  const badge = unautomated > 0 ? unautomated : null;

  return (
    <>
      {/* floating button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Contact × SwarmJob Nexus (CNTSWRM)"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: Z_INDEX,
          background: open ? `${PRP}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${PRP}${open ? "99" : "44"}`,
          borderRadius: 5,
          color: PRP,
          cursor: "pointer",
          fontSize: 9,
          letterSpacing: 1,
          padding: "4px 8px",
          backdropFilter: "blur(6px)",
          whiteSpace: "nowrap",
        }}
      >
        ◈ CNTSWRM{badge ? <span style={{ marginLeft: 4, background: AMB, color: "#000", borderRadius: 3, padding: "0 4px", fontSize: 9 }}>{badge}</span> : null}
      </button>

      {/* panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            left: BTN_LEFT,
            bottom: 36,
            zIndex: Z_INDEX + 1,
            width: 340,
            maxHeight: "70vh",
            overflowY: "auto",
            background: "rgba(4,7,12,0.96)",
            border: `1px solid ${PRP}44`,
            borderRadius: 8,
            padding: "12px 14px",
            backdropFilter: "blur(14px)",
            boxShadow: `0 0 28px ${PRP}22`,
            fontFamily: "monospace",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ color: PRP, fontSize: 11, letterSpacing: 2, fontWeight: "bold" }}>CONTACT × SWARM JOB NEXUS</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
            {[
              { label: "CONTACTS",    value: rows.length, color: CY },
              { label: "AUTOMATED",   value: automated,   color: GRN },
              { label: "UNAUTOMATED", value: unautomated, color: unautomated > 0 ? AMB : GRN },
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
              <span style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>SWARM AUTOMATION COVERAGE</span>
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
            placeholder="search contacts…"
            style={{ width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.4)", border: `1px solid ${PRP}33`, borderRadius: 5, color: "#DCEBF5", padding: "5px 8px", fontSize: 11, marginBottom: 8, outline: "none" }}
          />

          {/* list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 12 }}>No contacts match.</div>
            )}
            {visible.map((cnt) => (
              <div
                key={cnt.id}
                style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${cnt.automated ? PRP : AMB}33`, borderRadius: 6, padding: "7px 9px", cursor: "pointer" }}
                onClick={() => setExpanded(expanded === cnt.id ? null : cnt.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ color: cnt.automated ? GRN : AMB, fontSize: 10 }}>{cnt.automated ? "●" : "○"}</span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>{cnt.name}</span>
                  {cnt.role && <span style={{ color: DIM, fontSize: 9 }}>{cnt.role.slice(0, 20)}</span>}
                  <span style={{ color: cnt.automated ? GRN : DIM, fontSize: 9 }}>
                    {cnt.automated ? `${cnt.jobs.length} job${cnt.jobs.length !== 1 ? "s" : ""}` : "UNAUTOMATED"}
                  </span>
                </div>
                {cnt.org && (
                  <div style={{ color: DIM, fontSize: 9, marginLeft: 16 }}>{cnt.org.slice(0, 40)}</div>
                )}

                {expanded === cnt.id && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${PRP}22`, paddingTop: 6 }}>
                    {cnt.automated ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {cnt.jobs.map((j) => (
                          <div key={j.id} style={{ background: "rgba(176,110,255,0.04)", border: `1px solid ${PRP}33`, borderRadius: 4, padding: "5px 7px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ color: STATUS_COLOR[j.status] || DIM, fontSize: 9, border: `1px solid ${(STATUS_COLOR[j.status] || DIM)}44`, borderRadius: 3, padding: "1px 4px" }}>{j.status}</span>
                              <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{j.name}</span>
                              {j.progress != null && (
                                <span style={{ color: DIM, fontSize: 9 }}>{j.progress}%</span>
                              )}
                              <span style={{ color: DIM, fontSize: 9 }}>hits: {j.hits}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No swarm jobs matched this contact — no automation assigned.</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* assess */}
          <div style={{ marginTop: 10, borderTop: `1px solid ${PRP}22`, paddingTop: 8 }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{ background: `${PRP}18`, border: `1px solid ${PRP}55`, borderRadius: 5, color: PRP, padding: "5px 12px", cursor: "pointer", fontSize: 10, letterSpacing: 1, width: "100%", opacity: assessing ? 0.6 : 1 }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, color: "#DCEBF5", fontSize: 10, lineHeight: 1.5, borderLeft: `2px solid ${PRP}`, paddingLeft: 8 }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
