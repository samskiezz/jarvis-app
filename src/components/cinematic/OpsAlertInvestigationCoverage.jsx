/**
 * F174 — Ops Alert × Investigation Coverage Tracker (OALINV)
 *
 * Parallel-fetches /v1/ops/alerts + /v1/investigations, then
 * keyword-correlates each active alert against open investigation cases
 * to surface:
 *   INVESTIGATED  — at least one case has keyword overlap with this alert
 *   UNINVESTIGATED — no open case covers this alert (operational blind spot)
 *
 * Stat tiles: alerts / investigations / investigated / uninvestigated
 * Filter tabs: ALL | INVESTIGATED | UNINVESTIGATED
 * Text search across alert names / services.
 * Expand any alert → matched cases with status badge + relevance score.
 * Orange badge on uninvestigated count.
 * ▶ ASSESS: 2-sentence ops-alert investigation coverage brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ OALINV  at bottom:8 left:59000, zIndex:115.
 * Event:   jarvis:oalinv-toggle
 * Voice:   "alert investigation / uninvestigated alerts / ops alert case /
 *           oalinv / untracked alerts / alert case coverage"
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT  = 59000;
const POLL_MS   = 60_000;
const ORANGE    = "#FB923C";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ───────────────────────────────────────────────────

const OALINV_RE =
  /\b(alert\s+investigation[s]?|investigation[s]?\s+alert[s]?|uninvestigated\s+alert[s]?|untracked\s+alert[s]?|ops\s+alert\s+case[s]?|alert\s+case\s+coverage|oalinv|alert\s+coverage\s+gap[s]?|which\s+alerts\s+(have|are)\s+(no\s+)?case[s]?)\b/i;

export function isOalinvQuery(q) { return OALINV_RE.test(q); }

export async function buildOalinvScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [alertRes, invRes] = await Promise.all([
      fetch(`${base}/v1/ops/alerts`,   { headers: hdr }),
      fetch(`${base}/v1/investigations`, { headers: hdr }),
    ]);
    const alerts  = normaliseAlerts(await alertRes.json());
    const invs    = normaliseInvestigations(await invRes.json());

    const investigated   = alerts.filter((a) => invs.some((i) => relevance(a, i) > 0)).length;
    const uninvestigated = alerts.length - investigated;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS ops-alert investigation coverage analysis: ${alerts.length} active operational ` +
          `alerts on record, ${invs.length} investigations open. ${investigated} alerts have a ` +
          `corresponding open investigation case, ${uninvestigated} alerts have no investigation ` +
          `coverage (operational blind spots). Provide a 2-sentence situational-awareness brief — ` +
          `formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Ops-alert investigation coverage analysis complete, sir.").trim();
  } catch {
    return "Ops-alert investigation coverage analysis unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseAlerts(raw) {
  const arr = Array.isArray(raw)               ? raw
    : Array.isArray(raw?.alerts)               ? raw.alerts
    : Array.isArray(raw?.data)                 ? raw.data
    : Array.isArray(raw?.results)              ? raw.results
    : Array.isArray(raw?.items)                ? raw.items
    : [];
  return arr.map((a, i) => ({
    id:       a.id       || a.alert_id   || String(i),
    name:     a.name     || a.title      || a.message  || a.summary || `Alert ${i + 1}`,
    severity: a.severity || a.level      || a.priority || "",
    service:  a.service  || a.source     || a.component || a.system || "",
    status:   a.status   || a.state      || "",
    tags:     Array.isArray(a.tags) ? a.tags.join(" ") : (a.tags || ""),
    description: (a.description || a.details || a.body || "").toString().slice(0, 300),
  }));
}

function normaliseInvestigations(raw) {
  const arr = Array.isArray(raw)                  ? raw
    : Array.isArray(raw?.investigations)           ? raw.investigations
    : Array.isArray(raw?.cases)                    ? raw.cases
    : Array.isArray(raw?.data)                     ? raw.data
    : Array.isArray(raw?.results)                  ? raw.results
    : Array.isArray(raw?.items)                    ? raw.items
    : [];
  return arr.map((inv, i) => ({
    id:       inv.id      || inv.case_id  || String(i),
    title:    inv.title   || inv.name     || inv.subject || `Investigation ${i + 1}`,
    status:   inv.status  || inv.state    || "",
    priority: inv.priority || inv.severity || "",
    tags:     Array.isArray(inv.tags) ? inv.tags.join(" ") : (inv.tags || ""),
    description: (inv.description || inv.summary || inv.notes || "").toString().slice(0, 300),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(alert, inv) {
  const aw = keywords(`${alert.name} ${alert.service} ${alert.description} ${alert.tags}`);
  const iw = keywords(`${inv.title} ${inv.description} ${inv.tags}`);
  return aw.filter((w) => iw.some((i) => i.includes(w) || w.includes(i))).length;
}

function buildLinked(alerts, invs) {
  return alerts.map((alert) => {
    const matched = invs
      .map((inv) => ({ ...inv, score: relevance(alert, inv) }))
      .filter((inv) => inv.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...alert, investigations: matched, investigated: matched.length > 0 };
  });
}

function severityColor(s) {
  const lc = String(s || "").toLowerCase();
  if (lc === "critical") return "#F87171";
  if (lc === "high")     return "#FB923C";
  if (lc === "medium" || lc === "warning") return "#FBBF24";
  if (lc === "low" || lc === "info")       return "#4ADE80";
  return "#94A3B8";
}

function statusColor(s) {
  const lc = String(s || "").toLowerCase();
  if (lc === "open" || lc === "active" || lc === "new")        return "#F87171";
  if (lc === "investigating" || lc === "in_progress")           return "#FBBF24";
  if (lc === "resolved" || lc === "closed" || lc === "done")   return "#4ADE80";
  return "#94A3B8";
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "INVESTIGATED", "UNINVESTIGATED"];

export default function OpsAlertInvestigationCoverage() {
  const [open,        setOpen]        = useState(false);
  const [alerts,      setAlerts]      = useState([]);
  const [invs,        setInvs]        = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [filter,      setFilter]      = useState("ALL");
  const [search,      setSearch]      = useState("");
  const [expanded,    setExpanded]    = useState(null);
  const [assessing,   setAssessing]   = useState(false);
  const [lastFetch,   setLastFetch]   = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [alertRes, invRes] = await Promise.all([
        fetch(`${base}/v1/ops/alerts`,   { headers: hdr }),
        fetch(`${base}/v1/investigations`, { headers: hdr }),
      ]);
      setAlerts(normaliseAlerts(await alertRes.json()));
      setInvs(normaliseInvestigations(await invRes.json()));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:oalinv-toggle", onToggle);
    return () => window.removeEventListener("jarvis:oalinv-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "");
      if (isOalinvQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const linked        = buildLinked(alerts, invs);
  const investigated  = linked.filter((a) => a.investigated).length;
  const uninvestigated = linked.filter((a) => !a.investigated).length;

  const visible = linked
    .filter((a) => {
      if (filter === "INVESTIGATED")   return a.investigated;
      if (filter === "UNINVESTIGATED") return !a.investigated;
      return true;
    })
    .filter((a) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        a.name.toLowerCase().includes(q) ||
        String(a.service).toLowerCase().includes(q)
      );
    });

  async function assess() {
    setAssessing(true);
    const text = await buildOalinvScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Ops Alert × Investigation Coverage (◈ OALINV)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 115,
          background: open ? `${ORANGE}22` : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? ORANGE : S.border}`,
          borderRadius: S.radius, color: open ? ORANGE : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${ORANGE}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ OALINV{uninvestigated > 0 && (
          <span style={{
            marginLeft: 4,
            background: ORANGE,
            color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{uninvestigated}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 116,
          bottom: 36, left: Math.max(8, BTN_LEFT - 280),
          width: 380,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${ORANGE}`,
          borderRadius: S.radius,
          boxShadow: "0 4px 28px rgba(0,0,0,0.55)",
          fontFamily: S.mono, fontSize: S.fs.xs,
          display: "flex", flexDirection: "column",
          maxHeight: "70vh", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ color: ORANGE, letterSpacing: 2, fontWeight: 700, fontSize: S.fs.xxs }}>
              OPS ALERT × INVESTIGATION
            </span>
            <button
              onClick={assess}
              disabled={assessing || alerts.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || alerts.length === 0) ? 0.4 : 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 6, padding: "8px 12px",
          }}>
            {[
              { label: "ALERTS",   val: alerts.length,  color: ORANGE    },
              { label: "CASES",    val: invs.length,    color: "#A78BFA" },
              { label: "INVESTIG", val: investigated,   color: "#4ADE80" },
              { label: "BLIND",    val: uninvestigated, color: "#F87171" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                background: "rgba(0,0,0,0.3)", borderRadius: 6,
                padding: "5px 4px", textAlign: "center",
              }}>
                <div style={{ color, fontSize: S.fs.lg, fontWeight: 700 }}>{val}</div>
                <div style={{ color: S.text, fontSize: "8px", letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "0 12px 4px" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{
                flex: 1,
                background: filter === t ? `${ORANGE}22` : "transparent",
                border: `1px solid ${filter === t ? ORANGE : S.border}`,
                color: filter === t ? ORANGE : S.text,
                borderRadius: S.radius, padding: "2px 0",
                fontFamily: S.mono, fontSize: "8px", letterSpacing: 1, cursor: "pointer",
              }}>{t === "UNINVESTIGATED" ? "BLIND" : t}</button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "0 12px 6px" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search alerts…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(0,0,0,0.3)",
                border: `1px solid ${S.border}`, borderRadius: S.radius,
                color: S.textHi, fontFamily: S.mono, fontSize: "9px",
                padding: "3px 7px", outline: "none",
              }}
            />
          </div>

          {/* Alert list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && alerts.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No alerts match.</div>
            ) : visible.map((alert) => (
              <div key={alert.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === alert.id ? null : alert.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${alert.investigated ? "#4ADE80" : "#F87171"}`,
                  }}
                >
                  <span style={{ color: alert.investigated ? "#4ADE80" : "#F87171", fontSize: 10, width: 10 }}>
                    {alert.investigated ? "●" : "○"}
                  </span>
                  <span style={{ flex: 1, color: S.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "9px" }}>
                    {alert.name}
                  </span>
                  {alert.severity && (
                    <span style={{
                      fontSize: "7px", padding: "1px 4px", borderRadius: 4,
                      background: `${severityColor(alert.severity)}22`,
                      color: severityColor(alert.severity),
                      border: `1px solid ${severityColor(alert.severity)}44`,
                      whiteSpace: "nowrap",
                    }}>
                      {String(alert.severity).toUpperCase().slice(0, 8)}
                    </span>
                  )}
                  {alert.service && (
                    <span style={{ fontSize: "8px", color: S.text, whiteSpace: "nowrap" }}>
                      {String(alert.service).slice(0, 10)}
                    </span>
                  )}
                  <span style={{
                    fontSize: "9px", whiteSpace: "nowrap",
                    color: alert.investigated ? "#4ADE80" : "#F87171",
                    minWidth: 58, textAlign: "right",
                  }}>
                    {alert.investigated ? `${alert.investigations.length} CASE${alert.investigations.length !== 1 ? "S" : ""}` : "BLIND"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === alert.id ? "▴" : "▾"}</span>
                </div>

                {expanded === alert.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {alert.investigated ? alert.investigations.map((inv) => (
                      <div key={inv.id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "3px 0", borderBottom: `1px solid ${S.border}22`,
                      }}>
                        <span style={{
                          fontSize: "7px", padding: "1px 4px", borderRadius: 4,
                          background: `${statusColor(inv.status)}22`,
                          color: statusColor(inv.status),
                          border: `1px solid ${statusColor(inv.status)}44`,
                          whiteSpace: "nowrap",
                        }}>
                          {String(inv.status || "OPEN").toUpperCase().slice(0, 10)}
                        </span>
                        <span style={{ flex: 1, color: S.textHi, fontSize: "9px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {inv.title}
                        </span>
                        <span style={{ color: S.text, fontSize: "8px", whiteSpace: "nowrap" }}>
                          rel:{inv.score}
                        </span>
                      </div>
                    )) : (
                      <div style={{ color: "#F87171", fontSize: "9px", padding: "2px 0" }}>
                        No open investigation case covers this alert.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding: "4px 12px", borderTop: `1px solid ${S.border}`,
            color: S.text, fontSize: "8px", letterSpacing: 0.5,
          }}>
            /v1/ops/alerts · /v1/investigations · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
