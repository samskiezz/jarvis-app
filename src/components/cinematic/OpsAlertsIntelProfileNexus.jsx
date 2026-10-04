/**
 * OpsAlertsIntelProfileNexus — F650
 * "JARVIS, oalip / ops alert intel / alert intel profile /
 *  profiled alerts / threat actor alerts / which alerts match intel profiles /
 *  alert profile coverage / intel-backed alerts / anonymous alerts"
 * Cross-references /v1/ops/alerts against /entities/IntelProfile.
 * PROFILED alerts (≥1 intel profile keyword-matches) vs ANONYMOUS (no threat actor backing).
 * Coverage % tile; ALL/PROFILED/ANONYMOUS filter tabs + search; click-to-expand matched profiles.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4444";
const ORG = "#FF6B35";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 112_260;
const Z_INDEX  = 189;

const OALIP_RE =
  /\boalip\b|\bops.?alert.?intel\b|\balert.?intel.?profile\b|\bprofiled.?alerts?\b|\bthreat.?actor.?alerts?\b|\bwhich.?alerts?.match.?intel\b|\balert.?profile.?coverage\b|\bintel.?backed.?alerts?\b|\banonymous.?alerts?\b|\balert.?intel.?match\b/i;

export function isOalipQuery(text) {
  return OALIP_RE.test(text || "");
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

function normaliseProfiles(data) {
  if (!data) return [];
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.profiles)
    ? data.profiles
    : Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.data)
    ? data.data
    : [];
  return arr.map((p, i) => ({
    id:          p.id          || `prof-${i}`,
    name:        p.name        || p.title    || p.alias || `Profile ${i + 1}`,
    threat_level:(p.threat_level || p.level || p.severity || "MEDIUM").toString().toUpperCase(),
    actor_type:  p.actor_type  || p.type    || p.category || "",
    summary:     p.summary     || p.description || p.bio || "",
    tags:        Array.isArray(p.tags) ? p.tags.join(" ") : (p.tags || ""),
  }));
}

function crossRef(alerts, profiles) {
  return alerts.map((alert) => {
    const haystack = `${alert.title} ${alert.source} ${alert.message}`;
    const matches = profiles
      .map((prof) => {
        const needle = `${prof.name} ${prof.summary} ${prof.tags} ${prof.actor_type}`;
        const hits = overlap(haystack, needle);
        return hits > 0 ? { ...prof, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits);
    return { ...alert, profiled: matches.length > 0, profiles: matches };
  });
}

export async function buildOalipScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [alertRes, profRes] = await Promise.all([
      fetch(`${base}/v1/ops/alerts`,       { headers: hdr }),
      fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
    ]);
    const [alertData, profData] = await Promise.all([alertRes.json(), profRes.json()]);
    const alerts   = normaliseAlerts(alertData);
    const profiles = normaliseProfiles(profData);
    const rows     = crossRef(alerts, profiles);
    const profiled  = rows.filter((r) => r.profiled).length;
    const anonymous = rows.length - profiled;
    const pct = rows.length ? Math.round((profiled / rows.length) * 100) : 0;
    if (!rows.length) return "No ops alerts found in the system, sir.";
    const topAnon = rows
      .filter((r) => !r.profiled)
      .slice(0, 2)
      .map((r) => r.title)
      .join("; ");
    return (
      `${profiled} of ${rows.length} ops alerts are attributed to known intel profiles (${pct}% coverage). ` +
      (anonymous > 0
        ? `${anonymous} alert${anonymous !== 1 ? "s" : ""} have no matching threat actor profile — unknown-origin events requiring attribution: ${topAnon || "unidentified"}.`
        : "All active alerts are attributed to at least one tracked threat actor — full intel attribution confirmed.")
    );
  } catch {
    return "Unable to reach ops alerts or intel profile endpoints, sir.";
  }
}

const THREAT_COLOR = {
  CRITICAL: RED,
  HIGH:     ORG,
  MEDIUM:   AMB,
  LOW:      GRN,
};

const SEV_COLOR = {
  CRITICAL: RED,
  HIGH:     ORG,
  MEDIUM:   AMB,
  WARNING:  AMB,
  INFO:     CY,
  LOW:      GRN,
};

export default function OpsAlertsIntelProfileNexus() {
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
      const [alertRes, profRes] = await Promise.all([
        fetch(`${base}/v1/ops/alerts`,        { headers: hdr }),
        fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
      ]);
      const [alertData, profData] = await Promise.all([alertRes.json(), profRes.json()]);
      const alerts   = normaliseAlerts(alertData);
      const profiles = normaliseProfiles(profData);
      setRows(crossRef(alerts, profiles));
    } catch {
      /* silently ignore fetch errors */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen((p) => !p); if (!rows.length) load(); };
    window.addEventListener("jarvis:oalip-toggle", handler);
    return () => window.removeEventListener("jarvis:oalip-toggle", handler);
  }, [load, rows.length]);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const profiled  = rows.filter((r) => r.profiled).length;
  const anonymous = rows.length - profiled;
  const pct       = rows.length ? Math.round((profiled / rows.length) * 100) : 0;

  const visible = rows
    .filter((r) => {
      if (filter === "PROFILED")  return r.profiled;
      if (filter === "ANONYMOUS") return !r.profiled;
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
      const summary = await buildOalipScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `JARVIS ops-alert intel-profile attribution brief: ${summary}` }),
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
          background: anonymous > 0 ? `${AMB}22` : "rgba(0,0,0,0.55)",
          border:   `1px solid ${anonymous > 0 ? AMB : CY}55`,
          borderRadius: 5,
          color:    anonymous > 0 ? AMB : CY,
          padding:  "3px 8px",
          fontSize: 9,
          letterSpacing: 1,
          cursor:   "pointer",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ OALIP
        {anonymous > 0 && (
          <span style={{ marginLeft: 5, background: AMB, color: "#000", borderRadius: 9, padding: "0 5px", fontSize: 8, fontWeight: 700 }}>
            {anonymous}
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
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>OPS ALERTS × INTEL PROFILES</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 12 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[
              { label: "ALERTS",    value: rows.length, col: CY },
              { label: "PROFILED",  value: profiled,    col: RED },
              { label: "ANONYMOUS", value: anonymous,   col: AMB },
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
            {["ALL", "PROFILED", "ANONYMOUS"].map((f) => (
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
                  background: !alert.profiled ? `${AMB}09` : `${RED}06`,
                  border: `1px solid ${!alert.profiled ? AMB + "33" : RED + "22"}`,
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
                    border: `1px solid ${alert.profiled ? RED + "44" : AMB + "44"}`,
                    borderRadius: 3,
                    padding: "1px 4px",
                    color: alert.profiled ? RED : AMB,
                    letterSpacing: 1,
                  }}>
                    {alert.profiled ? "PROFILED" : "ANONYMOUS"}
                  </span>
                  <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{alert.title}</span>
                  {alert.profiled && (
                    <span style={{ color: DIM, fontSize: 9 }}>{alert.profiles.length} actor{alert.profiles.length !== 1 ? "s" : ""}</span>
                  )}
                </div>
                {alert.source && (
                  <div style={{ color: DIM, fontSize: 9, marginLeft: 16 }}>{alert.source.slice(0, 30)}</div>
                )}

                {expanded === alert.id && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${AMB}22`, paddingTop: 6 }}>
                    {alert.profiled ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {alert.profiles.slice(0, 4).map((prof) => (
                          <div key={prof.id} style={{ background: `${RED}08`, border: `1px solid ${RED}22`, borderRadius: 4, padding: "5px 7px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{
                                color: THREAT_COLOR[prof.threat_level] || CY,
                                fontSize: 9,
                                border: `1px solid ${(THREAT_COLOR[prof.threat_level] || CY)}33`,
                                borderRadius: 3,
                                padding: "1px 4px",
                              }}>
                                {prof.threat_level}
                              </span>
                              {prof.actor_type && (
                                <span style={{ color: ORG, fontSize: 8, border: `1px solid ${ORG}33`, borderRadius: 3, padding: "1px 4px" }}>
                                  {prof.actor_type}
                                </span>
                              )}
                              <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{prof.name}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>hits: {prof.hits}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No intel profiles matched this alert — unattributed activity; may require new profile creation or manual attribution.</div>
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
