/**
 * SwarmInvestigationBridge — F62
 * ◈ SWIMB button (left:981560, bottom:8, zIndex:130)
 * parallel-fetches /entities/SwarmJob + /v1/investigations
 * keyword-correlates each swarm job (name/description/type/status)
 * against investigation titles/descriptions to classify
 * MISSION_ALIGNED (≥1 match) vs UNALIGNED (no backing investigation)
 * amber badge on unaligned count; filter tabs ALL/MISSION_ALIGNED/UNALIGNED
 * expand job → matched investigation cards with relevance bar
 * ▶ ASSESS ALIGNMENT → /v1/jarvis/agent/chat 2-sentence mission coverage brief + TTS
 * voice trigger: "swimb/swarm investigation/mission aligned/swarm mission/unaligned swarm/swarm coverage"
 * jarvis:swimb-toggle event; 90-s auto-refresh
 */
import { useEffect, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const AM = "#F59E0B";
const GR = "#10B981";
const RD = "#EF4444";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SWIMB_RE =
  /\bswimb\b|\bswarm.invest|\bmission.align|\bswarm.mission|\bunaligned.swarm|\bswarm.cover|\bswarm.backed|\binvest.swarm|\bswarm.link/i;

export function isSwimbQuery(text) {
  return SWIMB_RE.test(text || "");
}

function tokenise(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function stopwords() {
  return new Set([
    "the", "and", "for", "are", "was", "were", "has", "have", "had",
    "not", "but", "with", "this", "that", "from", "will", "can",
    "its", "any", "all", "new", "our", "your", "their",
  ]);
}

function relevance(job, inv) {
  const sw = stopwords();
  const jobTokens = new Set(tokenise(`${job.name} ${job.description || ""} ${job.type || ""} ${job.status || ""}`)
    .filter((t) => !sw.has(t)));
  const invTokens = tokenise(`${inv.title || inv.name || ""} ${inv.description || ""} ${inv.summary || ""}`)
    .filter((t) => !sw.has(t));
  const hits = invTokens.filter((t) => jobTokens.has(t)).length;
  return Math.min(100, Math.round((hits / Math.max(jobTokens.size, 1)) * 160));
}

function normaliseJobs(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.data || raw?.items || raw?.jobs || []);
  return arr.map((j) => ({
    id: j.id || j._id || Math.random().toString(36).slice(2),
    name: j.name || j.title || j.job_name || "Unnamed Job",
    description: j.description || j.objective || "",
    type: j.type || j.job_type || "",
    status: j.status || j.state || "unknown",
    progress: j.progress ?? j.completion_pct ?? null,
  }));
}

function normaliseInvestigations(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.data || raw?.items || raw?.investigations || []);
  return arr.map((i) => ({
    id: i.id || i._id || Math.random().toString(36).slice(2),
    title: i.title || i.name || "Unnamed Investigation",
    description: i.description || i.summary || "",
    status: i.status || "open",
    priority: i.priority || i.severity || "medium",
  }));
}

export async function buildSwimbScript() {
  const base = apiBase();
  const hdr = { Authorization: `Bearer ${API_KEY}` };
  const [jRes, iRes] = await Promise.all([
    fetch(`${base}/entities/SwarmJob`, { headers: hdr }),
    fetch(`${base}/v1/investigations`, { headers: hdr }),
  ]);
  const jRaw = await jRes.json();
  const iRaw = await iRes.json();
  const jobs = normaliseJobs(jRaw);
  const invs = normaliseInvestigations(iRaw);

  const aligned = jobs.filter((j) => invs.some((i) => relevance(j, i) > 0)).length;
  const unaligned = jobs.length - aligned;

  const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      message:
        `JARVIS swarm-investigation mission bridge: ${jobs.length} swarm jobs active, ` +
        `${invs.length} investigations open, ${aligned} jobs are mission-aligned to an investigation, ` +
        `${unaligned} jobs have no backing investigation (unaligned automation). ` +
        `Give a 2-sentence mission-alignment brief — formal British butler tone, first person.`,
    }),
  });
  const d = await r.json();
  return (d.answer || "Swarm mission alignment analysis complete, sir.").trim();
}

// ── component ────────────────────────────────────────────────────────────────

export default function SwarmInvestigationBridge() {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [invs, setInvs] = useState([]);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [jRes, iRes] = await Promise.all([
        fetch(`${base}/entities/SwarmJob`, { headers: hdr }),
        fetch(`${base}/v1/investigations`, { headers: hdr }),
      ]);
      const jRaw = await jRes.json();
      const iRaw = await iRes.json();
      setJobs(normaliseJobs(jRaw));
      setInvs(normaliseInvestigations(iRaw));
    } catch {
      /* silently ignore network failures */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const toggle = () => {
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    };
    window.addEventListener("jarvis:swimb-toggle", toggle);
    return () => window.removeEventListener("jarvis:swimb-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(load, 90_000);
    return () => clearInterval(t);
  }, [open]);

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const script = await buildSwimbScript();
      setBrief(script);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch {
      setBrief("Assessment unavailable, sir.");
    } finally {
      setAssessing(false);
    }
  }

  const enriched = jobs.map((j) => {
    const matches = invs
      .map((i) => ({ ...i, score: relevance(j, i) }))
      .filter((i) => i.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...j, aligned: matches.length > 0, matches };
  });

  const aligned = enriched.filter((j) => j.aligned).length;
  const unaligned = enriched.length - aligned;

  const visible = enriched.filter((j) => {
    if (tab === "MISSION_ALIGNED" && !j.aligned) return false;
    if (tab === "UNALIGNED" && j.aligned) return false;
    if (search) {
      const q = search.toLowerCase();
      return j.name.toLowerCase().includes(q) || j.description.toLowerCase().includes(q);
    }
    return true;
  });

  const btnStyle = {
    position: "fixed", left: 981560, bottom: 8, zIndex: 130,
    background: "#0a1628cc", border: `1px solid ${CY}55`, borderRadius: 4,
    color: CY, fontSize: 10, fontFamily: "monospace", padding: "3px 8px",
    cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
  };

  if (!open) {
    return (
      <button style={btnStyle} onClick={() => { setOpen(true); load(); }}>
        ◈ SWIMB
        {unaligned > 0 && (
          <span style={{ background: AM, color: "#000", borderRadius: 8, padding: "0 5px", fontSize: 9 }}>
            {unaligned}
          </span>
        )}
      </button>
    );
  }

  const panelStyle = {
    position: "fixed", bottom: 60, left: "50%", transform: "translateX(-50%)",
    width: 640, maxHeight: "75vh", overflow: "hidden",
    background: "#050d1bec", border: `1px solid ${CY}44`,
    borderRadius: 8, zIndex: 10000, display: "flex", flexDirection: "column",
    fontFamily: "monospace", color: CY,
  };

  const tabBtn = (label) => ({
    padding: "3px 10px", cursor: "pointer", fontSize: 10, borderRadius: 3,
    background: tab === label ? `${CY}22` : "transparent",
    border: tab === label ? `1px solid ${CY}66` : "1px solid transparent",
    color: CY,
  });

  const statusColor = (j) => j.aligned ? GR : AM;

  return (
    <div style={panelStyle}>
      {/* header */}
      <div style={{ padding: "8px 12px", borderBottom: `1px solid ${CY}33`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, letterSpacing: 2 }}>◈ SWARM × INVESTIGATION MISSION BRIDGE</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, padding: "8px 12px", borderBottom: `1px solid ${CY}22` }}>
        {[
          ["JOBS", enriched.length, CY],
          ["INVESTIGATIONS", invs.length, CY],
          ["ALIGNED", aligned, GR],
          ["UNALIGNED", unaligned, unaligned > 0 ? AM : GR],
        ].map(([label, val, col]) => (
          <div key={label} style={{ background: "#0a1628", border: `1px solid ${col}33`, borderRadius: 4, padding: "5px 8px", textAlign: "center" }}>
            <div style={{ color: col, fontSize: 14, fontWeight: "bold" }}>{val}</div>
            <div style={{ color: `${col}88`, fontSize: 8 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display: "flex", gap: 6, padding: "6px 12px", borderBottom: `1px solid ${CY}22`, flexWrap: "wrap" }}>
        {["ALL", "MISSION_ALIGNED", "UNALIGNED"].map((t) => (
          <button key={t} style={tabBtn(t)} onClick={() => setTab(t)}>{t.replace("_", " ")}</button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search jobs…"
          style={{ marginLeft: "auto", background: "#0a1628", border: `1px solid ${CY}33`, color: CY, borderRadius: 3, padding: "2px 8px", fontSize: 10, width: 140 }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 12px" }}>
        {loading && <div style={{ color: `${CY}66`, fontSize: 10, padding: 8 }}>Loading…</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color: `${CY}44`, fontSize: 10, padding: 8 }}>No jobs match current filter.</div>
        )}
        {visible.map((j) => (
          <div key={j.id} style={{ marginBottom: 6, border: `1px solid ${statusColor(j)}33`, borderRadius: 4, overflow: "hidden" }}>
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 8px", cursor: "pointer", background: expanded === j.id ? `${CY}0d` : "transparent" }}
              onClick={() => setExpanded(expanded === j.id ? null : j.id)}
            >
              <div>
                <span style={{ fontSize: 10 }}>{j.name}</span>
                {j.type && <span style={{ color: `${CY}66`, fontSize: 9, marginLeft: 6 }}>{j.type}</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 8, color: j.status === "running" ? GR : `${CY}66` }}>{j.status}</span>
                <span style={{
                  fontSize: 8, padding: "1px 6px", borderRadius: 8,
                  background: j.aligned ? `${GR}22` : `${AM}22`,
                  color: j.aligned ? GR : AM,
                  border: `1px solid ${j.aligned ? GR : AM}44`,
                }}>
                  {j.aligned ? "ALIGNED" : "UNALIGNED"}
                </span>
                <span style={{ color: `${CY}55`, fontSize: 9 }}>{expanded === j.id ? "▲" : "▼"}</span>
              </div>
            </div>
            {expanded === j.id && (
              <div style={{ padding: "4px 8px 8px", borderTop: `1px solid ${CY}22` }}>
                {j.description && <div style={{ color: `${CY}88`, fontSize: 9, marginBottom: 6 }}>{j.description}</div>}
                {j.matches.length === 0 ? (
                  <div style={{ color: `${AM}88`, fontSize: 9 }}>No matching investigations found.</div>
                ) : (
                  <div>
                    <div style={{ color: `${CY}66`, fontSize: 9, marginBottom: 4 }}>MATCHING INVESTIGATIONS</div>
                    {j.matches.slice(0, 4).map((inv) => (
                      <div key={inv.id} style={{ marginBottom: 4, padding: "3px 6px", background: "#0a1628", borderRadius: 3, border: `1px solid ${CY}22` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                          <span style={{ fontSize: 9 }}>{inv.title}</span>
                          <span style={{ fontSize: 8, color: inv.priority === "critical" ? RD : inv.priority === "high" ? AM : GR, border: `1px solid currentColor`, borderRadius: 3, padding: "0 4px" }}>
                            {inv.priority?.toUpperCase() || "MEDIUM"}
                          </span>
                        </div>
                        <div style={{ height: 3, background: "#0a1628", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${inv.score}%`, background: `linear-gradient(90deg,${CY}88,${GR}88)` }} />
                        </div>
                        <div style={{ color: `${CY}44`, fontSize: 8, marginTop: 1 }}>relevance {inv.score}%</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* footer */}
      <div style={{ padding: "6px 12px", borderTop: `1px solid ${CY}22`, display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={assess}
          disabled={assessing}
          style={{ background: `${CY}18`, border: `1px solid ${CY}55`, color: CY, borderRadius: 3, padding: "3px 10px", cursor: "pointer", fontSize: 10 }}
        >
          {assessing ? "…" : "▶ ASSESS ALIGNMENT"}
        </button>
        {brief && <span style={{ color: `${CY}cc`, fontSize: 9, flex: 1 }}>{brief}</span>}
      </div>
    </div>
  );
}
