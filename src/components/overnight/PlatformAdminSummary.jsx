/**
 * F162: Platform Admin Summary Drawer
 * Right-edge slide-in at 97% vertical (below VaultSecretsDrawer 97% gap toward bottom).
 * Actually placed at 95.5% — a gap below ThoughtPacksDrawer (95%) and just above VaultSecretsDrawer (97%).
 * Polls GET /v1/admin/summary every 5 min.
 * Shows platform object counts (ontology, datasets, alerts, cases, reports, audit)
 * + process metrics (PID, RSS MB, uptime, Python version, platform).
 * Fuchsia (#C026D3) accent.
 */
import { useState, useEffect, useCallback } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const ACCENT = "#C026D3";
const DRAWER_W = 340;
const POLL_MS = 300_000; // 5 min

function fmtUptime(s) {
  if (!s && s !== 0) return "–";
  const sec = Math.floor(Number(s));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

function CountTile({ label, value, color }) {
  const c = color ?? ACCENT;
  return (
    <div
      style={{
        background: `${c}0f`,
        border: `1px solid ${c}33`,
        borderRadius: 6,
        padding: "8px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        minWidth: 0,
      }}
    >
      <span
        style={{
          color: `${c}99`,
          fontFamily: S.mono,
          fontSize: 8,
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: S.textHi ?? "#DCEBF5",
          fontFamily: S.mono,
          fontSize: 18,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        {value ?? "–"}
      </span>
    </div>
  );
}

function MetaRow({ label, value }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "4px 0",
        borderBottom: `1px solid ${ACCENT}15`,
      }}
    >
      <span
        style={{
          color: S.text ?? "#7A95AB",
          fontFamily: S.mono,
          fontSize: 9,
          letterSpacing: 0.5,
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: S.textHi ?? "#DCEBF5",
          fontFamily: S.mono,
          fontSize: 10,
          maxWidth: 180,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          textAlign: "right",
        }}
      >
        {value ?? "–"}
      </span>
    </div>
  );
}

export default function PlatformAdminSummary() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [lastTs, setLastTs] = useState(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await kimiClient.request("/v1/admin/summary");
      setData(res ?? {});
      setLastTs(Date.now());
    } catch (e) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const run = async () => { if (alive) await fetch(); };
    run();
    const id = setInterval(() => { if (alive) fetch(); }, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [open, fetch]);

  const summary = data?.summary ?? {};
  const system = data?.system ?? {};

  const countFields = [
    { label: "Ontology", key: "ontology_objects", color: "#C026D3" },
    { label: "Datasets", key: "datasets", color: "#38BDF8" },
    { label: "Alerts", key: "alerts", color: "#EF4444" },
    { label: "Cases", key: "cases", color: "#FB923C" },
    { label: "Reports", key: "reports", color: "#4ADE80" },
    { label: "Audit", key: "audit_length", color: "#FBBF24" },
  ];

  return (
    <>
      {/* Tab */}
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "96.5%",
          zIndex: 9000,
          writingMode: "vertical-rl",
          background: `${ACCENT}22`,
          border: `1px solid ${ACCENT}66`,
          borderRight: open ? "none" : `1px solid ${ACCENT}66`,
          borderRadius: open ? "6px 0 0 6px" : "0 6px 6px 0",
          padding: "10px 5px",
          cursor: "pointer",
          color: ACCENT,
          fontSize: S.fs?.xxs ?? 10,
          fontFamily: S.mono,
          letterSpacing: 2,
          transition: "right 0.2s ease",
          userSelect: "none",
        }}
      >
        ADMIN
      </div>

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: open ? 0 : -DRAWER_W,
          width: DRAWER_W,
          height: "100vh",
          zIndex: 8996,
          background: "rgba(5,10,18,0.97)",
          borderLeft: `1px solid ${ACCENT}44`,
          backdropFilter: S.blur ?? "blur(12px)",
          transition: "right 0.2s ease",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 14px 10px",
            borderBottom: `1px solid ${ACCENT}33`,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <span style={{ color: ACCENT, fontSize: 13, fontFamily: S.mono }}>◈</span>
          <span
            style={{
              color: S.textHi ?? "#DCEBF5",
              fontFamily: S.mono,
              fontSize: S.fs?.xs ?? 11,
              letterSpacing: 1,
              flex: 1,
            }}
          >
            PLATFORM SUMMARY
          </span>
          {loading && (
            <span style={{ color: `${ACCENT}88`, fontSize: 9, fontFamily: S.mono }}>
              POLLING…
            </span>
          )}
          <span
            onClick={() => setOpen(false)}
            style={{ color: S.text ?? "#7A95AB", cursor: "pointer", fontSize: 14, lineHeight: 1 }}
          >
            ✕
          </span>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
          {err && (
            <div
              style={{
                color: "#EF4444",
                fontSize: 10,
                fontFamily: S.mono,
                marginBottom: 10,
                background: "#EF444415",
                border: "1px solid #EF444433",
                borderRadius: 4,
                padding: "6px 8px",
              }}
            >
              {err}
            </div>
          )}

          {!data && !loading && !err && (
            <div
              style={{
                color: S.text ?? "#7A95AB",
                fontSize: 10,
                fontFamily: S.mono,
                textAlign: "center",
                marginTop: 32,
              }}
            >
              AWAITING DATA
            </div>
          )}

          {data && (
            <>
              {/* Platform counts section */}
              <div
                style={{
                  color: `${ACCENT}99`,
                  fontFamily: S.mono,
                  fontSize: 8,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Platform Objects
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 6,
                  marginBottom: 16,
                }}
              >
                {countFields.map(({ label, key, color }) => (
                  <CountTile
                    key={key}
                    label={label}
                    value={summary[key] ?? 0}
                    color={color}
                  />
                ))}
              </div>

              {/* Process metrics section */}
              <div
                style={{
                  color: `${ACCENT}99`,
                  fontFamily: S.mono,
                  fontSize: 8,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Process Metrics
              </div>
              <div
                style={{
                  background: `${ACCENT}08`,
                  border: `1px solid ${ACCENT}22`,
                  borderRadius: 6,
                  padding: "8px 10px",
                }}
              >
                <MetaRow label="PID" value={system.pid} />
                <MetaRow
                  label="RSS"
                  value={system.rss_mb != null ? `${system.rss_mb} MB` : null}
                />
                <MetaRow
                  label="Uptime"
                  value={system.uptime_s != null ? fmtUptime(system.uptime_s) : null}
                />
                <MetaRow label="Python" value={system.python_version} />
                <MetaRow label="Platform" value={system.platform} />
                <MetaRow label="Runtime" value={system.implementation} />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "6px 12px",
            borderTop: `1px solid ${ACCENT}22`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <span style={{ color: `${ACCENT}66`, fontFamily: S.mono, fontSize: 9 }}>
            GET /v1/admin/summary · 5 min
          </span>
          {lastTs && (
            <span style={{ color: `${ACCENT}55`, fontFamily: S.mono, fontSize: 9 }}>
              {new Date(lastTs).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
