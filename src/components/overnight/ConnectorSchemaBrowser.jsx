/**
 * ConnectorSchemaBrowser — Feature 166
 * Right-edge slide-in drawer at 8 % from top showing the available data-source
 * connector KIND schemas from GET /v1/connectors.  Two tabs:
 *   CONNECTORS — the connector kind registry (name, kind badge, description,
 *                required-param count; expand to see full param schema)
 *   TRANSFORMS — declarative pipeline operations (op, description, params)
 *
 * Fetched once on open and session-cached via useRef (schema never changes at
 * runtime).  Endpoint: GET /v1/connectors → {connectors:[...], transforms:[...]}.
 *
 * Mounted in src/Layout.jsx after <PalantirFeatureAuditDrawer />.
 */
import { useEffect, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const ACCENT = "#22D3EE";
const DRAWER_W = 340;

const KIND_COLORS = {
  geo: "#4ADE80",
  finance: "#FBBF24",
  generic: "#38BDF8",
  weather: "#60A5FA",
  ais: "#A78BFA",
  solar: "#F97316",
  seismic: "#F87171",
};

function kindColor(kind) {
  return KIND_COLORS[kind] || "#94A3B8";
}

export default function ConnectorSchemaBrowser() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("connectors");
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const cachedRef = useRef(null);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    if (!open) return;
    if (cachedRef.current) {
      setData(cachedRef.current);
      return;
    }
    let alive = true;
    kimiClient
      .request("/v1/connectors")
      .then((d) => {
        if (!alive) return;
        cachedRef.current = d;
        setData(d);
        setErr(false);
      })
      .catch(() => {
        if (alive) setErr(true);
      });
    return () => { alive = false; };
  }, [open]);

  function toggleRow(key) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const connectors = data?.connectors ?? [];
  const transforms = data?.transforms ?? [];

  return (
    <>
      {/* Fixed toggle tab — right edge, 8 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close connector schemas" : "Browse connector kind schemas"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "8%",
          transform: "translateY(-50%)",
          zIndex: 9020,
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
        {open ? "CONN ▶" : "CONN ◀"}
      </button>

      {/* Drawer panel — slides in from the right */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 9019,
          background: "rgba(2,6,10,0.97)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderLeft: `1px solid ${ACCENT}33`,
          display: "flex",
          flexDirection: "column",
          transition: "right 0.2s ease",
          fontFamily: S.mono,
          overflowX: "hidden",
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
            CONNECTOR SCHEMAS
          </span>
          {data && (
            <span
              style={{
                fontSize: 9,
                color: ACCENT,
                border: `1px solid ${ACCENT}44`,
                borderRadius: 3,
                padding: "1px 6px",
                letterSpacing: 1,
              }}
            >
              {connectors.length}
            </span>
          )}
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", borderBottom: `1px solid ${S.border}`, flexShrink: 0 }}>
          {["connectors", "transforms"].map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              style={{
                flex: 1,
                padding: "6px 0",
                background: activeTab === t ? `${ACCENT}18` : "none",
                border: "none",
                borderBottom: activeTab === t ? `2px solid ${ACCENT}` : "2px solid transparent",
                color: activeTab === t ? ACCENT : S.text,
                fontFamily: S.mono,
                fontSize: 9,
                letterSpacing: 2,
                cursor: "pointer",
                textTransform: "uppercase",
              }}
            >
              {t}
              {t === "transforms" && transforms.length > 0 && (
                <span style={{ marginLeft: 4, opacity: 0.7 }}>({transforms.length})</span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {!open ? null : err ? (
            <div
              style={{
                padding: "20px 14px",
                color: "#F59E0B",
                fontSize: S.fs.xs,
                letterSpacing: 1,
              }}
            >
              ENDPOINT UNREACHABLE
            </div>
          ) : !data ? (
            <div
              style={{
                padding: "20px 14px",
                color: S.text,
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              LOADING…
            </div>
          ) : activeTab === "connectors" ? (
            connectors.length === 0 ? (
              <div
                style={{
                  padding: "20px 14px",
                  color: S.text,
                  fontSize: S.fs.xxs,
                  letterSpacing: 1,
                }}
              >
                NO CONNECTORS REGISTERED
              </div>
            ) : (
              connectors.map((c) => {
                const key = c.connector || c.name || String(c);
                const isOpen = !!expanded[key];
                const params = Object.entries(c.params || {});
                const reqCount = params.filter(([, v]) => v?.required).length;
                const kColor = kindColor(c.kind);

                return (
                  <div key={key} style={{ borderBottom: `1px solid ${S.border}` }}>
                    <button
                      onClick={() => toggleRow(key)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 8,
                        padding: "10px 14px",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            marginBottom: 3,
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              fontSize: S.fs.xxs,
                              color: "#DCEBF5",
                              letterSpacing: 1,
                            }}
                          >
                            {(c.connector || c.name || "?").toUpperCase()}
                          </span>
                          <span
                            style={{
                              fontSize: 8,
                              color: "#000",
                              background: kColor,
                              borderRadius: 2,
                              padding: "1px 5px",
                              letterSpacing: 1,
                              textTransform: "uppercase",
                              fontFamily: S.mono,
                              flexShrink: 0,
                            }}
                          >
                            {c.kind || "?"}
                          </span>
                          {reqCount > 0 && (
                            <span
                              style={{
                                fontSize: 8,
                                color: ACCENT,
                                border: `1px solid ${ACCENT}44`,
                                borderRadius: 2,
                                padding: "1px 4px",
                                letterSpacing: 1,
                                flexShrink: 0,
                              }}
                            >
                              {reqCount} REQ
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: 9,
                            color: S.text,
                            letterSpacing: 0.5,
                            lineHeight: 1.4,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: isOpen ? "normal" : "nowrap",
                          }}
                        >
                          {c.description || "—"}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 9,
                          color: S.text,
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      >
                        {isOpen ? "▲" : "▼"}
                      </span>
                    </button>

                    {/* Expanded param schema */}
                    {isOpen && params.length > 0 && (
                      <div
                        style={{
                          borderTop: `1px solid ${ACCENT}22`,
                          background: "rgba(255,255,255,0.015)",
                          padding: "6px 14px 8px 18px",
                        }}
                      >
                        {params.map(([pName, pDef]) => (
                          <div
                            key={pName}
                            style={{
                              padding: "5px 0",
                              borderBottom: `1px solid ${S.border}`,
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 6,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 8,
                                color: "#DCEBF5",
                                letterSpacing: 0.5,
                                flexShrink: 0,
                                minWidth: 80,
                                paddingTop: 1,
                              }}
                            >
                              {pName}
                            </span>
                            <span
                              style={{
                                fontSize: 7,
                                color: "#94A3B8",
                                border: "1px solid #94A3B844",
                                borderRadius: 2,
                                padding: "1px 4px",
                                letterSpacing: 1,
                                flexShrink: 0,
                                textTransform: "uppercase",
                              }}
                            >
                              {pDef?.type || "any"}
                            </span>
                            <span
                              style={{
                                fontSize: 7,
                                color: pDef?.required ? "#F87171" : "#4ADE80",
                                border: `1px solid ${pDef?.required ? "#F87171" : "#4ADE80"}44`,
                                borderRadius: 2,
                                padding: "1px 4px",
                                letterSpacing: 1,
                                flexShrink: 0,
                                textTransform: "uppercase",
                              }}
                            >
                              {pDef?.required ? "REQ" : "OPT"}
                            </span>
                            <span
                              style={{
                                fontSize: 8,
                                color: S.text,
                                letterSpacing: 0.3,
                                lineHeight: 1.4,
                                flex: 1,
                              }}
                            >
                              {pDef?.description || ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {isOpen && params.length === 0 && (
                      <div
                        style={{
                          padding: "6px 18px 8px",
                          fontSize: 8,
                          color: S.text,
                          letterSpacing: 1,
                          borderTop: `1px solid ${ACCENT}22`,
                          background: "rgba(255,255,255,0.015)",
                        }}
                      >
                        NO PARAMS REQUIRED
                      </div>
                    )}
                  </div>
                );
              })
            )
          ) : (
            /* Transforms tab */
            transforms.length === 0 ? (
              <div
                style={{
                  padding: "20px 14px",
                  color: S.text,
                  fontSize: S.fs.xxs,
                  letterSpacing: 1,
                }}
              >
                NO TRANSFORMS REGISTERED
              </div>
            ) : (
              transforms.map((t) => {
                const key = `tfm_${t.op || String(Math.random())}`;
                const isOpen = !!expanded[key];
                const params = Object.entries(t.params || {});

                return (
                  <div key={key} style={{ borderBottom: `1px solid ${S.border}` }}>
                    <button
                      onClick={() => toggleRow(key)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 8,
                        padding: "10px 14px",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            marginBottom: 3,
                          }}
                        >
                          <span
                            style={{
                              fontSize: S.fs.xxs,
                              color: "#DCEBF5",
                              letterSpacing: 1,
                            }}
                          >
                            {(t.op || "?").toUpperCase()}
                          </span>
                          <span
                            style={{
                              fontSize: 8,
                              color: ACCENT,
                              border: `1px solid ${ACCENT}44`,
                              borderRadius: 2,
                              padding: "1px 4px",
                              letterSpacing: 1,
                              flexShrink: 0,
                            }}
                          >
                            TFM
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 9,
                            color: S.text,
                            letterSpacing: 0.5,
                            lineHeight: 1.4,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: isOpen ? "normal" : "nowrap",
                          }}
                        >
                          {t.description || "—"}
                        </div>
                      </div>
                      <span
                        style={{ fontSize: 9, color: S.text, flexShrink: 0, marginTop: 2 }}
                      >
                        {isOpen ? "▲" : "▼"}
                      </span>
                    </button>

                    {isOpen && params.length > 0 && (
                      <div
                        style={{
                          borderTop: `1px solid ${ACCENT}22`,
                          background: "rgba(255,255,255,0.015)",
                          padding: "6px 14px 8px 18px",
                        }}
                      >
                        {params.map(([pName, pDef]) => (
                          <div
                            key={pName}
                            style={{
                              padding: "5px 0",
                              borderBottom: `1px solid ${S.border}`,
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 6,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 8,
                                color: "#DCEBF5",
                                letterSpacing: 0.5,
                                flexShrink: 0,
                                minWidth: 80,
                                paddingTop: 1,
                              }}
                            >
                              {pName}
                            </span>
                            <span
                              style={{
                                fontSize: 7,
                                color: "#94A3B8",
                                border: "1px solid #94A3B844",
                                borderRadius: 2,
                                padding: "1px 4px",
                                letterSpacing: 1,
                                flexShrink: 0,
                                textTransform: "uppercase",
                              }}
                            >
                              {pDef?.type || "any"}
                            </span>
                            <span
                              style={{
                                fontSize: 7,
                                color: pDef?.required ? "#F87171" : "#4ADE80",
                                border: `1px solid ${pDef?.required ? "#F87171" : "#4ADE80"}44`,
                                borderRadius: 2,
                                padding: "1px 4px",
                                letterSpacing: 1,
                                flexShrink: 0,
                                textTransform: "uppercase",
                              }}
                            >
                              {pDef?.required ? "REQ" : "OPT"}
                            </span>
                            <span
                              style={{
                                fontSize: 8,
                                color: S.text,
                                letterSpacing: 0.3,
                                lineHeight: 1.4,
                                flex: 1,
                              }}
                            >
                              {pDef?.description || ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "6px 14px",
            borderTop: `1px solid ${S.border}`,
            fontSize: 8,
            color: S.text,
            letterSpacing: 1,
            flexShrink: 0,
          }}
        >
          CONNECTOR SCHEMAS · GET /v1/connectors · CACHED PER SESSION
        </div>
      </div>
    </>
  );
}
