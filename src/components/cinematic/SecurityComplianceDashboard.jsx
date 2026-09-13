/**
 * SecurityComplianceDashboard — F33 Security Compliance Dashboard.
 * Polls /v1/security/compliance/status (60 s) and /v1/security/audit?n=20 (90 s).
 * Shows compliance scorecard tiles + scrolling audit chain entries.
 * "JARVIS, security" / "compliance" / "audit" opens the panel; speaks a summary.
 * Additive only — mounted via App.jsx; intent hooks imported into JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const GRN  = "#00FF9C";
const RED  = "#FF3B6B";
const OR   = "#FF8800";
const GLD  = "#FFD700";
const DIM  = "rgba(41,231,255,0.08)";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SEC_RE = /\bsecurity|compliance|audit|chain\s*integrity|clearance|tenancy|revdb|acl\b/i;

async function fetchCompliance() {
  const r = await fetch(`${apiBase()}/v1/security/compliance/status`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) return null;
  return r.json();
}

async function fetchAudit(n = 20) {
  const r = await fetch(`${apiBase()}/v1/security/audit?n=${n}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) return null;
  return r.json();
}

export function isSecurityQuery(text) {
  return SEC_RE.test(text || "");
}

export async function buildSecurityScript() {
  let score = null;
  try { score = await fetchCompliance(); } catch (_) {}

  if (!score) return "Security compliance status is currently unavailable, sir.";

  const overall  = score.overall || "unknown";
  const chainLen = score.audit?.chain_length ?? 0;
  const chainOk  = score.audit?.chain_integrity ?? false;
  const tenants  = score.tenancy?.tenant_count ?? 0;
  const shares   = score.cross_org?.active_shares ?? 0;

  const statusWord = overall === "implemented" ? "nominal" : "partial";

  return (
    `Security compliance status: ${statusWord}. ` +
    `Audit chain: ${chainOk ? "intact" : "broken"}, ${chainLen} entr${chainLen === 1 ? "y" : "ies"}. ` +
    `Tenants: ${tenants}. Cross-org shares: ${shares}. ` +
    (chainOk ? "All integrity checks passing, sir." : "Chain integrity failure detected. Recommend immediate review, sir.")
  );
}

function overallColor(s) {
  if (s === "implemented") return GRN;
  if (s === "partial")     return GLD;
  return OR;
}

function fmtTs(t) {
  if (!t) return "—";
  try {
    const d = new Date(typeof t === "number" ? t * 1000 : Date.parse(t));
    if (Number.isNaN(d.getTime())) return String(t).slice(0, 19);
    return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  } catch (_) { return String(t).slice(0, 19); }
}

function ScoreTile({ label, value, color, sub }) {
  return (
    <div style={{
      background: DIM,
      border: `1px solid ${color}44`,
      borderRadius: 6,
      padding: "10px 14px",
      minWidth: 120,
      flex: "1 1 120px",
    }}>
      <div style={{ fontSize: 10, color: "#aaa", letterSpacing: 1, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: "monospace" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: "#888", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function AuditRow({ item, i }) {
  const actor  = item.actor || item.user || item.operator || "system";
  const action = item.action || item.event || item.type || item.kind || "event";
  const ts     = item.timestamp || item.created_at || item.ts || item.time;
  const hash   = item.hash || item.digest || item.id || "";
  return (
    <div style={{
      display: "flex",
      gap: 8,
      padding: "5px 8px",
      borderBottom: "1px solid rgba(41,231,255,0.07)",
      fontSize: 11,
      fontFamily: "monospace",
      alignItems: "center",
      background: i % 2 === 0 ? "transparent" : "rgba(41,231,255,0.03)",
    }}>
      <span style={{ color: "#555", minWidth: 26, textAlign: "right" }}>
        {String(i + 1).padStart(2, "0")}
      </span>
      <span style={{ color: CY, flex: "0 0 120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {fmtTs(ts)}
      </span>
      <span style={{ color: GLD, flex: "0 0 90px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {actor}
      </span>
      <span style={{ color: "#ccc", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {action}
      </span>
      {hash && (
        <span style={{ color: "#444", fontFamily: "monospace", fontSize: 9, flex: "0 0 60px",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {String(hash).slice(0, 8)}
        </span>
      )}
    </div>
  );
}

export default function SecurityComplianceDashboard() {
  const [open,       setOpen]       = useState(false);
  const [score,      setScore]      = useState(null);
  const [audit,      setAudit]      = useState(null);
  const [loadingSc,  setLoadingSc]  = useState(false);
  const [loadingAu,  setLoadingAu]  = useState(false);
  const [lastFetch,  setLastFetch]  = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState("");

  const loadScore = useCallback(async () => {
    setLoadingSc(true);
    try { setScore(await fetchCompliance()); } catch (_) {}
    finally { setLoadingSc(false); setLastFetch(new Date()); }
  }, []);

  const loadAudit = useCallback(async () => {
    setLoadingAu(true);
    try { setAudit(await fetchAudit(20)); } catch (_) {}
    finally { setLoadingAu(false); }
  }, []);

  useEffect(() => {
    if (!open) return;
    loadScore();
    loadAudit();
    const s = setInterval(loadScore, 60_000);
    const a = setInterval(loadAudit, 90_000);
    return () => { clearInterval(s); clearInterval(a); };
  }, [open, loadScore, loadAudit]);

  useEffect(() => {
    const fn = () => setOpen(v => !v);
    window.addEventListener("jarvis:sec-toggle", fn);
    return () => window.removeEventListener("jarvis:sec-toggle", fn);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment("");
    try {
      const script = await buildSecurityScript();
      setAssessment(script);
      // TTS
      const r = await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: script }),
      });
      if (r.ok) {
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = new Audio(url);
        a.onended = () => URL.revokeObjectURL(url);
        a.play().catch(() => {});
      }
    } catch (_) { setAssessment("Assessment unavailable."); }
    finally { setAssessing(false); }
  }, []);

  const overall = score?.overall || "unknown";
  const oColor  = overallColor(overall);

  const auditItems = (() => {
    if (!audit) return [];
    if (Array.isArray(audit)) return audit;
    if (Array.isArray(audit?.audit_chain)) return audit.audit_chain;
    if (Array.isArray(audit?.items)) return audit.items;
    return [];
  })();

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Security Compliance Dashboard"
        style={{
          position: "fixed", bottom: 8, left: 153400, zIndex: 128,
          background: "rgba(0,0,0,0.75)",
          border: `1px solid ${GRN}55`,
          color: GRN, fontSize: 9, fontFamily: "monospace",
          padding: "3px 7px", borderRadius: 4, cursor: "pointer",
          letterSpacing: 1, backdropFilter: "blur(6px)",
        }}
      >
        ⚑ SEC
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9200,
      background: "rgba(0,0,0,0.88)",
      backdropFilter: "blur(14px)",
      display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: "#e0e0e0",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 20px",
        borderBottom: `1px solid ${GRN}33`,
        background: "rgba(0,255,156,0.04)",
      }}>
        <span style={{ color: GRN, fontSize: 18, fontWeight: 700 }}>⚑ SECURITY COMPLIANCE</span>
        <span style={{
          fontSize: 10, padding: "2px 8px",
          border: `1px solid ${oColor}88`,
          borderRadius: 4, color: oColor, textTransform: "uppercase", letterSpacing: 1,
        }}>
          {overall}
        </span>
        {loadingSc && <span style={{ color: "#666", fontSize: 10 }}>syncing…</span>}
        {lastFetch && (
          <span style={{ color: "#555", fontSize: 9, marginLeft: "auto" }}>
            fetched {lastFetch.toISOString().replace("T", " ").slice(0, 19)}
          </span>
        )}
        <button
          onClick={() => setOpen(false)}
          style={{ marginLeft: 8, background: "none", border: "none", color: "#888",
            cursor: "pointer", fontSize: 18, lineHeight: 1 }}
        >×</button>
      </div>

      {/* Scorecard tiles */}
      {score && (
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 10,
          padding: "14px 20px",
          borderBottom: "1px solid rgba(41,231,255,0.08)",
        }}>
          <ScoreTile
            label="AUDIT CHAIN"
            value={score.audit?.chain_integrity ? "INTACT" : "BROKEN"}
            color={score.audit?.chain_integrity ? GRN : RED}
            sub={`${score.audit?.chain_length ?? 0} entries`}
          />
          <ScoreTile
            label="REVDB"
            value={score.revdb?.latest_commit ? "ACTIVE" : "NONE"}
            color={score.revdb?.latest_commit ? GRN : OR}
            sub={score.revdb?.latest_timestamp ? fmtTs(score.revdb.latest_timestamp).slice(0, 16) : "no commits"}
          />
          <ScoreTile
            label="TENANCY"
            value={String(score.tenancy?.tenant_count ?? 0)}
            color={CY}
            sub="active tenants"
          />
          <ScoreTile
            label="CROSS-ORG"
            value={String(score.cross_org?.active_shares ?? 0)}
            color={GLD}
            sub="active shares"
          />
          <ScoreTile
            label="CLEARANCE"
            value={score.clearance_model?.status === "implemented" ? "ACTIVE" : "PARTIAL"}
            color={score.clearance_model?.status === "implemented" ? GRN : OR}
            sub={`${(score.clearance_model?.lattice || []).length} levels`}
          />
        </div>
      )}

      {/* ASSESS button + assessment */}
      <div style={{ padding: "8px 20px", borderBottom: "1px solid rgba(41,231,255,0.06)", display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            background: assessing ? "rgba(0,255,156,0.1)" : "rgba(0,255,156,0.15)",
            border: `1px solid ${GRN}66`, color: GRN,
            padding: "5px 14px", borderRadius: 4, cursor: "pointer",
            fontSize: 11, letterSpacing: 1,
          }}
        >
          {assessing ? "⏳ SPEAKING…" : "▶ ASSESS"}
        </button>
        {assessment && (
          <div style={{ color: "#bbb", fontSize: 11, lineHeight: 1.5, maxWidth: 600, flex: 1 }}>
            {assessment}
          </div>
        )}
      </div>

      {/* Audit chain */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{
          padding: "8px 20px",
          fontSize: 10, letterSpacing: 1, color: "#666",
          display: "flex", gap: 12, alignItems: "center",
        }}>
          AUDIT CHAIN
          {loadingAu && <span style={{ color: "#444" }}>loading…</span>}
          {auditItems.length > 0 && (
            <span style={{ color: "#444" }}>{auditItems.length} entries</span>
          )}
        </div>

        {/* Column headers */}
        <div style={{
          display: "flex", gap: 8, padding: "3px 8px",
          fontSize: 9, color: "#444", letterSpacing: 1,
          borderBottom: "1px solid rgba(41,231,255,0.05)",
        }}>
          <span style={{ minWidth: 26 }}>#</span>
          <span style={{ flex: "0 0 120px" }}>TIMESTAMP</span>
          <span style={{ flex: "0 0 90px" }}>ACTOR</span>
          <span style={{ flex: 1 }}>ACTION</span>
          <span style={{ flex: "0 0 60px" }}>HASH</span>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {auditItems.length === 0 && !loadingAu && (
            <div style={{ color: "#555", padding: "20px 20px", fontSize: 12 }}>
              No audit entries available.
            </div>
          )}
          {auditItems.map((item, i) => (
            <AuditRow key={item.id || item.hash || i} item={item} i={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
