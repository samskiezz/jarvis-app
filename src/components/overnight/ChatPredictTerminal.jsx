import { useState, useRef, useCallback } from "react";

const API = import.meta.env.VITE_API_BASE ?? "";
const ACCENT = "#0EA5E9";
const TAB_TOP = "25%";

function rel(ts) {
  if (!ts) return "";
  const d = Date.now() - new Date(ts).getTime();
  if (d < 60000) return `${Math.round(d / 1000)}s ago`;
  if (d < 3600000) return `${Math.round(d / 60000)}m ago`;
  return `${Math.round(d / 3600000)}h ago`;
}

function ConfidenceBar({ value }) {
  const pct = Math.round((value ?? 0) * 100);
  const col = pct >= 70 ? "#4ADE80" : pct >= 40 ? "#FBBF24" : "#F87171";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
      <div style={{ flex: 1, height: 4, background: "#1e293b", borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: col, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 10, color: col, fontFamily: "monospace", minWidth: 32 }}>{pct}%</span>
    </div>
  );
}

export default function ChatPredictTerminal() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]); // [{q, ts, route, predict}]
  const inputRef = useRef(null);

  const run = useCallback(async () => {
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    try {
      const routeRes = await fetch(`${API}/v1/chat/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q }),
      });
      const route = routeRes.ok ? await routeRes.json() : { intent: "error", error: routeRes.status };

      let predict = null;
      if (route.intent === "prediction") {
        const predictRes = await fetch(`${API}/v1/chat/predict`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: q }),
        });
        predict = predictRes.ok ? await predictRes.json() : { handled: false, error: predictRes.status };
      }

      setHistory((prev) => [{ q, ts: new Date().toISOString(), route, predict }, ...prev].slice(0, 8));
      setQuery("");
    } finally {
      setLoading(false);
    }
  }, [query, loading]);

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); run(); }
  };

  const drawerW = 380;

  return (
    <>
      {/* Tab button */}
      <div
        onClick={() => { setOpen((o) => !o); setTimeout(() => inputRef.current?.focus(), 80); }}
        title="Chat Predict Terminal"
        style={{
          position: "fixed",
          left: open ? drawerW : 0,
          top: TAB_TOP,
          transform: "translateY(-50%)",
          zIndex: 1600,
          cursor: "pointer",
          background: open ? ACCENT : "#0f172a",
          border: `1px solid ${ACCENT}`,
          borderLeft: open ? "none" : `1px solid ${ACCENT}`,
          borderRadius: open ? "0 4px 4px 0" : "0 4px 4px 0",
          padding: "6px 4px",
          writingMode: "vertical-rl",
          fontSize: 9,
          fontFamily: "monospace",
          color: open ? "#0f172a" : ACCENT,
          letterSpacing: 1,
          userSelect: "none",
          transition: "left 0.25s",
        }}
      >
        FCAST ▶
      </div>

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          left: open ? 0 : -drawerW,
          top: 0,
          width: drawerW,
          height: "100vh",
          background: "#0a0f1e",
          borderRight: `1px solid ${ACCENT}44`,
          zIndex: 1599,
          display: "flex",
          flexDirection: "column",
          transition: "left 0.25s",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "10px 12px 8px",
          borderBottom: `1px solid ${ACCENT}33`,
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
        }}>
          <span style={{ color: ACCENT, fontFamily: "monospace", fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
            ◈ FORECAST TERMINAL
          </span>
          <span style={{ marginLeft: "auto", fontSize: 9, color: "#64748b", fontFamily: "monospace" }}>
            /v1/chat/predict
          </span>
        </div>

        {/* Input */}
        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${ACCENT}22`, flexShrink: 0 }}>
          <textarea
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Ask a forecast question… (↵ submit)"
            rows={3}
            style={{
              width: "100%",
              background: "#0f172a",
              border: `1px solid ${ACCENT}44`,
              borderRadius: 4,
              color: "#e2e8f0",
              fontFamily: "monospace",
              fontSize: 11,
              padding: "6px 8px",
              resize: "none",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <button
            onClick={run}
            disabled={!query.trim() || loading}
            style={{
              marginTop: 6,
              width: "100%",
              background: loading ? "#1e293b" : ACCENT,
              border: "none",
              borderRadius: 3,
              color: loading ? "#64748b" : "#0f172a",
              fontFamily: "monospace",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 1,
              padding: "5px 0",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}
          >
            {loading ? "PROCESSING…" : "▶ RUN PREDICTION"}
          </button>
        </div>

        {/* History */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
          {history.length === 0 && (
            <div style={{ color: "#334155", fontFamily: "monospace", fontSize: 10, textAlign: "center", marginTop: 24 }}>
              TYPE A FORECAST QUESTION ABOVE
            </div>
          )}
          {history.map((item, i) => (
            <HistoryItem key={i} item={item} accent={ACCENT} />
          ))}
        </div>
      </div>
    </>
  );
}

function HistoryItem({ item, accent }) {
  const [exp, setExp] = useState(true);
  const { q, ts, route, predict } = item;
  const intent = route?.intent ?? "error";
  const handled = predict?.handled ?? false;

  const intentColor = intent === "prediction" ? "#4ADE80" : intent === "other" ? "#94A3B8" : "#F87171";

  return (
    <div style={{
      marginBottom: 10,
      border: `1px solid ${accent}22`,
      borderRadius: 4,
      overflow: "hidden",
    }}>
      {/* Row header */}
      <div
        onClick={() => setExp((e) => !e)}
        style={{
          background: "#0f172a",
          padding: "6px 8px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{
          background: intentColor + "33",
          color: intentColor,
          border: `1px solid ${intentColor}55`,
          borderRadius: 3,
          fontSize: 8,
          fontFamily: "monospace",
          fontWeight: 700,
          padding: "1px 4px",
          letterSpacing: 1,
          flexShrink: 0,
        }}>
          {intent.toUpperCase()}
        </span>
        <span style={{
          color: "#cbd5e1",
          fontFamily: "monospace",
          fontSize: 10,
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {q}
        </span>
        <span style={{ color: "#475569", fontSize: 9, fontFamily: "monospace", flexShrink: 0 }}>
          {rel(ts)}
        </span>
        <span style={{ color: accent, fontSize: 9 }}>{exp ? "▲" : "▼"}</span>
      </div>

      {exp && (
        <div style={{ padding: "8px", background: "#070d1a" }}>
          {/* Route classification */}
          <div style={{ marginBottom: 6 }}>
            <span style={{ color: "#475569", fontSize: 9, fontFamily: "monospace", letterSpacing: 1 }}>
              ROUTE
            </span>
            <div style={{ marginTop: 2, display: "flex", flexWrap: "wrap", gap: 4 }}>
              {route?.target && (
                <Chip label="target" value={route.target} color="#38BDF8" />
              )}
              {route?.horizon && (
                <Chip label="horizon" value={route.horizon} color="#818CF8" />
              )}
              {!route?.target && !route?.horizon && (
                <span style={{ color: "#334155", fontFamily: "monospace", fontSize: 9 }}>
                  {intent === "other" ? "not a forecast query" : JSON.stringify(route).slice(0, 80)}
                </span>
              )}
            </div>
          </div>

          {/* Prediction result */}
          {intent === "prediction" && predict && (
            <div style={{ borderTop: `1px solid ${accent}22`, paddingTop: 6 }}>
              <span style={{ color: "#475569", fontSize: 9, fontFamily: "monospace", letterSpacing: 1 }}>
                PREDICTION {handled ? "✓" : "✗ not handled"}
              </span>
              {handled && predict.answer && (
                <div style={{
                  marginTop: 4,
                  color: "#e2e8f0",
                  fontSize: 10,
                  fontFamily: "monospace",
                  lineHeight: 1.5,
                  background: "#0f172a",
                  borderRadius: 3,
                  padding: "5px 7px",
                }}>
                  {predict.answer}
                </div>
              )}
              {handled && predict.prediction && (
                <div style={{ marginTop: 6 }}>
                  {predict.prediction.point !== undefined && (
                    <Chip label="point" value={String(predict.prediction.point)} color="#4ADE80" />
                  )}
                  {predict.prediction.interval && (
                    <Chip
                      label="interval"
                      value={`[${predict.prediction.interval[0]}, ${predict.prediction.interval[1]}]`}
                      color="#FBBF24"
                    />
                  )}
                  {predict.prediction.confidence !== undefined && (
                    <div style={{ marginTop: 4 }}>
                      <span style={{ color: "#475569", fontSize: 9, fontFamily: "monospace" }}>CONFIDENCE</span>
                      <ConfidenceBar value={predict.prediction.confidence} />
                    </div>
                  )}
                  {predict.prediction.honesty && (
                    <div style={{
                      marginTop: 5,
                      color: "#94A3B8",
                      fontSize: 9,
                      fontFamily: "monospace",
                      fontStyle: "italic",
                      lineHeight: 1.4,
                    }}>
                      {predict.prediction.honesty}
                    </div>
                  )}
                </div>
              )}
              {predict.error && (
                <div style={{ color: "#F87171", fontFamily: "monospace", fontSize: 9, marginTop: 4 }}>
                  error {predict.error}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ label, value, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 3 }}>
      <span style={{ color: "#475569", fontSize: 8, fontFamily: "monospace" }}>{label}:</span>
      <span style={{
        background: color + "22",
        color,
        border: `1px solid ${color}44`,
        borderRadius: 3,
        fontSize: 9,
        fontFamily: "monospace",
        padding: "1px 5px",
        maxWidth: 280,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {value}
      </span>
    </div>
  );
}
