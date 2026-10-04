/**
 * F152 — Investment × SwarmJob Coverage (INVSWJ)
 *
 * Parallel-fetches /entities/Investment + /entities/SwarmJob, then
 * keyword-correlates each investment (name/sector/notes/tags/ticker)
 * against active swarm jobs (name/kind/description/type/domain) to surface:
 *
 *   MONITORED   — swarm automation found for this investment's domain
 *   UNMONITORED — no swarm coverage — portfolio surveillance gap
 *
 * Stat tiles: investments / swarm jobs / monitored / unmonitored
 * Filter tabs: ALL | MONITORED | UNMONITORED + text search
 * Expand any investment → matched swarm jobs with kind badge + status badge + relevance score bar.
 * Amber badge on UNMONITORED count.
 * ▶ ASSESS: 2-sentence portfolio-automation brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ INVSWJ  at bottom:8 left:713760, zIndex:303.
 * Event:   jarvis:invswj-toggle
 * Voice:   "investment swarm / swarm investment / invswj / portfolio swarm /
 *           swarm portfolio / investment automation / portfolio automation /
 *           swarm coverage invest / which investments have swarm"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 713760;
const POLL_MS  = 90_000;
const AMBER    = "#F59E0B";
const SLATE    = "#6E8AA0";
const BLUE     = "#60A5FA";
const GREEN    = "#34D399";
const LIME     = "#A3E635";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const INVSWJ_RE =
  /\b(investment\s+swarm|swarm\s+investment|invswj|portfolio\s+swarm|swarm\s+portfolio|investment\s+automation|portfolio\s+automation|swarm\s+coverage\s+invest|which\s+investments\s+have\s+swarm)\b/i;

export function isInvSwjQuery(q) { return INVSWJ_RE.test(q); }

export async function buildInvSwjScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [invRes, swjRes] = await Promise.all([
      fetch(`${base}/entities/Investment`, { headers: hdr }),
      fetch(`${base}/entities/SwarmJob`,   { headers: hdr }),
    ]);
    const investments = normaliseInvestments(await invRes.json());
    const jobs        = normaliseJobs(await swjRes.json());

    const monitored   = investments.filter(
      (inv) => jobs.some((j) => relevance(inv, j) > 0)
    ).length;
    const unmonitored = investments.length - monitored;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS portfolio automation brief: ${investments.length} investment positions ` +
          `correlated against ${jobs.length} active swarm jobs. ` +
          `${monitored} investments are MONITORED (swarm automation coverage found); ` +
          `${unmonitored} positions are UNMONITORED (no swarm coverage — portfolio surveillance gap). ` +
          `Provide a 2-sentence portfolio-automation coverage assessment — formal British butler ` +
          `tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Portfolio automation analysis complete, sir.").trim();
  } catch {
    return "Investment swarm coverage unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseInvestments(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.investments)
    ? raw.investments
    : Array.isArray(raw?.items)
    ? raw.items
    : Array.isArray(raw?.results)
    ? raw.results
    : Array.isArray(raw?.data)
    ? raw.data
    : [];
  return arr.map((inv, i) => ({
    id:     inv.id     || String(i),
    label:  inv.name   || inv.title  || inv.asset  || `Investment ${i + 1}`,
    sector: inv.sector || inv.type   || inv.class  || "—",
    ticker: inv.ticker || inv.symbol || "",
    tokens: tok(
      `${inv.name || ""} ${inv.title || ""} ${inv.sector || ""} ${inv.notes || ""} ${inv.ticker || ""} ${(inv.tags || []).join(" ")}`
    ),
  }));
}

function normaliseJobs(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.swarm_jobs)
    ? raw.swarm_jobs
    : Array.isArray(raw?.jobs)
    ? raw.jobs
    : Array.isArray(raw?.items)
    ? raw.items
    : Array.isArray(raw?.results)
    ? raw.results
    : Array.isArray(raw?.data)
    ? raw.data
    : [];
  return arr.map((j, i) => ({
    id:     j.id     || String(i),
    label:  j.name   || j.title  || j.kind   || `SwarmJob ${i + 1}`,
    kind:   j.kind   || j.type   || "job",
    status: j.status || j.state  || "active",
    tokens: tok(
      `${j.name || ""} ${j.title || ""} ${j.kind || ""} ${j.type || ""} ${j.description || ""} ${j.domain || ""} ${(j.tags || []).join(" ")}`
    ),
  }));
}

function tok(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function relevance(investment, job) {
  const inv = new Set(investment.tokens);
  return job.tokens.filter((w) => inv.has(w)).length;
}

function buildLinked(investments, jobs) {
  return investments.map((inv) => {
    const matched = jobs
      .map((j) => ({ ...j, score: relevance(inv, j) }))
      .filter((j) => j.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    return { ...inv, jobs: matched, monitored: matched.length > 0 };
  });
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "MONITORED", "UNMONITORED"];

const KIND_COLOR = {
  scraper:   "#60A5FA",
  enricher:  "#34D399",
  scanner:   "#F97316",
  collector: "#A78BFA",
  monitor:   "#FBBF24",
  analyst:   "#F472B6",
};

export default function InvestmentSwarmJobCoverage() {
  const [open,      setOpen]      = useState(false);
  const [data,      setData]      = useState([]);
  const [stats,     setStats]     = useState({ investments: 0, jobs: 0, monitored: 0, unmonitored: 0 });
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [invRes, swjRes] = await Promise.all([
        fetch(`${base}/entities/Investment`, { headers: hdr }),
        fetch(`${base}/entities/SwarmJob`,   { headers: hdr }),
      ]);
      const investments = normaliseInvestments(await invRes.json());
      const jobs        = normaliseJobs(await swjRes.json());
      const linked      = buildLinked(investments, jobs);
      const monitored   = linked.filter((inv) => inv.monitored).length;
      setData(linked);
      setStats({ investments: investments.length, jobs: jobs.length, monitored, unmonitored: investments.length - monitored });
    } catch {
      /* silently keep previous */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => {
      setOpen((v) => {
        const next = !v;
        if (next) load();
        return next;
      });
    };
    window.addEventListener("jarvis:invswj-toggle", toggle);
    return () => window.removeEventListener("jarvis:invswj-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = await buildInvSwjScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } finally {
      setAssessing(false);
    }
  }, []);

  if (!open) {
    const badge = stats.unmonitored > 0;
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Investment × SwarmJob Coverage — INVSWJ"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 303,
          background: "rgba(0,0,0,0.55)", border: `1px solid ${badge ? AMBER : "#334155"}`,
          borderRadius: 6, color: badge ? AMBER : SLATE, fontSize: 10,
          fontFamily: "monospace", padding: "2px 6px", cursor: "pointer",
          backdropFilter: "blur(6px)", letterSpacing: "0.05em",
        }}
      >
        ◈ INVSWJ {badge ? <span style={{ color: AMBER }}>({stats.unmonitored})</span> : ""}
      </button>
    );
  }

  const visible = data.filter((inv) => {
    if (tab === "MONITORED"   && !inv.monitored) return false;
    if (tab === "UNMONITORED" &&  inv.monitored) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        inv.label.toLowerCase().includes(q) ||
        inv.sector.toLowerCase().includes(q) ||
        (inv.ticker && inv.ticker.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div style={{
      position: "fixed", top: 60, right: 16, width: 480, maxHeight: "calc(100vh - 80px)",
      background: "rgba(5,12,20,0.97)", border: "1px solid #1E3A5F",
      borderRadius: 10, zIndex: 303, display: "flex", flexDirection: "column",
      fontFamily: "monospace", overflow: "hidden", boxShadow: "0 0 32px rgba(0,0,0,0.7)",
    }}>
      {/* header */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #1E3A5F", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: AMBER, fontSize: 13, fontWeight: 700, flex: 1 }}>◈ INVESTMENT × SWARM COVERAGE</span>
        <button onClick={assess} disabled={assessing}
          style={{ fontSize: 10, padding: "2px 8px", background: "rgba(245,158,11,0.15)",
            border: `1px solid ${AMBER}`, borderRadius: 4, color: AMBER, cursor: "pointer" }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
        <button onClick={() => setOpen(false)}
          style={{ fontSize: 11, background: "none", border: "none", color: SLATE, cursor: "pointer" }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: "1px solid #0F2133" }}>
        {[
          { label: "INVESTMENTS", value: stats.investments, color: BLUE  },
          { label: "SWARM JOBS",  value: stats.jobs,        color: SLATE },
          { label: "MONITORED",   value: stats.monitored,   color: LIME  },
          { label: "UNMONITORED", value: stats.unmonitored, color: AMBER },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ flex: 1, background: "rgba(255,255,255,0.03)", borderRadius: 6,
            padding: "6px 4px", textAlign: "center", border: `1px solid ${color}22` }}>
            <div style={{ color, fontSize: 16, fontWeight: 700 }}>{value}</div>
            <div style={{ color: SLATE, fontSize: 8, letterSpacing: "0.06em" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* tabs + search */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderBottom: "1px solid #0F2133" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ fontSize: 9, padding: "2px 8px", borderRadius: 4, cursor: "pointer",
              background: tab === t ? `${AMBER}22` : "transparent",
              border: `1px solid ${tab === t ? AMBER : "#334155"}`,
              color: tab === t ? AMBER : SLATE }}>
            {t}
          </button>
        ))}
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="search investments…"
          style={{ marginLeft: "auto", fontSize: 10, padding: "2px 8px", borderRadius: 4,
            background: "rgba(255,255,255,0.05)", border: "1px solid #334155",
            color: "#CBD5E1", outline: "none", width: 140 }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 14px" }}>
        {loading && !data.length && (
          <div style={{ color: SLATE, fontSize: 11, textAlign: "center", padding: 20 }}>Loading…</div>
        )}
        {!loading && !visible.length && (
          <div style={{ color: SLATE, fontSize: 11, textAlign: "center", padding: 20 }}>No investments match.</div>
        )}
        {visible.map((inv) => (
          <div key={inv.id} style={{ marginBottom: 6 }}>
            <div
              onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px",
                background: "rgba(255,255,255,0.03)", borderRadius: 6, cursor: "pointer",
                border: `1px solid ${inv.monitored ? "#1E3A5F" : "#1E2A3A"}` }}
            >
              <span style={{ fontSize: 9, color: inv.monitored ? LIME : AMBER,
                background: inv.monitored ? `${LIME}22` : `${AMBER}22`,
                borderRadius: 3, padding: "1px 5px", fontWeight: 700, minWidth: 72, textAlign: "center" }}>
                {inv.monitored ? "MONITORED" : "UNMONITORED"}
              </span>
              <span style={{ color: "#CBD5E1", fontSize: 10, flex: 1, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {inv.label}
              </span>
              {inv.ticker && (
                <span style={{ fontSize: 9, color: BLUE, background: `${BLUE}15`,
                  borderRadius: 3, padding: "1px 4px" }}>
                  {inv.ticker}
                </span>
              )}
              <span style={{ fontSize: 9, color: SLATE, background: "rgba(255,255,255,0.05)",
                borderRadius: 3, padding: "1px 5px" }}>
                {inv.sector}
              </span>
              {inv.monitored && (
                <span style={{ fontSize: 9, color: LIME }}>{inv.jobs.length} job{inv.jobs.length !== 1 ? "s" : ""}</span>
              )}
            </div>

            {expanded === inv.id && (
              <div style={{ padding: "6px 8px 2px 16px" }}>
                {inv.monitored ? (
                  inv.jobs.map((j) => (
                    <div key={j.id} style={{ display: "flex", alignItems: "center", gap: 6,
                      marginBottom: 4, padding: "4px 6px",
                      background: "rgba(163,230,53,0.05)", borderRadius: 4 }}>
                      <span style={{
                        fontSize: 9,
                        color: KIND_COLOR[j.kind?.toLowerCase()] || SLATE,
                        border: `1px solid ${KIND_COLOR[j.kind?.toLowerCase()] || SLATE}`,
                        borderRadius: 3, padding: "1px 4px", minWidth: 54, textAlign: "center" }}>
                        {(j.kind || "job").toUpperCase().slice(0, 8)}
                      </span>
                      <span style={{ fontSize: 9, color: GREEN, background: `${GREEN}15`,
                        borderRadius: 3, padding: "1px 4px" }}>
                        {(j.status || "active").toLowerCase().slice(0, 10)}
                      </span>
                      <span style={{ color: "#94A3B8", fontSize: 9, flex: 1,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {j.label}
                      </span>
                      <div style={{ width: 60, height: 4, background: "#0F2133", borderRadius: 2, flexShrink: 0 }}>
                        <div style={{ height: "100%", borderRadius: 2, background: LIME,
                          width: `${Math.min(100, j.score * 12)}%` }} />
                      </div>
                      <span style={{ fontSize: 9, color: SLATE, minWidth: 20, textAlign: "right" }}>{j.score}</span>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 9, color: AMBER, padding: "4px 0" }}>
                    No active swarm jobs monitor this investment's domain — portfolio surveillance gap.
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* footer */}
      <div style={{ padding: "6px 14px", borderTop: "1px solid #0F2133",
        display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: SLATE, fontSize: 9 }}>
          {loading ? "Refreshing…" : `${visible.length} of ${data.length} investments · auto-refresh 90s`}
        </span>
        <button onClick={load} style={{ fontSize: 9, padding: "1px 6px",
          background: "transparent", border: `1px solid #334155`,
          borderRadius: 3, color: SLATE, cursor: "pointer" }}>↺</button>
      </div>
    </div>
  );
}
