/**
 * SecurityAuditConsole — F478
 * Fetches /v1/security/audit + /v1/security/compliance/status and renders a
 * JARVIS security audit console: compliance scorecard + scrollable hash-chained
 * audit trail.
 * Voice: "JARVIS, security audit / audit log / compliance / sec audit / audit chain /
 *         chain integrity / saudit / audit trail"
 * Toggle: jarvis:security-audit-toggle  |  ◈ SAUDIT button
 * Additive only — mounted via App.jsx; helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const YLW = "#FFD700";
const RED = "#FF3B3B";
const DIM = "#3A4A5A";
const BG  = "rgba(4,8,14,0.93)";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 120_000;
const BTN_LEFT = 12640;

const SAUDIT_RE =
  /\bsecurity.audit\b|\baudit.log\b|\baudit.chain\b|\bchain.integrity\b|\bsaudit\b|\baudit.trail\b|\bcompliance.status\b|\bsec.audit\b|\bsecurity.log\b|\baudit.ledger\b/i;

export function isSecurityAuditQuery(text) {
  return SAUDIT_RE.test(text || "");
}

function formatTs(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleTimeString("en-GB", {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch (_) { return String(ts).slice(0, 19); }
}

function normaliseAuditItems(data) {
  if (!data) return [];
  const chain  = (data.audit_chain?.items || []).map(r => ({
    ...r,
    _source: "audit",
    actor:  r.actor   || "system",
    action: r.action  || r.event || "—",
    object: r.object  || r.resource || "—",
    ts:     r.timestamp || r.ts || null,
  }));
  const revdb  = (data.revdb?.items || []).map(r => ({
    ...r,
    _source: "revdb",
    actor:  r.author  || r.actor || "system",
    action: r.message || r.action || "commit",
    object: r.id      || "—",
    ts:     r.timestamp || null,
  }));
  const merged = [...chain, ...revdb].sort((a, b) => {
    const ta = a.ts ? new Date(a.ts).getTime() : 0;
    const tb = b.ts ? new Date(b.ts).getTime() : 0;
    return tb - ta;
  });
  return merged;
}

export async function buildSecurityAuditScript() {
  let audit = null;
  let compliance = null;
  try {
    const [ra, rc] = await Promise.all([
      fetch(`${apiBase()}/v1/security/audit?n=20`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${apiBase()}/v1/security/compliance/status`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    if (ra.ok) audit      = await ra.json();
    if (rc.ok) compliance = await rc.json();
  } catch (_) {}

  window.dispatchEvent(new CustomEvent("jarvis:security-audit-toggle"));

  if (!audit && !compliance) {
    return "Unable to retrieve security audit data at this time, sir.";
  }

  const chainOk     = compliance?.audit?.chain_integrity ?? false;
  const chainLen    = compliance?.audit?.chain_length ?? 0;
  const overall     = compliance?.overall ?? "unknown";
  const auditCount  = audit?.audit_chain?.count ?? 0;
  const revdbCount  = audit?.revdb?.count ?? 0;
  const statusWord  = chainOk ? "intact" : "BROKEN";

  return (
    `Security audit console online, sir. Audit chain ${statusWord} — ${chainLen} records verified. ` +
    `${auditCount} audit events on record, ${revdbCount} revision commits tracked. ` +
    `Overall compliance posture: ${overall}. ` +
    "Audit console is now open."
  );
}

export default function SecurityAuditConsole() {
  const [open, setOpen]           = useState(false);
  const [audit, setAudit]         = useState(null);
  const [compliance, setCompliance] = useState(null);
  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState(null);
  const [tab, setTab]             = useState("ALL");

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [ra, rc] = await Promise.all([
        fetch(`${apiBase()}/v1/security/audit?n=100`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
        fetch(`${apiBase()}/v1/security/compliance/status`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
      ]);
      if (!ra.ok) throw new Error(`audit HTTP ${ra.status}`);
      if (!rc.ok) throw new Error(`compliance HTTP ${rc.status}`);
      const ad = await ra.json();
      const cd = await rc.json();
      setAudit(ad);
      setCompliance(cd);
      setItems(normaliseAuditItems(ad));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener("jarvis:security-audit-toggle", toggle);
    return () => window.removeEventListener("jarvis:security-audit-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const chainOk  = compliance?.audit?.chain_integrity ?? null;
  const chainLen = compliance?.audit?.chain_length ?? 0;
  const overall  = compliance?.overall ?? "—";
  const tenants  = compliance?.tenancy?.tenant_count ?? 0;
  const shares   = compliance?.cross_org?.active_shares ?? 0;

  const visible = tab === "ALL"
    ? items
    : items.filter(r => r._source === (tab === "AUDIT" ? "audit" : "revdb"));

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Security Audit Console"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 73,
          background: "rgba(4,8,14,0.82)", border: `1px solid ${CY}55`,
          color: CY, fontSize: 10, padding: "3px 7px", borderRadius: 4,
          cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
          letterSpacing: 1, whiteSpace: "nowrap",
        }}
      >
        ◈ SAUDIT
        {chainOk === false && (
          <span style={{
            marginLeft: 5, background: RED, color: "#fff",
            borderRadius: 8, padding: "0px 5px", fontSize: 9, fontWeight: 700,
          }}>!</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", right: 18, top: 18, zIndex: 73,
      width: "min(600px,94vw)", maxHeight: "90vh",
      background: BG, border: `1px solid ${CY}44`, borderRadius: 14,
      backdropFilter: "blur(14px)", boxShadow: `0 0 70px ${CY}18`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
        padding: "12px 16px", borderBottom: `1px solid ${CY}22`,
      }}>
        <span style={{ color: CY, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>
          ◈ SECURITY AUDIT CONSOLE
        </span>
        <span style={{
          background: chainOk === true  ? `${GRN}22` :
                      chainOk === false ? `${RED}22` : `${DIM}44`,
          color:      chainOk === true  ? GRN :
                      chainOk === false ? RED : "#6E8AA0",
          borderRadius: 10, padding: "1px 8px", fontSize: 10,
          letterSpacing: 1,
        }}>
          {chainOk === true ? "CHAIN OK" : chainOk === false ? "CHAIN BROKEN" : "checking…"}
        </span>
        <button
          onClick={load}
          style={{
            marginLeft: "auto", background: "none", border: `1px solid ${DIM}`,
            color: "#6E8AA0", borderRadius: 4, padding: "2px 7px",
            fontSize: 10, cursor: "pointer",
          }}
          title="Refresh"
        >↻</button>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: "none", border: "none",
            color: "#6E8AA0", cursor: "pointer", fontSize: 16, lineHeight: 1,
          }}
        >✕</button>
      </div>

      {/* Compliance scorecard */}
      {compliance && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4,1fr)",
          gap: 8, padding: "10px 14px", borderBottom: `1px solid ${CY}11`, flexShrink: 0,
        }}>
          {[
            { label: "CHAIN", value: chainLen, sub: chainOk === true ? "intact" : chainOk === false ? "broken" : "—", color: chainOk === true ? GRN : chainOk === false ? RED : CY },
            { label: "OVERALL", value: overall.toUpperCase(), sub: "posture", color: overall === "implemented" ? GRN : overall === "partial" ? YLW : CY },
            { label: "TENANTS", value: tenants, sub: "registered", color: CY },
            { label: "SHARES",  value: shares,  sub: "active",     color: shares > 0 ? YLW : GRN },
          ].map(({ label, value, sub, color }) => (
            <div key={label} style={{
              background: "rgba(41,231,255,0.04)", border: `1px solid ${color}22`,
              borderRadius: 8, padding: "8px 10px", textAlign: "center",
            }}>
              <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1, marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color }}>{value}</div>
              <div style={{ fontSize: 9, color: "#6E8AA0" }}>{sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tab filter */}
      <div style={{
        display: "flex", gap: 4, padding: "8px 14px", flexShrink: 0,
        borderBottom: `1px solid ${CY}11`,
      }}>
        {["ALL", "AUDIT", "REVDB"].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? `${CY}18` : "none",
              border: `1px solid ${tab === t ? CY + "66" : DIM + "44"}`,
              color: tab === t ? CY : "#6E8AA0",
              borderRadius: 4, padding: "3px 10px", fontSize: 10,
              cursor: "pointer", letterSpacing: 1,
            }}
          >{t}</button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#6E8AA0", lineHeight: "22px" }}>
          {visible.length} records
        </span>
      </div>

      {/* Audit trail */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {loading && (
          <div style={{ textAlign: "center", color: CY, fontSize: 12, padding: 24 }}>
            loading audit records…
          </div>
        )}
        {err && !loading && (
          <div style={{ textAlign: "center", color: RED, fontSize: 12, padding: 24 }}>
            {err}
          </div>
        )}
        {!loading && !err && visible.length === 0 && (
          <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 12, padding: 24 }}>
            no audit records
          </div>
        )}
        {visible.map((r, i) => (
          <div key={i} style={{
            display: "grid",
            gridTemplateColumns: "70px 90px 1fr 80px",
            gap: 8, padding: "7px 14px",
            borderBottom: `1px solid ${DIM}22`,
            fontSize: 11, lineHeight: 1.4,
            background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
          }}>
            <span style={{
              background: r._source === "revdb" ? `${YLW}18` : `${CY}14`,
              color:      r._source === "revdb" ? YLW : CY,
              borderRadius: 3, padding: "1px 5px", fontSize: 9,
              letterSpacing: 1, textAlign: "center", alignSelf: "start",
            }}>
              {r._source === "revdb" ? "REVDB" : "AUDIT"}
            </span>
            <span style={{ color: "#9BAFC0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.actor}
            </span>
            <span style={{ color: "#DCEBF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              title={`${r.action} — ${r.object}`}>
              <span style={{ color: GRN }}>{r.action}</span>
              {r.object !== "—" && (
                <span style={{ color: "#6E8AA0" }}> · {r.object}</span>
              )}
            </span>
            <span style={{ color: "#6E8AA0", fontSize: 10, textAlign: "right", whiteSpace: "nowrap" }}>
              {formatTs(r.ts)}
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        padding: "7px 14px", borderTop: `1px solid ${CY}11`, flexShrink: 0,
        fontSize: 10, color: "#3A4A5A", display: "flex", justifyContent: "space-between",
      }}>
        <span>chain length: {chainLen}</span>
        <span>auto-refresh every 2 min</span>
      </div>
    </div>
  );
}
