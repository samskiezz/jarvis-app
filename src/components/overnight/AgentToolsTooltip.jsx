/**
 * AgentToolsTooltip — hoverable TOOLS label in the breadcrumb top strip.
 * On first hover fetches GET /v1/jarvis/agent/tools (once, session-cached)
 * and shows a floating card listing each tool name + description.
 *
 * Mounted inside the breadcrumb strip <div> in src/Layout.jsx.
 */
import { useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const CY = "#29E7FF";

export default function AgentToolsTooltip() {
  const [tools, setTools] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(false);
  const [visible, setVisible] = useState(false);
  const fetchedRef = useRef(false);

  function fetchOnce() {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    kimiClient
      .request("/v1/jarvis/agent/tools")
      .then((d) => {
        setTools(Array.isArray(d?.tools) ? d.tools : []);
        setLoading(false);
      })
      .catch(() => {
        setErr(true);
        setLoading(false);
      });
  }

  return (
    <div
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      onMouseEnter={() => { setVisible(true); fetchOnce(); }}
      onMouseLeave={() => setVisible(false)}
    >
      <button
        style={{
          background: "transparent",
          border: "none",
          color: S.text,
          cursor: "pointer",
          fontFamily: S.mono,
          fontSize: S.fs.xxs,
          letterSpacing: 1,
          padding: "0 4px",
          lineHeight: 1,
        }}
        title="JARVIS agent tools"
      >
        TOOLS
      </button>

      {visible && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            zIndex: 200,
            width: 280,
            maxHeight: 320,
            overflowY: "auto",
            background: "rgba(3,8,16,0.97)",
            border: `1px solid ${CY}33`,
            borderRadius: 8,
            padding: "8px 0",
            boxShadow: `0 0 40px ${CY}10, 0 12px 32px rgba(0,0,0,0.8)`,
            fontFamily: S.mono,
          }}
        >
          <div
            style={{
              fontSize: S.fs.xxs,
              color: CY,
              letterSpacing: 2,
              padding: "4px 12px 8px",
              borderBottom: `1px solid ${CY}22`,
            }}
          >
            AGENT TOOLS
          </div>

          {loading && (
            <div style={{ padding: "10px 12px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          )}

          {err && (
            <div style={{ padding: "10px 12px", color: "#e8203c", fontSize: S.fs.xxs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          )}

          {tools && tools.length === 0 && (
            <div style={{ padding: "10px 12px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              NO TOOLS REGISTERED
            </div>
          )}

          {tools && tools.map((tool, i) => (
            <div
              key={tool.name ?? i}
              style={{
                padding: "5px 12px",
                borderBottom: i < tools.length - 1 ? `1px solid ${CY}11` : "none",
              }}
            >
              <div style={{ fontSize: S.fs.xxs, color: S.textHi, letterSpacing: 0.5 }}>
                {tool.name}
              </div>
              {tool.description && (
                <div
                  style={{
                    fontSize: S.fs.xxs,
                    color: S.text,
                    letterSpacing: 0,
                    marginTop: 2,
                    lineHeight: 1.4,
                    wordBreak: "break-word",
                  }}
                >
                  {tool.description}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
