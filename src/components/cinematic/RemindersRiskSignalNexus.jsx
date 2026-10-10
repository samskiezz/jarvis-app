/**
 * RemindersRiskSignalNexus — F643
 * "JARVIS, remrsk / reminders risk / risk reminders / risk-linked reminders /
 *  risk signal notes / which reminders match risk signals / reminder risk /
 *  risky reminders / reminder threat signal"
 * Cross-references /reminders/list against /entities/RiskSignal by keyword.
 * RISK-LINKED reminders (≥1 signal keyword-matches) vs FLOATING (no risk backing).
 * Coverage % tile; ALL/RISK-LINKED/FLOATING filter tabs + search; click-to-expand matched signals.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence threat-memory brief + TTS.
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
const BTN_LEFT = 107_960;
const Z_INDEX  = 184;

const REMRSK_RE =
  /\bremrsk\b|\breminders?.risk\b|\brisk.?reminders?\b|\brisk.?linked.?remind\b|\brisk.?signal.?notes?\b|\bwhich.?reminders?.match.?risk\b|\breminder.?risk\b|\brisky.?reminders?\b|\breminder.?threat.?signal\b|\bthreat.?remind\b/i;

export function isRemrskQuery(text) {
  return REMRSK_RE.test(text || "");
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

function normaliseReminders(data) {
  if (!data) return [];
  const raw =
    data.reminders || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((r, i) => ({
    id:    r.id    || `rem-${i}`,
    title: r.title || r.text || r.body || r.content || `Reminder ${i + 1}`,
    kind:  (r.kind || r.type || r.category || "reminder").toLowerCase(),
    status: r.status || r.state || "pending",
    tags:  Array.isArray(r.tags) ? r.tags.join(" ") : (r.tags || ""),
  }));
}

function normaliseSignals(data) {
  if (!data) return [];
  const raw =
    data.signals || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((s, i) => ({
    id:          s.id          || `sig-${i}`,
    title:       s.title       || s.name  || s.label || `Signal ${i + 1}`,
    severity:    (s.severity   || s.level || s.priority || "INFO").toString().toUpperCase(),
    description: s.description || s.body  || s.detail || s.notes || "",
    source:      s.source      || s.origin || s.service || "",
  }));
}

function crossRef(reminders, signals) {
  return reminders.map((rem) => {
    const haystack = `${rem.title} ${rem.kind} ${rem.tags}`;
    const matches = signals
      .map((sig) => {
        const needle = `${sig.title} ${sig.description} ${sig.source}`;
        const hits = overlap(haystack, needle);
        return hits > 0 ? { ...sig, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => {
        const sevOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, INFO: 0 };
        const diff = (sevOrder[b.severity] || 0) - (sevOrder[a.severity] || 0);
        return diff !== 0 ? diff : b.hits - a.hits;
      });
    return { ...rem, linked: matches.length > 0, signals: matches };
  });
}

export async function buildRemrskScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [remRes, sigRes] = await Promise.all([
      fetch(`${base}/reminders/list`,    { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
    ]);
    const [remData, sigData] = await Promise.all([remRes.json(), sigRes.json()]);
    const reminders = normaliseReminders(remData);
    const signals   = normaliseSignals(sigData);
    const rows      = crossRef(reminders, signals);
    const linked    = rows.filter((r) => r.linked).length;
    const floating  = rows.length - linked;
    const pct       = rows.length ? Math.round((linked / rows.length) * 100) : 0;
    if (!rows.length) return "No reminders found in the system, sir.";
    const topLinked = rows
      .filter((r) => r.linked)
      .slice(0, 2)
      .map((r) => r.title)
      .join("; ");
    const criticalLinked = rows
      .filter((r) => r.linked && r.signals.some((s) => s.severity === "CRITICAL"))
      .length;
    return (
      `${linked} of ${rows.length} reminders are linked to active risk signals (${pct}% risk coverage). ` +
      (linked > 0
        ? `${criticalLinked > 0 ? `${criticalLinked} reminder${criticalLinked !== 1 ? "s" : ""} intersect CRITICAL signals — ` : ""}Risk-linked reminders include: ${topLinked || "unknown"}.`
        : `${floating} reminder${floating !== 1 ? "s" : ""} show no risk-signal correlation — threat landscape appears disconnected from active notes.`)
    );
  } catch {
    return "Unable to reach reminders or risk signal endpoints, sir.";
  }
}

const SEV_COLOR = {
  CRITICAL: RED,
  HIGH:     ORG,
  MEDIUM:   AMB,
  WARNING:  AMB,
  INFO:     CY,
  LOW:      GRN,
};

const KIND_COLOR = {
  note:      CY,
  task:      GRN,
  alert:     RED,
  reminder:  AMB,
};

export default function RemindersRiskSignalNexus() {
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
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [remRes, sigRes] = await Promise.all([
        fetch(`${base}/reminders/list`,     { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
      ]);
      const [remData, sigData] = await Promise.all([remRes.json(), sigRes.json()]);
      setRows(crossRef(normaliseReminders(remData), normaliseSignals(sigData)));
    } catch {
      /* silently ignore fetch errors */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen((p) => !p); if (!rows.length) load(); };
    window.addEventListener("jarvis:remrsk-toggle", handler);
    return () => window.removeEventListener("jarvis:remrsk-toggle", handler);
  }, [load, rows.length]);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const linked   = rows.filter((r) => r.linked).length;
  const floating = rows.length - linked;
  const pct      = rows.length ? Math.round((linked / rows.length) * 100) : 0;

  const visible = rows
    .filter((r) => {
      if (filter === "RISK-LINKED") return r.linked;
      if (filter === "FLOATING")    return !r.linked;
      return true;
    })
    .filter((r) =>
      !search ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.kind.toLowerCase().includes(search.toLowerCase())
    );

  const assess = async () => {
    setAssessing(true);
    setBrief("");
    try {
      const summary = await buildRemrskScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body:    JSON.stringify({ message: `JARVIS reminders-risk brief: ${summary}` }),
      });
      const d    = await r.json();
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
          position:       "fixed",
          left:           BTN_LEFT,
          bottom:         8,
          zIndex:         Z_INDEX,
          background:     linked > 0 ? `${AMB}22` : "rgba(0,0,0,0.55)",
          border:         `1px solid ${linked > 0 ? AMB : CY}55`,
          borderRadius:   5,
          color:          linked > 0 ? AMB : CY,
          padding:        "3px 8px",
          fontSize:       9,
          letterSpacing:  1,
          cursor:         "pointer",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ REMRSK
        {linked > 0 && (
          <span style={{ marginLeft: 5, background: AMB, color: "#000", borderRadius: 9, padding: "0 5px", fontSize: 8, fontWeight: 700 }}>
            {linked}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position:       "fixed",
            left:           Math.min(BTN_LEFT, window.innerWidth - 360),
            bottom:         36,
            zIndex:         Z_INDEX + 1,
            width:          340,
            maxHeight:      480,
            overflow:       "hidden",
            display:        "flex",
            flexDirection:  "column",
            background:     "rgba(6,12,22,0.97)",
            border:         `1px solid ${CY}33`,
            borderRadius:   8,
            padding:        14,
            fontFamily:     "monospace",
            backdropFilter: "blur(12px)",
          }}
        >
          {/* header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>REMINDERS × RISK SIGNALS</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 12 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[
              { label: "REMINDERS",   value: rows.length, col: CY  },
              { label: "RISK-LINKED", value: linked,      col: AMB },
              { label: "FLOATING",    value: floating,    col: GRN },
              { label: "COVERAGE",    value: `${pct}%`,  col: pct >= 50 ? AMB : GRN },
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
            placeholder="search reminders…"
            style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${CY}33`, borderRadius: 4, color: "#DCEBF5", padding: "4px 8px", fontSize: 10, marginBottom: 6, outline: "none" }}
          />

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {["ALL", "RISK-LINKED", "FLOATING"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  flex:       1,
                  background: filter === f ? `${CY}22` : "transparent",
                  border:     `1px solid ${filter === f ? CY : CY + "33"}`,
                  borderRadius: 4,
                  color:      filter === f ? CY : DIM,
                  padding:    "3px 0",
                  fontSize:   8,
                  cursor:     "pointer",
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
              <div style={{ color: DIM, fontSize: 10, textAlign: "center", padding: 16 }}>No reminders match filter.</div>
            )}
            {visible.map((rem) => (
              <div
                key={rem.id}
                onClick={() => setExpanded(expanded === rem.id ? null : rem.id)}
                style={{
                  background: rem.linked ? `${AMB}09` : "rgba(255,255,255,0.02)",
                  border:     `1px solid ${rem.linked ? AMB + "33" : CY + "1A"}`,
                  borderRadius: 5,
                  padding:    "6px 8px",
                  cursor:     "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    fontSize: 8,
                    border:   `1px solid ${rem.linked ? AMB : GRN}44`,
                    borderRadius: 3,
                    padding:  "1px 4px",
                    color:    rem.linked ? AMB : GRN,
                    letterSpacing: 1,
                  }}>
                    {rem.linked ? "RISK-LINKED" : "FLOATING"}
                  </span>
                  <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{rem.title}</span>
                  {rem.linked && (
                    <span style={{ color: DIM, fontSize: 9 }}>{rem.signals.length} sig</span>
                  )}
                </div>
                {rem.kind && (
                  <div style={{ color: KIND_COLOR[rem.kind] || DIM, fontSize: 9, marginLeft: 16, textTransform: "uppercase", letterSpacing: 1 }}>
                    {rem.kind}
                  </div>
                )}

                {expanded === rem.id && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${AMB}22`, paddingTop: 6 }}>
                    {rem.linked ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {rem.signals.map((sig) => (
                          <div key={sig.id} style={{ background: "rgba(255,165,0,0.04)", border: `1px solid ${AMB}33`, borderRadius: 4, padding: "5px 7px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{
                                color:     SEV_COLOR[sig.severity] || CY,
                                fontSize:  9,
                                border:    `1px solid ${(SEV_COLOR[sig.severity] || CY)}44`,
                                borderRadius: 3,
                                padding:   "1px 4px",
                              }}>
                                {sig.severity}
                              </span>
                              <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{sig.title}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>hits: {sig.hits}</span>
                            </div>
                            {sig.source && (
                              <div style={{ color: DIM, fontSize: 8, marginTop: 2 }}>{sig.source}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No active risk signals matched this reminder — note appears threat-free.</div>
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
                border:     `1px solid ${AMB}55`,
                borderRadius: 5,
                color:      AMB,
                padding:    "5px 12px",
                cursor:     "pointer",
                fontSize:   10,
                letterSpacing: 1,
                width:      "100%",
                opacity:    assessing ? 0.6 : 1,
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
