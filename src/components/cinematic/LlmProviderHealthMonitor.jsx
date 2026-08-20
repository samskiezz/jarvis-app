/**
 * LlmProviderHealthMonitor — F48 Live LLM provider health monitor.
 *
 * Polls /v1/jarvis/agent/llm/health every 60 s and renders one row per
 * registered LLM provider (qwen32b, gpu, kimi, openai, anthropic, ollama)
 * with configured / reachable badges and measured latency. A red pulse
 * flags any configured-but-unreachable provider. ASSESS asks
 * /v1/jarvis/agent/chat for a 2-sentence brief and speaks it via
 * jarvis:speak-dossier.
 *
 * Button: ⬡ LLMH (left:840 bottom:18)
 * Endpoint: /v1/jarvis/agent/llm/health (+ /v1/jarvis/agent/chat for ASSESS)
 * Voice trigger: "llm health" | "provider health" | "llmh" |
 *                "llm status" | "model health" | "llm providers"
 * Event: jarvis:llmh-toggle
 * Refresh: 60 s auto-poll.
 *
 * Additive only — mounted via App.jsx; wired via JarvisBrain.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

const CY    = "#29E7FF";
const GRN   = "#00E5A0";
const AMB   = "#F59E0B";
const RED   = "#FF3B6B";
const DIM   = "#4A6070";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT = 840;
const POLL_MS  = 60_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = (typeof import.meta !== "undefined" && import.meta.env) || {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── data ────────────────────────────────────────────────────────────────────

async function fetchProviderHealth() {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/llm/health`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`llm/health ${r.status}`);
  const d = await r.json();
  const items = Array.isArray(d?.providers) ? d.providers : [];
  return {
    generated_at: String(d?.generated_at || ""),
    providers: items.map((p) => ({
      id:         String(p?.id || "unknown"),
      model:      p?.model ? String(p.model) : "",
      configured: Boolean(p?.configured),
      reachable:  Boolean(p?.reachable),
      latency_ms: Number.isFinite(Number(p?.latency_ms)) ? Number(p.latency_ms) : 0,
      error:      p?.error ? String(p.error) : "",
    })),
  };
}

function providerStatus(p) {
  if (!p.configured) return "unconfigured";
  if (p.reachable)   return "reachable";
  return "down";
}

function statusColor(status) {
  if (status === "reachable")   return GRN;
  if (status === "down")        return RED;
  return DIM;
}

function latencyColor(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return DIM;
  if (ms < 400)   return GRN;
  if (ms < 1200)  return AMB;
  return RED;
}

// ── voice intent (exported for JarvisBrain) ─────────────────────────────────

const VOICE_RE =
  /\b(llmh|llm\s*health|provider\s*health|llm\s*status|model\s*health|llm\s*providers?)\b/i;

export function isLlmhQuery(text) { return VOICE_RE.test(text || ""); }

export async function buildLlmhScript() {
  let data;
  try { data = await fetchProviderHealth(); }
  catch { return "LLM provider health is currently unavailable, sir."; }
  const items = data.providers || [];
  if (items.length === 0) {
    return "No LLM providers are registered with the router.";
  }
  const configured = items.filter((p) => p.configured);
  const reachable  = configured.filter((p) => p.reachable);
  const down       = configured.filter((p) => !p.reachable);
  const fastest    = reachable
    .slice()
    .sort((a, b) => (a.latency_ms || Infinity) - (b.latency_ms || Infinity))[0];
  const downClause = down.length
    ? ` ${down.length} configured provider${down.length === 1 ? " is" : "s are"} unreachable: ${down.map((p) => p.id).join(", ")}.`
    : " All configured providers are reachable.";
  const fastClause = fastest
    ? ` Fastest response: ${fastest.id}${fastest.model ? ` (${fastest.model})` : ""} at ${fastest.latency_ms} milliseconds.`
    : "";
  return (
    `${configured.length} of ${items.length} LLM provider${items.length === 1 ? "" : "s"} configured, ` +
    `${reachable.length} reachable.` +
    downClause +
    fastClause
  );
}

// ── panel ───────────────────────────────────────────────────────────────────

export default function LlmProviderHealthMonitor() {
  const [open,      setOpen]      = useState(false);
  const [providers, setProviders] = useState([]);
  const [genAt,     setGenAt]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [search,    setSearch]    = useState("");
  const [tab,       setTab]       = useState("ALL");
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const d = await fetchProviderHealth();
      setProviders(d.providers);
      setGenAt(d.generated_at);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (VOICE_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:llmh-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:llmh-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  const configuredCount = useMemo(
    () => providers.filter((p) => p.configured).length,
    [providers],
  );
  const reachableCount = useMemo(
    () => providers.filter((p) => p.configured && p.reachable).length,
    [providers],
  );
  const downCount = useMemo(
    () => providers.filter((p) => p.configured && !p.reachable).length,
    [providers],
  );
  const maxLatency = useMemo(
    () =>
      providers.reduce(
        (m, p) => (p.reachable && p.latency_ms > m ? p.latency_ms : m),
        0,
      ),
    [providers],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return providers
      .filter((p) => {
        const status = providerStatus(p);
        if (tab === "REACHABLE")    return status === "reachable";
        if (tab === "DOWN")         return status === "down";
        if (tab === "UNCONFIGURED") return status === "unconfigured";
        return true;
      })
      .filter((p) => {
        if (!q) return true;
        return (
          p.id.toLowerCase().includes(q) ||
          p.model.toLowerCase().includes(q)
        );
      });
  }, [providers, search, tab]);

  const runAssess = async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildLlmhScript();
      let brief = script;
      try {
        const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_KEY}`,
          },
          body: JSON.stringify({
            message:
              "In 2 short sentences, assess the LLM provider health and any operational risk to Jarvis reasoning. " +
              `Data: ${script}`,
          }),
        });
        if (r.ok) {
          const d = await r.json();
          const t = d?.reply || d?.message || d?.text || d?.output || "";
          if (t && String(t).trim()) brief = String(t).trim();
        }
      } catch { /* fall back to script */ }
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: brief, source: "llmh" },
      }));
    } finally {
      setAssessing(false);
    }
  };

  const accent = downCount > 0 ? RED : CY;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="LLM Provider Health Monitor"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
          background: open ? accent + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${open ? accent : accent + "44"}`,
          borderRadius: 8,
          color: open ? "#04060A" : accent,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: MONO, fontWeight: 700,
          boxShadow: `0 0 20px ${accent}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>⬡</span>
        LLMH
        {providers.length > 0 && (
          <span style={{
            background: (downCount > 0 ? RED : GRN) + "33",
            color: downCount > 0 ? RED : GRN,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 26, textAlign: "center",
            animation: downCount > 0 ? "llmhPulse 1.6s ease-in-out infinite" : "none",
          }}>
            {reachableCount}/{configuredCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 68,
          width: "min(560px,96vw)", maxHeight: "min(680px,82vh)",
          background: BG,
          border: `1px solid ${accent}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${accent}18`,
          fontFamily: MONO,
          display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${accent}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%",
              background: accent, boxShadow: `0 0 10px ${accent}`,
              display: "inline-block",
              animation: loading ? "llmhPulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: accent, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              LLM PROVIDER HEALTH
            </span>
            <span style={{ marginLeft: "auto", color: MUTED, fontSize: 9 }}>
              {loading ? "PROBING" : `${reachableCount}/${configuredCount} UP · 60s POLL`}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: MUTED,
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
            gap: 6, padding: "10px 14px 4px",
          }}>
            {[
              { label: "TOTAL",     value: providers.length,  color: CY  },
              { label: "REACHABLE", value: reachableCount,    color: GRN },
              { label: "DOWN",      value: downCount,         color: RED },
              { label: "MAX LAT",   value: maxLatency ? `${maxLatency}ms` : "—", color: AMB },
            ].map((t) => (
              <div key={t.label} style={{
                background: `${t.color}0f`,
                border: `1px solid ${t.color}33`,
                borderRadius: 8, padding: "6px 8px",
                display: "flex", flexDirection: "column", gap: 2,
              }}>
                <span style={{ color: t.color, fontSize: 9, letterSpacing: 1 }}>{t.label}</span>
                <span style={{ color: "#DCF0FF", fontSize: 15, fontWeight: 700 }}>
                  {t.value}
                </span>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{
            display: "flex", gap: 4, padding: "6px 14px 0",
          }}>
            {["ALL", "REACHABLE", "DOWN", "UNCONFIGURED"].map((f) => {
              const active = tab === f;
              const color =
                f === "REACHABLE"    ? GRN :
                f === "DOWN"         ? RED :
                f === "UNCONFIGURED" ? DIM :
                CY;
              return (
                <button
                  key={f}
                  onClick={() => setTab(f)}
                  style={{
                    background: active ? color + "22" : "transparent",
                    border: `1px solid ${active ? color : color + "22"}`,
                    color: active ? color : MUTED,
                    borderRadius: 5, padding: "3px 8px",
                    fontSize: 9, letterSpacing: 1, cursor: "pointer",
                    fontFamily: MONO, fontWeight: 700,
                  }}
                >
                  {f}
                </button>
              );
            })}
          </div>

          {/* Search + assess */}
          <div style={{
            padding: "8px 14px 6px", display: "flex", gap: 8, alignItems: "center",
            borderBottom: `1px solid ${accent}18`,
          }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="FILTER PROVIDER / MODEL…"
              style={{
                flex: 1, background: "rgba(255,255,255,0.04)",
                border: `1px solid ${accent}33`, borderRadius: 6,
                color: "#DCEBF5", padding: "5px 10px",
                fontSize: 10, letterSpacing: 1,
                fontFamily: MONO, outline: "none",
              }}
            />
            <button onClick={load} style={{
              background: "transparent", border: `1px solid ${accent}33`,
              borderRadius: 6, color: MUTED, padding: "5px 8px",
              fontSize: 9, cursor: "pointer", letterSpacing: 1, fontFamily: MONO,
            }} title="Refresh">↺</button>
            <button
              onClick={runAssess}
              disabled={assessing || providers.length === 0}
              style={{
                background: assessing ? `${accent}33` : "transparent",
                border: `1px solid ${accent}66`,
                borderRadius: 6, color: accent, padding: "5px 10px",
                fontSize: 9, cursor: assessing || providers.length === 0 ? "not-allowed" : "pointer",
                letterSpacing: 1, fontFamily: MONO,
                opacity: providers.length === 0 ? 0.4 : 1,
              }}
              title="Ask JARVIS to assess provider health"
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* Provider list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {error && (
              <div style={{
                padding: "20px 18px", color: RED, fontSize: 10,
                letterSpacing: 1, textAlign: "center",
              }}>
                {error.toUpperCase()}
              </div>
            )}

            {!error && filtered.length === 0 && (
              <div style={{
                padding: "28px 18px", color: DIM,
                fontSize: 11, textAlign: "center", letterSpacing: 1,
              }}>
                {loading
                  ? "PROBING PROVIDERS…"
                  : providers.length === 0
                    ? "NO PROVIDERS REGISTERED"
                    : "NO PROVIDERS MATCH FILTER"}
              </div>
            )}

            {filtered.map((p) => {
              const status = providerStatus(p);
              const color = statusColor(status);
              const latMs = p.latency_ms;
              const latC = latencyColor(latMs);
              const share = p.reachable && maxLatency
                ? Math.min(100, Math.round((latMs / maxLatency) * 100))
                : 0;
              return (
                <div key={p.id} style={{
                  padding: "9px 14px",
                  borderBottom: `1px solid ${accent}0F`,
                  borderLeft: `3px solid ${color}`,
                  display: "flex", flexDirection: "column", gap: 6,
                }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <span style={{
                      color: "#DCF0FF", fontSize: 12, flex: 1,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      fontWeight: 700, letterSpacing: 1,
                    }} title={p.id}>
                      {p.id.toUpperCase()}
                    </span>
                    {p.model && (
                      <span style={{
                        fontSize: 9, color: MUTED, fontStyle: "italic",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        maxWidth: 180,
                      }} title={p.model}>
                        {p.model}
                      </span>
                    )}
                    <span style={{
                      fontSize: 9, letterSpacing: 1, fontWeight: 700,
                      color, background: color + "22",
                      borderRadius: 5, padding: "2px 7px", flexShrink: 0,
                    }}>
                      {status.toUpperCase()}
                    </span>
                  </div>

                  {/* latency bar */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      flex: 1, height: 5, borderRadius: 3,
                      background: `${latC}18`, overflow: "hidden",
                    }}>
                      {p.reachable && (
                        <div style={{
                          height: "100%", borderRadius: 3,
                          width: `${Math.max(2, share)}%`,
                          background: latC,
                          boxShadow: latMs > 1200 ? `0 0 8px ${latC}` : "none",
                        }} />
                      )}
                    </div>
                    <span style={{
                      fontSize: 9, color: latC + "cc",
                      minWidth: 48, textAlign: "right",
                    }}>
                      {p.reachable ? `${latMs} ms` : "—"}
                    </span>
                  </div>

                  {/* meta line */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    fontSize: 9, color: MUTED, letterSpacing: 0.5,
                  }}>
                    <span>
                      CONFIGURED <span style={{ color: p.configured ? GRN : DIM, fontWeight: 700 }}>
                        {p.configured ? "YES" : "NO"}
                      </span>
                    </span>
                    <span>
                      REACHABLE <span style={{ color: p.reachable ? GRN : RED, fontWeight: 700 }}>
                        {p.reachable ? "YES" : "NO"}
                      </span>
                    </span>
                    {p.error && (
                      <span style={{
                        color: RED + "cc",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        flex: 1, textAlign: "right",
                      }} title={p.error}>
                        {p.error.length > 40 ? p.error.slice(0, 37) + "…" : p.error}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "7px 14px", borderTop: `1px solid ${accent}18`,
            display: "flex", alignItems: "center", gap: 10,
            fontSize: 9, color: DIM,
          }}>
            <span>
              {genAt ? `SNAPSHOT ${genAt}` : "SNAPSHOT PENDING"}
            </span>
            <span style={{ marginLeft: "auto", color: accent + "88" }}>
              /v1/jarvis/agent/llm/health
            </span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes llmhPulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.35); opacity: 0.55; }
        }
      `}</style>
    </>
  );
}
