/**
 * ContactSwarmCoverage — F523
 * "JARVIS, contact swarm / swarm contact / cswrm / which contacts have swarm / contact monitoring / unmonitored contact"
 * Cross-references /entities/Contact + /entities/SwarmJob.
 * Finds COVERED contacts (≥1 swarm job keyword-matches the contact's name/org/tags) vs UNMONITORED.
 * Coverage % tile; ALL/COVERED/UNMONITORED filter tabs + search; click-to-expand matched jobs.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 37_580;
const Z_INDEX  = 102;

const CSWRM_RE =
  /\bcswrm\b|\bcontact.?swarm\b|\bswarm.?contact\b|\bwhich.?contacts?.?have.?swarm\b|\bcontact.?monitor(ing)?\b|\bunmonitored.?contact\b|\bcontact.?automation\b|\bcontact.?coverage\b/i;

export function isContactSwarmQuery(text) {
  return CSWRM_RE.test(text || "");
}

// ─── helpers ─────────────────────────────────────────────────────────────────

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
    id:           c.id || `contact-${i}`,
    name:         c.name || c.full_name || c.display_name || `Contact ${i + 1}`,
    organization: c.organization || c.org || c.company || "",
    role:         c.role || c.title || c.position || "",
    tags:         Array.isArray(c.tags) ? c.tags.join(" ") : String(c.tags || ""),
    email:        c.email || "",
  }));
}

function normaliseSwarmJobs(data) {
  if (!data) return [];
  const raw =
    data.jobs || data.swarm_jobs || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((j, i) => ({
    id:          j.id || `job-${i}`,
    name:        j.name || j.title || j.job_name || `Job ${i + 1}`,
    status:      (j.status || j.state || "UNKNOWN").toUpperCase(),
    description: j.description || j.summary || null,
    tags:        Array.isArray(j.tags) ? j.tags.join(" ") : String(j.tags || ""),
  }));
}

function crossRef(contacts, jobs) {
  return contacts.map((c) => {
    const haystack = `${c.name} ${c.organization} ${c.role} ${c.tags}`;
    const matches = jobs
      .map((j) => ({
        j,
        hits: overlap(haystack, `${j.name} ${j.description || ""} ${j.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...c,
      covered: matches.length > 0,
      matches: matches.map(({ j, hits }) => ({ ...j, hits })),
    };
  });
}

// ─── buildContactSwarmScript (for JarvisBrain) ───────────────────────────────

export async function buildContactSwarmScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [cRes, jRes] = await Promise.all([
      fetch(`${base}/entities/Contact`,   { headers: hdr }),
      fetch(`${base}/entities/SwarmJob`,  { headers: hdr }),
    ]);
    const cData = cRes.ok ? await cRes.json() : {};
    const jData = jRes.ok ? await jRes.json() : {};

    const contacts = normaliseContacts(cData);
    const jobs     = normaliseSwarmJobs(jData);
    const crossed  = crossRef(contacts, jobs);

    const total       = crossed.length;
    const covered     = crossed.filter((c) => c.covered).length;
    const unmonitored = total - covered;
    const coverage    = total > 0 ? Math.round((covered / total) * 100) : 0;
    const topCovered  = crossed
      .filter((c) => c.covered)
      .slice(0, 2)
      .map((c) => c.name)
      .join(", ");

    const brief =
      `${coverage}% of ${total} contacts have swarm job coverage. ` +
      `${covered} COVERED, ${unmonitored} UNMONITORED.` +
      (topCovered ? ` Top monitored contacts: ${topCovered}.` : "");

    const agentRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Contact × Swarm Coverage: ${brief} Provide a 2-sentence operational assessment.`,
      }),
    });
    const agentData = agentRes.ok ? await agentRes.json() : {};
    const agentText = agentData.response || agentData.message || agentData.reply || "";

    return agentText ? `${brief}\n\n${agentText}` : brief;
  } catch (err) {
    return `Contact × Swarm Coverage unavailable: ${err.message}`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────

const STATUS_COLOR = {
  RUNNING:   "#29E7FF",
  COMPLETED: "#00E5A0",
  PENDING:   "#FFA500",
  FAILED:    "#FF4466",
  UNKNOWN:   "#8899AA",
};

export default function ContactSwarmCoverage() {
  const [open, setOpen]         = useState(false);
  const [contacts, setContacts] = useState([]);
  const [jobs, setJobs]         = useState([]);
  const [crossed, setCrossed]   = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [query, setQuery]       = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [assessing, setAssess]  = useState(false);
  const [brief, setBrief]       = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [cRes, jRes] = await Promise.all([
        fetch(`${base}/entities/Contact`,  { headers: hdr }),
        fetch(`${base}/entities/SwarmJob`, { headers: hdr }),
      ]);
      const cData = cRes.ok ? await cRes.json() : {};
      const jData = jRes.ok ? await jRes.json() : {};
      const c = normaliseContacts(cData);
      const j = normaliseSwarmJobs(jData);
      setContacts(c);
      setJobs(j);
      setCrossed(crossRef(c, j));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () =>
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    window.addEventListener("jarvis:cswrm-toggle", onToggle);
    return () => window.removeEventListener("jarvis:cswrm-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssess(true);
    setBrief("");
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const total       = crossed.length;
      const covered     = crossed.filter((c) => c.covered).length;
      const unmonitored = total - covered;
      const coverage    = total > 0 ? Math.round((covered / total) * 100) : 0;
      const prompt = `Contact × Swarm Coverage: ${coverage}% coverage (${covered}/${total} monitored, ${unmonitored} unmonitored). Assess in 2 sentences.`;
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      const d    = res.ok ? await res.json() : {};
      const text = d.response || d.message || d.reply || "Assessment complete.";
      setBrief(text);
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "onyx" }),
      });
    } catch (e) {
      setBrief(`Assessment error: ${e.message}`);
    } finally {
      setAssess(false);
    }
  }, [crossed]);

  const visible = crossed.filter((c) => {
    if (tab === "COVERED"     && !c.covered) return false;
    if (tab === "UNMONITORED" &&  c.covered) return false;
    if (query) {
      const q = query.toLowerCase();
      if (
        !c.name.toLowerCase().includes(q) &&
        !(c.organization || "").toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const total        = crossed.length;
  const nCovered     = crossed.filter((c) => c.covered).length;
  const nUnmonitored = total - nCovered;
  const coverage     = total > 0 ? Math.round((nCovered / total) * 100) : 0;

  const btnStyle = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 8,
    zIndex: Z_INDEX,
    background: "rgba(0,0,0,0.85)",
    border: `1px solid ${CY}`,
    color: CY,
    fontFamily: "monospace",
    fontSize: 10,
    padding: "2px 7px",
    cursor: "pointer",
    borderRadius: 3,
    userSelect: "none",
    display: "flex",
    alignItems: "center",
    gap: 4,
  };

  const panelStyle = {
    position: "fixed",
    right: 18,
    bottom: 54,
    width: 460,
    maxHeight: "78vh",
    overflowY: "auto",
    background: "rgba(0,6,18,0.97)",
    border: `1px solid ${CY}44`,
    borderRadius: 8,
    padding: 16,
    zIndex: 9999,
    fontFamily: "monospace",
    color: CY,
    boxSizing: "border-box",
  };

  return (
    <>
      <button
        style={btnStyle}
        onClick={() => setOpen((v) => { if (!v) load(); return !v; })}
        title="Contact × Swarm Coverage Monitor"
      >
        ◈ CSWRM
        {nUnmonitored > 0 && (
          <span
            style={{
              background: AMB,
              color: "#000",
              borderRadius: 8,
              padding: "0 4px",
              fontSize: 9,
            }}
          >
            {nUnmonitored}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: "bold", letterSpacing: 1 }}>
              CONTACT × SWARM COVERAGE
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={load}
                style={{
                  background: "none",
                  border: `1px solid ${CY}55`,
                  color: CY,
                  cursor: "pointer",
                  padding: "2px 8px",
                  borderRadius: 3,
                  fontSize: 10,
                }}
                title="Refresh"
              >
                ↺
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: DIM,
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {[
              {
                label: "COVERAGE",
                value: `${coverage}%`,
                color: coverage > 60 ? GRN : coverage > 30 ? AMB : "#FF4466",
              },
              { label: "COVERED",     value: nCovered,     color: GRN },
              { label: "UNMONITORED", value: nUnmonitored, color: AMB },
              { label: "SWARM JOBS",  value: jobs.length,  color: CY },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  flex: 1,
                  background: "rgba(41,231,255,0.05)",
                  border: `1px solid ${color}33`,
                  borderRadius: 4,
                  padding: "6px 8px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 16, fontWeight: "bold", color }}>{value}</div>
                <div style={{ fontSize: 8, color: DIM, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Assess */}
          <div style={{ marginBottom: 10 }}>
            <button
              onClick={assess}
              disabled={assessing || crossed.length === 0}
              style={{
                background: assessing
                  ? "rgba(41,231,255,0.1)"
                  : "rgba(41,231,255,0.15)",
                border: `1px solid ${CY}88`,
                color: CY,
                cursor: assessing ? "wait" : "pointer",
                padding: "4px 14px",
                borderRadius: 3,
                fontSize: 10,
                fontFamily: "monospace",
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 10,
                  color: "#cde",
                  lineHeight: 1.5,
                  padding: "6px 8px",
                  background: "rgba(41,231,255,0.05)",
                  borderRadius: 3,
                }}
              >
                {brief}
              </div>
            )}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {["ALL", "COVERED", "UNMONITORED"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "none",
                  border: `1px solid ${tab === t ? CY : CY + "33"}`,
                  color: tab === t ? CY : DIM,
                  cursor: "pointer",
                  padding: "2px 10px",
                  borderRadius: 3,
                  fontSize: 10,
                  fontFamily: "monospace",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contacts…"
            style={{
              width: "100%",
              background: "rgba(41,231,255,0.06)",
              border: `1px solid ${CY}33`,
              color: CY,
              padding: "4px 8px",
              borderRadius: 3,
              fontSize: 10,
              marginBottom: 8,
              boxSizing: "border-box",
              fontFamily: "monospace",
            }}
          />

          {/* Contact rows */}
          {loading ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
              Loading…
            </div>
          ) : visible.length === 0 ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
              No contacts match.
            </div>
          ) : (
            visible.map((c) => (
              <div key={c.id}>
                <div
                  onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 6px",
                    marginBottom: 3,
                    cursor: "pointer",
                    borderRadius: 3,
                    background: "rgba(41,231,255,0.04)",
                    border: `1px solid ${c.covered ? GRN + "44" : DIM + "22"}`,
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      color: c.covered ? GRN : DIM,
                      minWidth: 76,
                    }}
                  >
                    {c.covered ? "COVERED" : "UNMONITORED"}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      fontSize: 10,
                      color: c.covered ? GRN : DIM,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.name}
                  </span>
                  {c.organization && (
                    <span style={{ fontSize: 8, color: DIM }}>
                      {c.organization}
                    </span>
                  )}
                  {c.covered && (
                    <span style={{ fontSize: 8, color: GRN }}>
                      ⬡ {c.matches.length} job{c.matches.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {/* Expanded matched swarm jobs */}
                {expanded === c.id && c.covered && (
                  <div style={{ marginLeft: 12, marginBottom: 6 }}>
                    {c.role && (
                      <div style={{ fontSize: 9, color: DIM, marginBottom: 4 }}>
                        {c.role}
                      </div>
                    )}
                    {c.matches.map((j) => (
                      <div
                        key={j.id}
                        style={{
                          padding: "3px 6px",
                          marginBottom: 2,
                          borderRadius: 2,
                          background: "rgba(0,229,160,0.05)",
                          border: `1px solid ${STATUS_COLOR[j.status] || DIM}33`,
                          fontSize: 9,
                        }}
                      >
                        <span
                          style={{
                            color: STATUS_COLOR[j.status] || DIM,
                            marginRight: 4,
                          }}
                        >
                          [{j.status}]
                        </span>
                        <span style={{ color: GRN }}>{j.name}</span>
                        <span style={{ color: DIM, marginLeft: 6 }}>
                          hits:{j.hits}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {expanded === c.id && !c.covered && (
                  <div
                    style={{
                      marginLeft: 12,
                      marginBottom: 6,
                      fontSize: 9,
                      color: DIM,
                    }}
                  >
                    No swarm jobs reference this contact.
                    {c.email && (
                      <div style={{ marginTop: 2 }}>{c.email}</div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}
