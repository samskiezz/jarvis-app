/**
 * ServiceRegistryPanel — F72
 * Right-edge slide-in drawer at 7 % vertical.
 * Polls GET /v1/registry/services every 30 s — the live roster of every
 * JARVIS microservice that has announced itself to the Nexus registry.
 * Each row shows: status LED, service name, role badge, port, heartbeat age.
 */
import { useEffect, useRef, useState } from "react";

const ACC    = "#D946EF"; // fuchsia-500
const BG     = "rgba(5,12,20,0.97)";
const BORDER = `1px solid ${ACC}33`;
const MONO   = "'JetBrains Mono','Courier New',monospace";
const POLL_MS = 30_000;

function relAge(ts) {
  if (!ts) return "—";
  const secs = Math.max(0, Math.round((Date.now() - ts * 1000) / 1000));
  if (secs < 60)   return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

function statusColor(s) {
  if (!s || s === "ok")       return "#22C55E";
  if (s === "degraded")       return "#F59E0B";
  return "#EF4444";
}

export default function ServiceRegistryPanel() {
  const [open, setOpen]       = useState(false);
  const [data, setData]       = useState(null);
  const [err, setErr]         = useState(null);
  const [loading, setLoading] = useState(false);
  const timerRef              = useRef(null);

  async function fetchServices() {
    setLoading(true);
    try {
      const r = await fetch("/v1/registry/services");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setData(j);
      setErr(null);
    } catch (e) {
      setErr(e.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) {
      clearInterval(timerRef.current);
      return;
    }
    fetchServices();
    timerRef.current = setInterval(fetchServices, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  const svcs = data?.services ?? [];
  const alive = data?.alive ?? 0;
  const total = data?.count ?? svcs.length;

  return (
    <>
      {/* Tab trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Service Registry — /v1/registry/services"
        style={{
          position: "fixed",
          right: open ? 340 : 0,
          top: "7%",
          zIndex: 120,
          background: open ? ACC : BG,
          border: BORDER,
          borderRight: "none",
          borderRadius: "6px 0 0 6px",
          color: open ? "#000" : ACC,
          cursor: "pointer",
          fontFamily: MONO,
          fontSize: 9,
          letterSpacing: 1,
          padding: "6px 5px",
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          transition: "right 0.25s ease",
          boxShadow: `0 0 12px ${ACC}22`,
        }}
      >
        {alive > 0 && (
          <span
            style={{
              display: "block",
              textAlign: "center",
              background: alive === total ? "#22C55E" : "#F59E0B",
              color: "#000",
              borderRadius: 3,
              fontSize: 8,
              padding: "1px 3px",
              marginBottom: 4,
              fontWeight: 700,
              writingMode: "horizontal-tb",
            }}
          >
            {alive}/{total}
          </span>
        )}
        ⬡ SVCS
      </button>

      {/* Drawer */}
      {open && (
        <div
          style={{
            position: "fixed",
            right: 0,
            top: 0,
            width: 340,
            height: "100vh",
            zIndex: 119,
            background: BG,
            borderLeft: BORDER,
            display: "flex",
            flexDirection: "column",
            fontFamily: MONO,
            boxShadow: `-12px 0 40px ${ACC}11`,
          }}
        >
          {/* Header */}
          <div
            style={{
              borderBottom: BORDER,
              padding: "10px 14px 8px",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: ACC, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
                ⬡ SERVICE REGISTRY
              </span>
              {loading && (
                <span style={{ color: ACC, fontSize: 9, opacity: 0.6 }}>⟳</span>
              )}
              <span
                style={{
                  marginLeft: "auto",
                  background: alive === total && total > 0 ? "#22C55E22" : "#F59E0B22",
                  color: alive === total && total > 0 ? "#22C55E" : "#F59E0B",
                  border: `1px solid ${alive === total && total > 0 ? "#22C55E55" : "#F59E0B55"}`,
                  borderRadius: 4,
                  padding: "1px 6px",
                  fontSize: 9,
                  letterSpacing: 1,
                }}
              >
                {alive}/{total} ALIVE
              </span>
            </div>
            <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1 }}>
              GET /v1/registry/services · 30s poll
            </div>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
            {err && (
              <div style={{ color: "#EF4444", fontSize: 10, padding: "12px 14px", letterSpacing: 1 }}>
                ✗ {err}
              </div>
            )}
            {!err && svcs.length === 0 && !loading && (
              <div style={{ color: "#4E6070", fontSize: 10, padding: "18px 14px", textAlign: "center", letterSpacing: 1 }}>
                NO SERVICES REGISTERED
              </div>
            )}
            {svcs.map((svc) => (
              <ServiceRow key={svc.id} svc={svc} acc={ACC} />
            ))}
          </div>

          {/* Footer */}
          <div
            style={{
              borderTop: BORDER,
              padding: "6px 14px",
              color: "#2E4050",
              fontSize: 9,
              letterSpacing: 1,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>NEXUS PHASE 1</span>
            <span>↺ 30s</span>
          </div>
        </div>
      )}

      <style>{`
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${ACC}33; border-radius: 2px; }
      `}</style>
    </>
  );
}

function ServiceRow({ svc, acc }) {
  const [expanded, setExpanded] = useState(false);
  const dot = statusColor(svc.status);
  const routes = svc.routes ?? [];

  return (
    <div
      onClick={() => setExpanded((v) => !v)}
      style={{
        padding: "7px 14px",
        cursor: "pointer",
        borderBottom: "1px solid rgba(255,255,255,0.03)",
        background: expanded ? `${acc}08` : "transparent",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        {/* Status LED */}
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: dot,
            flexShrink: 0,
            boxShadow: `0 0 5px ${dot}88`,
          }}
        />
        {/* Name */}
        <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1, letterSpacing: 0.5 }}>
          {svc.name || svc.id}
        </span>
        {/* Role badge */}
        {svc.role && (
          <span
            style={{
              background: `${acc}18`,
              color: acc,
              border: `1px solid ${acc}33`,
              borderRadius: 3,
              fontSize: 8,
              padding: "1px 5px",
              letterSpacing: 1,
              flexShrink: 0,
            }}
          >
            {svc.role.toUpperCase()}
          </span>
        )}
        {/* Port */}
        {svc.port && (
          <span style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1, flexShrink: 0 }}>
            :{svc.port}
          </span>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ marginTop: 6, paddingLeft: 14 }}>
          {svc.id !== svc.name && (
            <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1, marginBottom: 2 }}>
              id: {svc.id}
            </div>
          )}
          {svc.base_url && (
            <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1, marginBottom: 2 }}>
              url: {svc.base_url}
            </div>
          )}
          {svc.transport && (
            <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1, marginBottom: 2 }}>
              transport: {svc.transport}
            </div>
          )}
          {svc.pid != null && (
            <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1, marginBottom: 2 }}>
              pid: {svc.pid}
            </div>
          )}
          {svc.last_heartbeat && (
            <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1, marginBottom: 2 }}>
              heartbeat: {relAge(svc.last_heartbeat)}
            </div>
          )}
          {routes.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <div style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1, marginBottom: 2 }}>
                ROUTES ({routes.length})
              </div>
              {routes.slice(0, 6).map((r, i) => (
                <div key={i} style={{ color: "#2E4050", fontSize: 8, letterSpacing: 0.5 }}>
                  {r}
                </div>
              ))}
              {routes.length > 6 && (
                <div style={{ color: "#2E4050", fontSize: 8 }}>…+{routes.length - 6} more</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
