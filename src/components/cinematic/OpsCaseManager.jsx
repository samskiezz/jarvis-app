/**
 * OpsCaseManager — F229.
 *
 * Badge polls GET /v1/alerts?status=open every 60 s (red = open alerts > 0).
 * Panel has two tabs:
 *   ALERTS — GET /v1/alerts, ACK via POST /v1/alerts/{id}/ack
 *   CASES  — GET /v1/cases, status update via POST /v1/cases/{id}/status
 *
 * Stat tiles: open alerts / total alerts / open cases / closed cases.
 * Alert filters: ALL | OPEN | ACKED + search.
 * Case  filters: ALL | OPEN | CLOSED  + search.
 *
 * ⊡ OPCM button left:82400 bottom:8 zIndex:111.
 * jarvis:opcm-toggle event.
 *
 * Intent: "ops case / case manager / alerts board / active alerts /
 *          open cases / opcm / ops board / case board / alert queue /
 *          incident cases / operational cases / unacked alerts"
 *   → isOpcmQuery() + buildOpcmScript() wired in JarvisBrain.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00C878";
const RED    = "#FF3B3B";
const PURPLE = "#B06EFF";

const BTN_LEFT  = 82400;
const POLL_MS   = 60_000;
const API_KEY   =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── intent exports ───────────────────────────────────────────────────────────

const OPCM_RE =
  /\b(ops.?case|case.?manager|alerts?.?board|active.?alerts?|open.?cases?|opcm|ops.?board|case.?board|alert.?queue|incident.?cases?|operational.?cases?|unacked.?alerts?|case.?file|ops.?centre|alert.?summary)\b/i;

export function isOpcmQuery(t) { return OPCM_RE.test(t || ""); }

export async function buildOpcmScript() {
  try {
    const [ar, cr] = await Promise.all([
      fetch(`${apiBase()}/v1/alerts?status=open`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/v1/cases`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const alerts = ar.ok ? await ar.json() : null;
    const cases  = cr.ok ? await cr.json() : null;
    const openAlerts = alerts?.count ?? (alerts?.items?.length ?? 0);
    const totalCases  = cases?.count  ?? (cases?.items?.length ?? 0);
    const openCases   = (cases?.items ?? []).filter((c) => c.status === "open").length;
    window.dispatchEvent(new CustomEvent("jarvis:opcm-toggle"));
    if (openAlerts > 0) {
      return (
        `Sir, Ops Case Manager: ${openAlerts} open alert${openAlerts !== 1 ? "s" : ""} ` +
        `requiring attention. ${openCases} of ${totalCases} case${totalCases !== 1 ? "s" : ""} remain open. ` +
        "Opening Ops board now."
      );
    }
    if (openCases > 0) {
      return (
        `Alerts clear, sir. ${openCases} open case${openCases !== 1 ? "s" : ""} ` +
        `tracked across ${totalCases} total. Opening Ops Case Manager.`
      );
    }
    return `Ops Case Manager: all alerts acknowledged, all ${totalCases} case${totalCases !== 1 ? "s" : ""} closed. Opening board.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:opcm-toggle"));
    return "Ops Case Manager online. Opening now, sir.";
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtMs(ms) {
  if (!ms) return "—";
  try {
    const n = typeof ms === "string" ? parseInt(ms, 10) : ms;
    const d = new Date(n > 1e12 ? n : n * 1000);
    return d.toLocaleString("en-GB", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}

function normalise(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  return [];
}

function statusColor(s) {
  const v = (s || "").toLowerCase();
  if (v === "open")         return AMBER;
  if (v === "acked")        return GREEN;
  if (v === "closed")       return GREEN;
  if (v === "investigating") return PURPLE;
  return CY;
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatTile({ label, value, color }) {
  return (
    <div style={{
      flex: "1 1 76px", textAlign: "center",
      background: "rgba(255,255,255,0.03)", borderRadius: 8,
      border: `1px solid ${color}33`, padding: "10px 6px",
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color, letterSpacing: 1 }}>{value}</div>
      <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1.5, marginTop: 3, textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

function AlertRow({ item, onAck, acking }) {
  const sc = statusColor(item.status);
  const isOpen = (item.status || "").toLowerCase() === "open";
  return (
    <div style={{
      borderRadius: 8, border: `1px solid ${sc}33`, borderLeft: `3px solid ${sc}`,
      background: "rgba(255,255,255,0.02)", padding: "9px 12px", marginBottom: 7,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: sc, textTransform: "uppercase" }}>
          {item.status || "open"}
        </span>
        <span style={{ fontSize: 10, color: "#DCEBF5" }}>
          Rule #{item.rule_id ?? "?"}
        </span>
        <span style={{ fontSize: 9, color: "#445A6A", marginLeft: 4 }}>{fmtMs(item.fired_ts)}</span>
        {item.ack_by && (
          <span style={{ fontSize: 9, color: GREEN, marginLeft: "auto" }}>✓ {item.ack_by}</span>
        )}
        {isOpen && (
          <button
            disabled={acking === item.id}
            onClick={() => onAck(item.id)}
            style={{
              marginLeft: item.ack_by ? 0 : "auto",
              fontSize: 9, padding: "2px 8px", borderRadius: 4,
              border: `1px solid ${AMBER}66`, background: "rgba(245,166,35,0.08)",
              color: AMBER, cursor: acking === item.id ? "default" : "pointer",
              letterSpacing: 0.5, opacity: acking === item.id ? 0.5 : 1,
            }}
          >{acking === item.id ? "…" : "ACK"}</button>
        )}
      </div>
      {item.payload_json && typeof item.payload_json === "object" && Object.keys(item.payload_json).length > 0 && (
        <div style={{ marginTop: 4, fontSize: 9, color: "#445A6A", wordBreak: "break-all" }}>
          {JSON.stringify(item.payload_json).slice(0, 120)}
        </div>
      )}
    </div>
  );
}

const CASE_STATUSES = ["open", "investigating", "closed"];

function CaseRow({ item, onSetStatus, settingStatus }) {
  const [expanded, setExpanded] = useState(false);
  const sc = statusColor(item.status);
  const isSetting = settingStatus === item.id;
  return (
    <div style={{
      borderRadius: 8, border: `1px solid ${sc}33`, borderLeft: `3px solid ${sc}`,
      background: "rgba(255,255,255,0.02)", padding: "9px 12px", marginBottom: 7,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
          color: sc, textTransform: "uppercase",
        }}>{item.status || "open"}</span>
        <span
          style={{ fontSize: 11, color: "#DCEBF5", cursor: "pointer", flex: 1, minWidth: 0 }}
          onClick={() => setExpanded((v) => !v)}
        >{item.title || "Untitled"}</span>
        <span style={{ fontSize: 9, color: "#445A6A" }}>{fmtMs(item.created_ts)}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {CASE_STATUSES.map((s) => (
              <button
                key={s}
                disabled={isSetting || item.status === s}
                onClick={() => onSetStatus(item.id, s)}
                style={{
                  fontSize: 9, padding: "2px 8px", borderRadius: 4,
                  border: `1px solid ${statusColor(s)}66`,
                  background: item.status === s ? `${statusColor(s)}22` : "transparent",
                  color: item.status === s ? statusColor(s) : "#6E8AA0",
                  cursor: isSetting || item.status === s ? "default" : "pointer",
                  letterSpacing: 0.5,
                  opacity: isSetting ? 0.5 : 1,
                  textTransform: "uppercase",
                }}
              >{isSetting && item.status !== s ? "…" : s}</button>
            ))}
          </div>
          {Array.isArray(item.notes) && item.notes.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {item.notes.slice(-3).map((n, i) => (
                <div key={i} style={{ fontSize: 9, color: "#445A6A", marginBottom: 2 }}>
                  <span style={{ color: "#6E8AA0" }}>{n.by || "op"}: </span>
                  {n.text}
                </div>
              ))}
            </div>
          )}
          {Array.isArray(item.entity_ids) && item.entity_ids.length > 0 && (
            <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
              {item.entity_ids.map((e) => (
                <span key={e} style={{
                  fontSize: 9, color: CY, border: `1px solid ${CY}33`,
                  borderRadius: 3, padding: "1px 5px",
                }}>{e}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function OpsCaseManager() {
  const [open, setOpen]             = useState(false);
  const [tab, setTab]               = useState("ALERTS");
  const [alerts, setAlerts]         = useState([]);
  const [cases, setCases]           = useState([]);
  const [openCount, setOpenCount]   = useState(0);
  const [loadingA, setLoadingA]     = useState(false);
  const [loadingC, setLoadingC]     = useState(false);
  const [errorA, setErrorA]         = useState(null);
  const [errorC, setErrorC]         = useState(null);
  const [filterA, setFilterA]       = useState("ALL");
  const [filterC, setFilterC]       = useState("ALL");
  const [searchA, setSearchA]       = useState("");
  const [searchC, setSearchC]       = useState("");
  const [acking, setAcking]         = useState(null);
  const [settingStatus, setSettingStatus] = useState(null);
  const pollTimer = useRef(null);

  // 60-s badge poll: open alerts count
  const pollBadge = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase()}/v1/alerts?status=open`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) return;
      const d = await r.json();
      setOpenCount(d.count ?? normalise(d).length);
    } catch {}
  }, []);

  useEffect(() => {
    pollBadge();
    pollTimer.current = setInterval(pollBadge, POLL_MS);
    return () => clearInterval(pollTimer.current);
  }, [pollBadge]);

  // load alerts
  const fetchAlerts = useCallback(async () => {
    setLoadingA(true); setErrorA(null);
    try {
      const r = await fetch(`${apiBase()}/v1/alerts`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setAlerts(normalise(d));
    } catch (e) { setErrorA(e.message); }
    finally { setLoadingA(false); }
  }, []);

  // load cases
  const fetchCases = useCallback(async () => {
    setLoadingC(true); setErrorC(null);
    try {
      const r = await fetch(`${apiBase()}/v1/cases`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setCases(normalise(d));
    } catch (e) { setErrorC(e.message); }
    finally { setLoadingC(false); }
  }, []);

  useEffect(() => {
    if (open) { fetchAlerts(); fetchCases(); }
  }, [open, fetchAlerts, fetchCases]);

  // toggle via event
  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:opcm-toggle", onToggle);
    return () => window.removeEventListener("jarvis:opcm-toggle", onToggle);
  }, []);

  // ACK an alert
  async function handleAck(id) {
    if (!id) return;
    setAcking(id);
    try {
      await fetch(`${apiBase()}/v1/alerts/${id}/ack?by=operator`, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, status: "acked", ack_by: "operator" } : a));
      pollBadge();
    } catch {}
    setAcking(null);
  }

  // Set case status
  async function handleSetStatus(id, newStatus) {
    if (!id) return;
    setSettingStatus(id);
    try {
      await fetch(`${apiBase()}/v1/cases/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ status: newStatus }),
      });
      setCases((prev) => prev.map((c) => c.id === id ? { ...c, status: newStatus } : c));
    } catch {}
    setSettingStatus(null);
  }

  // stat counts
  const openAlerts  = alerts.filter((a) => (a.status || "").toLowerCase() === "open").length;
  const totalAlerts = alerts.length;
  const openCases   = cases.filter((c) => (c.status || "").toLowerCase() === "open").length;
  const closedCases = cases.filter((c) => (c.status || "").toLowerCase() === "closed").length;

  // filtered alerts
  const visAlerts = alerts.filter((a) => {
    const s = (a.status || "").toLowerCase();
    if (filterA === "OPEN"  && s !== "open")  return false;
    if (filterA === "ACKED" && s !== "acked") return false;
    if (searchA.trim()) {
      const q = searchA.toLowerCase();
      return (
        String(a.rule_id ?? "").includes(q) ||
        (a.status || "").toLowerCase().includes(q) ||
        (a.ack_by  || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  // filtered cases
  const visCases = cases.filter((c) => {
    const s = (c.status || "").toLowerCase();
    if (filterC === "OPEN"   && s !== "open")   return false;
    if (filterC === "CLOSED" && s !== "closed")  return false;
    if (searchC.trim()) {
      const q = searchC.toLowerCase();
      return (
        (c.title  || "").toLowerCase().includes(q) ||
        (c.status || "").toLowerCase().includes(q) ||
        (c.entity_ids ?? []).some((e) => e.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const badgeColor = openCount > 0 ? RED : null;
  const loading = tab === "ALERTS" ? loadingA : loadingC;
  const error   = tab === "ALERTS" ? errorA   : errorC;

  return (
    <>
      <style>{`
        @keyframes jpulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.5);opacity:.5}}
        @keyframes ofade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {/* dock button */}
      <div style={{
        position: "fixed",
        left: `min(${BTN_LEFT}px, calc(100vw - 110px))`,
        bottom: 8, zIndex: 111,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        <button
          onClick={() => setOpen((v) => !v)}
          title="Ops Case Manager"
          style={{
            position: "relative",
            background: open ? CY : "rgba(5,8,13,0.8)",
            color: open ? "#04060A" : CY,
            border: `1px solid ${CY}`,
            borderRadius: 6, padding: "3px 10px",
            fontSize: 11, letterSpacing: 1.5, cursor: "pointer",
            boxShadow: `0 0 18px ${CY}${open ? "99" : "44"}`,
            backdropFilter: "blur(6px)",
          }}
        >
          ⊡ OPCM
          {badgeColor && (
            <span style={{
              position: "absolute", top: -5, right: -6,
              background: badgeColor, color: "#fff",
              borderRadius: "50%", width: 16, height: 16,
              fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, boxShadow: `0 0 8px ${badgeColor}`,
              animation: "jpulse 1.5s ease-in-out infinite",
            }}>{openCount > 9 ? "9+" : openCount}</span>
          )}
        </button>
      </div>

      {/* panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 44, right: 18, zIndex: 110,
          width: "min(560px, 96vw)",
          maxHeight: "80vh",
          background: "rgba(5,9,16,0.96)",
          border: `1px solid ${CY}44`,
          borderRadius: 14, overflow: "hidden",
          boxShadow: `0 0 60px ${CY}18`,
          display: "flex", flexDirection: "column",
          fontFamily: "'JetBrains Mono', monospace",
          animation: "ofade 0.2s ease-out",
        }}>
          {/* header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 16px",
            borderBottom: `1px solid ${CY}22`,
            background: "rgba(41,231,255,0.04)",
            flexShrink: 0,
          }}>
            <span style={{ color: CY, fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>⊡ OPS</span>
            <span style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>CASE MANAGER</span>
            <button
              onClick={() => setOpen(false)}
              style={{ marginLeft: "auto", background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 16, padding: 0 }}
            >×</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "12px 16px 0", flexShrink: 0 }}>
            <StatTile label="Open Alerts"  value={openAlerts}  color={openAlerts > 0 ? RED : CY} />
            <StatTile label="Total Alerts" value={totalAlerts} color={CY}    />
            <StatTile label="Open Cases"   value={openCases}   color={openCases > 0 ? AMBER : CY} />
            <StatTile label="Closed"       value={closedCases} color={GREEN} />
          </div>

          {/* tabs */}
          <div style={{ display: "flex", gap: 0, padding: "10px 16px 0", flexShrink: 0 }}>
            {["ALERTS", "CASES"].map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "4px 18px", fontSize: 10, letterSpacing: 1.5,
                border: `1px solid ${tab === t ? CY : CY + "33"}`,
                borderBottom: "none",
                borderRadius: "5px 5px 0 0",
                background: tab === t ? CY + "22" : "transparent",
                color: tab === t ? CY : "#6E8AA0", cursor: "pointer",
                marginRight: 2,
              }}>{t}</button>
            ))}
            <div style={{ flex: 1, borderBottom: `1px solid ${CY}33` }} />
          </div>

          {/* filters for current tab */}
          {tab === "ALERTS" && (
            <div style={{ display: "flex", gap: 6, padding: "8px 16px 0", flexShrink: 0, alignItems: "center" }}>
              {["ALL", "OPEN", "ACKED"].map((f) => (
                <button key={f} onClick={() => setFilterA(f)} style={{
                  padding: "3px 10px", borderRadius: 5, fontSize: 10, letterSpacing: 1,
                  border: `1px solid ${filterA === f ? CY : CY + "33"}`,
                  background: filterA === f ? CY + "22" : "transparent",
                  color: filterA === f ? CY : "#6E8AA0", cursor: "pointer",
                }}>{f}</button>
              ))}
              <input
                value={searchA}
                onChange={(e) => setSearchA(e.target.value)}
                placeholder="search…"
                style={{
                  marginLeft: "auto", background: "rgba(41,231,255,0.06)",
                  border: `1px solid ${CY}33`, borderRadius: 5,
                  color: "#DCEBF5", fontSize: 10, padding: "3px 8px",
                  outline: "none", width: 100,
                }}
              />
              <button onClick={fetchAlerts} disabled={loadingA} style={{
                background: "none", border: `1px solid ${CY}44`, borderRadius: 5,
                color: CY, cursor: loadingA ? "default" : "pointer",
                fontSize: 10, padding: "3px 8px", opacity: loadingA ? 0.5 : 1,
              }}>{loadingA ? "…" : "↺"}</button>
            </div>
          )}
          {tab === "CASES" && (
            <div style={{ display: "flex", gap: 6, padding: "8px 16px 0", flexShrink: 0, alignItems: "center" }}>
              {["ALL", "OPEN", "CLOSED"].map((f) => (
                <button key={f} onClick={() => setFilterC(f)} style={{
                  padding: "3px 10px", borderRadius: 5, fontSize: 10, letterSpacing: 1,
                  border: `1px solid ${filterC === f ? CY : CY + "33"}`,
                  background: filterC === f ? CY + "22" : "transparent",
                  color: filterC === f ? CY : "#6E8AA0", cursor: "pointer",
                }}>{f}</button>
              ))}
              <input
                value={searchC}
                onChange={(e) => setSearchC(e.target.value)}
                placeholder="search…"
                style={{
                  marginLeft: "auto", background: "rgba(41,231,255,0.06)",
                  border: `1px solid ${CY}33`, borderRadius: 5,
                  color: "#DCEBF5", fontSize: 10, padding: "3px 8px",
                  outline: "none", width: 100,
                }}
              />
              <button onClick={fetchCases} disabled={loadingC} style={{
                background: "none", border: `1px solid ${CY}44`, borderRadius: 5,
                color: CY, cursor: loadingC ? "default" : "pointer",
                fontSize: 10, padding: "3px 8px", opacity: loadingC ? 0.5 : 1,
              }}>{loadingC ? "…" : "↺"}</button>
            </div>
          )}

          {/* list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 16px 14px" }}>
            {loading && (
              <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 12, padding: "24px 0" }}>
                Loading {tab === "ALERTS" ? "alerts" : "cases"}…
              </div>
            )}
            {!loading && error && (
              <div style={{ color: RED, fontSize: 11, padding: "12px 0" }}>Error: {error}</div>
            )}
            {!loading && !error && tab === "ALERTS" && visAlerts.length === 0 && (
              <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 12, padding: "24px 0" }}>
                {alerts.length === 0 ? "No alerts on record." : "No alerts match filter."}
              </div>
            )}
            {!loading && !error && tab === "CASES" && visCases.length === 0 && (
              <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 12, padding: "24px 0" }}>
                {cases.length === 0 ? "No cases on record." : "No cases match filter."}
              </div>
            )}
            {!loading && tab === "ALERTS" && visAlerts.map((a) => (
              <AlertRow key={a.id} item={a} onAck={handleAck} acking={acking} />
            ))}
            {!loading && tab === "CASES" && visCases.map((c) => (
              <CaseRow key={c.id} item={c} onSetStatus={handleSetStatus} settingStatus={settingStatus} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
