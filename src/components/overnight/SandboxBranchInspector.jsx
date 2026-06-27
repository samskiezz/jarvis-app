/**
 * SandboxBranchInspector — F141
 * Left-edge slide-in at 68 % vertical. Polls GET /v1/jarvis/sandbox/branches
 * every 3 min. Clicking a branch fetches GET /v1/jarvis/sandbox/{branch}/diff
 * and shows field-level object diffs inline (before → after props).
 * Tab: SBXBR ◀  Accent: cyan (#22D3EE)
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 180_000;
const DRAWER_W = 320;
const CYAN = "#22D3EE";

function relTime(ts) {
  if (!ts) return "—";
  const sec = typeof ts === "number" ? (ts > 1e10 ? ts / 1000 : ts) : Math.floor(Date.parse(ts) / 1000);
  if (!sec || isNaN(sec)) return "—";
  const diff = Math.floor(Date.now() / 1000 - sec);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function Badge({ label, color, dim }) {
  return (
    <span style={{
      fontFamily: S.mono, fontSize: S.fs?.xxs ?? 9,
      color: dim ? "#6B7280" : color,
      border: `1px solid ${dim ? "#6B728044" : color + "55"}`,
      borderRadius: 3, padding: "1px 5px",
      letterSpacing: 1, textTransform: "uppercase", flexShrink: 0,
    }}>
      {label}
    </span>
  );
}

function DiffRow({ change }) {
  const [open, setOpen] = useState(false);
  const { object_id, before, after } = change;

  const afterKeys = Object.keys(after?.props ?? {});
  const beforeKeys = Object.keys(before?.props ?? {});
  const allKeys = [...new Set([...beforeKeys, ...afterKeys])];
  const changed = allKeys.filter(k => {
    const bv = JSON.stringify(before?.props?.[k]);
    const av = JSON.stringify(after?.props?.[k]);
    return bv !== av;
  });

  return (
    <div style={{ borderBottom: `1px solid ${CYAN}11` }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          padding: "7px 14px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 8,
        }}
      >
        <span style={{ fontSize: 10, flex: 1, wordBreak: "break-all", color: "#DCEBF5" }}>
          {object_id}
        </span>
        <Badge label={`Δ${changed.length}`} color={changed.length ? "#F97316" : "#6B7280"} />
        <span style={{ color: CYAN, fontSize: 9 }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div style={{ padding: "0 14px 10px", fontSize: 9, color: "#9CA3AF" }}>
          {changed.length === 0 && (
            <div style={{ color: "#6B7280" }}>no prop changes</div>
          )}
          {changed.map(k => {
            const bv = before?.props?.[k];
            const av = after?.props?.[k];
            return (
              <div key={k} style={{ marginBottom: 4 }}>
                <span style={{ color: CYAN }}>{k}</span>
                <div style={{ marginLeft: 8, color: "#EF4444", wordBreak: "break-all" }}>
                  — {JSON.stringify(bv) ?? "∅"}
                </div>
                <div style={{ marginLeft: 8, color: "#22C55E", wordBreak: "break-all" }}>
                  + {JSON.stringify(av) ?? "∅"}
                </div>
              </div>
            );
          })}
          {(before?.state !== after?.state) && (
            <div style={{ marginTop: 4 }}>
              <span style={{ color: CYAN }}>state</span>
              <div style={{ marginLeft: 8, color: "#EF4444" }}>— {before?.state ?? "∅"}</div>
              <div style={{ marginLeft: 8, color: "#22C55E" }}>+ {after?.state ?? "∅"}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SandboxBranchInspector() {
  const [open, setOpen]         = useState(false);
  const [branches, setBranches] = useState(null);
  const [err, setErr]           = useState(false);
  const [selected, setSelected] = useState(null);
  const [diff, setDiff]         = useState(null);
  const [diffErr, setDiffErr]   = useState(false);
  const [diffBusy, setDiffBusy] = useState(false);
  const [tick, bump]            = useReducer(n => n + 1, 0);
  const timerRef                = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    kimiClient
      .request("/v1/jarvis/sandbox/branches")
      .then(d => {
        if (!alive) return;
        setBranches(Array.isArray(d?.branches) ? d.branches : (Array.isArray(d) ? d : []));
        setErr(false);
      })
      .catch(() => { if (alive) setErr(true); });

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => { alive = false; clearTimeout(timerRef.current); };
  }, [open, tick]);

  function selectBranch(name) {
    if (selected === name) { setSelected(null); setDiff(null); return; }
    setSelected(name);
    setDiff(null);
    setDiffErr(false);
    setDiffBusy(true);
    kimiClient
      .request(`/v1/jarvis/sandbox/${encodeURIComponent(name)}/diff`)
      .then(d => { setDiff(d); setDiffErr(false); })
      .catch(() => setDiffErr(true))
      .finally(() => setDiffBusy(false));
  }

  const count = branches?.length ?? 0;

  return (
    <>
      {/* Tab toggle */}
      <div
        onClick={() => setOpen(o => !o)}
        title="Sandbox Branch Inspector"
        style={{
          position: "fixed", left: open ? DRAWER_W : 0, top: "68%",
          zIndex: 120, cursor: "pointer",
          background: open ? CYAN : "rgba(5,8,13,0.82)",
          color: open ? "#04060A" : CYAN,
          border: `1px solid ${CYAN}77`,
          borderLeft: open ? "none" : `1px solid ${CYAN}77`,
          borderRadius: "0 6px 6px 0",
          padding: "6px 5px",
          fontSize: 9, fontFamily: S.mono, letterSpacing: 1.5,
          writingMode: "vertical-rl", textOrientation: "mixed",
          userSelect: "none", backdropFilter: "blur(6px)",
          boxShadow: `0 0 14px ${CYAN}33`,
          transition: "left 0.25s ease",
        }}
      >
        SBXBR {count > 0 ? `(${count})` : "◀"}
      </div>

      {/* Drawer */}
      <div style={{
        position: "fixed", left: open ? 0 : -DRAWER_W - 2, top: 0, bottom: 0,
        width: DRAWER_W, zIndex: 119,
        background: "rgba(5,8,13,0.92)", borderRight: `1px solid ${CYAN}44`,
        backdropFilter: "blur(12px)", display: "flex", flexDirection: "column",
        transition: "left 0.25s ease",
        fontFamily: S.mono, color: "#DCEBF5",
      }}>
        {/* Header */}
        <div style={{
          padding: "10px 14px 8px",
          borderBottom: `1px solid ${CYAN}33`,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ color: CYAN, fontSize: 10, letterSpacing: 2, fontWeight: 700 }}>
            SANDBOX BRANCHES
          </span>
          <span style={{ marginLeft: "auto", fontSize: 9, color: "#6B7280" }}>
            {branches === null ? "…" : `${count} branch${count !== 1 ? "es" : ""}`}
          </span>
        </div>

        {/* Branch list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {err && (
            <div style={{ padding: 14, color: "#EF4444", fontSize: 10, textAlign: "center" }}>
              ENDPOINT ERROR — /v1/jarvis/sandbox/branches
            </div>
          )}
          {!err && branches === null && (
            <div style={{ padding: 14, color: "#6B7280", fontSize: 10, textAlign: "center" }}>
              LOADING…
            </div>
          )}
          {!err && branches !== null && branches.length === 0 && (
            <div style={{ padding: 14, color: "#6B7280", fontSize: 10, textAlign: "center" }}>
              NO SANDBOX BRANCHES
            </div>
          )}
          {!err && branches !== null && branches.map(b => {
            const name = b.name ?? b.id ?? "?";
            const base = b.base ?? "main";
            const actor = b.actor ?? b.created_by ?? "—";
            const ts = b.created_ts ?? b.created_at;
            const isSelected = selected === name;
            return (
              <div key={name}>
                <div
                  onClick={() => selectBranch(name)}
                  style={{
                    padding: "8px 14px", cursor: "pointer",
                    borderBottom: `1px solid ${CYAN}11`,
                    background: isSelected ? `${CYAN}0D` : "transparent",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, flex: 1, wordBreak: "break-all" }}>
                      {name}
                    </span>
                    <Badge label={`⬡ ${base}`} color={CYAN} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 9, color: "#6B7280" }}>actor: {actor}</span>
                    <span style={{ marginLeft: "auto", fontSize: 9, color: "#4B5563" }}>
                      {relTime(ts)}
                    </span>
                  </div>
                </div>

                {/* Diff panel */}
                {isSelected && (
                  <div style={{
                    background: `${CYAN}08`,
                    borderBottom: `1px solid ${CYAN}22`,
                  }}>
                    <div style={{
                      padding: "6px 14px",
                      borderBottom: `1px solid ${CYAN}22`,
                      display: "flex", alignItems: "center", gap: 8,
                    }}>
                      <span style={{ color: CYAN, fontSize: 9, letterSpacing: 1 }}>
                        DIFF — {name}
                      </span>
                      {diff && (
                        <Badge label={`${diff.changed} obj`} color="#F97316" />
                      )}
                    </div>
                    {diffBusy && (
                      <div style={{ padding: 10, color: "#6B7280", fontSize: 9, textAlign: "center" }}>
                        LOADING DIFF…
                      </div>
                    )}
                    {diffErr && (
                      <div style={{ padding: 10, color: "#EF4444", fontSize: 9, textAlign: "center" }}>
                        DIFF UNAVAILABLE
                      </div>
                    )}
                    {!diffBusy && !diffErr && diff && diff.changes?.length === 0 && (
                      <div style={{ padding: 10, color: "#6B7280", fontSize: 9, textAlign: "center" }}>
                        NO CHANGES IN BRANCH
                      </div>
                    )}
                    {!diffBusy && !diffErr && diff && diff.changes?.map((c, i) => (
                      <DiffRow key={c.object_id ?? i} change={c} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: "6px 14px",
          borderTop: `1px solid ${CYAN}22`,
          fontSize: 9, color: "#374151", letterSpacing: 1,
        }}>
          GET /v1/jarvis/sandbox/branches · 3 min poll
        </div>
      </div>
    </>
  );
}
