/**
 * AutobuildPill — polls GET /v1/jarvis/system/autobuild/status every 90 s.
 * Derives phase from real response fields (seed_progress, scraped_documents,
 * document_store) and renders a compact status pill in the breadcrumb strip.
 *
 * Mounted inside the breadcrumb strip div in src/Layout.jsx.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 90_000;

const PHASE_STYLE = {
  crawling: { bg: "#78350F", fg: "#FCD34D", dot: "#F59E0B", label: "CRAWLING" },
  syncing:  { bg: "#1E3A5F", fg: "#93C5FD", dot: "#3B82F6", label: "SYNCING"  },
  ready:    { bg: "#064E3B", fg: "#6EE7B7", dot: "#10B981", label: "READY"    },
  idle:     { bg: "transparent", fg: "#4E6070", dot: "#2E4050", label: "IDLE" },
  error:    { bg: "#450A0A", fg: "#FCA5A5", dot: "#EF4444", label: "ERROR"    },
};

function derivePhase(data) {
  if (!data) return "idle";
  if (data.error) return "error";
  const remaining = data.seed_progress?.remaining ?? 0;
  const scraped   = data.scraped_documents ?? 0;
  const docs      = data.document_store?.documents ?? 0;
  if (remaining > 0)  return "crawling";
  if (scraped   > 0)  return "syncing";
  if (docs      > 0)  return "ready";
  return "idle";
}

export default function AutobuildPill() {
  const [data, setData] = useState(null);
  const [tick, bump]    = useReducer((n) => n + 1, 0);
  const timerRef        = useRef(null);

  useEffect(() => {
    let alive = true;
    kimiClient
      .request("/v1/jarvis/system/autobuild/status")
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setData({ error: true }); });

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => {
      alive = false;
      clearTimeout(timerRef.current);
    };
  }, [tick]);

  const phase = derivePhase(data);
  const ps    = PHASE_STYLE[phase];
  const docs  = data?.document_store?.documents;
  const seeds = data?.seed_progress;

  const detail = phase === "crawling" && seeds
    ? `${seeds.crawled}/${seeds.total}`
    : phase === "ready" && docs != null
    ? `${docs.toLocaleString()} docs`
    : null;

  return (
    <div
      title={`Autobuild: ${ps.label}${detail ? ` — ${detail}` : ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: ps.bg,
        border: `1px solid ${ps.dot}44`,
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
          background: ps.dot,
          flexShrink: 0,
          boxShadow: phase !== "idle" ? `0 0 4px ${ps.dot}` : "none",
        }}
      />
      <span style={{ fontSize: S.fs.xxs, color: ps.fg, letterSpacing: 1 }}>
        {ps.label}
        {detail && (
          <span style={{ opacity: 0.7, marginLeft: 4 }}>{detail}</span>
        )}
      </span>
    </div>
  );
}
