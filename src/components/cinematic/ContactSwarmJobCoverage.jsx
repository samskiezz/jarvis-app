/**
 * F114 — Contact × SwarmJob Coverage (CSJC)
 *
 * Parallel-fetches /entities/Contact + /entities/SwarmJob every 60 s,
 * then keyword-correlates each contact (name/email/organization/role/tags)
 * against swarm jobs (name/description/target/objective/tags).
 *
 * Classification:
 *   ASSIGNED   — contact matched ≥1 swarm job
 *   UNASSIGNED — contact matched 0 swarm jobs
 *
 * Amber badge on UNASSIGNED count.
 * Stat tiles: contacts / jobs / assigned / unassigned
 * Filter tabs: ALL | ASSIGNED | UNASSIGNED + text search
 * Expand contact → matched swarm job cards with status badge + relevance score bar (max 6 shown).
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence contact-swarm coverage brief + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ CSJC  at left:3900 bottom:18 zIndex:68
 * Event:   jarvis:csjc-toggle
 * Voice:   "contact swarm / swarm contact / csjc / contact jobs / contact swarm coverage /
 *           which contacts have swarm / swarm contact assignment / contact swarm job"
 * Refresh: 60 s auto-poll
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 3900;
const POLL_MS  = 60_000;
const AMBER    = "#F59E0B";
const GREEN    = "#34D399";
const CYAN     = "#67E8F9";
const SLATE    = "#6E8AA0";
const BLUE     = "#60A5FA";
const RED      = "#F87171";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const CSJC_RE =
  /\b(contact\s+swarm|swarm\s+contact|csjc|contact\s+jobs?|contact\s+swarm\s+coverage|which\s+contacts\s+have\s+swarm|swarm\s+contact\s+assign\w*|contact\s+swarm\s+job)\b/i;

export function isCsjcQuery(q) { return CSJC_RE.test(q); }

export async function buildCsjcScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [ctRes, sjRes] = await Promise.all([
      fetch(`${base}/entities/Contact`,  { headers: hdr }),
      fetch(`${base}/entities/SwarmJob`, { headers: hdr }),
    ]);
    const contacts  = ctRes.ok ? await ctRes.json() : [];
    const swarmJobs = sjRes.ok ? await sjRes.json() : [];

    const ctList = Array.isArray(contacts)  ? contacts  : (contacts.contacts   || contacts.items   || []);
    const sjList = Array.isArray(swarmJobs) ? swarmJobs : (swarmJobs.swarm_jobs || swarmJobs.items  || []);

    const unassigned = ctList.filter(ct => {
      const toks = `${ct.name||""} ${ct.email||""} ${ct.organization||""} ${ct.role||""} ${(ct.tags||[]).join(" ")}`.toLowerCase().split(/\s+/);
      return !sjList.some(sj =>
        toks.some(t => t.length > 3 && `${sj.name||""} ${sj.description||""} ${sj.target||""} ${sj.objective||""} ${(sj.tags||[]).join(" ")}`.toLowerCase().includes(t))
      );
    }).length;

    const total = ctList.length;
    return `Contact-swarm coverage: ${total} contacts evaluated against ${sjList.length} swarm jobs. ${unassigned} contact${unassigned !== 1 ? "s are" : " is"} UNASSIGNED — no swarm job keyword-matches found — these contacts may lack active intelligence tasking and should be reviewed for swarm coverage gaps.`;
  } catch {
    return "Unable to fetch contact-swarm job coverage data.";
  }
}

// ── keyword helpers ───────────────────────────────────────────────────────────

function tokens(text) {
  return String(text || "").toLowerCase().split(/\s+/).filter(t => t.length > 3);
}

function scoreAgainst(ctTokens, sj) {
  const haystack = `${sj.name||""} ${sj.description||""} ${sj.target||""} ${sj.objective||""} ${(sj.tags||[]).join(" ")}`.toLowerCase();
  return ctTokens.filter(t => haystack.includes(t)).length;
}

function classify(ct, sjList) {
  const toks = tokens(`${ct.name||""} ${ct.email||""} ${ct.organization||""} ${ct.role||""} ${(ct.tags||[]).join(" ")}`);
  const matched = sjList.filter(sj => scoreAgainst(toks, sj) > 0);
  return { label: matched.length > 0 ? "ASSIGNED" : "UNASSIGNED", matched };
}

// ── component ────────────────────────────────────────────────────────────────

export default function ContactSwarmJobCoverage() {
  const [open,     setOpen]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [data,     setData]     = useState(null);
  const [tab,      setTab]      = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState({});
  const [assessing,setAssessing]= useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [ctRes, sjRes] = await Promise.all([
        fetch(`${base}/entities/Contact`,  { headers: hdr }),
        fetch(`${base}/entities/SwarmJob`, { headers: hdr }),
      ]);
      const ct = ctRes.ok ? await ctRes.json() : [];
      const sj = sjRes.ok ? await sjRes.json() : [];

      const ctList = Array.isArray(ct) ? ct : (ct.contacts    || ct.items  || []);
      const sjList = Array.isArray(sj) ? sj : (sj.swarm_jobs  || sj.items  || []);

      const rows = ctList.map(c => ({ ...c, ...classify(c, sjList) }));
      setData({ rows, sjList });
    } catch (e) {
      setData({ rows: [], sjList: [], error: String(e) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => {
      setOpen(v => {
        if (!v) load();
        return !v;
      });
    };
    window.addEventListener("jarvis:csjc-toggle", handler);
    return () => window.removeEventListener("jarvis:csjc-toggle", handler);
  }, [load]);

  const rows       = data?.rows || [];
  const unassigned = rows.filter(r => r.label === "UNASSIGNED").length;
  const assigned   = rows.filter(r => r.label === "ASSIGNED").length;

  const filtered = rows.filter(r => {
    if (tab !== "ALL" && r.label !== tab) return false;
    if (!search) return true;
    return `${r.name||""} ${r.email||""} ${r.organization||""}`.toLowerCase().includes(search.toLowerCase());
  });

  const assess = async () => {
    setAssessing(true);
    try {
      const script = await buildCsjcScript();
      const base   = apiBase();
      const hdr    = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers: hdr,
        body: JSON.stringify({ message: `Give a 2-sentence assessment: ${script}` }),
      });
      const j = await r.json();
      const text = j.response || j.reply || j.message || script;
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch { /* silent */ }
    setAssessing(false);
  };

  const sjStatusColor = status => {
    const s = (status || "").toLowerCase();
    if (s === "running")   return GREEN;
    if (s === "completed") return CYAN;
    if (s === "queued")    return BLUE;
    if (s === "failed")    return RED;
    return SLATE;
  };

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Contact × SwarmJob Coverage (CSJC)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
          background: "rgba(5,8,13,0.80)", border: `1px solid ${AMBER}55`,
          color: AMBER, fontFamily: "'JetBrains Mono',monospace", fontSize: 11,
          padding: "4px 9px", borderRadius: 6, cursor: "pointer",
          boxShadow: unassigned > 0 ? `0 0 14px ${AMBER}44` : "none",
          backdropFilter: "blur(6px)", letterSpacing: 1,
        }}>
        ◈ CSJC
        {unassigned > 0 && (
          <span style={{ marginLeft: 6, background: AMBER, color: "#0a0d14", borderRadius: 4,
            padding: "1px 5px", fontSize: 10, fontWeight: 700 }}>{unassigned}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: Math.max(8, BTN_LEFT - 380), bottom: 60, zIndex: 68,
      width: 480, maxHeight: "76vh", display: "flex", flexDirection: "column",
      background: "rgba(6,10,18,0.94)", border: `1px solid ${AMBER}44`,
      borderRadius: 12, overflow: "hidden", backdropFilter: "blur(12px)",
      boxShadow: `0 0 40px ${AMBER}22`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5", fontSize: 12,
    }}>
      {/* header */}
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${AMBER}33`,
        display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span style={{ color: AMBER, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ CONTACT × SWARM JOB COVERAGE</span>
        <button onClick={assess} disabled={assessing} style={{
          marginLeft: "auto", background: "transparent", border: `1px solid ${CYAN}55`,
          color: CYAN, borderRadius: 5, padding: "2px 8px", cursor: "pointer", fontSize: 10 }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
        <button onClick={() => setOpen(false)} style={{
          background: "transparent", border: "none", color: SLATE, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, padding: "10px 14px", flexShrink: 0 }}>
        {[
          ["CONTACTS",   rows.length, CYAN],
          ["JOBS",       data?.sjList?.length ?? 0, BLUE],
          ["ASSIGNED",   assigned,   GREEN],
          ["UNASSIGNED", unassigned, AMBER],
        ].map(([label, val, col]) => (
          <div key={label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 7,
            padding: "8px 6px", textAlign: "center", border: `1px solid ${col}33` }}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{val}</div>
            <div style={{ color: SLATE, fontSize: 9, letterSpacing: 1, marginTop: 3 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 14px 8px", flexShrink: 0, flexWrap: "wrap" }}>
        {["ALL", "ASSIGNED", "UNASSIGNED"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? AMBER + "33" : "transparent",
            border: `1px solid ${tab === t ? AMBER : SLATE + "44"}`,
            color: tab === t ? AMBER : SLATE, borderRadius: 5, padding: "2px 8px",
            cursor: "pointer", fontSize: 10, letterSpacing: 0.5,
          }}>
            {t}{t === "ASSIGNED" ? ` (${assigned})` : t === "UNASSIGNED" ? ` (${unassigned})` : ""}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{ marginLeft: "auto", background: "rgba(255,255,255,0.06)", border: `1px solid ${SLATE}44`,
            color: "#DCEBF5", borderRadius: 5, padding: "2px 8px", fontSize: 10, width: 100 }} />
      </div>

      {/* rows */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 14px 14px" }}>
        {loading && !data && (
          <div style={{ color: SLATE, textAlign: "center", padding: 20 }}>loading…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ color: SLATE, textAlign: "center", padding: 20 }}>no contacts match</div>
        )}
        {filtered.map((row, i) => {
          const exp     = expanded[i];
          const rowCol  = row.label === "ASSIGNED" ? GREEN : AMBER;
          const ctToks  = tokens(`${row.name||""} ${row.email||""} ${row.organization||""} ${row.role||""} ${(row.tags||[]).join(" ")}`);
          return (
            <div key={i} style={{ marginBottom: 6, background: "rgba(255,255,255,0.03)",
              border: `1px solid ${rowCol}33`, borderRadius: 8 }}>
              <div onClick={() => setExpanded(p => ({ ...p, [i]: !exp }))}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", cursor: "pointer" }}>
                <span style={{ color: rowCol, fontSize: 9, fontWeight: 700,
                  border: `1px solid ${rowCol}55`, borderRadius: 4,
                  padding: "1px 5px", letterSpacing: 0.5, flexShrink: 0 }}>
                  {row.label}
                </span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {row.name || row.email || row.id || "—"}
                </span>
                {row.organization && (
                  <span style={{ color: SLATE, fontSize: 10, flexShrink: 0 }}>{row.organization}</span>
                )}
                <span style={{ color: SLATE, fontSize: 10, flexShrink: 0 }}>
                  {row.matched.length}J
                </span>
                <span style={{ color: SLATE, fontSize: 11 }}>{exp ? "▲" : "▼"}</span>
              </div>

              {exp && (
                <div style={{ padding: "0 10px 10px", borderTop: `1px solid ${SLATE}22` }}>
                  <div style={{ color: CYAN, fontSize: 10, letterSpacing: 1, margin: "6px 0 4px" }}>
                    SWARM JOBS ({row.matched.length})
                  </div>
                  {row.matched.length === 0
                    ? <div style={{ color: SLATE, fontSize: 10 }}>no swarm job matches</div>
                    : row.matched.slice(0, 6).map((sj, j) => {
                        const score = scoreAgainst(ctToks, sj);
                        const pct   = Math.min(100, score * 20);
                        const st    = (sj.status || sj.state || "").toUpperCase();
                        const stCol = sjStatusColor(sj.status || sj.state || "");
                        return (
                          <div key={j} style={{ marginBottom: 5 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {st && (
                                <span style={{ color: stCol, fontSize: 9, border: `1px solid ${stCol}55`,
                                  borderRadius: 3, padding: "0 4px", flexShrink: 0 }}>{st}</span>
                              )}
                              <span style={{ flex: 1, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {sj.name || sj.id || "—"}
                              </span>
                              <span style={{ color: SLATE, fontSize: 10 }}>{score}pt</span>
                            </div>
                            <div style={{ height: 3, background: SLATE + "33", borderRadius: 2, marginTop: 2 }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: CYAN, borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
