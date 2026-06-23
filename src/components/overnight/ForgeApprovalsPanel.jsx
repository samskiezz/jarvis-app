/**
 * ForgeApprovalsPanel — F52
 * Left-edge slide-in at 83 % vertical. Polls GET /v1/forge/approvals every 5 min.
 * Header shows Forge availability + model from GET /v1/forge/status (fetched once on open).
 * Each row: file path, status badge, diff excerpt.
 * Tab: FORGE ▶  Accent: lime (#84CC16)
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000;
const DRAWER_W = 320;
const LIME = "#84CC16";

function relTime(ts) {
  if (!ts) return "—";
  const ms = ts > 1e12 ? ts : ts * 1000;
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function StatusBadge({ status }) {
  const s = String(status || "pending").toLowerCase();
  let col = "#6B7280";
  if (s === "approved") col = "#22C55E";
  else if (s === "rejected" || s === "failed") col = "#EF4444";
  else if (s === "pending" || s === "awaiting_review") col = "#F59E0B";
  return (
    <span style={{
      fontFamily: S.mono, fontSize: S.fs?.xxs ?? 9,
      color: col, border: `1px solid ${col}55`, borderRadius: 3,
      padding: "1px 5px", letterSpacing: 1, textTransform: "uppercase", flexShrink: 0,
    }}>
      {s.replace("_", " ")}
    </span>
  );
}

export default function ForgeApprovalsPanel() {
  const [open, setOpen]     = useState(false);
  const [items, setItems]   = useState(null);
  const [forgeStatus, setForgeStatus] = useState(null);
  const [err, setErr]       = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [tick, bump]        = useReducer((n) => n + 1, 0);
  const timerRef            = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    // Fetch status once per open (read-only config info)
    if (!forgeStatus) {
      kimiClient.request("/v1/forge/status").then((d) => {
        if (alive) setForgeStatus(d);
      }).catch(() => {});
    }

    kimiClient
      .request("/v1/forge/approvals")
      .then((d) => {
        if (!alive) return;
        const arr = Array.isArray(d)
          ? d
          : (d?.items ?? d?.approvals ?? d?.changes ?? []);
        setItems(arr);
        setErr(false);
      })
      .catch(() => { if (alive) setErr(true); });

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => { alive = false; clearTimeout(timerRef.current); };
  }, [open, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const count = items?.length ?? 0;
  const available = forgeStatus?.available;
  const model = forgeStatus?.config?.model ?? forgeStatus?.model;

  return (
    <>
      {/* Tab toggle */}
      <div
        onClick={() => setOpen((o) => !o)}
        title="Forge Approvals — GET /v1/forge/approvals"
        style={{
          position: "fixed", left: open ? DRAWER_W : 0, top: "83%",
          zIndex: 120, cursor: "pointer",
          background: open ? LIME : "rgba(5,8,13,0.82)",
          color: open ? "#04060A" : LIME,
          border: `1px solid ${LIME}77`,
          borderLeft: open ? "none" : `1px solid ${LIME}77`,
          borderRadius: open ? "0 6px 6px 0" : "0 6px 6px 0",
          padding: "6px 5px",
          fontSize: 9, fontFamily: S.mono, letterSpacing: 1.5,
          writingMode: "vertical-rl", textOrientation: "mixed",
          userSelect: "none", backdropFilter: "blur(6px)",
          boxShadow: `0 0 14px ${LIME}33`,
          transition: "left 0.25s ease",
        }}
      >
        FORGE {count > 0 ? `(${count})` : "▶"}
      </div>

      {/* Drawer */}
      <div style={{
        position: "fixed", left: open ? 0 : -DRAWER_W - 2, top: 0, bottom: 0,
        width: DRAWER_W, zIndex: 119,
        background: "rgba(5,8,13,0.92)", borderRight: `1px solid ${LIME}44`,
        backdropFilter: "blur(12px)", display: "flex", flexDirection: "column",
        transition: "left 0.25s ease",
        fontFamily: S.mono, color: "#DCEBF5",
      }}>
        {/* Header */}
        <div style={{
          padding: "10px 14px 8px", borderBottom: `1px solid ${LIME}33`,
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: LIME, fontSize: 10, letterSpacing: 2, fontWeight: 700 }}>
              FORGE APPROVALS
            </span>
            <span style={{ marginLeft: "auto", fontSize: 9, color: "#6B7280" }}>
              {items === null ? "…" : `${count} change${count !== 1 ? "s" : ""}`}
            </span>
          </div>
          {forgeStatus && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={{
                fontSize: 9, color: available ? "#22C55E" : "#6B7280",
                border: `1px solid ${available ? "#22C55E" : "#374151"}55`,
                borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
              }}>
                {available ? "AVAILABLE" : "UNAVAILABLE"}
              </span>
              {model && (
                <span style={{
                  fontSize: 9, color: LIME, border: `1px solid ${LIME}44`,
                  borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                  maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {model}
                </span>
              )}
            </div>
          )}
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {err && (
            <div style={{ padding: "14px", color: "#EF4444", fontSize: 10, textAlign: "center" }}>
              ENDPOINT ERROR — /v1/forge/approvals
            </div>
          )}
          {!err && items === null && (
            <div style={{ padding: "14px", color: "#6B7280", fontSize: 10, textAlign: "center" }}>
              LOADING…
            </div>
          )}
          {!err && items !== null && items.length === 0 && (
            <div style={{ padding: "14px", color: "#6B7280", fontSize: 10, textAlign: "center" }}>
              NO PENDING FORGE CHANGES
            </div>
          )}
          {!err && items !== null && items.map((change) => {
            const id = change.id ?? change.change_id ?? change.file ?? "—";
            const filePath = change.file ?? change.path ?? change.file_path ?? id;
            const isExpanded = expanded === id;
            const diff = change.diff ?? change.patch ?? change.content ?? null;
            const ts = change.created_at ?? change.ts ?? 0;
            return (
              <div
                key={id}
                onClick={() => setExpanded(isExpanded ? null : id)}
                style={{
                  padding: "8px 14px", borderBottom: `1px solid ${LIME}11`,
                  cursor: diff ? "pointer" : "default",
                }}
              >
                {/* File path */}
                <div style={{
                  fontSize: 10, marginBottom: 5, color: "#DCEBF5",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  fontFamily: "monospace",
                }}>
                  {filePath}
                </div>
                {/* Meta row */}
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <StatusBadge status={change.status ?? change.state} />
                  {change.lines_changed != null && (
                    <span style={{ fontSize: 9, color: LIME }}>
                      {change.lines_changed > 0 ? `+${change.lines_changed}` : change.lines_changed}L
                    </span>
                  )}
                  <span style={{ marginLeft: "auto", fontSize: 9, color: "#4B5563", flexShrink: 0 }}>
                    {relTime(ts)}
                  </span>
                </div>
                {/* Diff excerpt (expanded) */}
                {isExpanded && diff && (
                  <pre style={{
                    marginTop: 8, padding: "6px 8px", background: "rgba(0,0,0,0.4)",
                    borderRadius: 4, fontSize: 9, color: "#9CA3AF", overflow: "auto",
                    maxHeight: 140, whiteSpace: "pre-wrap", wordBreak: "break-all",
                    border: `1px solid ${LIME}22`,
                  }}>
                    {String(diff).slice(0, 600)}{String(diff).length > 600 ? "\n…" : ""}
                  </pre>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: "6px 14px", borderTop: `1px solid ${LIME}22`,
          fontSize: 9, color: "#374151", letterSpacing: 1,
        }}>
          GET /v1/forge/approvals · 5 min poll · read-only
        </div>
      </div>
    </>
  );
}
