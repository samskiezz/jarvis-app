/**
 * RitualDeckPanel — Feature 32
 * Left-edge slide-in drawer listing configured routines from
 * GET /v1/ritual/list, polling every 5 minutes while open.
 *
 * Tab at 45 % from top on left edge (between ScenarioRunsPanel 35 %
 * and SkillScorecardPanel 50 %). Accent colour: orange (#F97316).
 *
 * Endpoint: GET /v1/ritual/list
 * → { items: [{ id, name, steps: [{ label, action, destructive }] }] }
 *
 * Mounted in src/Layout.jsx after <ScenarioRunsPanel />.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000;
const DRAWER_W = 300;
const ORANGE = "#F97316";

export default function RitualDeckPanel() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/ritual/list")
      .then((d) => {
        if (alive) {
          setData(d);
          setErr(false);
        }
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

  const routines = data?.items ?? [];

  return (
    <>
      {/* Fixed toggle tab — left edge, 45 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close ritual deck" : "Open ritual deck"}
        style={{
          position: "fixed",
          left: open ? DRAWER_W : 0,
          top: "45%",
          transform: open
            ? "translateY(-50%) rotate(180deg)"
            : "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${ORANGE}55`,
          borderLeft: open ? "none" : `1px solid ${ORANGE}55`,
          color: ORANGE,
          fontFamily: S.mono,
          fontSize: S.fs.xxs,
          letterSpacing: 2,
          padding: "10px 5px",
          cursor: "pointer",
          borderRadius: "0 4px 4px 0",
          transition: "left 0.2s ease",
          userSelect: "none",
        }}
      >
        {open ? "RITUALS ▶" : "RITUALS ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          left: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8988,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderRight: `1px solid ${ORANGE}33`,
          display: "flex",
          flexDirection: "column",
          transition: "left 0.2s ease",
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
          <span style={{ fontSize: S.fs.xs, color: ORANGE, letterSpacing: 2, flex: 1 }}>
            RITUAL DECK
          </span>
          {data && (
            <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1 }}>
              {routines.length} routines
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {!open ? null : err ? (
            <div style={{ padding: "20px 14px", color: ORANGE, fontSize: S.fs.xs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : !data ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : routines.length === 0 ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              NO ROUTINES CONFIGURED
            </div>
          ) : (
            routines.map((routine) => {
              const isOpen = expanded === routine.id;
              const steps = routine.steps ?? [];
              return (
                <div
                  key={routine.id}
                  style={{
                    borderBottom: `1px solid ${S.border}`,
                  }}
                >
                  {/* Routine header row */}
                  <button
                    onClick={() => setExpanded(isOpen ? null : routine.id)}
                    style={{
                      width: "100%",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "9px 14px",
                      textAlign: "left",
                      fontFamily: S.mono,
                    }}
                  >
                    <span
                      style={{
                        color: "#DCEBF5",
                        fontSize: S.fs.xs,
                        letterSpacing: 0.5,
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {routine.name || routine.id}
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        color: `${ORANGE}AA`,
                        border: `1px solid ${ORANGE}33`,
                        borderRadius: 3,
                        padding: "1px 5px",
                        letterSpacing: 1,
                        flexShrink: 0,
                      }}
                    >
                      {steps.length} STEPS
                    </span>
                    <span style={{ color: ORANGE, fontSize: S.fs.xxs, flexShrink: 0 }}>
                      {isOpen ? "▴" : "▾"}
                    </span>
                  </button>

                  {/* Expanded step list */}
                  {isOpen && steps.length > 0 && (
                    <div style={{ padding: "0 14px 10px 22px" }}>
                      {steps.map((step, i) => (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "4px 0",
                            borderTop: i === 0 ? "none" : `1px solid ${S.border}33`,
                          }}
                        >
                          <span style={{ color: `${ORANGE}66`, fontSize: S.fs.xxs, flexShrink: 0 }}>
                            {i + 1}.
                          </span>
                          <span
                            style={{
                              color: step.destructive ? "#F87171" : S.text,
                              fontSize: S.fs.xxs,
                              flex: 1,
                              letterSpacing: 0.5,
                            }}
                          >
                            {step.label}
                          </span>
                          {step.destructive && (
                            <span
                              style={{
                                fontSize: 8,
                                color: "#F87171",
                                border: "1px solid #F8717133",
                                borderRadius: 3,
                                padding: "1px 4px",
                                letterSpacing: 1,
                                flexShrink: 0,
                              }}
                            >
                              ⚠ DEST
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
