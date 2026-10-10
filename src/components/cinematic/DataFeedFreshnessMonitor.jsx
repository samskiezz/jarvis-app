/**
 * F75 — Data Feed Freshness Monitor
 * Polls six confirmed-real endpoints and shows how stale each feed is.
 * Stale = no data update in the last threshold. Displays a compact panel
 * with colour-coded pills: green (<1 h), amber (1–6 h), red (>6 h), grey (unreachable).
 *
 * Endpoints: /v1/cinematic/brain · /v1/investigations · /entities/RiskSignal
 *            /v1/datasets · /entities/Task · /v1/aip/skill
 *
 * Toggle: "JARVIS, freshness" | "feed health" | "data age"
 * Dispatches jarvis:ask → JarvisBrain wiring on pill click.
 * Additive only — mounted via App.jsx; zero edits to protected files.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const GRN  = "#00E5A0";
const AMB  = "#F59E0B";
const RED  = "#FF4D6D";
const GREY = "#4a5568";
const BG   = "rgba(6,14,20,0.96)";
const MONO = "'JetBrains Mono','Courier New',monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS = 90_000; // 90 s

// Threshold buckets (ms)
const FRESH_MS  = 60 * 60 * 1000;        // <1 h  → green
const STALE_MS  = 6 * 60 * 60 * 1000;    // 1–6 h → amber
// >6 h → red

const FRESH_RE = /\bfreshness\b|\bfeed.health\b|\bdata.age\b|\bfeed.fresh\b|\bstale\b|\bdata.freshness\b/i;

export function isFreshnessQuery(text) {
  return FRESH_RE.test(text || "");
}

// ─── per-feed extractors ──────────────────────────────────────────────────────

function latestDate(items, ...keys) {
  let best = null;
  for (const it of (Array.isArray(items) ? items : [])) {
    for (const k of keys) {
      const v = it?.[k];
      if (!v) continue;
      const d = new Date(typeof v === "number" ? v : Date.parse(v));
      if (!isNaN(d) && (!best || d > best)) best = d;
    }
  }
  return best;
}

async function fetchFeed(path) {
  const r = await fetch(`${apiBase()}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

function arrayOf(d) {
  return Array.isArray(d) ? d
    : Array.isArray(d?.data) ? d.data
    : Array.isArray(d?.items) ? d.items
    : Array.isArray(d?.results) ? d.results
    : [];
}

const FEEDS = [
  {
    id: "brain",
    label: "Brain Graph",
    path: "/v1/cinematic/brain",
    extract: (d) => {
      const ts = d?.last_updated || d?.updated_at || d?.timestamp;
      return ts ? new Date(typeof ts === "number" ? ts : Date.parse(ts)) : null;
    },
    query: "brain",
  },
  {
    id: "investigations",
    label: "Investigations",
    path: "/v1/investigations",
    extract: (d) => latestDate(arrayOf(d), "updated_at", "created_at", "last_updated", "date"),
    query: "investigations",
  },
  {
    id: "risks",
    label: "Risk Signals",
    path: "/entities/RiskSignal",
    extract: (d) => latestDate(arrayOf(d), "updated_at", "created_at", "timestamp", "detected_at"),
    query: "risks",
  },
  {
    id: "datasets",
    label: "Datasets",
    path: "/v1/datasets",
    extract: (d) => latestDate(arrayOf(d), "updated_at", "last_ingested", "created_at", "timestamp"),
    query: "datasets",
  },
  {
    id: "tasks",
    label: "Tasks",
    path: "/entities/Task",
    extract: (d) => latestDate(arrayOf(d), "updated_at", "created_at", "due_date", "timestamp"),
    query: "show tasks",
  },
  {
    id: "skills",
    label: "AIP Skills",
    path: "/v1/aip/skill",
    extract: (d) => {
      const arr = arrayOf(d?.skills ?? d);
      return latestDate(arr, "updated_at", "evaluated_at", "last_run", "timestamp");
    },
    query: "skills",
  },
];

// ─── helpers ─────────────────────────────────────────────────────────────────

function ageLabel(ms) {
  if (ms == null) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function pillColor(ageMs, error) {
  if (error) return GREY;
  if (ageMs == null) return GREY;
  if (ageMs < FRESH_MS) return GRN;
  if (ageMs < STALE_MS) return AMB;
  return RED;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function DataFeedFreshnessMonitor() {
  const [visible, setVisible] = useState(false);
  const [feeds, setFeeds]     = useState(() =>
    FEEDS.map(f => ({ id: f.id, label: f.label, query: f.query, ageMs: null, error: false, ts: null }))
  );
  const timer = useRef(null);

  const refresh = useCallback(async () => {
    const now = Date.now();
    const results = await Promise.allSettled(
      FEEDS.map(f => fetchFeed(f.path).then(d => ({ id: f.id, data: d, extract: f.extract })))
    );
    setFeeds(prev =>
      prev.map((row, i) => {
        const r = results[i];
        if (r.status === "rejected") return { ...row, error: true, ageMs: null, ts: null };
        const latest = r.value.extract(r.value.data);
        const ageMs  = latest ? now - latest.getTime() : null;
        return { ...row, error: false, ageMs, ts: latest };
      })
    );
  }, []);

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer.current);
  }, [refresh]);

  // voice/keyboard toggle
  useEffect(() => {
    const onAsk = (e) => {
      if (isFreshnessQuery(e.detail?.query)) setVisible(v => !v);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const openFeed = useCallback((query) => {
    window.dispatchEvent(new CustomEvent("jarvis:ask", { detail: { query } }));
  }, []);

  const staleCount = feeds.filter(f => !f.error && f.ageMs != null && f.ageMs >= FRESH_MS).length;
  const errorCount = feeds.filter(f => f.error).length;

  return (
    <>
      {/* toggle button */}
      <button
        onClick={() => setVisible(v => !v)}
        title="Data Feed Freshness (F75)"
        style={{
          position: "fixed", right: 16, bottom: 72, zIndex: 88000,
          background: BG, border: `1px solid ${CY}44`, borderRadius: 8,
          color: staleCount > 0 || errorCount > 0 ? AMB : CY,
          fontFamily: MONO, fontSize: 11, padding: "5px 10px",
          cursor: "pointer", letterSpacing: 1,
          boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
        }}
      >
        ◈ FEEDS {staleCount > 0 ? `${staleCount}⚠` : errorCount > 0 ? `${errorCount}✗` : "✓"}
      </button>

      {visible && (
        <div
          style={{
            position: "fixed", right: 16, bottom: 108, zIndex: 88001,
            background: BG, border: `1px solid ${CY}33`,
            borderRadius: 10, padding: "14px 16px", minWidth: 260,
            boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
            fontFamily: MONO,
          }}
        >
          {/* header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>
              Feed Freshness
            </span>
            <button
              onClick={() => setVisible(false)}
              style={{ background: "none", border: "none", color: GREY, cursor: "pointer", fontSize: 14, padding: 0 }}
            >
              ✕
            </button>
          </div>

          {/* feed rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {feeds.map(f => {
              const col = pillColor(f.ageMs, f.error);
              const age = f.error ? "ERR" : ageLabel(f.ageMs);
              return (
                <div
                  key={f.id}
                  onClick={() => openFeed(f.query)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "6px 10px", borderRadius: 6, cursor: "pointer",
                    background: `${col}11`, border: `1px solid ${col}33`,
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = `${col}22`}
                  onMouseLeave={e => e.currentTarget.style.background = `${col}11`}
                >
                  <span style={{ color: "#94a3b8", fontSize: 12 }}>{f.label}</span>
                  <span style={{
                    color: col, fontSize: 12, fontWeight: 600,
                    minWidth: 36, textAlign: "right",
                  }}>
                    {age}
                  </span>
                </div>
              );
            })}
          </div>

          {/* footer */}
          <div style={{ marginTop: 10, color: GREY, fontSize: 10, letterSpacing: 1, textAlign: "right" }}>
            auto-refresh 90s
          </div>
        </div>
      )}
    </>
  );
}
