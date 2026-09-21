/**
 * F302 — Live Intel × Swarm Job Alignment Panel (LISWRM)
 *
 * Parallel-fetches /functions/getLiveIntel (earthquakes + crypto + FX) and
 * /entities/SwarmJob, then keyword-correlates each live world event against
 * every active swarm job to surface:
 *
 *   RESPONDING   — at least one swarm job keyword-matches this live event
 *                  (automation already tracking the world state)
 *   UNAUTOMATED  — live event with no matching swarm job
 *                  (automation gap — world event is not being tracked)
 *
 * Stat tiles: events / jobs / responding / unautomated
 * Filter tabs: ALL | RESPONDING | UNAUTOMATED + text search
 * Expand event → matched swarm jobs with status badge + relevance score.
 * Red badge on unautomated count.
 * ▶ ASSESS: 2-sentence swarm-world-event coverage brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ LISWRM  at bottom:8 left:392880, zIndex:179.
 * Event:   jarvis:liswrm-toggle
 * Voice:   "live swarm / world swarm / liswrm / swarm world response /
 *           automated response / swarm live event / swarm alignment /
 *           which swarms respond to live events"
 * Refresh: 120 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 392880;
const POLL_MS  = 120_000;
const CYAN     = "#29E7FF";
const GREEN    = "#34D399";
const AMBER    = "#F59E0B";
const SLATE    = "#6E8AA0";
const RED      = "#FF4444";
const VIOLET   = "#A78BFA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const LISWRM_RE =
  /\b(live\s+swarm[s]?|world\s+swarm[s]?|liswrm|swarm\s+world\s+response|automated?\s+response|swarm\s+live\s+(event[s]?)?|swarm\s+alignment|which\s+swarms?\s+respond|swarm\s+coverage\s+(for\s+)?(live|world)|world\s+event\s+swarm[s]?)\b/i;

export function isLiswrmQuery(q) { return LISWRM_RE.test(q); }

export async function buildLiswrmScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [intelRes, swarmRes] = await Promise.all([
      fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
      fetch(`${base}/entities/SwarmJob`,      { headers: hdr }),
    ]);
    const events = normaliseEvents(await intelRes.json());
    const jobs   = normaliseJobs(await swarmRes.json());

    const responding = events.filter(
      (e) => jobs.some((j) => relevance(e, j) > 0)
    ).length;
    const unautomated = events.length - responding;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS swarm-world alignment analysis: ${events.length} live world events ` +
          `(seismic, crypto, FX) cross-referenced against ${jobs.length} active swarm jobs. ` +
          `${responding} events have at least one aligned swarm job (automation responding); ` +
          `${unautomated} events have no swarm coverage (automation gap). ` +
          `Provide a 2-sentence swarm-alignment brief — formal British butler tone, ` +
          `first person, highlight any critical coverage gaps.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Swarm-world alignment analysis complete, sir.").trim();
  } catch {
    return "Live intel swarm alignment assessment unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseEvents(raw) {
  const quakes = Array.isArray(raw?.earthquakes) ? raw.earthquakes : [];
  const crypto = Array.isArray(raw?.crypto)      ? raw.crypto      : [];
  const fx     = Array.isArray(raw?.fx)          ? raw.fx
                : Array.isArray(raw?.forex)       ? raw.forex       : [];
  const out = [];

  quakes.forEach((q, i) => {
    const mag   = q.magnitude ?? q.mag ?? q.properties?.mag ?? "";
    const place = q.place ?? q.location ?? q.properties?.place ?? "";
    const title = q.title ?? q.properties?.title ?? `M${mag} ${place}`;
    out.push({
      id:   `quake-${i}`,
      type: "SEISMIC",
      title: String(title).slice(0, 120),
      body:  `earthquake seismic magnitude:${mag} region:${place} tectonic`.slice(0, 200),
      col:  RED,
    });
  });

  crypto.forEach((c, i) => {
    const sym    = c.symbol ?? c.name ?? `CRYPTO${i}`;
    const change = c.change_24h ?? c.change ?? c.pct_change ?? "";
    out.push({
      id:   `crypto-${i}`,
      type: "CRYPTO",
      title: `${sym}${change ? " " + (Number(change) >= 0 ? "+" : "") + Number(change).toFixed(2) + "%" : ""}`.trim(),
      body:  `asset:${sym} crypto cryptocurrency digital-asset blockchain market price`.slice(0, 200),
      col:  CYAN,
    });
  });

  fx.forEach((f, i) => {
    const pair = f.pair ?? f.symbol ?? f.name ?? `FX${i}`;
    const rate = f.rate ?? f.price ?? f.value ?? "";
    out.push({
      id:   `fx-${i}`,
      type: "FX",
      title: `${pair}${rate ? " @ " + Number(rate).toFixed(4) : ""}`,
      body:  `currency:${pair} forex:${pair} exchange-rate monetary financial`.slice(0, 200),
      col:  VIOLET,
    });
  });

  return out;
}

function normaliseJobs(raw) {
  const arr = Array.isArray(raw)             ? raw
    : Array.isArray(raw?.jobs)               ? raw.jobs
    : Array.isArray(raw?.swarm_jobs)         ? raw.swarm_jobs
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.results)            ? raw.results
    : [];
  return arr.map((j, i) => ({
    id:         j.id         || j.job_id       || String(i),
    title:      j.title      || j.name         || j.label     || `Job ${i + 1}`,
    status:     j.status     || j.state        || j.phase     || "unknown",
    objective:  (j.objective || j.description  || j.notes     || "").toString().slice(0, 300),
    target:     j.target     || j.tags         || "",
    progress:   typeof j.progress === "number" ? j.progress : null,
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"'%+]+/)
    .filter((w) => w.length >= 3);
}

function relevance(event, job) {
  const ew = keywords(`${event.title} ${event.body}`);
  const jw = keywords(`${job.title} ${job.objective} ${job.target}`);
  return ew.filter((w) => jw.some((p) => p.includes(w) || w.includes(p))).length;
}

function buildLinked(events, jobs) {
  return events.map((e) => {
    const matched = jobs
      .map((j) => ({ ...j, score: relevance(e, j) }))
      .filter((j) => j.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...e, jobs: matched, responding: matched.length > 0 };
  });
}

function statusCol(s) {
  const v = String(s || "").toLowerCase();
  if (v === "running" || v === "active")  return GREEN;
  if (v === "queued"  || v === "pending") return AMBER;
  if (v === "failed"  || v === "error")   return RED;
  return SLATE;
}

// ── component ─────────────────────────────────────────────────────────────────

const PANEL = {
  position: "fixed",
  top: 58,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 180,
  width: "min(520px,94vw)",
  background: "rgba(4,8,14,0.94)",
  border: `1px solid ${CYAN}44`,
  borderRadius: 14,
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  boxShadow: `0 0 52px ${CYAN}18`,
  fontFamily: "'JetBrains Mono', monospace",
  color: "#DCEBF5",
  overflow: "hidden",
};

export default function LiveIntelSwarmAlignPanel() {
  const [open, setOpen]       = useState(false);
  const [events, setEvents]   = useState([]);
  const [jobs, setJobs]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState(null);
  const [tab, setTab]         = useState("ALL");
  const [q, setQ]             = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [ir, sr] = await Promise.all([
        fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
        fetch(`${base}/entities/SwarmJob`,      { headers: hdr }),
      ]);
      if (!ir.ok) throw new Error(`getLiveIntel ${ir.status}`);
      if (!sr.ok) throw new Error(`SwarmJob ${sr.status}`);
      setEvents(normaliseEvents(await ir.json()));
      setJobs(normaliseJobs(await sr.json()));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:liswrm-toggle", onToggle);
    return () => window.removeEventListener("jarvis:liswrm-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildLiswrmScript();
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text: script } })
      );
    } finally {
      setAssessing(false);
    }
  }

  const linked      = buildLinked(events, jobs);
  const responding  = linked.filter((e) => e.responding).length;
  const unautomated = linked.filter((e) => !e.responding).length;

  const displayed = linked.filter((e) => {
    if (tab === "RESPONDING"  && !e.responding)  return false;
    if (tab === "UNAUTOMATED" &&  e.responding)  return false;
    if (q.trim()) {
      const lq = q.toLowerCase();
      return e.title.toLowerCase().includes(lq) || e.type.toLowerCase().includes(lq);
    }
    return true;
  });

  return (
    <>
      {/* Strip toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Live intel × swarm job alignment"
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 179,
          padding: "4px 10px",
          background: open ? CYAN : "rgba(5,8,13,0.75)",
          color: open ? "#04060A" : CYAN,
          border: `1px solid ${CYAN}`,
          borderRadius: 6,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9,
          letterSpacing: 1,
          cursor: "pointer",
          backdropFilter: "blur(6px)",
        }}
      >
        ◈ LISWRM
      </button>

      {open && (
        <div style={PANEL}>
          {/* header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", borderBottom: `1px solid ${CYAN}22`,
            background: "rgba(41,231,255,0.05)",
          }}>
            <span style={{ color: CYAN, fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>
              ◈ Live Intel × Swarm Job Alignment
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={assess}
                disabled={assessing || loading}
                style={{
                  fontSize: 8, padding: "2px 8px", borderRadius: 4,
                  border: `1px solid ${CYAN}66`, background: "rgba(41,231,255,0.08)",
                  color: CYAN, cursor: "pointer", fontFamily: "inherit", letterSpacing: 1,
                  opacity: (assessing || loading) ? 0.5 : 1,
                }}
              >
                {assessing ? "◌ ASSESSING" : "▶ ASSESS"}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: SLATE, cursor: "pointer", fontSize: 14, lineHeight: 1 }}
              >
                ×
              </button>
            </div>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${CYAN}11` }}>
            {[
              { label: "EVENTS",      val: events.length,  col: CYAN  },
              { label: "JOBS",        val: jobs.length,    col: SLATE },
              { label: "RESPONDING",  val: responding,     col: GREEN },
              { label: "UNAUTOMATED", val: unautomated,    col: RED   },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                flex: 1, textAlign: "center",
                background: "rgba(41,231,255,0.04)",
                border: `1px solid ${CYAN}18`,
                borderRadius: 8, padding: "6px 4px",
              }}>
                <div style={{ color: col, fontSize: 16, fontVariantNumeric: "tabular-nums" }}>{val}</div>
                <div style={{ color: SLATE, fontSize: 7, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs + search */}
          <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${CYAN}11`, alignItems: "center" }}>
            {["ALL", "RESPONDING", "UNAUTOMATED"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  fontSize: 8, padding: "2px 8px", borderRadius: 4,
                  border: `1px solid ${tab === t ? CYAN : "#2a3a4a"}`,
                  background: tab === t ? `${CYAN}22` : "transparent",
                  color: tab === t ? CYAN : SLATE,
                  cursor: "pointer", fontFamily: "inherit", letterSpacing: 1,
                }}
              >
                {t}
              </button>
            ))}
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="filter events…"
              style={{
                marginLeft: "auto", background: "rgba(41,231,255,0.05)",
                border: `1px solid ${CYAN}22`, borderRadius: 4,
                color: "#DCEBF5", fontSize: 9, padding: "2px 8px",
                fontFamily: "inherit", outline: "none", width: 120,
              }}
            />
          </div>

          {/* event list */}
          <div style={{ maxHeight: 340, overflowY: "auto", padding: "4px 0" }}>
            {loading && !events.length && (
              <div style={{ color: SLATE, fontSize: 10, padding: "12px 14px" }}>◌ Loading intel + swarm data…</div>
            )}
            {err && (
              <div style={{ color: RED, fontSize: 10, padding: "8px 14px" }}>⚠ {err}</div>
            )}
            {!loading && !err && displayed.length === 0 && (
              <div style={{ color: SLATE, fontSize: 10, padding: "12px 14px" }}>No events match filter.</div>
            )}
            {displayed.map((ev) => (
              <div key={ev.id}>
                <div
                  onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "7px 14px", cursor: "pointer",
                    background: expanded === ev.id ? "rgba(41,231,255,0.06)" : "transparent",
                    borderLeft: expanded === ev.id ? `2px solid ${CYAN}` : "2px solid transparent",
                  }}
                >
                  <span style={{
                    fontSize: 7, padding: "1px 5px", borderRadius: 3,
                    background: `${ev.col}22`, color: ev.col, letterSpacing: 1, flexShrink: 0,
                  }}>
                    {ev.type}
                  </span>
                  <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ev.title}
                  </span>
                  <span style={{
                    fontSize: 7, padding: "1px 6px", borderRadius: 3,
                    background: ev.responding ? `${GREEN}22` : `${RED}22`,
                    color: ev.responding ? GREEN : RED,
                    letterSpacing: 1, flexShrink: 0,
                  }}>
                    {ev.responding ? `RESPONDING (${ev.jobs.length})` : "UNAUTOMATED"}
                  </span>
                </div>

                {expanded === ev.id && (
                  <div style={{ padding: "4px 14px 10px 38px", borderBottom: `1px solid ${CYAN}0A` }}>
                    {ev.jobs.length === 0 ? (
                      <div style={{ color: RED, fontSize: 9, letterSpacing: 1 }}>
                        ⚠ No swarm jobs aligned — automation gap detected.
                      </div>
                    ) : (
                      ev.jobs.map((j) => (
                        <div key={j.id} style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "3px 0",
                          borderBottom: `1px solid ${CYAN}08`,
                        }}>
                          <span style={{
                            fontSize: 7, padding: "1px 5px", borderRadius: 3,
                            background: `${statusCol(j.status)}22`, color: statusCol(j.status),
                            letterSpacing: 1, flexShrink: 0,
                          }}>
                            {String(j.status).toUpperCase()}
                          </span>
                          <span style={{ flex: 1, fontSize: 9, color: "#DCEBF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {j.title}
                          </span>
                          {j.progress !== null && (
                            <span style={{ fontSize: 8, color: GREEN, flexShrink: 0 }}>
                              {j.progress}%
                            </span>
                          )}
                          <span style={{ fontSize: 8, color: SLATE, flexShrink: 0 }}>
                            ≡{j.score}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* footer */}
          <div style={{
            padding: "6px 14px", borderTop: `1px solid ${CYAN}0A`,
            display: "flex", justifyContent: "space-between",
            fontSize: 8, color: SLATE,
          }}>
            <span>Source: /functions/getLiveIntel · /entities/SwarmJob</span>
            <span style={{ color: loading ? AMBER : (unautomated > 0 ? RED : GREEN) }}>
              {loading ? "◌ updating" : `${unautomated} gap${unautomated !== 1 ? "s" : ""} · ${events.length} events`}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
