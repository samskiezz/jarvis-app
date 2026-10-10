import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const AM = "#FFB300"; const CY = "#00E5FF"; const GN = "#4CAF50";
const OR = "#FF9800"; const RD = "#FF3D3D";
const DIM = "rgba(255,255,255,0.04)"; const BG = "rgba(6,10,18,0.94)";
const MN = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const REFRESH_MS = 90_000;
const BTN_LEFT   = 1097280;
const Z_IDX      = 675;

const SCKNEX_RE = /\b(scknex|swarm contact knowledge|swarm capability readiness|contact swarm knowledge|knowledge swarm contact|capability readiness nexus|swarm readiness|contact knowledge swarm|swarm nexus capability)\b/i;
export function isScknexQuery(t) { return SCKNEX_RE.test(t || ""); }

function tokens(s) {
  return String(s || "").toLowerCase().split(/[\s,;:|\/\-_]+/).filter(w => w.length > 3);
}
function overlap(a, b) {
  const sa = new Set(tokens(a));
  let n = 0;
  for (const w of tokens(b)) if (sa.has(w)) n++;
  return n;
}

function normSwarm(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.jobs) ? raw.jobs
    : Array.isArray(raw?.results) ? raw.results
    : Array.isArray(raw?.data) ? raw.data
    : [];
  return arr.map(j => ({
    id: j.id || j._id || "",
    label: j.name || j.title || j.job_name || j.label || String(j.id || ""),
    description: j.description || j.summary || j.objective || "",
    status: j.status || j.state || "",
    type: j.type || j.category || "",
  }));
}

function normContacts(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.contacts) ? raw.contacts
    : Array.isArray(raw?.results) ? raw.results
    : Array.isArray(raw?.data) ? raw.data
    : [];
  return arr.map(c => ({
    id: c.id || c._id || "",
    label: c.name || c.full_name || c.display_name || c.label || String(c.id || ""),
    role: c.role || c.title || c.position || "",
    org: c.org || c.organization || c.company || "",
    tags: Array.isArray(c.tags) ? c.tags.join(" ") : String(c.tags || ""),
  }));
}

function normKnowledge(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.articles) ? raw.articles
    : Array.isArray(raw?.items) ? raw.items
    : Array.isArray(raw?.results) ? raw.results
    : Array.isArray(raw?.data) ? raw.data
    : [];
  return arr.map(k => ({
    id: k.id || k._id || "",
    label: k.title || k.name || k.label || String(k.id || ""),
    content: k.content || k.summary || k.description || "",
    category: k.category || k.type || "",
    tags: Array.isArray(k.tags) ? k.tags.join(" ") : String(k.tags || ""),
  }));
}

function classify(job, contacts, knowledge) {
  const hay = job.label + " " + job.description + " " + job.type;
  const hasContact  = contacts.some(c  => overlap(hay, c.label + " " + c.role + " " + c.tags) >= 1);
  const hasKnowledge = knowledge.some(k => overlap(hay, k.label + " " + k.content + " " + k.tags) >= 1);
  if (hasContact && hasKnowledge) return "FULLY_READY";
  if (hasContact)                 return "CONTACT_ONLY";
  if (hasKnowledge)               return "KB_ONLY";
  return "UNREADY";
}

function relevance(jobHay, itemText) {
  return Math.min(100, overlap(jobHay, itemText) * 20);
}

const clsColor = cls => ({
  FULLY_READY:  GN,
  CONTACT_ONLY: CY,
  KB_ONLY:      OR,
  UNREADY:      RD,
}[cls] || "#888");

const clsLabel = cls => ({
  FULLY_READY:  "FULLY READY",
  CONTACT_ONLY: "CONTACT ONLY",
  KB_ONLY:      "KB ONLY",
  UNREADY:      "UNREADY",
}[cls] || cls);

export async function buildScknexScript() {
  const base = apiBase();
  const hdr = { Authorization: `Bearer ${API_KEY}` };
  const [swRaw, cRaw, kRaw] = await Promise.all([
    fetch(`${base}/entities/SwarmJob`, { headers: hdr }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/entities/Contact`,  { headers: hdr }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/knowledge/`,         { headers: hdr }).then(r => r.ok ? r.json() : []),
  ]);
  const jobs     = normSwarm(swRaw);
  const contacts = normContacts(cRaw);
  const knowledge = normKnowledge(kRaw);
  const counts = { FULLY_READY: 0, CONTACT_ONLY: 0, KB_ONLY: 0, UNREADY: 0 };
  jobs.forEach(j => counts[classify(j, contacts, knowledge)]++);
  return `SCKNEX online, sir. ${jobs.length} swarm jobs assessed for capability readiness. `
    + `${counts.FULLY_READY} fully ready (contact + KB), ${counts.CONTACT_ONLY} contact-only, `
    + `${counts.KB_ONLY} KB-only, ${counts.UNREADY} unready — capability gaps detected. `
    + `${contacts.length} contacts and ${knowledge.length} knowledge articles correlated.`;
}

export default function SwarmContactKnowledgeNexus() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [knowledge, setKnowledge] = useState([]);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [swRaw, cRaw, kRaw] = await Promise.all([
        fetch(`${base}/entities/SwarmJob`, { headers: hdr }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/entities/Contact`,  { headers: hdr }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/knowledge/`,         { headers: hdr }).then(r => r.ok ? r.json() : []),
      ]);
      setJobs(normSwarm(swRaw));
      setContacts(normContacts(cRaw));
      setKnowledge(normKnowledge(kRaw));
    } catch { /* stay stale */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(v => !v); };
    window.addEventListener("jarvis:scknex-toggle", handler);
    return () => window.removeEventListener("jarvis:scknex-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const classified = jobs.map(j => {
    const cls = classify(j, contacts, knowledge);
    return { ...j, cls };
  });

  const unreadyCount = classified.filter(j => j.cls === "UNREADY").length;

  const tabs = ["ALL", "FULLY_READY", "CONTACT_ONLY", "KB_ONLY", "UNREADY"];
  const filtered = classified
    .filter(j => tab === "ALL" || j.cls === tab)
    .filter(j => !search || j.label.toLowerCase().includes(search.toLowerCase()) || j.description.toLowerCase().includes(search.toLowerCase()));

  const counts = { FULLY_READY: 0, CONTACT_ONLY: 0, KB_ONLY: 0, UNREADY: 0 };
  classified.forEach(j => counts[j.cls]++);

  const assess = async () => {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const hdr = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
      const ctx = `${classified.length} swarm jobs: ${counts.FULLY_READY} fully ready, ${counts.CONTACT_ONLY} contact-only, ${counts.KB_ONLY} KB-only, ${counts.UNREADY} unready.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers: hdr,
        body: JSON.stringify({ message: `SCKNEX capability readiness assessment: ${ctx} Give a 2-sentence brief on swarm job readiness gaps and recommended next actions.` }),
      });
      const d = await r.json();
      const text = d.response || d.answer || d.message || d.result || "";
      setBrief(text);
      if (text) {
        const ttsR = await fetch(`${base}/v1/voice/tts`, {
          method: "POST", headers: hdr,
          body: JSON.stringify({ text, voice: getActiveVoice() }),
        });
        if (ttsR.ok) {
          const blob = await ttsR.blob();
          new Audio(URL.createObjectURL(blob)).play();
        }
      }
    } catch { setBrief("Assessment unavailable — backend unreachable."); }
    setAssessing(false);
  };

  return (
    <>
      {/* toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_IDX,
          background: open ? `${AM}22` : "rgba(10,14,24,0.82)",
          border: `1px solid ${open ? AM : "#333"}`,
          borderRadius: 4, color: open ? AM : "#666",
          fontFamily: MN, fontSize: 9, fontWeight: 700,
          padding: "3px 8px", cursor: "pointer", letterSpacing: 1,
        }}
      >
        ◈ SCKNEX
        {unreadyCount > 0 && (
          <span style={{
            marginLeft: 5, background: RD, color: "#fff",
            borderRadius: 8, fontSize: 8, padding: "1px 5px", fontWeight: 900,
          }}>{unreadyCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: Math.min(BTN_LEFT, window.innerWidth - 480),
          width: 460, maxHeight: "72vh", overflowY: "auto",
          background: BG, border: `1px solid ${AM}55`, borderRadius: 8,
          zIndex: Z_IDX + 1, padding: 14, fontFamily: MN,
          boxShadow: `0 0 24px ${AM}22`,
        }}>
          {/* header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ color: AM, fontWeight: 900, fontSize: 12, letterSpacing: 2 }}>SCKNEX — CAPABILITY READINESS</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#555", fontSize: 14, cursor: "pointer" }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 10 }}>
            {[
              ["SWARM JOBS", classified.length, "#888"],
              ["FULLY READY", counts.FULLY_READY, GN],
              ["CONTACT/KB", counts.CONTACT_ONLY + counts.KB_ONLY, CY],
              ["UNREADY", counts.UNREADY, RD],
            ].map(([label, val, color]) => (
              <div key={label} style={{ background: `${color}11`, border: `1px solid ${color}33`, borderRadius: 5, padding: "6px 4px", textAlign: "center" }}>
                <div style={{ color, fontWeight: 900, fontSize: 16 }}>{loading ? "…" : val}</div>
                <div style={{ color: "#666", fontSize: 8, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* coverage bar */}
          {classified.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ color: "#888", fontSize: 9 }}>READINESS COVERAGE</span>
                <span style={{ color: GN, fontSize: 9, fontWeight: 700 }}>{Math.round(counts.FULLY_READY / classified.length * 100)}%</span>
              </div>
              <div style={{ background: "#111", borderRadius: 3, height: 4 }}>
                <div style={{ width: `${Math.round(counts.FULLY_READY / classified.length * 100)}%`, height: "100%", background: GN, borderRadius: 3 }} />
              </div>
            </div>
          )}

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            {tabs.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${AM}22` : "none",
                border: `1px solid ${tab === t ? AM : "#333"}`,
                color: tab === t ? AM : "#555",
                borderRadius: 3, fontSize: 8, padding: "2px 7px", cursor: "pointer", fontFamily: MN,
              }}>{t === "ALL" ? `ALL (${classified.length})` : `${clsLabel(t)} (${counts[t] || 0})`}</button>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search swarm jobs…"
            style={{
              width: "100%", background: "#0a0f18", border: "1px solid #222", borderRadius: 4,
              color: "#ccc", fontFamily: MN, fontSize: 11, padding: "5px 8px",
              marginBottom: 8, boxSizing: "border-box",
            }}
          />

          {loading && <div style={{ color: "#555", textAlign: "center", padding: 20, fontSize: 11 }}>Loading…</div>}

          {!loading && filtered.map(j => {
            const hay = j.label + " " + j.description + " " + j.type;
            const isExp = expanded === j.id;
            const matchedContacts  = contacts.filter(c  => overlap(hay, c.label + " " + c.role + " " + c.tags) >= 1);
            const matchedKnowledge = knowledge.filter(k => overlap(hay, k.label + " " + k.content + " " + k.tags) >= 1);
            return (
              <div key={j.id} style={{
                background: DIM, border: `1px solid ${clsColor(j.cls)}22`,
                borderRadius: 5, marginBottom: 6, padding: "7px 10px",
                animation: j.cls === "UNREADY" ? "scknexPulse 2.4s ease-in-out infinite" : "none",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ color: "#fff", fontWeight: 700 }}>{j.label}</span>
                    {j.status && <span style={{ color: "#888", marginLeft: 6, fontSize: 10 }}>{j.status}</span>}
                    {j.type   && <span style={{ color: "#666", marginLeft: 6, fontSize: 10 }}>{j.type}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{
                      background: `${clsColor(j.cls)}22`, border: `1px solid ${clsColor(j.cls)}`,
                      color: clsColor(j.cls), borderRadius: 3, padding: "1px 5px", fontSize: 9, fontWeight: 700,
                    }}>{clsLabel(j.cls)}</span>
                    <button onClick={() => setExpanded(isExp ? null : j.id)} style={{
                      background: "none", border: `1px solid #333`, borderRadius: 3,
                      color: "#888", fontSize: 9, padding: "1px 5px", cursor: "pointer",
                    }}>{isExp ? "▲" : "▼"}</button>
                  </div>
                </div>

                {isExp && (
                  <div style={{ marginTop: 8 }}>
                    {matchedContacts.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ color: CY, fontSize: 10, fontWeight: 700, marginBottom: 4 }}>MATCHED CONTACTS ({matchedContacts.length})</div>
                        {matchedContacts.slice(0, 4).map(c => {
                          const rel = relevance(hay, c.label + " " + c.role + " " + c.tags);
                          return (
                            <div key={c.id} style={{ background: `${CY}0a`, border: `1px solid ${CY}22`, borderRadius: 3, padding: "4px 8px", marginBottom: 3 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ color: "#ccc", fontSize: 11 }}>{c.label}</span>
                                {c.role && <span style={{ background: `${CY}22`, color: CY, borderRadius: 2, padding: "0 4px", fontSize: 8 }}>{c.role}</span>}
                              </div>
                              <div style={{ marginTop: 3, background: "#111", borderRadius: 2, height: 3 }}>
                                <div style={{ width: `${rel}%`, height: "100%", background: CY, borderRadius: 2 }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {matchedKnowledge.length > 0 && (
                      <div>
                        <div style={{ color: GN, fontSize: 10, fontWeight: 700, marginBottom: 4 }}>MATCHED KB ARTICLES ({matchedKnowledge.length})</div>
                        {matchedKnowledge.slice(0, 4).map(k => {
                          const rel = relevance(hay, k.label + " " + k.content + " " + k.tags);
                          return (
                            <div key={k.id} style={{ background: `${GN}0a`, border: `1px solid ${GN}22`, borderRadius: 3, padding: "4px 8px", marginBottom: 3 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ color: "#ccc", fontSize: 11 }}>{k.label}</span>
                                {k.category && <span style={{ background: `${GN}22`, color: GN, borderRadius: 2, padding: "0 4px", fontSize: 8 }}>{k.category}</span>}
                              </div>
                              <div style={{ marginTop: 3, background: "#111", borderRadius: 2, height: 3 }}>
                                <div style={{ width: `${rel}%`, height: "100%", background: GN, borderRadius: 2 }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {matchedContacts.length === 0 && matchedKnowledge.length === 0 && (
                      <div style={{ color: RD, fontSize: 10, padding: "4px 0" }}>No contact or KB match — capability readiness gap.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* assess */}
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              marginTop: 10, width: "100%", background: assessing ? "#111" : `${AM}22`,
              border: `1px solid ${AM}`, borderRadius: 4, color: AM,
              fontFamily: MN, fontSize: 11, fontWeight: 700, padding: "6px 0", cursor: assessing ? "default" : "pointer",
            }}
          >
            {assessing ? "ASSESSING…" : "▶ ASSESS CAPABILITY READINESS"}
          </button>
          {brief && (
            <div style={{ marginTop: 8, background: `${AM}11`, border: `1px solid ${AM}33`, borderRadius: 4, padding: 8, color: "#ccc", fontSize: 11, lineHeight: 1.5 }}>
              {brief}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes scknexPulse {
          0%,100% { border-color: ${RD}22; }
          50% { border-color: ${RD}88; box-shadow: 0 0 6px ${RD}44; }
        }
      `}</style>
    </>
  );
}
