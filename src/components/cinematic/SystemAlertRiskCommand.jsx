/**
 * F108 — System Status × Alert × Risk Signal Command Center (SARC)
 *
 * Parallel-fetches three real endpoints every 60 s:
 *   /v1/jarvis/system/status  — per-service health + cpu/mem/load
 *   /v1/alerts                — active alerts list
 *   /entities/RiskSignal      — risk signals by severity
 *
 * Computes an overall DEFCON state:
 *   DEFCON 1 (RED)    — any service DOWN or CRITICAL alert or critical risk
 *   DEFCON 2 (AMBER)  — any service DEGRADED or HIGH alert or high risk
 *   DEFCON 3 (CYAN)   — warnings / medium risks
 *   DEFCON 4 (GREEN)  — all clear
 *
 * Button: ◉ SARC  left:3600 bottom:18 zIndex:68
 * Event:  jarvis:sarc-toggle
 * Intents: sarc / system command / command center / operational status /
 *          defcon / system alert risk / sarc center / ops command
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AMB = "#FFD700";
const GRN = "#00E5A0";
const RED = "#FF4466";
const DIM = "#5A7A9A";
const POLL = 60_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const hdrs = { Authorization: `Bearer ${API_KEY}` };

const SARC_RE =
  /\b(sarc|system[._\s]?alert[._\s]?risk|command[._\s]?center|operational[._\s]?status|defcon|ops[._\s]?command|sarc[._\s]?center|system[._\s]?command)\b/i;

export function isSarcQuery(t) { return SARC_RE.test(t || ""); }

function defconLevel(services, alerts, risks) {
  const down = services.filter(s => {
    const st = String(s.status || s.state || "").toLowerCase();
    return st === "down" || st === "error" || st === "failed";
  });
  const critical_alerts = alerts.filter(a => {
    const sev = String(a.severity || a.level || "").toLowerCase();
    return sev === "critical";
  });
  const critical_risks = risks.filter(r => {
    const sev = String(r.severity || "").toUpperCase();
    return sev === "CRITICAL";
  });
  const high_alerts = alerts.filter(a => {
    const sev = String(a.severity || a.level || "").toLowerCase();
    return sev === "high";
  });
  const high_risks = risks.filter(r => {
    const sev = String(r.severity || "").toUpperCase();
    return sev === "HIGH";
  });
  const degraded = services.filter(s => {
    const st = String(s.status || s.state || "").toLowerCase();
    return st === "degraded" || st === "warning" || st === "slow";
  });

  if (down.length > 0 || critical_alerts.length > 0 || critical_risks.length > 0) return 1;
  if (degraded.length > 0 || high_alerts.length > 0 || high_risks.length > 0) return 2;
  const warn_alerts = alerts.filter(a => {
    const sev = String(a.severity || a.level || "").toLowerCase();
    return sev === "warning" || sev === "medium";
  });
  const med_risks = risks.filter(r => {
    const sev = String(r.severity || "").toUpperCase();
    return sev === "MEDIUM";
  });
  if (warn_alerts.length > 0 || med_risks.length > 0) return 3;
  return 4;
}

function defconColor(lvl) {
  if (lvl === 1) return RED;
  if (lvl === 2) return AMB;
  if (lvl === 3) return CY;
  return GRN;
}

function defconLabel(lvl) {
  if (lvl === 1) return "DEFCON 1 — CRITICAL";
  if (lvl === 2) return "DEFCON 2 — ELEVATED";
  if (lvl === 3) return "DEFCON 3 — GUARDED";
  return "DEFCON 4 — ALL CLEAR";
}

export async function buildSarcScript() {
  try {
    const base = apiBase();
    const [sr, ar, rr] = await Promise.all([
      fetch(`${base}/v1/jarvis/system/status`, { headers: hdrs }),
      fetch(`${base}/v1/alerts`, { headers: hdrs }),
      fetch(`${base}/entities/RiskSignal`, { headers: hdrs }),
    ]);
    const [sd, ad, rd] = await Promise.all([sr.json(), ar.json(), rr.json()]);
    const services = Array.isArray(sd.services) ? sd.services :
      (Array.isArray(sd) ? sd : []);
    const alerts = Array.isArray(ad) ? ad : ad.alerts || ad.results || [];
    const risks = Array.isArray(rd) ? rd : rd.items || rd.results || [];
    const lvl = defconLevel(services, alerts, risks);
    const down = services.filter(s => {
      const st = String(s.status || s.state || "").toLowerCase();
      return st === "down" || st === "error" || st === "failed";
    }).length;
    const crit_a = alerts.filter(a => String(a.severity || a.level || "").toLowerCase() === "critical").length;
    const crit_r = risks.filter(r => String(r.severity || "").toUpperCase() === "CRITICAL").length;
    return `SARC Command Center: ${defconLabel(lvl)}. System — ${services.length} services monitored, ${down} DOWN. Alerts — ${alerts.length} active, ${crit_a} critical. Risk signals — ${risks.length} tracked, ${crit_r} critical. ${lvl <= 2 ? `Immediate attention required: ${down} service(s) down, ${crit_a} critical alert(s), ${crit_r} critical risk(s).` : lvl === 3 ? "Operational posture guarded — monitor for escalation." : "All systems nominal. Posture clear."}`;
  } catch {
    return "System, alert, and risk data temporarily unavailable.";
  }
}

/* ── styles ──────────────────────────────────────────────────── */
const BTN_BASE = {
  position: "fixed", left: 3600, bottom: 18, zIndex: 68,
  background: "rgba(0,20,40,0.82)", border: `1px solid ${CY}44`,
  color: CY, fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
  letterSpacing: 1.4, padding: "4px 8px", cursor: "pointer",
  borderRadius: 3, userSelect: "none",
};
const PANEL = {
  position: "fixed", bottom: 52, left: 3490, width: 460,
  background: "rgba(0,8,20,0.97)", border: `1px solid ${CY}55`,
  borderRadius: 6, zIndex: 200, fontFamily: "'JetBrains Mono',monospace",
  color: CY, fontSize: 10, padding: 14, maxHeight: 560, overflowY: "auto",
};
const HDR = {
  fontSize: 10, letterSpacing: 2, color: CY, marginBottom: 10,
  borderBottom: `1px solid ${CY}33`, paddingBottom: 6,
};
const TILE_ROW = {
  display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10,
};
const TILE = {
  background: "rgba(0,30,60,0.6)", borderRadius: 4, padding: "6px 8px",
  border: `1px solid ${CY}22`, textAlign: "center",
};
const ROW_ST = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "3px 0", borderBottom: `1px solid ${CY}14`,
};
const SECTION_HDR = {
  fontSize: 9, letterSpacing: 1.5, color: DIM, marginTop: 8, marginBottom: 4,
};

function statusColor(s) {
  const st = String(s || "").toLowerCase();
  if (st === "ok" || st === "healthy" || st === "running" || st === "online") return GRN;
  if (st === "degraded" || st === "warning" || st === "slow") return AMB;
  if (st === "down" || st === "error" || st === "failed") return RED;
  return DIM;
}

function alertColor(sev) {
  const s = String(sev || "").toLowerCase();
  if (s === "critical") return RED;
  if (s === "high") return AMB;
  if (s === "warning" || s === "medium") return CY;
  return DIM;
}

function riskColor(sev) {
  const s = String(sev || "").toUpperCase();
  if (s === "CRITICAL") return RED;
  if (s === "HIGH") return AMB;
  if (s === "MEDIUM") return CY;
  return DIM;
}

/* ── component ───────────────────────────────────────────────── */
export default function SystemAlertRiskCommand() {
  const [open, setOpen] = useState(false);
  const [services, setServices] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [risks, setRisks] = useState([]);
  const [sysRaw, setSysRaw] = useState({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const base = apiBase();
      const [sr, ar, rr] = await Promise.all([
        fetch(`${base}/v1/jarvis/system/status`, { headers: hdrs }),
        fetch(`${base}/v1/alerts`, { headers: hdrs }),
        fetch(`${base}/entities/RiskSignal`, { headers: hdrs }),
      ]);
      const [sd, ad, rd] = await Promise.all([sr.json(), ar.json(), rr.json()]);
      setSysRaw(sd);
      setServices(Array.isArray(sd.services) ? sd.services : (Array.isArray(sd) ? sd : []));
      setAlerts(Array.isArray(ad) ? ad : ad.alerts || ad.results || []);
      setRisks(Array.isArray(rd) ? rd : rd.items || rd.results || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:sarc-toggle", onToggle);
    return () => window.removeEventListener("jarvis:sarc-toggle", onToggle);
  }, []);

  const lvl = defconLevel(services, alerts, risks);
  const defCol = defconColor(lvl);
  const defLbl = defconLabel(lvl);

  /* counts */
  const svcDown = services.filter(s => {
    const st = String(s.status || s.state || "").toLowerCase();
    return st === "down" || st === "error" || st === "failed";
  }).length;
  const critAlerts = alerts.filter(a => String(a.severity || a.level || "").toLowerCase() === "critical").length;
  const critRisks = risks.filter(r => String(r.severity || "").toUpperCase() === "CRITICAL").length;

  /* filtered lists by active tab */
  const TABS = ["ALL", "SERVICES", "ALERTS", "RISKS"];

  const filteredServices = services.filter(s => {
    if (!search) return true;
    return String(s.service || s.name || "").toLowerCase().includes(search.toLowerCase());
  });
  const filteredAlerts = alerts.filter(a => {
    if (!search) return true;
    return [a.category, a.type, a.message, a.title, a.source]
      .join(" ").toLowerCase().includes(search.toLowerCase());
  });
  const filteredRisks = risks.filter(r => {
    if (!search) return true;
    return [r.title, r.description, r.severity, r.category]
      .join(" ").toLowerCase().includes(search.toLowerCase());
  });

  const handleAssess = async () => {
    setAssessing(true); setAssessment("");
    try {
      const script = await buildSarcScript();
      setAssessment(script);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch (e) {
      setAssessment("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  };

  return (
    <>
      <button
        style={{
          ...BTN_BASE,
          borderColor: lvl === 1 ? `${RED}88` : lvl === 2 ? `${AMB}88` : `${CY}44`,
          color: defCol,
        }}
        onClick={() => setOpen(o => !o)}
        title="System Alert Risk Command Center"
      >
        {lvl <= 2 && (
          <span style={{
            display: "inline-block", width: 6, height: 6, borderRadius: "50%",
            background: defCol, marginRight: 4,
            animation: "sarc-pulse 1s ease-in-out infinite alternate",
          }} />
        )}
        ◉ SARC
        {(svcDown > 0 || critAlerts > 0 || critRisks > 0) && (
          <span style={{
            marginLeft: 4, background: RED, color: "#fff",
            borderRadius: 8, padding: "0 5px", fontSize: 8,
          }}>
            {svcDown + critAlerts + critRisks}
          </span>
        )}
        <style>{`@keyframes sarc-pulse{from{opacity:1}to{opacity:0.3}}`}</style>
      </button>

      {open && (
        <div style={PANEL}>
          {/* header */}
          <div style={HDR}>
            ◉ SARC — SYSTEM ALERT RISK COMMAND
            <span style={{ float: "right", color: DIM, fontSize: 8, cursor: "pointer" }}
              onClick={() => setOpen(false)}>✕ CLOSE</span>
          </div>

          {/* DEFCON banner */}
          <div style={{
            background: `${defCol}18`, border: `1px solid ${defCol}55`,
            borderRadius: 4, padding: "8px 12px", marginBottom: 10,
            textAlign: "center", fontSize: 11, letterSpacing: 2, color: defCol,
            fontWeight: "bold",
          }}>
            {defLbl}
          </div>

          {/* stat tiles */}
          <div style={TILE_ROW}>
            <div style={{ ...TILE, borderColor: svcDown > 0 ? `${RED}55` : `${GRN}33` }}>
              <div style={{ fontSize: 14, color: svcDown > 0 ? RED : GRN }}>{svcDown}</div>
              <div style={{ color: DIM, fontSize: 8 }}>SVCS DOWN</div>
            </div>
            <div style={{ ...TILE, borderColor: critAlerts > 0 ? `${RED}55` : `${CY}22` }}>
              <div style={{ fontSize: 14, color: critAlerts > 0 ? RED : CY }}>{critAlerts}</div>
              <div style={{ color: DIM, fontSize: 8 }}>CRIT ALERTS</div>
            </div>
            <div style={{ ...TILE, borderColor: critRisks > 0 ? `${RED}55` : `${CY}22` }}>
              <div style={{ fontSize: 14, color: critRisks > 0 ? RED : CY }}>{critRisks}</div>
              <div style={{ color: DIM, fontSize: 8 }}>CRIT RISKS</div>
            </div>
          </div>

          {/* secondary tiles */}
          <div style={TILE_ROW}>
            <div style={TILE}>
              <div style={{ fontSize: 13, color: CY }}>{services.length}</div>
              <div style={{ color: DIM, fontSize: 8 }}>SERVICES</div>
            </div>
            <div style={{ ...TILE }}>
              <div style={{ fontSize: 13, color: AMB }}>{alerts.length}</div>
              <div style={{ color: DIM, fontSize: 8 }}>ALERTS</div>
            </div>
            <div style={TILE}>
              <div style={{ fontSize: 13, color: AMB }}>{risks.length}</div>
              <div style={{ color: DIM, fontSize: 8 }}>RISK SIGNALS</div>
            </div>
          </div>

          {/* system cpu/mem if present */}
          {(sysRaw.cpu_percent !== undefined || sysRaw.memory_percent !== undefined) && (
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              {sysRaw.cpu_percent !== undefined && (
                <div style={{ ...TILE, flex: 1 }}>
                  <div style={{ fontSize: 13, color: sysRaw.cpu_percent > 80 ? RED : sysRaw.cpu_percent > 60 ? AMB : GRN }}>
                    {Number(sysRaw.cpu_percent).toFixed(1)}%
                  </div>
                  <div style={{ color: DIM, fontSize: 8 }}>CPU</div>
                </div>
              )}
              {sysRaw.memory_percent !== undefined && (
                <div style={{ ...TILE, flex: 1 }}>
                  <div style={{ fontSize: 13, color: sysRaw.memory_percent > 85 ? RED : sysRaw.memory_percent > 70 ? AMB : GRN }}>
                    {Number(sysRaw.memory_percent).toFixed(1)}%
                  </div>
                  <div style={{ color: DIM, fontSize: 8 }}>MEM</div>
                </div>
              )}
            </div>
          )}

          {/* tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {TABS.map(t => (
              <button key={t}
                style={{
                  flex: 1, padding: "3px 0", fontSize: 8, cursor: "pointer",
                  background: filter === t ? `${CY}22` : "transparent",
                  border: filter === t ? `1px solid ${CY}55` : `1px solid ${DIM}33`,
                  color: filter === t ? CY : DIM, borderRadius: 3,
                  fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1,
                }}
                onClick={() => setFilter(t)}
              >{t}</button>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="filter…"
            style={{
              width: "100%", marginBottom: 8, padding: "4px 6px",
              background: "rgba(0,30,60,0.5)", border: `1px solid ${CY}33`,
              color: CY, fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
              borderRadius: 3, boxSizing: "border-box",
            }}
          />

          {loading && <div style={{ color: DIM, fontSize: 9 }}>◌ loading…</div>}
          {err && <div style={{ color: RED, fontSize: 9 }}>⚠ {err}</div>}

          {/* services section */}
          {(filter === "ALL" || filter === "SERVICES") && filteredServices.length > 0 && (
            <>
              <div style={SECTION_HDR}>— SERVICES ({filteredServices.length}) —</div>
              {filteredServices.map((s, i) => {
                const name = s.service || s.name || `svc-${i}`;
                const st = s.status || s.state || "unknown";
                const col = statusColor(st);
                return (
                  <div key={i} style={ROW_ST}>
                    <span style={{ color: col }}>⬤</span>
                    <span style={{ flex: 1, marginLeft: 6, color: CY }}>{name}</span>
                    <span style={{ color: col, fontSize: 8, letterSpacing: 1 }}>{String(st).toUpperCase()}</span>
                  </div>
                );
              })}
            </>
          )}

          {/* alerts section */}
          {(filter === "ALL" || filter === "ALERTS") && filteredAlerts.length > 0 && (
            <>
              <div style={SECTION_HDR}>— ALERTS ({filteredAlerts.length}) —</div>
              {filteredAlerts.slice(0, 8).map((a, i) => {
                const sev = a.severity || a.level || "info";
                const col = alertColor(sev);
                const label = a.title || a.message || a.category || `alert-${i}`;
                return (
                  <div key={i} style={ROW_ST}>
                    <span style={{ color: col, fontSize: 8, letterSpacing: 1, minWidth: 48 }}>
                      {String(sev).toUpperCase()}
                    </span>
                    <span style={{ flex: 1, marginLeft: 6, color: CY, fontSize: 9 }}>
                      {String(label).slice(0, 52)}
                    </span>
                  </div>
                );
              })}
              {filteredAlerts.length > 8 && (
                <div style={{ color: DIM, fontSize: 8, textAlign: "center", marginTop: 4 }}>
                  +{filteredAlerts.length - 8} more alerts
                </div>
              )}
            </>
          )}

          {/* risks section */}
          {(filter === "ALL" || filter === "RISKS") && filteredRisks.length > 0 && (
            <>
              <div style={SECTION_HDR}>— RISK SIGNALS ({filteredRisks.length}) —</div>
              {filteredRisks.slice(0, 8).map((r, i) => {
                const sev = r.severity || "INFO";
                const col = riskColor(sev);
                const label = r.title || r.name || `risk-${i}`;
                return (
                  <div key={i} style={ROW_ST}>
                    <span style={{ color: col, fontSize: 8, letterSpacing: 1, minWidth: 56 }}>
                      {String(sev).toUpperCase()}
                    </span>
                    <span style={{ flex: 1, marginLeft: 6, color: CY, fontSize: 9 }}>
                      {String(label).slice(0, 52)}
                    </span>
                  </div>
                );
              })}
              {filteredRisks.length > 8 && (
                <div style={{ color: DIM, fontSize: 8, textAlign: "center", marginTop: 4 }}>
                  +{filteredRisks.length - 8} more risk signals
                </div>
              )}
            </>
          )}

          {/* empty state */}
          {!loading && !err && services.length === 0 && alerts.length === 0 && risks.length === 0 && (
            <div style={{ color: DIM, fontSize: 9, textAlign: "center", padding: 12 }}>
              No data — backend may be offline
            </div>
          )}

          {/* assess */}
          <div style={{ marginTop: 10, borderTop: `1px solid ${CY}22`, paddingTop: 8 }}>
            <button
              onClick={handleAssess}
              disabled={assessing}
              style={{
                width: "100%", padding: "5px 0", fontSize: 9, cursor: "pointer",
                background: `${CY}18`, border: `1px solid ${CY}55`,
                color: CY, borderRadius: 3,
                fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1,
                opacity: assessing ? 0.5 : 1,
              }}
            >
              {assessing ? "◌ ASSESSING…" : "▶ ASSESS — JARVIS OPERATIONAL BRIEF"}
            </button>
            {assessment && (
              <div style={{
                marginTop: 6, fontSize: 9, color: GRN, lineHeight: 1.5,
                background: "rgba(0,229,160,0.05)", borderRadius: 3, padding: 6,
                border: `1px solid ${GRN}22`,
              }}>
                {assessment}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
