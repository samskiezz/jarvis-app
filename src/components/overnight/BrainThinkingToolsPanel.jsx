/**
 * BrainThinkingToolsPanel — left-edge slide-in at 9% vertical.
 * Four retrieval-grounded thinking tools over the second-brain vault.
 * Results assemble vault evidence; no LLM is called.
 *
 * CHALLENGE  POST /v1/brain/think/challenge  — red-team an idea
 * PANEL      POST /v1/brain/think/panel      — multi-perspective panel on a decision
 * CONNECT    POST /v1/brain/think/connect    — bridge two concepts
 * EMERGE     POST /v1/brain/think/emerge     — emergent themes over recent notes
 *
 * Accent: #0EA5E9 (sky-blue).
 */
import { useState, useRef, useCallback } from "react";

const ACCENT = "#0EA5E9";
const W = 340;

const TABS = ["CHALLENGE", "PANEL", "CONNECT", "EMERGE"];

/* ── tiny helpers ─────────────────────────────────────────────────────── */
function Badge({ color, children }) {
  return (
    <span
      style={{
        color,
        fontSize: 9,
        border: `1px solid ${color}55`,
        borderRadius: 3,
        padding: "1px 5px",
        letterSpacing: 1,
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}

function RunBtn({ onClick, loading, label = "▶ RUN" }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        background: loading ? "rgba(14,165,233,0.15)" : `${ACCENT}22`,
        border: `1px solid ${ACCENT}55`,
        borderRadius: 4,
        color: loading ? "#4E6070" : ACCENT,
        fontSize: 10,
        letterSpacing: 1,
        padding: "5px 14px",
        cursor: loading ? "default" : "pointer",
        fontFamily: "'JetBrains Mono',monospace",
      }}
    >
      {loading ? "THINKING…" : label}
    </button>
  );
}

function TextInput({ value, onChange, placeholder }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%",
        boxSizing: "border-box",
        background: "rgba(0,0,0,0.4)",
        border: `1px solid ${ACCENT}33`,
        borderRadius: 4,
        color: "#DCE8F0",
        fontSize: 10,
        fontFamily: "'JetBrains Mono',monospace",
        padding: "6px 10px",
        outline: "none",
      }}
    />
  );
}

function ErrMsg({ msg }) {
  return msg ? (
    <div style={{ color: "#EF4444", fontSize: 9, letterSpacing: 1, padding: "8px 16px" }}>
      ERROR: {msg}
    </div>
  ) : null;
}

/* ── CHALLENGE tab ─────────────────────────────────────────────────────── */
function ChallengeTab() {
  const [idea, setIdea] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const cache = useRef({});

  const run = useCallback(async () => {
    const key = idea.trim();
    if (!key) return;
    if (cache.current[key]) { setResult(cache.current[key]); return; }
    setLoading(true); setErr(null);
    try {
      const r = await fetch("/v1/brain/think/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: key }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      cache.current[key] = d;
      setResult(d);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [idea]);

  const counter = Array.isArray(result?.counter_case) ? result.counter_case : [];

  return (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1 }}>IDEA TO RED-TEAM</div>
      <TextInput value={idea} onChange={setIdea} placeholder="e.g. We should adopt microservices" />
      <RunBtn onClick={run} loading={loading} label="▶ RED-TEAM" />
      <ErrMsg msg={err} />
      {result && (
        <div style={{ marginTop: 4 }}>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              marginBottom: 8,
              color: "#4E6070",
              fontSize: 9,
              letterSpacing: 1,
            }}
          >
            <span>COUNTER CASE</span>
            <Badge color="#EF4444">{counter.length} POINTS</Badge>
            <Badge color="#4E6070">{result.considered ?? 0} NOTES SCANNED</Badge>
          </div>
          {counter.length === 0 ? (
            <div
              style={{
                padding: "10px 12px",
                background: `${ACCENT}11`,
                border: `1px solid ${ACCENT}33`,
                borderRadius: 5,
                color: ACCENT,
                fontSize: 9,
                letterSpacing: 1,
              }}
            >
              NO COUNTER-EVIDENCE IN VAULT
            </div>
          ) : (
            counter.map((c, i) => (
              <div
                key={i}
                style={{
                  padding: "8px 10px",
                  marginBottom: 5,
                  background: "rgba(239,68,68,0.05)",
                  border: "1px solid #EF444422",
                  borderRadius: 5,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    marginBottom: 4,
                  }}
                >
                  <Badge color="#EF4444">#{i + 1}</Badge>
                  {c.note_id && <Badge color="#4E6070">{String(c.note_id).slice(0, 12)}</Badge>}
                  {c.label && (
                    <span style={{ color: "#8CA0B0", fontSize: 9, fontStyle: "italic" }}>
                      {c.label}
                    </span>
                  )}
                </div>
                <div style={{ color: "#DCE8F0", fontSize: 10, lineHeight: 1.5 }}>
                  {c.point}
                </div>
              </div>
            ))
          )}
          {result.note && (
            <div style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1, marginTop: 6, fontStyle: "italic" }}>
              {result.note}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── PANEL tab ─────────────────────────────────────────────────────────── */
function PanelTab() {
  const [decision, setDecision] = useState("");
  const [n, setN] = useState(4);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const cache = useRef({});

  const run = useCallback(async () => {
    const key = `${decision.trim()}::${n}`;
    if (!decision.trim()) return;
    if (cache.current[key]) { setResult(cache.current[key]); return; }
    setLoading(true); setErr(null);
    try {
      const r = await fetch("/v1/brain/think/panel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: decision.trim(), n }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      cache.current[key] = d;
      setResult(d);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [decision, n]);

  const perspectives = Array.isArray(result?.perspectives) ? result.perspectives : [];

  const PERSPECTIVE_COLORS = ["#A78BFA", "#22D3EE", "#FCD34D", "#F97316", "#EC4899", "#4ADE80"];

  return (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1 }}>DECISION TO CONVENE ON</div>
      <TextInput value={decision} onChange={setDecision} placeholder="e.g. Should we rewrite the auth layer?" />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1 }}>PERSPECTIVES</span>
        <input
          type="range"
          min={2}
          max={6}
          value={n}
          onChange={(e) => setN(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <span style={{ color: ACCENT, fontSize: 10, minWidth: 12 }}>{n}</span>
      </div>
      <RunBtn onClick={run} loading={loading} label="▶ CONVENE PANEL" />
      <ErrMsg msg={err} />
      {result && (
        <div style={{ marginTop: 4 }}>
          <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1, marginBottom: 8 }}>
            PERSPECTIVES ({perspectives.length})
          </div>
          {perspectives.length === 0 ? (
            <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1, padding: "8px 0" }}>
              NO NOTES RETRIEVED — VAULT MAY BE SPARSE
            </div>
          ) : (
            perspectives.map((p, i) => {
              const col = PERSPECTIVE_COLORS[i % PERSPECTIVE_COLORS.length];
              return (
                <div
                  key={i}
                  style={{
                    padding: "8px 10px",
                    marginBottom: 5,
                    background: `${col}08`,
                    border: `1px solid ${col}22`,
                    borderLeft: `3px solid ${col}`,
                    borderRadius: "0 5px 5px 0",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      alignItems: "center",
                      marginBottom: 4,
                    }}
                  >
                    <Badge color={col}>{p.title || `VOICE ${i + 1}`}</Badge>
                    {p.note_id && <Badge color="#4E6070">{String(p.note_id).slice(0, 10)}</Badge>}
                  </div>
                  {p.framing && (
                    <div style={{ color: "#8CA0B0", fontSize: 9, marginBottom: 3, fontStyle: "italic" }}>
                      {p.framing}
                    </div>
                  )}
                  {p.excerpt && (
                    <div style={{ color: "#DCE8F0", fontSize: 10, lineHeight: 1.5 }}>
                      {p.excerpt}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/* ── CONNECT tab ───────────────────────────────────────────────────────── */
function ConnectTab() {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const cache = useRef({});

  const run = useCallback(async () => {
    const ka = a.trim(); const kb = b.trim();
    if (!ka || !kb) return;
    const key = `${ka}::${kb}`;
    if (cache.current[key]) { setResult(cache.current[key]); return; }
    setLoading(true); setErr(null);
    try {
      const r = await fetch("/v1/brain/think/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ a: ka, b: kb }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      cache.current[key] = d;
      setResult(d);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [a, b]);

  const bridge = result?.bridge || {};
  const pathNodes = Array.isArray(bridge.path) ? bridge.path : [];
  const sharedNbrs = Array.isArray(bridge.shared_neighbours) ? bridge.shared_neighbours : [];
  const overlap = Array.isArray(bridge.concept_overlap) ? bridge.concept_overlap : [];

  return (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1 }}>CONCEPT A</div>
      <TextInput value={a} onChange={setA} placeholder="e.g. graph database" />
      <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1 }}>CONCEPT B</div>
      <TextInput value={b} onChange={setB} placeholder="e.g. time series analysis" />
      <RunBtn onClick={run} loading={loading} label="▶ FIND BRIDGE" />
      <ErrMsg msg={err} />
      {result && (
        <div style={{ marginTop: 4 }}>
          {/* Graph path */}
          {pathNodes.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                GRAPH PATH ({pathNodes.length} HOPS)
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                {pathNodes.map((node, i) => (
                  <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span
                      style={{
                        color: i === 0 || i === pathNodes.length - 1 ? ACCENT : "#DCE8F0",
                        fontSize: 9,
                        background: "rgba(0,0,0,0.3)",
                        border: `1px solid ${i === 0 || i === pathNodes.length - 1 ? ACCENT : "#2A3A4A"}55`,
                        borderRadius: 3,
                        padding: "2px 6px",
                      }}
                    >
                      {String(node).slice(0, 20)}
                    </span>
                    {i < pathNodes.length - 1 && (
                      <span style={{ color: "#4E6070", fontSize: 9 }}>→</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Shared neighbours */}
          {sharedNbrs.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                SHARED GRAPH NEIGHBOURS ({sharedNbrs.length})
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {sharedNbrs.slice(0, 12).map((n, i) => (
                  <Badge key={i} color="#22D3EE">{String(n).slice(0, 18)}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Concept overlap */}
          {overlap.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                CONCEPT OVERLAP ({overlap.length})
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {overlap.slice(0, 10).map((t, i) => (
                  <Badge key={i} color="#A78BFA">{t}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* No bridge found */}
          {pathNodes.length === 0 && sharedNbrs.length === 0 && overlap.length === 0 && (
            <div
              style={{
                padding: "10px 12px",
                background: "rgba(0,0,0,0.2)",
                border: "1px solid #2A3A4A55",
                borderRadius: 5,
                color: "#4E6070",
                fontSize: 9,
                letterSpacing: 1,
              }}
            >
              NO BRIDGE FOUND — VAULT MAY NOT CONTAIN THESE CONCEPTS
            </div>
          )}

          {result.note && (
            <div style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1, marginTop: 4, fontStyle: "italic" }}>
              {result.note}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── EMERGE tab ────────────────────────────────────────────────────────── */
function EmergeTab() {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const cache = useRef({});

  const run = useCallback(async () => {
    const key = String(days);
    if (cache.current[key]) { setResult(cache.current[key]); return; }
    setLoading(true); setErr(null);
    try {
      const r = await fetch("/v1/brain/think/emerge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      cache.current[key] = d;
      setResult(d);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  const themes = Array.isArray(result?.themes) ? result.themes : [];
  const maxFreq = themes.length > 0 ? Math.max(...themes.map((t) => t.freq || 1)) : 1;

  return (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1 }}>RECENCY WINDOW</span>
        <input
          type="range"
          min={7}
          max={90}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <span style={{ color: ACCENT, fontSize: 10, minWidth: 36 }}>{days}d</span>
      </div>
      <RunBtn onClick={run} loading={loading} label="▶ SCAN THEMES" />
      <ErrMsg msg={err} />
      {result && (
        <div style={{ marginTop: 4 }}>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              marginBottom: 8,
              color: "#4E6070",
              fontSize: 9,
              letterSpacing: 1,
            }}
          >
            <span>EMERGENT THEMES</span>
            <Badge color={ACCENT}>{themes.length}</Badge>
            {result.total_terms != null && (
              <Badge color="#4E6070">{result.total_terms} TERMS</Badge>
            )}
          </div>
          {themes.length === 0 ? (
            <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1 }}>
              NO THEMES EMERGED — VAULT MAY BE SPARSE IN THIS WINDOW
            </div>
          ) : (
            themes.map((t, i) => {
              const pct = Math.round(((t.freq || 1) / maxFreq) * 100);
              return (
                <div
                  key={i}
                  style={{
                    padding: "7px 10px",
                    marginBottom: 4,
                    background: "rgba(0,0,0,0.25)",
                    border: `1px solid ${ACCENT}18`,
                    borderRadius: 4,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ color: "#DCE8F0", fontSize: 10, flex: 1 }}>{t.term}</span>
                    <Badge color={ACCENT}>{t.freq}×</Badge>
                  </div>
                  {/* Frequency bar */}
                  <div
                    style={{
                      height: 3,
                      background: "#1A2A3A",
                      borderRadius: 2,
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${pct}%`,
                        background: ACCENT,
                        borderRadius: 2,
                        opacity: 0.7,
                      }}
                    />
                  </div>
                  {/* Seed note IDs */}
                  {Array.isArray(t.seeds) && t.seeds.length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                      {t.seeds.slice(0, 4).map((s, j) => (
                        <Badge key={j} color="#4E6070">{String(s).slice(0, 10)}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
          {result.note && (
            <div style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1, marginTop: 6, fontStyle: "italic" }}>
              {result.note}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main component ────────────────────────────────────────────────────── */
export default function BrainThinkingToolsPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("CHALLENGE");

  return (
    <>
      {/* Tab button */}
      <div
        onClick={() => setOpen((o) => !o)}
        title="Brain Thinking Tools"
        style={{
          position: "fixed",
          top: "9%",
          left: open ? W : 0,
          zIndex: 120,
          background: open ? ACCENT : "rgba(5,10,18,0.88)",
          border: `1px solid ${ACCENT}55`,
          borderLeft: "none",
          borderRadius: "0 6px 6px 0",
          padding: "6px 8px",
          cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 10,
          letterSpacing: 1,
          color: open ? "#030712" : ACCENT,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          transition: "left 0.25s, background 0.2s",
          userSelect: "none",
        }}
      >
        THINK ▶
      </div>

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: open ? 0 : -W,
          bottom: 0,
          width: W,
          zIndex: 119,
          background: "rgba(5,8,16,0.97)",
          border: `1px solid ${ACCENT}33`,
          borderLeft: "none",
          boxShadow: open ? `4px 0 32px ${ACCENT}14` : "none",
          transition: "left 0.25s",
          display: "flex",
          flexDirection: "column",
          fontFamily: "'JetBrains Mono',monospace",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: `1px solid ${ACCENT}22`,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: `linear-gradient(90deg, ${ACCENT}0E, transparent)`,
            flexShrink: 0,
          }}
        >
          <span style={{ color: ACCENT, fontSize: 11, letterSpacing: 2, flex: 1 }}>
            BRAIN THINKING TOOLS
          </span>
          <span
            onClick={() => setOpen(false)}
            style={{ color: "#4E6070", fontSize: 14, cursor: "pointer", padding: "0 4px" }}
          >
            ×
          </span>
        </div>

        {/* Tab selector */}
        <div
          style={{
            display: "flex",
            borderBottom: `1px solid ${ACCENT}22`,
            flexShrink: 0,
          }}
        >
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: "7px 4px",
                background: tab === t ? `${ACCENT}18` : "transparent",
                border: "none",
                borderBottom: tab === t ? `2px solid ${ACCENT}` : "2px solid transparent",
                color: tab === t ? ACCENT : "#4E6070",
                fontSize: 9,
                letterSpacing: 1,
                cursor: "pointer",
                fontFamily: "'JetBrains Mono',monospace",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {tab === "CHALLENGE" && <ChallengeTab />}
          {tab === "PANEL" && <PanelTab />}
          {tab === "CONNECT" && <ConnectTab />}
          {tab === "EMERGE" && <EmergeTab />}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "5px 16px",
            borderTop: `1px solid ${ACCENT}1A`,
            color: "#2E4050",
            fontSize: 8,
            letterSpacing: 1,
            flexShrink: 0,
          }}
        >
          POST /v1/brain/think/{"{challenge|panel|connect|emerge}"} · on-demand · vault-grounded
        </div>
      </div>
    </>
  );
}
