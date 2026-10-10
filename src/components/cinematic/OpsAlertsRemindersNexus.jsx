/**
 * OpsAlertsRemindersNexus — F653
 * "JARVIS, oalrem / ops alert reminders / alert reminders /
 *  which alerts have reminders / reminder-backed alerts /
 *  untracked alerts / alert memory / reminder coverage"
 * Cross-references /v1/ops/alerts against /reminders/list.
 * NOTED alerts (≥1 reminder keyword-matches) vs UNTRACKED (no reminder backing).
 * Coverage % tile; ALL/NOTED/UNTRACKED filter tabs + search; click-to-expand matched reminders.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4444";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 114_840;
const Z_INDEX  = 192;

const OALREM_RE =
  /\boalrem\b|\bops.?alert.?reminder\b|\balert.?reminder\b|\bwhich.?alerts?.have.?reminder\b|\breminder.?backed.?alerts?\b|\buntracked.?alerts?\b|\balert.?memory\b|\breminder.?coverage\b|\balert.?note\b|\bnoted.?alerts?\b/i;

export function isOalremQuery(text) {
  return OALREM_RE.test(text || "");
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

function normaliseAlerts(data) {
  if (!data) return [];
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.alerts)
    ? data.alerts
    : Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.data)
    ? data.data
    : [];
  return arr.map((a, i) => ({
    id:       a.id       || a.alert_id || String(i),
    title:    a.title    || a.name     || a.summary    || `Alert ${i + 1}`,
    severity: (a.severity || a.level   || "INFO").toString().toUpperCase(),
    source:   a.source   || a.service  || a.origin || "",
    message:  a.message  || a.description || a.body || "",
  }));
}

function normaliseReminders(data) {
  if (!data) return [];
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.reminders)
    ? data.reminders
    : Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.data)
    ? data.data
    : [];
  return arr.map((r, i) => ({
    id:      r.id      || `rem-${i}`,
    title:   r.title   || r.text || r.name || r.content || `Reminder ${i + 1}`,
    kind:    r.kind    || r.type || r.category || "reminder",
    status:  r.status  || r.state || "pending",
    tags:    Array.isArray(r.tags) ? r.tags.join(" ") : (r.tags || ""),
  }));
}

function crossRef(alerts, reminders) {
  return alerts.map((alert) => {
    const haystack = `${alert.title} ${alert.source} ${alert.message}`;
    const matches = reminders
      .map((rem) => {
        const needle = `${rem.title} ${rem.kind} ${rem.tags}`;
        const hits = overlap(haystack, needle);
        return hits > 0 ? { ...rem, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits);
    return { ...alert, noted: matches.length > 0, reminders: matches };
  });
}

export async function buildOalremScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [alertRes, remRes] = await Promise.all([
      fetch(`${base}/v1/ops/alerts`,  { headers: hdr }),
      fetch(`${base}/reminders/list`, { headers: hdr }),
    ]);
    const [alertData, remData] = await Promise.all([alertRes.json(), remRes.json()]);
    const alerts    = normaliseAlerts(alertData);
    const reminders = normaliseReminders(remData);
    const rows      = crossRef(alerts, reminders);
    const noted     = rows.filter((r) => r.noted).length;
    const untracked = rows.length - noted;
    const pct       = rows.length ? Math.round((noted / rows.length) * 100) : 0;
    if (!rows.length) return "No ops alerts found in the system, sir.";
    const topUntracked = rows
      .filter((r) => !r.noted)
      .slice(0, 2)
      .map((r) => r.title)
      .join("; ");
    return (
      `${noted} of ${rows.length} ops alerts have associated reminders (${pct}% memory coverage). ` +
      (untracked > 0
        ? `${untracked} alert${untracked !== 1 ? "s" : ""} have no reminder note — untracked blind spots: ${topUntracked || "unidentified alerts"}.`
        : "All active ops alerts are backed by at least one reminder — full alert memory confirmed.")
    );
  } catch {
    return "Unable to reach ops alerts or reminders endpoints, sir.";
  }
}

const SEV_COLOR = {
  CRITICAL: RED,
  HIGH:     "#FF6B35",
  MEDIUM:   AMB,
  WARNING:  AMB,
  INFO:     CY,
  LOW:      GRN,
};

const KIND_COLOR = {
  alert:    RED,
  task:     CY,
  note:     GRN,
  reminder: AMB,
};

export default function OpsAlertsRemindersNexus() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [alertRes, remRes] = await Promise.all([
        fetch(`${base}/v1/ops/alerts`,  { headers: hdr }),
        fetch(`${base}/reminders/list`, { headers: hdr }),
      ]);
      const [alertData, remData] = await Promise.all([alertRes.json(), remRes.json()]);
      const alerts    = normaliseAlerts(alertData);
      const reminders = normaliseReminders(remData);
      setRows(crossRef(alerts, reminders));
    } catch {
      /* silently ignore fetch errors */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen((p) => !p); if (!rows.length) load(); };
    window.addEventListener("jarvis:oalrem-toggle", handler);
    return () => window.removeEventListener("jarvis:oalrem-toggle", handler);
  }, [load, rows.length]);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const noted     = rows.filter((r) => r.noted).length;
  const untracked = rows.length - noted;
  const pct       = rows.length ? Math.round((noted / rows.length) * 100) : 0;

  const visible = rows
    .filter((r) => {
      if (filter === "NOTED")     return r.noted;
      if (filter === "UNTRACKED") return !r.noted;
      return true;
    })
    .filter((r) =>
      !search ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.severity.toLowerCase().includes(search.toLowerCase()) ||
      r.source.toLowerCase().includes(search.toLowerCase())
    );

  const assess = async () => {
    setAssessing(true);
    setBrief("");
    try {
      const summary = await buildOalremScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `JARVIS ops-alert reminder coverage brief: ${summary}` }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || summary;
      setBrief(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setBrief("Assessment unavailable — check backend connectivity, sir.");
    } finally {
      setAssessing(false);
    }
  };

  return (
    <>
      {/* HUD button */}
      <button
        onClick={() => { setOpen((p) => !p); if (!rows.length) load(); }}
        style={{
          position: "fixed",
          left:     BTN_LEFT,
          bottom:   8,
          zIndex:   Z_INDEX,
          background: untracked > 0 ? `${AMB}22` : "rgba(0,0,0,0.55)",
          border:   `1px solid ${untracked > 0 ? AMB : CY}55`,
          borderRadius: 5,
          color:    untracked > 0 ? AMB : CY,
          padding:  "3px 8px",
          fontSize: 9,
          letterSpacing: 1,
          cursor:   "pointer",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ OALREM
        {untracked > 0 && (
          <span style={{ marginLeft: 5, background: AMB, color: "#000", borderRadius: 9, padding: "0 5px", fontSize: 8, fontWeight: 700 }}>
            {untracked}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            left: Math.min(BTN_LEFT, window.innerWidth - 360),
            bottom: 36,
            zIndex: Z_INDEX + 1,
            width: 340,
            maxHeight: 480,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            background: "rgba(6,12,22,0.97)",
            border: `1px solid ${CY}33`,
            borderRadius: 8,
            padding: 14,
            fontFamily: "monospace",
            backdropFilter: "blur(12px)",
          }}
        >
          {/* header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>OPS ALERTS × REMINDERS</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 12 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[
              { label: "ALERTS",    value: rows.length, col: CY },
              { label: "NOTED",     value: noted,       col: GRN },
              { label: "UNTRACKED", value: untracked,   col: AMB },
              { label: "COVERAGE",  value: `${pct}%`,   col: pct >= 60 ? GRN : AMB },
            ].map((t) => (
              <div key={t.label} style={{ flex: 1, background: `${t.col}11`, border: `1px solid ${t.col}33`, borderRadius: 5, padding: "5px 4px", textAlign: "center" }}>
                <div style={{ color: t.col, fontSize: 12, fontWeight: 700 }}>{t.value}</div>
                <div style={{ color: DIM, fontSize: 7, letterSpacing: 1 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search alerts…"
            style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${CY}33`, borderRadius: 4, color: "#DCEBF5", padding: "4px 8px", fontSize: 10, marginBottom: 6, outline: "none" }}
          />

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {["ALL", "NOTED", "UNTRACKED"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  flex: 1,
                  background: filter === f ? `${CY}22` : "transparent",
                  border: `1px solid ${filter === f ? CY : CY + "33"}`,
                  borderRadius: 4,
                  color: filter === f ? CY : DIM,
                  padding: "3px 0",
                  fontSize: 8,
                  cursor: "pointer",
                  letterSpacing: 1,
                }}
              >
                {f}
              </button>
            ))}
          </div>

          {/* list */}
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {loading && <div style={{ color: DIM, fontSize: 10, textAlign: "center", padding: 16 }}>Loading…</div>}
            {!loading && visible.length === 0 && (
              <div style={{ color: DIM, fontSize: 10, textAlign: "center", padding: 16 }}>No alerts match filter.</div>
            )}
            {visible.map((alert) => (
              <div
                key={alert.id}
                onClick={() => setExpanded(expanded === alert.id ? null : alert.id)}
                style={{
                  background: alert.noted ? `${GRN}06` : `${AMB}09`,
                  border: `1px solid ${alert.noted ? GRN + "22" : AMB + "33"}`,
                  borderRadius: 5,
                  padding: "6px 8px",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    fontSize: 8,
                    border: `1px solid ${(SEV_COLOR[alert.severity] || CY)}44`,
                    borderRadius: 3,
                    padding: "1px 4px",
                    color: SEV_COLOR[alert.severity] || CY,
                    letterSpacing: 1,
                  }}>
                    {alert.severity}
                  </span>
                  <span style={{
                    fontSize: 8,
                    border: `1px solid ${alert.noted ? GRN + "44" : AMB + "44"}`,
                    borderRadius: 3,
                    padding: "1px 4px",
                    color: alert.noted ? GRN : AMB,
                    letterSpacing: 1,
                  }}>
                    {alert.noted ? "NOTED" : "UNTRACKED"}
                  </span>
                  <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{alert.title}</span>
                  {alert.noted && (
                    <span style={{ color: DIM, fontSize: 9 }}>{alert.reminders.length} note{alert.reminders.length !== 1 ? "s" : ""}</span>
                  )}
                </div>
                {alert.source && (
                  <div style={{ color: DIM, fontSize: 9, marginLeft: 16 }}>{alert.source.slice(0, 30)}</div>
                )}

                {expanded === alert.id && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${AMB}22`, paddingTop: 6 }}>
                    {alert.noted ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {alert.reminders.slice(0, 4).map((rem) => (
                          <div key={rem.id} style={{ background: `${GRN}08`, border: `1px solid ${GRN}22`, borderRadius: 4, padding: "5px 7px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{rem.title}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>hits: {rem.hits}</span>
                            </div>
                            <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                              {rem.kind && (
                                <span style={{ color: KIND_COLOR[rem.kind.toLowerCase()] || CY, fontSize: 8, border: `1px solid ${KIND_COLOR[rem.kind.toLowerCase()] || CY}33`, borderRadius: 3, padding: "1px 4px" }}>{rem.kind}</span>
                              )}
                              {rem.status && (
                                <span style={{ color: DIM, fontSize: 9 }}>{rem.status}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No reminders matched this alert — no tracking note exists for this operational signal.</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* assess */}
          <div style={{ marginTop: 10, borderTop: `1px solid ${AMB}22`, paddingTop: 8 }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{
                background: `${AMB}18`,
                border: `1px solid ${AMB}55`,
                borderRadius: 5,
                color: AMB,
                padding: "5px 12px",
                cursor: "pointer",
                fontSize: 10,
                letterSpacing: 1,
                width: "100%",
                opacity: assessing ? 0.6 : 1,
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, color: "#DCEBF5", fontSize: 10, lineHeight: 1.5, borderLeft: `2px solid ${AMB}`, paddingLeft: 8 }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
