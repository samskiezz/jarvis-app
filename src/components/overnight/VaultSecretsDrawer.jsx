/**
 * VaultSecretsDrawer — F64
 * Right-edge slide-in drawer listing configured secrets from GET /v1/vault/.
 * Shows name, owner, obfuscation method, and relative age — NEVER secret values.
 * Tab at 97 % from top (right edge, below ThoughtPacksDrawer 95 %).
 *
 * Mounted in src/Layout.jsx after GuardianSensorPanel.
 *
 * Endpoint: GET /v1/vault/
 * → { items: [{ name, owner, obfuscation, created_ts, updated_ts }],
 *     count: number, note: string }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS  = 300_000; // 5 min
const DRAWER_W = 330;
const AMBER    = "#F59E0B";
const AMBER_DIM = "rgba(245,158,11,0.45)";
const GREEN    = "#22C55E";

function relAge(ts) {
  if (!ts) return "—";
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60)   return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

export default function VaultSecretsDrawer() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err,  setErr]  = useState(false);
  const [tick, bump]    = useReducer((n) => n + 1, 0);
  const timerRef        = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/vault/")
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

  const items = data?.items ?? [];

  return (
    <>
      {/* Fixed toggle tab — right edge, 97 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close vault registry" : "Open JARVIS vault secrets registry"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "97%",
          transform: open
            ? "translateY(-50%) rotate(180deg)"
            : "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${AMBER}55`,
          borderRight: open ? "none" : `1px solid ${AMBER}55`,
          color: AMBER,
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
        {open ? "VAULT ▶" : "VAULT ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8995,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderLeft: `1px solid ${AMBER}33`,
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
          <span style={{ fontSize: S.fs.xs, color: AMBER, letterSpacing: 2, flex: 1 }}>
            ◈ VAULT REGISTRY
          </span>
          {data && (
            <span
              style={{
                fontSize: 9,
                color: AMBER,
                border: `1px solid ${AMBER}55`,
                borderRadius: 3,
                padding: "1px 6px",
                letterSpacing: 1,
                flexShrink: 0,
              }}
            >
              {data.count ?? items.length} secrets
            </span>
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
          ) : items.length === 0 ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              NO SECRETS REGISTERED
            </div>
          ) : (
            items.map((secret) => (
              <div
                key={secret.name}
                style={{
                  padding: "9px 14px",
                  borderBottom: `1px solid ${S.border}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                }}
              >
                {/* Name row */}
                <div
                  style={{
                    color: "#DCEBF5",
                    fontSize: S.fs.xs,
                    letterSpacing: 0.5,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {secret.name}
                </div>

                {/* Meta row: owner + obfuscation + age */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {secret.owner && (
                    <span
                      style={{
                        fontSize: 9,
                        color: GREEN,
                        border: `1px solid ${GREEN}55`,
                        borderRadius: 3,
                        padding: "1px 5px",
                        letterSpacing: 1,
                        flexShrink: 0,
                      }}
                    >
                      {secret.owner}
                    </span>
                  )}
                  {secret.obfuscation && (
                    <span
                      style={{
                        fontSize: 9,
                        color: AMBER_DIM,
                        border: `1px solid ${AMBER}33`,
                        borderRadius: 3,
                        padding: "1px 5px",
                        letterSpacing: 1,
                        flexShrink: 0,
                      }}
                    >
                      {String(secret.obfuscation).toUpperCase()}
                    </span>
                  )}
                  <span style={{ fontSize: 9, color: S.text, letterSpacing: 0.5, marginLeft: "auto", flexShrink: 0 }}>
                    {relAge(secret.updated_ts ?? secret.created_ts)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer — security note */}
        <div
          style={{
            padding: "7px 14px",
            borderTop: `1px solid ${S.border}`,
            fontSize: 9,
            color: AMBER_DIM,
            letterSpacing: 1,
            flexShrink: 0,
          }}
        >
          ⚠ values never exposed via API
        </div>
      </div>
    </>
  );
}
