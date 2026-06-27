import { useState, useEffect, useRef, useCallback } from "react";

const BASE = "";
const POLL_MS = 180_000; // 3 min
const ACCENT = "#EF4444";
const ACCENT_OK = "#64748B";

function relAge(ts) {
  if (!ts) return "—";
  const ms = typeof ts === "number" ? (ts > 1e12 ? ts : ts * 1000) : Date.parse(ts);
  if (isNaN(ms)) return "—";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function shortId(id) {
  if (!id) return "—";
  return String(id).slice(0, 8);
}

function RoleBadge({ role }) {
  const colors = {
    admin: { bg: "#7C3AED", label: "ADMIN" },
    analyst: { bg: "#0EA5E9", label: "ANALYST" },
    operator: { bg: "#10B981", label: "OPERATOR" },
    viewer: { bg: "#64748B", label: "VIEWER" },
  };
  const c = colors[role] || { bg: "#64748B", label: (role || "ANON").toUpperCase() };
  return (
    <span style={{ background: c.bg, color: "#fff", fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, letterSpacing: 1 }}>
      {c.label}
    </span>
  );
}

function ClearancePill({ mark }) {
  const palette = {
    PUBLIC: "#22C55E",
    INTERNAL: "#0EA5E9",
    FINANCIAL: "#F59E0B",
    PII: "#F97316",
    RESTRICTED: "#EF4444",
  };
  const col = palette[mark] || "#64748B";
  return (
    <span style={{ background: col + "22", border: `1px solid ${col}`, color: col, fontSize: 8, padding: "0 4px", borderRadius: 3, marginRight: 2 }}>
      {mark}
    </span>
  );
}

function ChainRow({ item }) {
  const action = item.action || item.event_type || item.kind || "event";
  const actor = item.actor || item.author || "—";
  const resource = item.resource_id
    ? `${item.resource_type || "obj"}:${item.resource_id}`
    : item.resource_type || item.message || "—";
  const hash = item.hash ? item.hash.slice(0, 8) : null;
  const ts = item.ts || item.timestamp || item.created_at;

  return (
    <div style={{ borderBottom: "1px solid #1e293b", padding: "5px 0", display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "#e2e8f0", fontWeight: 600, fontFamily: "'JetBrains Mono',monospace" }}>
          {action.toUpperCase()}
        </span>
        <span style={{ fontSize: 9, color: "#64748b", fontFamily: "'JetBrains Mono',monospace" }}>
          {relAge(ts)}
        </span>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 9, color: "#94a3b8", fontFamily: "'JetBrains Mono',monospace" }}>
          {actor}
        </span>
        <span style={{ color: "#334155", fontSize: 9 }}>→</span>
        <span style={{ fontSize: 9, color: "#cbd5e1", fontFamily: "'JetBrains Mono',monospace", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {resource}
        </span>
        {hash && (
          <span style={{ fontSize: 8, background: "#1e293b", color: "#64748b", padding: "0 3px", borderRadius: 2, fontFamily: "'JetBrains Mono',monospace" }}>
            #{hash}
          </span>
        )}
      </div>
    </div>
  );
}

function RevRow({ item }) {
  const id = shortId(item.id || item.commit_id);
  const author = item.author || item.actor || "—";
  const message = item.message || item.description || "(no message)";
  const ts = item.timestamp || item.ts || item.created_at;
  const changes = Array.isArray(item.changes) ? item.changes.length : null;

  return (
    <div style={{ borderBottom: "1px solid #1e293b", padding: "5px 0", display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <span style={{ fontSize: 8, background: "#1e3a5f", color: "#60a5fa", padding: "0 4px", borderRadius: 2, fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}>
            {id}
          </span>
          {changes !== null && (
            <span style={{ fontSize: 8, background: "#172028", color: "#94a3b8", padding: "0 3px", borderRadius: 2 }}>
              Δ{changes}
            </span>
          )}
        </div>
        <span style={{ fontSize: 9, color: "#64748b", fontFamily: "'JetBrains Mono',monospace" }}>
          {relAge(ts)}
        </span>
      </div>
      <div style={{ fontSize: 9, color: "#cbd5e1", fontFamily: "'JetBrains Mono',monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>
        {message.slice(0, 55)}
      </div>
      <div style={{ fontSize: 8, color: "#64748b" }}>{author}</div>
    </div>
  );
}

export default function SecurityAuditLogDrawer() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("chain");
  const [audit, setAudit] = useState(null);
  const [acl, setAcl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [auditRes, aclRes] = await Promise.all([
        fetch(`${BASE}/v1/security/audit?n=50`),
        fetch(`${BASE}/v1/security/acl`),
      ]);
      if (!auditRes.ok) throw new Error(`audit ${auditRes.status}`);
      const auditData = await auditRes.json();
      setAudit(auditData);
      if (aclRes.ok) {
        const aclData = await aclRes.json();
        setAcl(aclData);
      }
    } catch (e) {
      setError(e.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const chainItems = audit?.audit_chain?.items || [];
  const revItems = audit?.revdb?.items || [];
  const chainOk = audit?.audit_chain?.integrity?.ok;
  const chainLen = audit?.audit_chain?.integrity?.length ?? chainItems.length;
  const accentColor = chainOk === false ? ACCENT : ACCENT_OK;
  const totalCount = chainItems.length + revItems.length;

  return (
    <>
      {/* Slide-in panel */}
      <div style={{
        position: "fixed",
        top: "18%",
        right: open ? 0 : -340,
        width: 340,
        maxHeight: "55vh",
        background: "rgba(5,10,20,0.97)",
        border: `1px solid ${accentColor}44`,
        borderRight: "none",
        borderRadius: "8px 0 0 8px",
        zIndex: 8500,
        transition: "right 0.3s ease",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'JetBrains Mono',monospace",
        boxShadow: open ? `-4px 0 24px ${accentColor}22` : "none",
      }}>
        {/* Tab button */}
        <div
          onClick={() => setOpen(v => !v)}
          style={{
            position: "absolute",
            left: -60,
            top: 0,
            width: 60,
            padding: "6px 4px",
            background: `rgba(5,10,20,0.97)`,
            border: `1px solid ${accentColor}44`,
            borderRight: "none",
            borderRadius: "6px 0 0 6px",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
          }}
        >
          <span style={{ color: accentColor, fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>SEC</span>
          <span style={{ color: accentColor, fontSize: 8 }}>▶</span>
          {totalCount > 0 && (
            <span style={{ background: accentColor, color: "#fff", borderRadius: "50%", width: 16, height: 16, fontSize: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
              {totalCount > 99 ? "99" : totalCount}
            </span>
          )}
        </div>

        {/* Header */}
        <div style={{ padding: "8px 10px", borderBottom: `1px solid ${accentColor}33`, flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
            <span style={{ color: accentColor, fontSize: 10, fontWeight: 700, letterSpacing: 2 }}>SECURITY AUDIT LOG</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 12 }}>✕</button>
          </div>

          {/* Chain integrity */}
          {audit && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
              <span style={{
                background: chainOk === false ? "#ef444422" : "#22c55e22",
                border: `1px solid ${chainOk === false ? "#ef4444" : "#22c55e"}`,
                color: chainOk === false ? "#ef4444" : "#22c55e",
                fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 3,
                animation: chainOk === false ? "pulse 1.5s infinite" : "none",
              }}>
                {chainOk === false ? "✗ CHAIN BROKEN" : "✓ CHAIN INTACT"}
              </span>
              <span style={{ fontSize: 8, color: "#64748b" }}>{chainLen} events</span>
              {loading && <span style={{ fontSize: 8, color: "#64748b" }}>…</span>}
            </div>
          )}

          {/* ACL context */}
          {acl && (
            <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
              <RoleBadge role={acl.role} />
              {Array.isArray(acl.clearance) && acl.clearance.map(m => <ClearancePill key={m} mark={m} />)}
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
            {["chain", "revdb"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? accentColor + "22" : "transparent",
                border: `1px solid ${tab === t ? accentColor : "#334155"}`,
                color: tab === t ? accentColor : "#64748b",
                borderRadius: 3, padding: "2px 8px", fontSize: 8, fontWeight: 700,
                cursor: "pointer", letterSpacing: 1,
              }}>
                {t === "chain" ? `CHAIN (${chainItems.length})` : `REVDB (${revItems.length})`}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 10px" }}>
          {error && (
            <div style={{ color: "#ef4444", fontSize: 9, padding: "10px 0" }}>⚠ {error}</div>
          )}
          {!audit && !error && !loading && (
            <div style={{ color: "#64748b", fontSize: 9, padding: "10px 0" }}>Waiting for data…</div>
          )}
          {!audit && loading && (
            <div style={{ color: "#64748b", fontSize: 9, padding: "10px 0" }}>Loading…</div>
          )}

          {audit && tab === "chain" && (
            chainItems.length === 0
              ? <div style={{ color: "#64748b", fontSize: 9, padding: "10px 0" }}>NO AUDIT EVENTS RECORDED</div>
              : chainItems.map((item, i) => <ChainRow key={i} item={item} />)
          )}

          {audit && tab === "revdb" && (
            revItems.length === 0
              ? <div style={{ color: "#64748b", fontSize: 9, padding: "10px 0" }}>NO REVDB COMMITS RECORDED</div>
              : revItems.map((item, i) => <RevRow key={i} item={item} />)
          )}
        </div>

        {/* Footer */}
        {audit && (
          <div style={{ padding: "5px 10px", borderTop: `1px solid ${accentColor}22`, flexShrink: 0 }}>
            <span style={{ fontSize: 8, color: "#334155" }}>
              role: {acl?.role || "—"} · poll 3 min · /v1/security/audit
            </span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </>
  );
}
