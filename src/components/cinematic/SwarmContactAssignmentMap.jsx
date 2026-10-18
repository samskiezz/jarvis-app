/**
 * SwarmContactAssignmentMap — F301
 * Fetches /entities/SwarmJob + /entities/Contact; keyword-matches each swarm
 * job against contact names/roles to surface ASSIGNED vs UNASSIGNED jobs.
 * Stat tiles (total jobs, assigned, unassigned, contacts); expandable rows
 * show matched contacts with role badge.
 * ◈ SCMAP toggle; voice "swarm assignment"/"swarm contacts"/"job assignment"/"who is assigned".
 * Additive-only — no edits to CinematicShell/CinematicHome/JarvisLoader.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GR = "#00FF9F";
const AM = "#FFB800";
const PU = "#A855F7";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";
const POLL_MS = 90_000;

const SCMAP_RE =
  /\bswarm.?assign\b|\bswarm.?contact(s)?\b|\bjob.?assign\b|\bassign.?job(s)?\b|\bwho.?assign\b|\bscmap\b|\bswarm.?person\b|\bpersonnel.?assign\b|\bcontact.?job(s)?\b/i;

export function isSwarmContactQuery(text) {
  return SCMAP_RE.test(text || "");
}

function tokenize(str) {
  return (str || "")
    .toLowerCase()
    .split(/[\s,;:\-_/()[\]{}\.]+/)
    .filter((t) => t.length >= 3);
}

function matchContacts(job, contacts) {
  const jobTokens = tokenize(
    (job.title || job.name || "") +
      " " +
      (job.description || "") +
      " " +
      (job.assigned_to || "") +
      " " +
      (job.owner || ""),
  );
  return contacts.filter((c) => {
    const cTokens = tokenize(
      (c.name || c.full_name || "") +
        " " +
        (c.role || c.title || "") +
        " " +
        (c.email || "") +
        " " +
        (c.department || ""),
    );
    return jobTokens.some((jt) => cTokens.includes(jt));
  });
}

export async function buildSwarmContactScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [jr, cr] = await Promise.allSettled([
    fetch(`${base}/entities/SwarmJob`, { headers }),
    fetch(`${base}/entities/Contact`, { headers }),
  ]);
  if (jr.status !== "fulfilled" || !jr.value.ok)
    return "Swarm job data unavailable, sir.";
  if (cr.status !== "fulfilled" || !cr.value.ok)
    return "Contact data unavailable, sir.";
  const jd = await jr.value.json();
  const cd = await cr.value.json();
  const jobs = Array.isArray(jd) ? jd : jd.jobs || jd.items || jd.data || [];
  const contacts = Array.isArray(cd)
    ? cd
    : cd.contacts || cd.items || cd.data || [];
  if (!jobs.length) return "No active swarm jobs found, sir.";
  const assigned = jobs.filter((j) => matchContacts(j, contacts).length > 0);
  const unassigned = jobs.length - assigned.length;
  const pct =
    jobs.length > 0 ? Math.round((assigned.length / jobs.length) * 100) : 0;
  return (
    `Swarm personnel assignment analysis complete, sir. ${jobs.length} active swarm jobs across ` +
    `${contacts.length} registered contacts. ${assigned.length} jobs have identified personnel ` +
    `(${pct}% coverage); ${unassigned} jobs show no contact match and may require assignment. ` +
    (unassigned > 0
      ? `Recommend reviewing the ${unassigned} unassigned mission${unassigned > 1 ? "s" : ""} for staffing gaps.`
      : "All swarm operations appear to have personnel coverage.")
  );
}

export default function SwarmContactAssignmentMap() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [filter, setFilter] = useState("all");
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const base = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [jr, cr] = await Promise.allSettled([
        fetch(`${base}/entities/SwarmJob`, { headers }),
        fetch(`${base}/entities/Contact`, { headers }),
      ]);
      const jOk = jr.status === "fulfilled" && jr.value.ok;
      const cOk = cr.status === "fulfilled" && cr.value.ok;
      const jd = jOk ? await jr.value.json() : null;
      const cd = cOk ? await cr.value.json() : null;
      const jobs = jd
        ? Array.isArray(jd)
          ? jd
          : jd.jobs || jd.items || jd.data || []
        : [];
      const allContacts = cd
        ? Array.isArray(cd)
          ? cd
          : cd.contacts || cd.items || cd.data || []
        : [];
      const mapped = jobs.map((j) => ({
        ...j,
        _matched: matchContacts(j, allContacts),
      }));
      setRows(mapped);
      setContacts(allContacts);
    } catch {}
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:swarm-contact-map-toggle", onToggle);
    return () =>
      window.removeEventListener("jarvis:swarm-contact-map-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [open, fetchData]);

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildSwarmContactScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const answer = (d.answer || script).replace(/<<ACTION:[^>]*>>/g, "").trim();
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }),
      );
    } catch {
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", {
          detail: { text: "Swarm assignment assessment unavailable." },
        }),
      );
    }
    setAssessing(false);
  }

  function toggleRow(id) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const assigned = rows.filter((j) => j._matched.length > 0);
  const unassigned = rows.filter((j) => j._matched.length === 0);

  const visible =
    filter === "assigned"
      ? assigned
      : filter === "unassigned"
      ? unassigned
      : rows;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Swarm × Contact Assignment Map"
        style={{
          position: "fixed",
          left: 59000,
          bottom: 8,
          zIndex: 114,
          background: open ? PU : "rgba(5,8,13,0.75)",
          border: `1px solid ${open ? PU : "rgba(168,85,247,0.35)"}`,
          color: open ? "#fff" : PU,
          fontFamily: "monospace",
          fontSize: 10,
          padding: "3px 7px",
          borderRadius: 4,
          cursor: "pointer",
          letterSpacing: "0.05em",
        }}
      >
        ◈ SCMAP
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            right: 18,
            bottom: 90,
            zIndex: 9200,
            width: 340,
            maxHeight: "72vh",
            background: "rgba(5,8,13,0.93)",
            border: `1px solid ${PU}`,
            borderRadius: 8,
            padding: 14,
            fontFamily: "monospace",
            color: CY,
            boxShadow: `0 0 20px rgba(168,85,247,0.18)`,
            display: "flex",
            flexDirection: "column",
            gap: 0,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <span
              style={{
                fontSize: 11,
                letterSpacing: "0.12em",
                fontWeight: "bold",
                color: PU,
              }}
            >
              ◈ SWARM × CONTACT ASSIGNMENT MAP
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none",
                border: "none",
                color: CY,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              ✕
            </button>
          </div>

          {loading && !rows.length && (
            <div
              style={{
                textAlign: "center",
                fontSize: 11,
                opacity: 0.6,
                padding: "12px 0",
              }}
            >
              cross-referencing swarm jobs vs contacts…
            </div>
          )}

          {rows.length > 0 && (
            <>
              {/* Stat tiles */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr 1fr",
                  gap: 5,
                  marginBottom: 10,
                }}
              >
                {[
                  { label: "JOBS", val: rows.length, col: PU },
                  { label: "ASSIGNED", val: assigned.length, col: GR },
                  { label: "UNASSIGNED", val: unassigned.length, col: AM },
                  { label: "CONTACTS", val: contacts.length, col: CY },
                ].map(({ label, val, col }) => (
                  <div
                    key={label}
                    style={{
                      background: "rgba(168,85,247,0.05)",
                      borderRadius: 4,
                      padding: "5px 3px",
                      textAlign: "center",
                      border: "1px solid rgba(168,85,247,0.15)",
                    }}
                  >
                    <div
                      style={{ fontSize: 14, fontWeight: "bold", color: col }}
                    >
                      {val}
                    </div>
                    <div style={{ fontSize: 8, opacity: 0.5, marginTop: 1 }}>
                      {label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Filter tabs */}
              <div
                style={{
                  display: "flex",
                  gap: 4,
                  marginBottom: 8,
                  flexWrap: "wrap",
                }}
              >
                {[
                  { key: "all", label: "ALL" },
                  { key: "assigned", label: "ASSIGNED" },
                  { key: "unassigned", label: "UNASSIGNED" },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    style={{
                      background:
                        filter === key ? PU : "rgba(168,85,247,0.07)",
                      border: `1px solid ${filter === key ? PU : "rgba(168,85,247,0.25)"}`,
                      color: filter === key ? "#fff" : PU,
                      fontFamily: "monospace",
                      fontSize: 9,
                      padding: "2px 6px",
                      borderRadius: 3,
                      cursor: "pointer",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Job rows */}
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  maxHeight: "38vh",
                  marginBottom: 8,
                }}
              >
                {visible.length === 0 && (
                  <div
                    style={{
                      textAlign: "center",
                      opacity: 0.5,
                      fontSize: 10,
                      padding: "10px 0",
                    }}
                  >
                    no jobs in this filter
                  </div>
                )}
                {visible.map((job, i) => {
                  const status = (job.status || "unknown").toLowerCase();
                  const id = job.id || job._id || i;
                  const isExpanded = expanded[id];
                  const matched = job._matched || [];
                  const isAssigned = matched.length > 0;
                  return (
                    <div
                      key={id}
                      style={{
                        borderBottom: "1px solid rgba(168,85,247,0.1)",
                        paddingBottom: 6,
                        marginBottom: 6,
                      }}
                    >
                      <div
                        onClick={() => matched.length > 0 && toggleRow(id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          cursor: matched.length > 0 ? "pointer" : "default",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 8,
                            background: isAssigned
                              ? "rgba(0,255,159,0.12)"
                              : "rgba(255,184,0,0.12)",
                            border: `1px solid ${isAssigned ? GR : AM}`,
                            color: isAssigned ? GR : AM,
                            borderRadius: 3,
                            padding: "1px 4px",
                            letterSpacing: "0.06em",
                            minWidth: 54,
                            textAlign: "center",
                          }}
                        >
                          {isAssigned ? "ASSIGNED" : "UNASSIGNED"}
                        </span>
                        <span
                          style={{
                            flex: 1,
                            fontSize: 10,
                            color: "#DCEBF5",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {job.title || job.name || `Job #${id}`}
                        </span>
                        {matched.length > 0 && (
                          <span
                            style={{
                              fontSize: 9,
                              color: GR,
                              background: "rgba(0,255,159,0.1)",
                              border: "1px solid rgba(0,255,159,0.3)",
                              borderRadius: 3,
                              padding: "1px 4px",
                            }}
                          >
                            {matched.length}▾
                          </span>
                        )}
                      </div>
                      {status !== "unknown" && (
                        <div
                          style={{
                            fontSize: 8,
                            opacity: 0.45,
                            paddingLeft: 0,
                            marginTop: 2,
                          }}
                        >
                          status: {status}
                        </div>
                      )}
                      {isExpanded && matched.length > 0 && (
                        <div
                          style={{
                            marginTop: 5,
                            paddingLeft: 10,
                            borderLeft: `2px solid ${PU}44`,
                          }}
                        >
                          {matched.slice(0, 5).map((c, ci) => (
                            <div
                              key={c.id || c._id || ci}
                              style={{
                                fontSize: 9,
                                color: "#A0B8C8",
                                padding: "2px 0",
                                display: "flex",
                                alignItems: "center",
                                gap: 5,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 8,
                                  color: CY,
                                  background: "rgba(41,231,255,0.08)",
                                  border: "1px solid rgba(41,231,255,0.2)",
                                  borderRadius: 2,
                                  padding: "0 3px",
                                  maxWidth: 70,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {c.role || c.title || "contact"}
                              </span>
                              {c.name || c.full_name || `Contact ${ci + 1}`}
                            </div>
                          ))}
                          {matched.length > 5 && (
                            <div
                              style={{
                                fontSize: 9,
                                opacity: 0.5,
                                paddingTop: 2,
                              }}
                            >
                              +{matched.length - 5} more
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Assess button */}
          <button
            onClick={assess}
            disabled={assessing || !rows.length}
            style={{
              width: "100%",
              background: "rgba(168,85,247,0.08)",
              border: `1px solid ${PU}`,
              color: PU,
              fontFamily: "monospace",
              fontSize: 10,
              padding: "5px 0",
              borderRadius: 4,
              cursor: assessing || !rows.length ? "not-allowed" : "pointer",
              letterSpacing: "0.08em",
              opacity: assessing || !rows.length ? 0.5 : 1,
            }}
          >
            {assessing ? "▶ ASSESSING…" : "▶ ASSESS — JARVIS BRIEF"}
          </button>
        </div>
      )}
    </>
  );
}
