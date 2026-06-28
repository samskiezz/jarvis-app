/**
 * AiModelGatewayDrawer — F168
 * JARVIS AI Model Gateway registry — shows every registered model with
 * its capability set, risk tier, cost per 1k tokens, and context window.
 * Data is static per boot; fetched once per session and cached.
 *
 * Real endpoint:
 *   GET /v1/jarvis/ai/models
 *     → { models: [{ name, capabilities, cost_per_1k, risk, max_tokens }] }
 *
 * Mounted in Layout.jsx (additive only). Sky-blue (#38BDF8) accent.
 * Right-edge slide-in at 13% from top.
 */
import { useState, useEffect, useRef, useCallback } from "react";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function apiBase() {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/$/, "");
  }
  return "";
}

const ACC = "#38BDF8";

function fmtTokens(n) {
  if (!n && n !== 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function RiskBadge({ risk }) {
  const cfg = {
    low:    { color: "#4ADE80", label: "LOW RISK" },
    medium: { color: "#F59E0B", label: "MED RISK" },
    high:   { color: "#F87171", label: "HIGH RISK" },
  };
  const { color, label } = cfg[risk] || { color: "#475569", label: risk?.toUpperCase() || "—" };
  return (
    <span style={{
      fontSize: 9, letterSpacing: 1, padding: "1px 5px",
      border: `1px solid ${color}55`, borderRadius: 4,
      color, background: `${color}11`, flexShrink: 0,
    }}>
      {label}
    </span>
  );
}

function CapBadge({ cap }) {
  const colors = {
    chat:     "#38BDF8",
    extract:  "#A78BFA",
    classify: "#4ADE80",
    reason:   "#F59E0B",
    vision:   "#FB923C",
  };
  const c = colors[cap] || "#64748B";
  return (
    <span style={{
      fontSize: 9, letterSpacing: 1, padding: "1px 5px",
      border: `1px solid ${c}55`, borderRadius: 4,
      color: c, background: `${c}11`,
    }}>
      {cap}
    </span>
  );
}

export default function AiModelGatewayDrawer() {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fetchedRef = useRef(false);

  const fetchModels = useCallback(async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/ai/models`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      const list = Array.isArray(d.models) ? d.models : [];
      setModels(list);
    } catch (e) {
      fetchedRef.current = false;
      setError(e.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchModels();
  }, [open, fetchModels]);

  const maxCost = models.reduce((m, x) => Math.max(m, x.cost_per_1k || 0), 0) || 1;

  return (
    <>
      {/* Toggle tab */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="AI Model Gateway (F168)"
        style={{
          position: "fixed", right: 0, top: "13%",
          zIndex: 110, writingMode: "vertical-rl",
          padding: "8px 5px", cursor: "pointer",
          background: open ? ACC : "rgba(8,10,16,0.85)",
          border: `1px solid ${ACC}`,
          borderRight: "none",
          borderRadius: "6px 0 0 6px",
          color: open ? "#0F172A" : ACC,
          fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace",
        }}
      >
        {open ? "◈" : "◇"} MODELS
      </button>

      {/* Drawer */}
      {open && (
        <div
          style={{
            position: "fixed", right: 0, top: 0, height: "100vh",
            width: "min(340px, 90vw)", zIndex: 109,
            background: "rgba(8,10,20,0.97)",
            border: `1px solid ${ACC}44`,
            borderRight: "none",
            boxShadow: `-12px 0 40px rgba(56,189,248,0.12)`,
            display: "flex", flexDirection: "column",
            fontFamily: "'JetBrains Mono',monospace",
            overflowY: "hidden",
          }}
        >
          {/* Header */}
          <div style={{
            padding: "12px 14px 10px",
            borderBottom: `1px solid ${ACC}33`,
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: ACC, fontSize: 13, letterSpacing: 2 }}>◈ AI MODEL GATEWAY</span>
              <span style={{
                fontSize: 9, letterSpacing: 1, padding: "1px 5px",
                border: `1px solid ${ACC}44`, borderRadius: 4, color: "#475569",
              }}>
                {models.length} REGISTERED
              </span>
              <button
                onClick={() => { fetchedRef.current = false; fetchModels(); }}
                title="Refresh"
                style={{
                  marginLeft: "auto", background: "none", border: "none",
                  color: ACC, cursor: "pointer", fontSize: 12, padding: "2px 4px",
                }}
              >
                ↻
              </button>
            </div>
            <div style={{ fontSize: 9, color: "#334155", letterSpacing: 1, marginTop: 6 }}>
              capability · cost · context window · risk tier
            </div>
          </div>

          {/* Model list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
            {loading && models.length === 0 && (
              <div style={{ padding: "24px 14px", color: "#475569", fontSize: 11, textAlign: "center", letterSpacing: 1 }}>
                loading…
              </div>
            )}
            {error && (
              <div style={{ padding: "12px 14px", color: "#F87171", fontSize: 10, letterSpacing: 1 }}>
                ⚠ {error}
              </div>
            )}
            {!loading && !error && models.length === 0 && (
              <div style={{ padding: "24px 14px", color: "#334155", fontSize: 11, textAlign: "center", letterSpacing: 1 }}>
                NO MODELS REGISTERED
              </div>
            )}
            {models.map((m, i) => {
              const costPct = maxCost > 0 ? ((m.cost_per_1k || 0) / maxCost) * 100 : 0;
              const caps = Array.isArray(m.capabilities) ? m.capabilities : [];
              return (
                <div
                  key={m.name || i}
                  style={{
                    padding: "10px 14px",
                    borderBottom: `1px solid ${ACC}11`,
                  }}
                >
                  {/* Name row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                    <span style={{ color: "#E2E8F0", fontSize: 12, letterSpacing: 1, fontWeight: 600 }}>
                      {m.name || "—"}
                    </span>
                    <RiskBadge risk={m.risk} />
                  </div>

                  {/* Capability chips */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                    {caps.map((c) => <CapBadge key={c} cap={c} />)}
                  </div>

                  {/* Cost bar + stats */}
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 5 }}>
                    <span style={{ fontSize: 9, color: "#475569", letterSpacing: 1, flexShrink: 0, width: 36 }}>COST</span>
                    <div style={{
                      flex: 1, height: 4, background: "rgba(56,189,248,0.12)",
                      borderRadius: 2, overflow: "hidden",
                    }}>
                      <div style={{
                        height: "100%", borderRadius: 2,
                        width: `${costPct}%`,
                        background: costPct > 66 ? "#F87171" : costPct > 33 ? "#F59E0B" : "#4ADE80",
                      }} />
                    </div>
                    <span style={{ fontSize: 10, color: "#CBD5E1", letterSpacing: 1, flexShrink: 0, minWidth: 36, textAlign: "right" }}>
                      {m.cost_per_1k === 0 ? "FREE" : `${m.cost_per_1k.toFixed(1)}×`}
                    </span>
                  </div>

                  {/* Context window */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 9, color: "#475569", letterSpacing: 1 }}>CTX</span>
                    <span style={{ fontSize: 10, color: "#94A3B8", letterSpacing: 1 }}>
                      {fmtTokens(m.max_tokens)} tokens
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "6px 14px", borderTop: `1px solid ${ACC}22`,
            flexShrink: 0, fontSize: 9, color: "#334155", letterSpacing: 1,
            display: "flex", gap: 10,
          }}>
            <span>GET /v1/jarvis/ai/models</span>
            <span style={{ marginLeft: "auto" }}>session cache</span>
          </div>
        </div>
      )}
    </>
  );
}
