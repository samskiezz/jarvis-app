/**
 * RuleEnginePanel — F281
 * ◈ RUENGN button: left 205160, bottom 8, zIndex 377
 * Toggle: window.dispatchEvent(new Event("jarvis:ruengn-toggle"))
 * Voice triggers: "rule engine", "ruengn", "show rules", "rules panel", "rule editor"
 * Data: GET /v1/rules | POST /v1/rules/evaluate | POST /v1/rules
 * ASSESS: proposes new rules based on current alert patterns + TTS via /v1/voice/tts
 */
import { useState, useEffect, useCallback, useRef } from "react";

const CY = "#29E7FF";
const AM = "#F5A623";
const GN = "#4ADE80";
const RD = "#F87171";
const SURF = "rgba(10,18,28,0.97)";
const BORD = "rgba(41,231,255,0.18)";

const BTN_LEFT = 205160;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function apiBase() {
  return (
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE) ||
    "http://localhost:8000"
  );
}

const RUENGN_RE =
  /\b(rule\s+engine|ruengn\b|show\s+rules?|rules?\s+panel|rule\s+editor|ops\s+rules?|alert\s+rules?)\b/i;

export function isRuengnQuery(q) {
  return RUENGN_RE.test(q || "");
}

const SEV_COLORS = { CRITICAL: RD, HIGH: AM, MEDIUM: CY, LOW: GN, INFO: "#7C86FF" };

function sevColor(sev) {
  return SEV_COLORS[(sev || "").toUpperCase()] || CY;
}

async function speak(text) {
  try {
    const res = await fetch(`${apiBase()}/v1/voice/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    audio.play().catch(() => {});
  } catch {}
}

const BLANK_RULE = { name: "", expr: "", severity: "MEDIUM", enabled: true };

export default function RuleEnginePanel() {
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [evalRuleId, setEvalRuleId] = useState(null);
  const [evalResult, setEvalResult] = useState(null);
  const [evaluating, setEvaluating] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newRule, setNewRule] = useState({ ...BLANK_RULE });
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [assessing, setAssessing] = useState(false);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase()}/v1/rules`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data.items)
        ? data.items
        : [];
      setRules(list);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchRules();
  }, [open, fetchRules]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:ruengn-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ruengn-toggle", onToggle);
  }, []);

  async function evaluateRule(ruleId) {
    if (evaluating) return;
    setEvalRuleId(ruleId);
    setEvaluating(true);
    setEvalResult(null);
    try {
      const res = await fetch(`${apiBase()}/v1/rules/evaluate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ rule_id: ruleId }),
      });
      if (res.ok) {
        const data = await res.json();
        setEvalResult(data);
      } else {
        setEvalResult({ error: `HTTP ${res.status}` });
      }
    } catch (err) {
      setEvalResult({ error: String(err) });
    }
    setEvaluating(false);
  }

  async function saveNewRule() {
    if (!newRule.name.trim() || !newRule.expr.trim()) {
      setSaveErr("Name and condition are required.");
      return;
    }
    setSaving(true);
    setSaveErr("");
    try {
      const res = await fetch(`${apiBase()}/v1/rules`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          name: newRule.name.trim(),
          expr: newRule.expr.trim(),
          severity: newRule.severity,
          enabled: newRule.enabled,
        }),
      });
      if (res.ok) {
        setShowNew(false);
        setNewRule({ ...BLANK_RULE });
        await fetchRules();
      } else {
        const err = await res.json().catch(() => ({}));
        setSaveErr(err.detail || `HTTP ${res.status}`);
      }
    } catch (err) {
      setSaveErr(String(err));
    }
    setSaving(false);
  }

  async function runAssess() {
    setAssessing(true);
    const sevCounts = rules.reduce((acc, r) => {
      const s = (r.severity || "UNKNOWN").toUpperCase();
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
    const enabled = rules.filter((r) => r.enabled !== false).length;
    try {
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          message: `Assess rule engine: ${rules.length} total rules, ${enabled} enabled. Severity distribution: ${
            Object.entries(sevCounts)
              .map(([k, v]) => `${v} ${k}`)
              .join(", ") || "none"
          }. Based on these patterns, propose one new rule that would improve alert coverage. Provide a one-sentence recommendation.`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const reply =
          data?.response ||
          data?.message ||
          `${rules.length} rules active. Consider reviewing coverage for edge cases.`;
        await speak(reply);
      }
    } catch {}
    setAssessing(false);
  }

  const sevGroups = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].reduce(
    (acc, s) => {
      acc[s] = rules.filter((r) => (r.severity || "").toUpperCase() === s);
      return acc;
    },
    {}
  );
  const otherRules = rules.filter(
    (r) =>
      !["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].includes(
        (r.severity || "").toUpperCase()
      )
  );

  const headerCounts = Object.entries(sevGroups)
    .filter(([, arr]) => arr.length > 0)
    .map(([k, arr]) => (
      <span
        key={k}
        style={{
          fontSize: 9,
          color: sevColor(k),
          border: `1px solid ${sevColor(k)}44`,
          borderRadius: 3,
          padding: "1px 5px",
          marginLeft: 4,
        }}
      >
        {arr.length} {k}
      </span>
    ));

  return (
    <>
      {/* ◈ RUENGN button */}
      <div
        onClick={() => setOpen((v) => !v)}
        title="Rule Engine Panel"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 377,
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          userSelect: "none",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: open
              ? "rgba(245,166,35,0.18)"
              : "rgba(10,18,28,0.80)",
            border: `1px solid ${open ? AM : BORD}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "border-color 0.2s, background 0.2s",
          }}
        >
          {/* rules/filter icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <polygon
              points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"
              stroke={open ? AM : CY}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <span
          style={{
            fontSize: 8,
            color: open ? AM : CY,
            letterSpacing: "0.08em",
            fontFamily: "monospace",
          }}
        >
          RUENGN
        </span>
      </div>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            right: 16,
            bottom: 60,
            width: 540,
            maxHeight: "72vh",
            background: SURF,
            border: `1px solid ${BORD}`,
            borderRadius: 12,
            zIndex: 378,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: "0 4px 40px rgba(0,0,0,0.6)",
            fontFamily: "'JetBrains Mono',monospace",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderBottom: `1px solid ${BORD}`,
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: AM, fontSize: 13, fontWeight: 700 }}>
                RULE ENGINE
              </span>
              {rules.length > 0 && (
                <span
                  style={{
                    fontSize: 9,
                    color: CY,
                    border: `1px solid ${CY}44`,
                    borderRadius: 3,
                    padding: "1px 5px",
                  }}
                >
                  {rules.length} RULES
                </span>
              )}
              {headerCounts}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => { setShowNew((v) => !v); setSaveErr(""); }}
                style={{
                  fontSize: 9,
                  color: GN,
                  background: "none",
                  border: `1px solid ${GN}`,
                  borderRadius: 4,
                  padding: "2px 8px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {showNew ? "CANCEL" : "+ NEW RULE"}
              </button>
              <button
                onClick={runAssess}
                disabled={assessing}
                style={{
                  fontSize: 9,
                  color: assessing ? "#666" : AM,
                  background: "none",
                  border: `1px solid ${assessing ? "#444" : AM}`,
                  borderRadius: 4,
                  padding: "2px 8px",
                  cursor: assessing ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {assessing ? "ASSESSING…" : "ASSESS"}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  fontSize: 11,
                  color: "#666",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "0 4px",
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* New Rule Form */}
          {showNew && (
            <div
              style={{
                padding: "10px 14px",
                borderBottom: `1px solid ${BORD}`,
                background: "rgba(74,222,128,0.04)",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  color: GN,
                  letterSpacing: "0.08em",
                  marginBottom: 8,
                }}
              >
                NEW RULE
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <input
                  type="text"
                  placeholder="Rule name…"
                  value={newRule.name}
                  onChange={(e) =>
                    setNewRule((r) => ({ ...r, name: e.target.value }))
                  }
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: `1px solid ${BORD}`,
                    borderRadius: 4,
                    color: "#e8f4f8",
                    fontSize: 10,
                    padding: "5px 8px",
                    fontFamily: "inherit",
                    outline: "none",
                  }}
                />
                <input
                  type="text"
                  placeholder="Condition expression…"
                  value={newRule.expr}
                  onChange={(e) =>
                    setNewRule((r) => ({ ...r, expr: e.target.value }))
                  }
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: `1px solid ${BORD}`,
                    borderRadius: 4,
                    color: "#e8f4f8",
                    fontSize: 10,
                    padding: "5px 8px",
                    fontFamily: "inherit",
                    outline: "none",
                  }}
                />
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <select
                    value={newRule.severity}
                    onChange={(e) =>
                      setNewRule((r) => ({ ...r, severity: e.target.value }))
                    }
                    style={{
                      background: "rgba(10,18,28,0.9)",
                      border: `1px solid ${BORD}`,
                      borderRadius: 4,
                      color: sevColor(newRule.severity),
                      fontSize: 10,
                      padding: "4px 6px",
                      fontFamily: "inherit",
                      cursor: "pointer",
                    }}
                  >
                    {["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 10,
                      color: "#aaa",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={newRule.enabled}
                      onChange={(e) =>
                        setNewRule((r) => ({
                          ...r,
                          enabled: e.target.checked,
                        }))
                      }
                    />
                    Enabled
                  </label>
                  <button
                    onClick={saveNewRule}
                    disabled={saving}
                    style={{
                      marginLeft: "auto",
                      fontSize: 9,
                      color: saving ? "#666" : GN,
                      background: "none",
                      border: `1px solid ${saving ? "#444" : GN}`,
                      borderRadius: 4,
                      padding: "3px 12px",
                      cursor: saving ? "not-allowed" : "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {saving ? "SAVING…" : "SAVE RULE"}
                  </button>
                </div>
                {saveErr && (
                  <span style={{ fontSize: 9, color: RD }}>{saveErr}</span>
                )}
              </div>
            </div>
          )}

          {/* Rules list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {loading && rules.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "32px",
                  color: CY,
                  fontSize: 11,
                }}
              >
                LOADING RULES…
              </div>
            ) : rules.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "32px",
                  color: "#555",
                  fontSize: 11,
                }}
              >
                No rules configured.
              </div>
            ) : (
              [...rules, ...otherRules.filter((r) => !rules.includes(r))].map((rule) => {
                const col = sevColor(rule.severity);
                const isSelected = evalRuleId === rule.id;
                const isEvaluating = evaluating && isSelected;
                const hasResult = isSelected && evalResult;
                const fired =
                  hasResult && Array.isArray(evalResult.fired)
                    ? evalResult.fired
                    : [];

                return (
                  <div
                    key={rule.id}
                    style={{
                      padding: "9px 14px",
                      borderBottom: `1px solid ${BORD}`,
                      background: isSelected
                        ? "rgba(41,231,255,0.04)"
                        : "transparent",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          width: 3,
                          borderRadius: 2,
                          background: col,
                          alignSelf: "stretch",
                          flexShrink: 0,
                          minHeight: 20,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 6,
                          }}
                        >
                          <span
                            style={{
                              color: "#e8f4f8",
                              fontSize: 11,
                              fontWeight: 600,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {rule.name || `Rule ${rule.id}`}
                          </span>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              flexShrink: 0,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 8,
                                color: col,
                                border: `1px solid ${col}44`,
                                borderRadius: 3,
                                padding: "1px 5px",
                              }}
                            >
                              {(rule.severity || "?").toUpperCase()}
                            </span>
                            <span
                              style={{
                                fontSize: 8,
                                color: rule.enabled !== false ? GN : "#555",
                                border: `1px solid ${rule.enabled !== false ? GN : "#444"}44`,
                                borderRadius: 3,
                                padding: "1px 5px",
                              }}
                            >
                              {rule.enabled !== false ? "ON" : "OFF"}
                            </span>
                            <button
                              onClick={() =>
                                isSelected
                                  ? (setEvalRuleId(null), setEvalResult(null))
                                  : evaluateRule(rule.id)
                              }
                              disabled={isEvaluating}
                              style={{
                                fontSize: 8,
                                color: isEvaluating ? "#666" : CY,
                                background: "none",
                                border: `1px solid ${isEvaluating ? "#444" : CY}`,
                                borderRadius: 3,
                                padding: "1px 6px",
                                cursor: isEvaluating ? "not-allowed" : "pointer",
                                fontFamily: "inherit",
                              }}
                            >
                              {isEvaluating
                                ? "…"
                                : isSelected
                                ? "CLOSE"
                                : "EVALUATE"}
                            </button>
                          </div>
                        </div>

                        {/* Condition preview */}
                        {rule.expr && (
                          <div
                            style={{
                              fontSize: 9,
                              color: "#557",
                              marginTop: 3,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {rule.expr}
                          </div>
                        )}

                        {/* Eval result */}
                        {hasResult && (
                          <div
                            style={{
                              marginTop: 8,
                              paddingTop: 8,
                              borderTop: `1px solid ${BORD}`,
                            }}
                          >
                            {evalResult.error ? (
                              <span style={{ fontSize: 9, color: RD }}>
                                Error: {evalResult.error}
                              </span>
                            ) : (
                              <>
                                <div
                                  style={{
                                    fontSize: 9,
                                    color:
                                      fired.length > 0 ? RD : GN,
                                    marginBottom: 4,
                                  }}
                                >
                                  {fired.length > 0
                                    ? `${fired.length} OBJECT${fired.length !== 1 ? "S" : ""} MATCHED`
                                    : "NO OBJECTS MATCHED"}
                                </div>
                                {fired.length > 0 && (
                                  <div
                                    style={{
                                      display: "flex",
                                      flexWrap: "wrap",
                                      gap: 4,
                                    }}
                                  >
                                    {fired.slice(0, 12).map((obj, i) => (
                                      <span
                                        key={i}
                                        style={{
                                          fontSize: 9,
                                          color: AM,
                                          border: `1px solid ${AM}44`,
                                          borderRadius: 3,
                                          padding: "1px 5px",
                                        }}
                                      >
                                        {typeof obj === "string"
                                          ? obj
                                          : obj?.name ||
                                            obj?.id ||
                                            JSON.stringify(obj)}
                                      </span>
                                    ))}
                                    {fired.length > 12 && (
                                      <span
                                        style={{ fontSize: 9, color: "#555" }}
                                      >
                                        +{fired.length - 12} more
                                      </span>
                                    )}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "6px 14px",
              borderTop: `1px solid ${BORD}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 9, color: "#444" }}>
              {rules.filter((r) => r.enabled !== false).length}/{rules.length} ENABLED
            </span>
            <button
              onClick={fetchRules}
              style={{
                fontSize: 9,
                color: CY,
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              ↺ REFRESH
            </button>
          </div>
        </div>
      )}
    </>
  );
}
