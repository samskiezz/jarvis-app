/**
 * GpuTierPill — polls GET /v1/gpu/status every 2 min.
 * Shows a compact pill in the breadcrumb strip indicating whether the GPU
 * inference tier (SGLang or remote Ollama) is configured and healthy.
 * Green = healthy, amber = configured but unhealthy, grey = not configured.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 120_000;

const STATE = {
  healthy:      { bg: "#064E3B", fg: "#6EE7B7", dot: "#10B981", label: "GPU OK"   },
  degraded:     { bg: "#78350F", fg: "#FCD34D", dot: "#F59E0B", label: "GPU WARN" },
  unconfigured: { bg: "transparent", fg: "#4E6070", dot: "#2E4050", label: "GPU --" },
  error:        { bg: "#450A0A", fg: "#FCA5A5", dot: "#EF4444", label: "GPU ERR"  },
};

function deriveState(data) {
  if (!data) return "unconfigured";

  const sglangOk   = data.sglang?.configured && data.sglang?.health?.ok;
  const ollamaOk   = data.ollama?.configured && data.ollama?.health?.ok;
  const anyConfig  = data.sglang?.configured || data.ollama?.configured;

  if (!anyConfig) return "unconfigured";
  if (sglangOk || ollamaOk) return "healthy";
  return "degraded";
}

function tierLabel(data) {
  if (!data) return null;
  if (data.sglang?.configured && data.sglang?.health?.ok) return "SGLang";
  if (data.ollama?.configured && data.ollama?.health?.ok) {
    const models = data.ollama?.models ?? [];
    return models.length > 0 ? `Ollama·${models.length}m` : "Ollama";
  }
  if (data.sglang?.configured) return "SGLang";
  if (data.ollama?.configured) return "Ollama";
  return null;
}

export default function GpuTierPill() {
  const [data, setData]   = useState(null);
  const [fetched, setFetched] = useState(false);
  const [tick, bump]      = useReducer((n) => n + 1, 0);
  const timerRef          = useRef(null);

  useEffect(() => {
    let alive = true;
    kimiClient
      .request("/v1/gpu/status")
      .then((d) => { if (alive) { setData(d); setFetched(true); } })
      .catch(() => { if (alive) { setData(null); setFetched(true); } });

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => {
      alive = false;
      clearTimeout(timerRef.current);
    };
  }, [tick]);

  if (!fetched) return null;

  const key  = deriveState(data);
  const st   = STATE[key];
  const tier = tierLabel(data);

  return (
    <div
      title={`GPU Tier: ${st.label}${tier ? ` (${tier})` : ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: st.bg,
        border: `1px solid ${st.dot}44`,
        borderRadius: 10,
        padding: "1px 8px",
        fontFamily: S.mono,
        cursor: "default",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: st.dot,
          flexShrink: 0,
          boxShadow: key !== "unconfigured" ? `0 0 4px ${st.dot}` : "none",
        }}
      />
      <span style={{ fontSize: S.fs.xxs, color: st.fg, letterSpacing: 1 }}>
        {st.label}
        {tier && (
          <span style={{ opacity: 0.7, marginLeft: 4 }}>{tier}</span>
        )}
      </span>
    </div>
  );
}
