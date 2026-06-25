/**
 * VoiceForgeDrawer — F91
 * Right-edge slide-in at 62 % vertical.
 * Polls GET /v1/voiceforge/profiles every 5 min.
 * Lists voice-clone profiles: name, description, active indicator, created age.
 * Header shows XTTS availability (online/offline).
 * Tab: ◈ VOICES ▶  Accent: pink (#EC4899)
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000;
const DRAWER_W = 320;
const PINK = "#EC4899";

function relTime(ts) {
  if (!ts) return "—";
  const ms = ts > 1e12 ? ts : ts * 1000;
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function VoiceForgeDrawer() {
  const [open, setOpen]   = useState(false);
  const [data, setData]   = useState(null);
  const [err, setErr]     = useState(false);
  const [tick, bump]      = useReducer((n) => n + 1, 0);
  const timerRef          = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/voiceforge/profiles")
      .then((d) => { if (alive) { setData(d); setErr(false); } })
      .catch(() => { if (alive) setErr(true); });

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => { alive = false; clearTimeout(timerRef.current); };
  }, [open, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const profiles  = data?.profiles ?? [];
  const activeId  = data?.active_profile_id ?? "";
  const xtts      = data?.xtts ?? {};

  return (
    <>
      {/* Tab toggle */}
      <div
        onClick={() => setOpen((o) => !o)}
        title="VoiceForge Profiles — GET /v1/voiceforge/profiles"
        style={{
          position: "fixed", right: open ? DRAWER_W : 0, top: "62%",
          zIndex: 120, cursor: "pointer",
          background: open ? PINK : "rgba(5,8,13,0.82)",
          color: open ? "#04060A" : PINK,
          border: `1px solid ${PINK}77`,
          borderRight: open ? "none" : `1px solid ${PINK}77`,
          borderRadius: "6px 0 0 6px",
          padding: "6px 5px",
          fontSize: 9, fontFamily: S.mono, letterSpacing: 1.5,
          writingMode: "vertical-rl", textOrientation: "mixed",
          userSelect: "none", backdropFilter: "blur(6px)",
          boxShadow: `0 0 14px ${PINK}33`,
          transition: "right 0.25s ease",
        }}
      >
        ◈ VOICES {profiles.length > 0 ? `(${profiles.length})` : "▶"}
      </div>

      {/* Drawer */}
      <div style={{
        position: "fixed", right: open ? 0 : -DRAWER_W - 2, top: 0, bottom: 0,
        width: DRAWER_W, zIndex: 119,
        background: "rgba(5,8,13,0.92)", borderLeft: `1px solid ${PINK}44`,
        backdropFilter: "blur(12px)", display: "flex", flexDirection: "column",
        transition: "right 0.25s ease",
        fontFamily: S.mono, color: "#DCEBF5",
      }}>
        {/* Header */}
        <div style={{
          padding: "10px 14px 8px", borderBottom: `1px solid ${PINK}33`,
          display: "flex", flexDirection: "column", gap: 5,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: PINK, fontSize: 10, letterSpacing: 2, fontWeight: 700 }}>
              ◈ VOICEFORGE
            </span>
            <span style={{ marginLeft: "auto", fontSize: 9, color: "#6B7280" }}>
              {data === null ? "…" : `${profiles.length} profile${profiles.length !== 1 ? "s" : ""}`}
            </span>
          </div>
          {data !== null && (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{
                fontSize: 9, letterSpacing: 1,
                color: xtts.available ? "#22C55E" : "#6B7280",
                border: `1px solid ${xtts.available ? "#22C55E55" : "#37415155"}`,
                borderRadius: 3, padding: "1px 5px",
              }}>
                XTTS {xtts.available ? "ONLINE" : "OFFLINE"}
              </span>
              {xtts.url && (
                <span style={{ fontSize: 9, color: "#4B5563" }}>
                  {xtts.url.replace(/^https?:\/\//, "")}
                </span>
              )}
            </div>
          )}
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {err && (
            <div style={{ padding: "14px", color: "#EF4444", fontSize: 10, textAlign: "center" }}>
              ENDPOINT ERROR — /v1/voiceforge/profiles
            </div>
          )}
          {!err && data === null && (
            <div style={{ padding: "14px", color: "#6B7280", fontSize: 10, textAlign: "center" }}>
              LOADING…
            </div>
          )}
          {!err && data !== null && profiles.length === 0 && (
            <div style={{ padding: "14px", color: "#6B7280", fontSize: 10, textAlign: "center" }}>
              NO VOICE PROFILES FOUND
            </div>
          )}
          {!err && profiles.map((p) => {
            const isActive = p.id === activeId;
            const createdTs = p.created_at ?? p.createdAt ?? 0;
            const updatedTs = p.updated_at ?? p.updatedAt ?? createdTs;
            return (
              <div
                key={p.id}
                style={{
                  padding: "9px 14px",
                  borderBottom: `1px solid ${PINK}11`,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 9,
                }}
              >
                {/* Active indicator */}
                <div style={{
                  marginTop: 3,
                  width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                  background: isActive ? PINK : "#374151",
                  boxShadow: isActive ? `0 0 6px ${PINK}` : "none",
                }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Name row */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
                  }}>
                    <span style={{
                      fontSize: 11, color: isActive ? PINK : "#E2E8F0",
                      fontWeight: isActive ? 700 : 400,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      maxWidth: 180,
                    }}>
                      {p.name || p.id}
                    </span>
                    {isActive && (
                      <span style={{
                        fontSize: 9, color: PINK, border: `1px solid ${PINK}55`,
                        borderRadius: 3, padding: "0px 4px", letterSpacing: 1,
                        flexShrink: 0,
                      }}>
                        ACTIVE
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  {p.description && (
                    <div style={{
                      fontSize: 9, color: "#6B7280", marginTop: 2,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {p.description}
                    </div>
                  )}

                  {/* Meta row */}
                  <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
                    <span style={{ fontSize: 9, color: "#4B5563" }}>
                      id: {p.id}
                    </span>
                    <span style={{ marginLeft: "auto", fontSize: 9, color: "#4B5563", flexShrink: 0 }}>
                      {relTime(updatedTs || createdTs)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: "6px 14px", borderTop: `1px solid ${PINK}22`,
          fontSize: 9, color: "#374151", letterSpacing: 1,
        }}>
          GET /v1/voiceforge/profiles · 5 min poll · read-only
        </div>
      </div>
    </>
  );
}
