/**
 * RemindersRiskSignalNexus — F599
 * "JARVIS, reminders risk / risk reminders / remrsk / risk-backed reminders / floating risk notes"
 * Cross-references /reminders/list against /entities/RiskSignal.
 * RISK-BACKED reminders (≥1 risk-signal keyword-matches) vs UNLINKED (no signal backing).
 * Coverage % tile; ALL/RISK-BACKED/UNLINKED filter tabs + search; click-to-expand matched signals.
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

const POLL_MS = 90_000;

const REMRSK_RE =
  /\bremrsk\b|\breminders?.risks?\b|\brisk.?reminders?\b|\brisk.?backed.?reminders?\b|\bunlinked.?reminders?\b|\breminder.?risk.?coverage\b|\bfloating.?risk.?notes?\b|\breminder.?signals?\b/i;

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
    id:      r.id || `rem-${i}`,
    content: r.content || r.text || r.title || r.note || `Reminder ${i + 1}`,
    kind:    (r.kind || r.type || "reminder").toLowerCase(),
    status:  (r.status || "pending").toLowerCase(),
    tags:    r.tags || [],
  }));
}

function normaliseSignals(data) {
  if (!data) return [];
  const raw =
    data.signals || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((s, i) => ({
    id:       s.id || `sig-${i}`,
    title:    s.title || s.name || s.signal || `Signal ${i + 1}`,
    severity: (s.severity || s.level || "MEDIUM").toUpperCase(),
    source:   s.source || s.origin || "",
    tags:     s.tags || [],
  }));
}

function crossRef(reminders, signals) {
  return reminders.map((rem) => {
    const haystack = `${rem.content} ${(rem.tags || []).join(" ")}`;
    const matches = signals
      .map((s) => {
        const hits = overlap(haystack, `${s.title} ${(s.tags || []).join(" ")} ${s.source}`);
        return hits > 0 ? { ...s, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 5);
    return { ...rem, signals: matches, backed: matches.length > 0 };
  });
}

export async function buildRemrskScript() {
  try {
    const base = apiBase();
    const [remRes, sigRes] = await Promise.all([
      fetch(`${base}/reminders/list`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const [remData, sigData] = await Promise.all([remRes.json(), sigRes.json()]);
    const reminders = normaliseReminders(remData);
    const signals   = normaliseSignals(sigData);
    const rows      = crossRef(reminders, signals);
    const backed    = rows.filter((r) => r.backed).length;
    const unlinked  = rows.length - backed;
    const pct       = rows.length ? Math.round((backed / rows.length) * 100) : 0;
    if (!rows.length) return "No reminders found in the system, sir.";
    const criticalBacked = rows
      .filter((r) => r.backed && r.signals.some((s) => s.severity === "CRITICAL"))
      .length;
    return (
      `${backed} of ${rows.length} reminders are backed by active risk signals (${pct}% coverage). ` +
      (criticalBacked > 0
        ? `${criticalBacked} reminder${criticalBacked !== 1 ? "s" : ""} reference CRITICAL signals — immediate attention required.`
        : unlinked > 0
        ? `${unlinked} reminder${unlinked !== 1 ? "s" : ""} have no associated risk signal — these may be uncontextualised action items.`
        : "All reminders have active risk signal backing.")
    );
  } catch {
    return "Unable to reach reminders or risk-signal endpoints, sir.";
  }
}

const SEV_COLOR = { CRITICAL: RED, HIGH: AMB, MEDIUM: CY, LOW: GRN };

export default function RemindersRiskSignalNexus() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const [remRes, sigRes] = await Promise.all([
        fetch(`${base}/reminders/list`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const [remData, sigData] = await Promise.all([remRes.json(), sigRes.json()]);
      setRows(crossRef(normaliseReminders(remData), normaliseSignals(sigData)));
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:remrsk-toggle", toggle);
    return () => window.removeEventListener("jarvis:remrsk-toggle", toggle);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try {
      const base  = apiBase();
      const backed   = rows.filter((r) => r.backed);
      const unlinked = rows.filter((r) => !r.backed);
      const critSigs = backed
        .flatMap((r) => r.signals.filter((s) => s.severity === "CRITICAL"))
        .slice(0, 3)
        .map((s) => s.title.slice(0, 40))
        .join("; ");
      const resp = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message:
            `Assess reminder-to-risk-signal linkage: ${rows.length} reminders total, ` +
            `${backed.length} are backed by active risk signals, ` +
            `${unlinked.length} are unlinked with no risk context. ` +
            (critSigs ? `Critical signals referenced: ${critSigs}. ` : "") +
            "Give a 2-sentence operational memory and risk-signal coverage assessment with recommended action.",
        }),
      });
      const d = await resp.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(text);
      if (text) {
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }, [rows]);

  const backed   = rows.filter((r) => r.backed).length;
  const unlinked = rows.length - backed;
  const pct      = rows.length ? Math.round((backed / rows.length) * 100) : 0;

  const visible = rows
    .filter((r) => {
      if (tab === "RISK-BACKED") return r.backed;
      if (tab === "UNLINKED")    return !r.backed;
      return true;
    })
    .filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        r.content.toLowerCase().includes(q) ||
        r.kind.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q)
      );
    });

  const KIND_COLOR = { note: CY, task: GRN, alert: RED, reminder: AMB };

  const BTN_LEFT = 80_580;
  const BTN_STYLE = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 8,
    zIndex: 152,
    padding: "4px 10px",
    background: "rgba(5,8,13,0.82)",
    border: `1px solid ${unlinked > 0 ? AMB : CY}55`,
    borderRadius: 6,
    cursor: "pointer",
    color: CY,
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 10,
    letterSpacing: 1,
    display: "flex",
    alignItems: "center",
    gap: 5,
    backdropFilter: "blur(6px)",
  };

  const PANEL = {
    position: "fixed",
    left: BTN_LEFT - 340,
    bottom: 38,
    zIndex: 152,
    width: 400,
    maxHeight: "70vh",
    overflowY: "auto",
    background: "rgba(6,10,16,0.94)",
    border: `1px solid ${CY}44`,
    borderRadius: 10,
    padding: 14,
    fontFamily: "'JetBrains Mono',monospace",
    color: "#DCEBF5",
    backdropFilter: "blur(10px)",
    boxShadow: `0 0 40px ${CY}18`,
  };

  const tabStyle = (t) => ({
    padding: "3px 8px",
    border: `1px solid ${tab === t ? CY : CY + "33"}`,
    borderRadius: 4,
    cursor: "pointer",
    background: tab === t ? CY + "22" : "transparent",
    color: tab === t ? CY : DIM,
    fontSize: 10,
    letterSpacing: 1,
  });

  return (
    <>
      <button
        style={BTN_STYLE}
        onClick={() => setOpen((o) => !o)}
        title="Reminders × Risk Signal Nexus (REMRSK)"
      >
        ◈ REMRSK
        {unlinked > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 4, padding: "1px 5px", fontSize: 9 }}>
            {unlinked}
          </span>
        )}
      </button>

      {open && (
        <div style={PANEL}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>REMINDERS × RISK SIGNAL NEXUS</span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
            >✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              { label: "REMINDERS",   value: rows.length, color: CY },
              { label: "RISK-BACKED", value: backed,      color: backed > 0 ? GRN : DIM },
              { label: "UNLINKED",    value: unlinked,    color: unlinked > 0 ? AMB : GRN },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${color}33`, borderRadius: 6, padding: "6px 8px", textAlign: "center" }}
              >
                <div style={{ color, fontSize: 16, fontWeight: "bold" }}>{loading ? "…" : value}</div>
                <div style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* coverage bar */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>RISK SIGNAL LINKAGE COVERAGE</span>
              <span style={{ color: pct >= 70 ? GRN : pct >= 40 ? AMB : RED, fontSize: 10, fontWeight: "bold" }}>{pct}%</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct >= 70 ? GRN : pct >= 40 ? AMB : RED, borderRadius: 2, transition: "width 0.4s" }} />
            </div>
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
            {["ALL", "RISK-BACKED", "UNLINKED"].map((t) => (
              <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search reminders…"
            style={{ width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.4)", border: `1px solid ${CY}33`, borderRadius: 5, color: "#DCEBF5", padding: "5px 8px", fontSize: 11, marginBottom: 8, outline: "none" }}
          />

          {/* list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 12 }}>No reminders match.</div>
            )}
            {visible.map((rem) => (
              <div
                key={rem.id}
                style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${rem.backed ? GRN : AMB}33`, borderRadius: 6, padding: "7px 9px", cursor: "pointer" }}
                onClick={() => setExpanded(expanded === rem.id ? null : rem.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ color: rem.backed ? GRN : AMB, fontSize: 10 }}>{rem.backed ? "●" : "○"}</span>
                  <span style={{ color: KIND_COLOR[rem.kind] || CY, fontSize: 9, border: `1px solid ${(KIND_COLOR[rem.kind] || CY)}44`, borderRadius: 3, padding: "1px 4px" }}>{rem.kind}</span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>{rem.content.slice(0, 60)}{rem.content.length > 60 ? "…" : ""}</span>
                  <span style={{ color: rem.backed ? GRN : DIM, fontSize: 9 }}>{rem.backed ? `${rem.signals.length} signal${rem.signals.length !== 1 ? "s" : ""}` : "UNLINKED"}</span>
                </div>

                {expanded === rem.id && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${CY}22`, paddingTop: 6 }}>
                    {rem.backed ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {rem.signals.map((s) => (
                          <div key={s.id} style={{ background: "rgba(0,229,160,0.04)", border: `1px solid ${(SEV_COLOR[s.severity] || CY)}33`, borderRadius: 4, padding: "5px 7px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ color: SEV_COLOR[s.severity] || CY, fontSize: 9, border: `1px solid ${(SEV_COLOR[s.severity] || CY)}44`, borderRadius: 3, padding: "1px 4px" }}>{s.severity}</span>
                              <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{s.title}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>hits: {s.hits}</span>
                            </div>
                            {s.source && (
                              <div style={{ color: DIM, fontSize: 9, marginTop: 2 }}>source: {s.source}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No risk signals matched this reminder — uncontextualised action item.</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* assess */}
          <div style={{ marginTop: 10, borderTop: `1px solid ${CY}22`, paddingTop: 8 }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{ background: `${CY}18`, border: `1px solid ${CY}55`, borderRadius: 5, color: CY, padding: "5px 12px", cursor: "pointer", fontSize: 10, letterSpacing: 1, width: "100%", opacity: assessing ? 0.6 : 1 }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, color: "#DCEBF5", fontSize: 10, lineHeight: 1.5, borderLeft: `2px solid ${CY}`, paddingLeft: 8 }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
