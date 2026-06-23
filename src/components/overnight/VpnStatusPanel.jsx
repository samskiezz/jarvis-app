/**
 * VpnStatusPanel — Feature 45
 * Right-edge slide-in drawer showing WireGuard VPN status from GET /v1/vpn/status.
 * Tab at 12 % from top (between InvestmentSnapshotDrawer 5 % and
 * KnowledgeTimelinePanel 20 %). Polls every 2 min while open.
 *
 * Mounted in src/Layout.jsx after SchedulesPanel.
 *
 * Endpoint: GET /v1/vpn/status
 * → { ok, installed, active, interfaces: [{ iface, listen_port, peers, latest_handshake }],
 *     schema_version, source }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 120_000;
const DRAWER_W = 320;
const ACCENT = "#10B981";
const GREEN = "#22C55E";
const AMBER = "#F5A623";
const RED = "#FF4D4D";
const DIM = "rgba(16,185,129,0.45)";

function fmtBytes(n) {
  if (!n || n === 0) return "0 B";
  const v = Number(n);
  if (v < 1024) return `${v} B`;
  if (v < 1048576) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1073741824) return `${(v / 1048576).toFixed(1)} MB`;
  return `${(v / 1073741824).toFixed(2)} GB`;
}

function fmtHandshake(ts) {
  if (!ts || ts === 0) return "never";
  const diff = Math.floor(Date.now() / 1000) - Number(ts);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtPeers(peers) {
  if (Array.isArray(peers)) return peers.length;
  if (typeof peers === "number") return peers;
  return 0;
}

export default function VpnStatusPanel() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/vpn/status")
      .then((d) => {
        if (alive) { setData(d); setErr(false); }
      })
      .catch(() => {
        if (alive) setErr(true);
      });

    timerRef.current = setTimeout(() => {
      if (alive) bump();
    }, POLL_MS);

    return () => {
      alive = false;
      clearTimeout(timerRef.current);
    };
  }, [open, tick]);

  const ifaces = data?.interfaces ?? [];
  const active = data?.active === true;
  const installed = data?.installed !== false;
  const source = data?.source ?? "";

  return (
    <>
      {/* Fixed toggle tab — right edge, 12 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close VPN status" : "Open WireGuard VPN status"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "12%",
          transform: open
            ? "translateY(-50%) rotate(180deg)"
            : "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${ACCENT}55`,
          borderRight: open ? "none" : `1px solid ${ACCENT}55`,
          color: ACCENT,
          fontFamily: S.mono,
          fontSize: S.fs.xxs,
          letterSpacing: 2,
          padding: "10px 5px",
          cursor: "pointer",
          borderRadius: "4px 0 0 4px",
          transition: "right 0.2s ease",
          userSelect: "none",
        }}
      >
        {open ? "VPN ▶" : "VPN ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8994,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderLeft: `1px solid ${ACCENT}33`,
          display: "flex",
          flexDirection: "column",
          transition: "right 0.2s ease",
          fontFamily: S.mono,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderBottom: `1px solid ${S.border}`,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: S.fs.xs, color: ACCENT, letterSpacing: 2, flex: 1 }}>
            VPN STATUS
          </span>
          {data && (
            <>
              <span
                style={{
                  fontSize: 9,
                  color: active ? GREEN : installed ? AMBER : RED,
                  border: `1px solid ${active ? GREEN : installed ? AMBER : RED}55`,
                  borderRadius: 3,
                  padding: "1px 5px",
                  letterSpacing: 1,
                  flexShrink: 0,
                }}
              >
                {active ? "ACTIVE" : installed ? "INSTALLED" : "NO WG"}
              </span>
              {source === "default-schema" && (
                <span style={{ fontSize: 9, color: DIM, letterSpacing: 0.5 }}>
                  seed
                </span>
              )}
            </>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {!open ? null : err ? (
            <div style={{ padding: "20px 14px", color: AMBER, fontSize: S.fs.xs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : !data ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : ifaces.length === 0 ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              NO INTERFACES FOUND
            </div>
          ) : (
            ifaces.map((ifc, idx) => {
              const peers = Array.isArray(ifc.peers) ? ifc.peers : [];
              const peerCount = typeof ifc.peers === "number" ? ifc.peers : peers.length;
              const handshakeTs =
                ifc.latest_handshake ??
                (peers.length > 0
                  ? Math.max(...peers.map((p) => p.latest_handshake ?? 0))
                  : 0);

              return (
                <div
                  key={ifc.iface ?? idx}
                  style={{
                    padding: "10px 14px",
                    borderBottom: `1px solid ${S.border}`,
                  }}
                >
                  {/* Interface name + port */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: active ? GREEN : S.border,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ color: "#DCEBF5", fontSize: S.fs.xs, letterSpacing: 1, flex: 1 }}>
                      {ifc.iface ?? "wg0"}
                    </span>
                    {ifc.listen_port != null && (
                      <span style={{ fontSize: 9, color: DIM, letterSpacing: 1 }}>
                        :{ifc.listen_port}
                      </span>
                    )}
                  </div>

                  {/* Peer count + handshake */}
                  <div style={{ display: "flex", gap: 12, paddingLeft: 15, flexWrap: "wrap" }}>
                    <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 0.5 }}>
                      <span style={{ color: ACCENT }}>{peerCount}</span> peer{peerCount !== 1 ? "s" : ""}
                    </span>
                    <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 0.5 }}>
                      hs{" "}
                      <span style={{ color: handshakeTs > 0 ? "#DCEBF5" : DIM }}>
                        {fmtHandshake(handshakeTs)}
                      </span>
                    </span>
                  </div>

                  {/* Per-peer rows when available */}
                  {peers.length > 0 && (
                    <div style={{ marginTop: 6, paddingLeft: 15, display: "flex", flexDirection: "column", gap: 4 }}>
                      {peers.map((p, pi) => (
                        <div
                          key={p.public_key ?? pi}
                          style={{
                            fontSize: 9,
                            color: S.text,
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                            borderLeft: `1px solid ${ACCENT}33`,
                            paddingLeft: 6,
                          }}
                        >
                          <span style={{ color: "#DCEBF5", letterSpacing: 0.5 }}>
                            {p.name ?? (p.public_key ?? "peer").slice(0, 16)}
                          </span>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {p.allowed_ips && (
                              <span style={{ color: DIM }}>{p.allowed_ips}</span>
                            )}
                            {(p.rx_bytes != null || p.tx_bytes != null) && (
                              <span style={{ color: S.text }}>
                                ↓{fmtBytes(p.rx_bytes)} ↑{fmtBytes(p.tx_bytes)}
                              </span>
                            )}
                            {p.endpoint && (
                              <span style={{ color: S.text, opacity: 0.6 }}>
                                {p.endpoint}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer: schema source */}
        {data && (
          <div
            style={{
              padding: "6px 14px",
              borderTop: `1px solid ${S.border}`,
              fontSize: 9,
              color: DIM,
              letterSpacing: 1,
              flexShrink: 0,
            }}
          >
            {source === "live" ? "LIVE · wg show" : source === "default-schema" ? "SEED · wireguard-tools not configured" : source}
          </div>
        )}
      </div>
    </>
  );
}
