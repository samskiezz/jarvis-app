/**
 * SwarmContactOwnership — F59
 * /entities/SwarmJob × /entities/Contact → keyword-correlates running swarm jobs against
 * contacts to surface OWNED vs UNOWNED jobs.
 * Voice trigger: "swarm contact"/"job owner"/"scown"/"swarm ownership"/"who runs"/"contact swarm".
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const CY  = "#29E7FF";
const GRN = "#4ADE80";
const AMB = "#FFBB33";
const RED = "#FF4455";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SCOWN_RE =
  /\bswarm\s*contact(?:s)?\b|\bjob\s*owner(?:s|ship)?\b|\bscown\b|\bswarm\s*ownership\b|\bwho\s*run(?:s)?\b|\bcontact\s*swarm\b|\bowned?\s*jobs?\b|\bunowned?\s*jobs?\b|\bswarm\s*responsib(?:le|ility)\b/i;

export function isScownQuery(text) {
  return SCOWN_RE.test(text || "");
}

async function fetchSwarmJobs() {
  const r = await fetch(`${apiBase()}/entities/SwarmJob`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)            ? d
    : Array.isArray(d?.items)        ? d.items
    : Array.isArray(d?.data)         ? d.data
    : Array.isArray(d?.results)      ? d.results
    : Array.isArray(d?.jobs)         ? d.jobs
    : [];
}

async function fetchContacts() {
  const r = await fetch(`${apiBase()}/entities/Contact`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)              ? d
    : Array.isArray(d?.items)          ? d.items
    : Array.isArray(d?.data)           ? d.data
    : Array.isArray(d?.results)        ? d.results
    : Array.isArray(d?.contacts)       ? d.contacts
    : [];
}

function keywords(obj) {
  return [
    obj?.name, obj?.title, obj?.label, obj?.description,
    obj?.type, obj?.category, obj?.owner, obj?.assigned_to,
    obj?.created_by, obj?.contact_name, obj?.agent,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 2);
}

function correlate(jobs, contacts) {
  return jobs.map(job => {
    const jWords = new Set(keywords(job));
    const matched = contacts.filter(c => {
      const cWords = keywords(c);
      return cWords.some(w => jWords.has(w));
    });
    const status = matched.length > 0 ? "OWNED" : "UNOWNED";
    return { job, contacts: matched, status };
  });
}

export async function buildScownScript() {
  const [jRes, cRes] = await Promise.allSettled([fetchSwarmJobs(), fetchContacts()]);
  const jobs     = jRes.status === "fulfilled" ? jRes.value : [];
  const contacts = cRes.status === "fulfilled" ? cRes.value : [];
  if (!jobs.length) return "No swarm jobs available to assess contact ownership, sir.";
  const rows    = correlate(jobs, contacts);
  const owned   = rows.filter(r => r.status === "OWNED").length;
  const unowned = rows.filter(r => r.status === "UNOWNED").length;
  return (
    `Swarm contact ownership: ${rows.length} job${rows.length !== 1 ? "s" : ""} assessed against ` +
    `${contacts.length} contact${contacts.length !== 1 ? "s" : ""}. ` +
    `${owned} OWNED, ${unowned} UNOWNED — no identifiable contact owner.`
  );
}

const TABS = ["ALL", "OWNED", "UNOWNED"];

export default function SwarmContactOwnership() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [tab, setTab]             = useState("ALL");
  const [q, setQ]                 = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [verdict, setVerdict]     = useState({});

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [jobs, contacts] = await Promise.all([fetchSwarmJobs(), fetchContacts()]);
      setRows(correlate(jobs, contacts));
    } catch (e) {
      setError(e.message || "Fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => {
      if (!o) load();
      return !o;
    });
    window.addEventListener("jarvis:scown-toggle", onToggle);
    return () => window.removeEventListener("jarvis:scown-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  if (!open) return null;

  const owned   = rows.filter(r => r.status === "OWNED").length;
  const unowned = rows.filter(r => r.status === "UNOWNED").length;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r.status !== tab) return false;
    if (q) {
      const name = (r.job?.name || r.job?.title || r.job?.label || "").toLowerCase();
      if (!name.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  async function assess(row) {
    const jobId = row.job?.id || row.job?.name || "?";
    setAssessing(jobId);
    try {
      const prompt =
        `Swarm job "${row.job?.name || row.job?.title || jobId}" is ${row.status}. ` +
        (row.contacts.length
          ? `Matched contacts: ${row.contacts.map(c => c.name || c.title || c.id).join(", ")}.`
          : "No contact owner found.") +
        " In 2 sentences, assess who should own this job and what action JARVIS should take.";
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const text = data?.response || data?.message || data?.content || "No assessment available.";
      setVerdict(v => ({ ...v, [jobId]: text }));
      const voice = getActiveVoice?.() || "ash";
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice }),
      });
    } catch {
      // TTS non-critical
    } finally {
      setAssessing(null);
    }
  }

  const statTile = (label, value, color) => (
    <div style={{ flex: 1, background: "rgba(0,0,0,0.35)", borderRadius: 8, padding: "8px 10px",
      border: `1px solid ${color}44`, textAlign: "center" }}>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: "#6E8AA0", letterSpacing: 1 }}>{label}</div>
    </div>
  );

  return (
    <div style={{
      position: "fixed", left: 14040, bottom: 8, zIndex: 68,
      background: "rgba(6,12,20,0.93)", border: `1px solid ${CY}55`,
      borderRadius: 12, padding: "12px 14px", width: "min(460px,90vw)",
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
      backdropFilter: "blur(12px)", boxShadow: `0 0 40px ${CY}18`,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>◈ SCOWN</span>
        <span style={{ color: "#6E8AA0", fontSize: 10 }}>SwarmJob × Contact Ownership</span>
        <button onClick={() => setOpen(false)} style={{ marginLeft: "auto", background: "none",
          border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {statTile("JOBS",    rows.length, CY)}
        {statTile("OWNED",   owned,       GRN)}
        {statTile("UNOWNED", unowned,     unowned > 0 ? AMB : GRN)}
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `${CY}22` : "none", border: `1px solid ${tab === t ? CY : "#2A3A4A"}`,
            color: tab === t ? CY : "#6E8AA0", borderRadius: 6, padding: "3px 10px",
            fontSize: 10, cursor: "pointer", letterSpacing: 1,
          }}>{t}</button>
        ))}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="search jobs…"
          style={{ marginLeft: "auto", background: "rgba(0,0,0,0.3)", border: `1px solid ${CY}33`,
            borderRadius: 6, padding: "3px 8px", fontSize: 10, color: "#DCEBF5", width: 110 }} />
      </div>

      {/* Rows */}
      {loading && <div style={{ color: CY, fontSize: 11, textAlign: "center", padding: 10 }}>loading…</div>}
      {error   && <div style={{ color: RED, fontSize: 11, padding: 6 }}>{error}</div>}
      {!loading && !error && visible.length === 0 && (
        <div style={{ color: "#6E8AA0", fontSize: 11, textAlign: "center", padding: 10 }}>No jobs match.</div>
      )}
      <div style={{ maxHeight: 280, overflowY: "auto" }}>
        {visible.map((row, i) => {
          const jobId  = row.job?.id || row.job?.name || String(i);
          const name   = row.job?.name || row.job?.title || row.job?.label || jobId;
          const status = row.status;
          const color  = status === "OWNED" ? GRN : AMB;
          const exp    = expanded === jobId;
          return (
            <div key={jobId} style={{ borderBottom: `1px solid ${CY}22`, paddingBottom: 6, marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                onClick={() => setExpanded(exp ? null : jobId)}>
                <span style={{ fontSize: 10, fontWeight: 700, color,
                  border: `1px solid ${color}55`, borderRadius: 4, padding: "1px 5px",
                  ...(status === "UNOWNED" ? { animation: "scown-pulse 2s ease-in-out infinite" } : {}),
                }}>{status}</span>
                <span style={{ fontSize: 11, color: "#DCEBF5", flex: 1, overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                <span style={{ fontSize: 9, color: "#6E8AA0" }}>{exp ? "▲" : "▼"}</span>
              </div>
              {exp && (
                <div style={{ marginTop: 6, paddingLeft: 8 }}>
                  {row.contacts.length > 0 ? (
                    row.contacts.map((c, ci) => (
                      <div key={ci} style={{ fontSize: 10, color: GRN, padding: "2px 0",
                        borderLeft: `2px solid ${GRN}55`, paddingLeft: 6, marginBottom: 2 }}>
                        {c.name || c.title || c.email || c.id}
                        {c.role && <span style={{ color: "#6E8AA0", marginLeft: 6 }}>{c.role}</span>}
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: 10, color: AMB }}>No matching contact owner found.</div>
                  )}
                  {verdict[jobId] && (
                    <div style={{ marginTop: 6, fontSize: 10, color: "#9BBCD1",
                      background: "rgba(0,0,0,0.3)", borderRadius: 6, padding: "5px 8px",
                      borderLeft: `2px solid ${CY}55` }}>{verdict[jobId]}</div>
                  )}
                  <button onClick={() => assess(row)} disabled={assessing === jobId}
                    style={{ marginTop: 6, background: `${CY}18`, border: `1px solid ${CY}55`,
                      color: CY, borderRadius: 6, padding: "3px 10px", fontSize: 10,
                      cursor: assessing === jobId ? "wait" : "pointer", letterSpacing: 1 }}>
                    {assessing === jobId ? "…assessing" : "▶ ASSESS"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <style>{`@keyframes scown-pulse{0%,100%{opacity:1}50%{opacity:0.45}}`}</style>
    </div>
  );
}
