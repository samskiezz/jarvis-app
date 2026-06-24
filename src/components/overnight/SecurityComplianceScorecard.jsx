/**
 * SecurityComplianceScorecard — F82
 * Right-edge slide-in drawer at 10 % vertical.
 * Polls GET /v1/security/compliance/status every 5 min.
 * Shows the five security-plane tiles (audit, revdb, tenancy, cross_org,
 * clearance_model) plus an overall IMPLEMENTED / PARTIAL badge.
 */
import { useEffect, useRef, useState } from "react";

const ACC = "#22C55E"; // green (healthy compliance)
const ACC_WARN = "#F59E0B"; // amber (partial)
const BG = "rgba(4,10,18,0.97)";
const BORDER = `1px solid ${ACC}33`;
const MONO = "'JetBrains Mono','Courier New',monospace";
const POLL_MS = 5 * 60_000;

function ago(ts) {
  if (!ts) return "—";
  const d = Date.now() / 1000 - ts;
  if (d < 60) return `${Math.round(d)}s ago`;
  if (d < 3600) return `${Math.round(d / 60)}m ago`;
  if (d < 86400) return `${Math.round(d / 3600)}h ago`;
  return `${Math.round(d / 86400)}d ago`;
}

function agoMs(ms) {
  if (!ms) return "—";
  return ago(ms / 1000);
}

function Tile({ label, children, ok }) {
  const color = ok === true ? "#4ADE80" : ok === false ? "#F87171" : "#64748B";
  return (
    <div style={{
      padding: "8px 14px",
      borderBottom: `1px solid ${ACC}0A`,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        marginBottom: 4,
      }}>
        <span style={{ color, fontSize: 9 }}>●</span>
        <span style={{
          fontSize: 9, letterSpacing: 2, color: "#7A9AB5",
        }}>
          {label}
        </span>
      </div>
      <div style={{ paddingLeft: 14 }}>
        {children}
      </div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between",
      fontSize: 9, color: "#C0DCE8", marginBottom: 2,
    }}>
      <span style={{ color: "#4A6070" }}>{k}</span>
      <span>{String(v ?? "—")}</span>
    </div>
  );
}

export default function SecurityComplianceScorecard() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const timerRef = useRef(null);

  async function fetchData() {
    try {
      const res = await fetch("/v1/security/compliance/status");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setErr(null);
    } catch (e) {
      setErr(e.message || "fetch error");
    }
  }

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  const overall = data?.overall || null;
  const implemented = overall === "implemented";
  const badgeColor = implemented ? ACC : overall ? ACC_WARN : "#64748B";
  const badgeText = overall ? overall.toUpperCase() : "—";

  const lattice = data?.clearance_model?.lattice || [];

  return (
    <>
      {/* Tab button */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed", right: open ? 300 : 0, top: "10%",
          zIndex: 1200, writingMode: "vertical-rl", textOrientation: "mixed",
          background: open ? badgeColor + "22" : BG,
          border: BORDER, borderRight: "none",
          borderRadius: "6px 0 0 6px",
          color: badgeColor, fontFamily: MONO, fontSize: 9, letterSpacing: 2,
          padding: "10px 5px", cursor: "pointer",
          transition: "right 0.22s ease",
        }}
        title="Security Compliance Scorecard (F82)"
      >
        COMPL ◀
      </button>

      {/* Drawer panel */}
      <div style={{
        position: "fixed", top: 0, right: open ? 0 : -300,
        width: 300, height: "100vh", zIndex: 1199,
        background: BG, backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        borderLeft: `1px solid ${ACC}33`,
        display: "flex", flexDirection: "column",
        transition: "right 0.22s ease",
        fontFamily: MONO,
      }}>
        {/* Header */}
        <div style={{
          padding: "10px 14px 8px",
          borderBottom: `1px solid ${ACC}22`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ color: ACC, fontSize: 10, letterSpacing: 2.5 }}>
            ⚑ COMPLIANCE
          </span>
          {overall && (
            <span style={{
              background: badgeColor + "22",
              color: badgeColor,
              border: `1px solid ${badgeColor}44`,
              fontSize: 9, letterSpacing: 1.5,
              padding: "2px 7px", borderRadius: 4,
            }}>
              {badgeText}
            </span>
          )}
        </div>

        {/* Error */}
        {err && (
          <div style={{ padding: "8px 14px", color: "#F87171", fontSize: 9 }}>
            ⚠ {err}
          </div>
        )}

        {/* Loading */}
        {open && !data && !err && (
          <div style={{ padding: "16px 14px", color: "#3A5060", fontSize: 9 }}>
            FETCHING…
          </div>
        )}

        <div style={{ overflowY: "auto", flex: 1 }}>
          {data && (
            <>
              {/* Audit plane */}
              <Tile label="AUDIT CHAIN" ok={data.audit?.chain_integrity}>
                <Row k="integrity" v={data.audit?.chain_integrity ? "✓ valid" : "✗ broken"} />
                <Row k="chain length" v={data.audit?.chain_length ?? "—"} />
                {data.audit?.broken_at != null && (
                  <Row k="broken at" v={`entry ${data.audit.broken_at}`} />
                )}
                <Row k="status" v={data.audit?.status || "—"} />
              </Tile>

              {/* RevDB plane */}
              <Tile label="REVDB" ok={!!data.revdb?.latest_commit}>
                <Row k="latest commit"
                  v={data.revdb?.latest_commit
                    ? String(data.revdb.latest_commit).slice(0, 8)
                    : "none"} />
                <Row k="last write"
                  v={agoMs(data.revdb?.latest_timestamp)} />
                <Row k="status" v={data.revdb?.status || "—"} />
              </Tile>

              {/* Tenancy plane */}
              <Tile label="TENANCY" ok={data.tenancy?.tenant_count > 0 || data.tenancy?.status === "implemented"}>
                <Row k="tenant count" v={data.tenancy?.tenant_count ?? "—"} />
                <Row k="status" v={data.tenancy?.status || "—"} />
              </Tile>

              {/* Cross-org plane */}
              <Tile label="CROSS-ORG" ok={data.cross_org?.status === "implemented"}>
                <Row k="active shares" v={data.cross_org?.active_shares ?? "—"} />
                <Row k="status" v={data.cross_org?.status || "—"} />
              </Tile>

              {/* Clearance model plane */}
              <Tile label="CLEARANCE MODEL" ok={lattice.length > 0 || data.clearance_model?.status === "implemented"}>
                <Row k="lattice levels" v={lattice.length || 0} />
                {lattice.length > 0 && (
                  <div style={{
                    display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4,
                  }}>
                    {lattice.map((lv) => (
                      <span key={lv} style={{
                        fontSize: 7, letterSpacing: 1,
                        background: ACC + "1A",
                        border: `1px solid ${ACC}33`,
                        color: ACC, padding: "1px 5px", borderRadius: 3,
                      }}>
                        {String(lv).toUpperCase()}
                      </span>
                    ))}
                  </div>
                )}
                <Row k="status" v={data.clearance_model?.status || "—"} />
              </Tile>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "6px 14px", borderTop: `1px solid ${ACC}11`,
          fontSize: 8, color: "#3A5060", letterSpacing: 1,
        }}>
          /v1/security/compliance/status · 5 min poll
        </div>
      </div>
    </>
  );
}
