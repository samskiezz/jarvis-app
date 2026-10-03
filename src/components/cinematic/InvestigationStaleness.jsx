/**
 * InvestigationStaleness — F94.
 *
 * /v1/investigations → classify each case by age since created_at/opened_at:
 *   FRESH   — ≤ 7 days
 *   ACTIVE  — 8–30 days
 *   AGING   — 31–90 days
 *   STALE   — > 90 days (open+stale cases pulse red as blind spots)
 *
 * Stat tiles: TOTAL / FRESH / ACTIVE / AGING / STALE
 * Filter tabs: ALL / FRESH / ACTIVE / AGING / STALE
 * List: sorted by age desc (stalest first); each row shows status + age badge.
 * Red pulse on STALE count when any open case is stale.
 * Click ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence case-recency brief + TTS.
 * 120 s auto-refresh.
 *
 * Intent: "invstale" / "stale investigation" / "case age" / "old cases" /
 *         "aging investigation" / "investigation recency" / "stale cases" /
 *         "investigation age" / "stale case tracker"
 *   → jarvis:invstale-toggle + TTS via buildInvstaleScript()
 *
 * Toggle: ◈ INVSTALE at left:973380, bottom:8, zIndex:118.
 * Mounted in App.jsx; wired in JarvisBrain.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const GREEN  = "#00c878";
const AMBER  = "#FFB347";
const RED    = "#FF3D5A";
const BTN_LEFT   = 973380;
const REFRESH_MS = 120_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise helpers ────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

function normaliseInvestigations(raw) {
  return normaliseArray(raw).map((inv) => ({
    id:     inv.id || inv.investigation_id || String(Math.random()),
    title:  inv.title || inv.name || inv.subject || "Untitled Investigation",
    status: inv.status || inv.state || "open",
    description: inv.description || inv.summary || inv.brief || "",
    createdAt:
      inv.created_at || inv.opened_at || inv.start_date ||
      inv.date || inv.timestamp || null,
  }));
}

// ─── age classification ───────────────────────────────────────────────────────

function ageDays(createdAt) {
  if (!createdAt) return null;
  const ts = new Date(createdAt).getTime();
  if (isNaN(ts)) return null;
  return Math.floor((Date.now() - ts) / 86_400_000);
}

function classify(days) {
  if (days === null) return "UNKNOWN";
  if (days <= 7) return "FRESH";
  if (days <= 30) return "ACTIVE";
  if (days <= 90) return "AGING";
  return "STALE";
}

const CLASS_ORDER = { STALE: 0, AGING: 1, ACTIVE: 2, FRESH: 3, UNKNOWN: 4 };
const CLASS_COLOR = {
  FRESH:   GREEN,
  ACTIVE:  CY,
  AGING:   AMBER,
  STALE:   RED,
  UNKNOWN: "#666",
};

// ─── exported intent helpers ──────────────────────────────────────────────────

export function isInvstaleQuery(q) {
  const s = (q || "").toLowerCase();
  return (
    s.includes("invstale") ||
    s.includes("stale investigation") ||
    s.includes("stale case") ||
    s.includes("old case") ||
    s.includes("aging investigation") ||
    s.includes("case age") ||
    s.includes("investigation age") ||
    s.includes("investigation recency") ||
    s.includes("old investigation")
  );
}

export async function buildInvstaleScript() {
  try {
    const base = apiBase();
    const r = await fetch(`${base}/v1/investigations`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const data = await r.json().catch(() => []);
    const invs = normaliseInvestigations(data);
    const enriched = invs.map((inv) => {
      const d = ageDays(inv.createdAt);
      return { ...inv, days: d, cls: classify(d) };
    });
    const counts = { FRESH: 0, ACTIVE: 0, AGING: 0, STALE: 0, UNKNOWN: 0 };
    enriched.forEach((i) => { counts[i.cls] = (counts[i.cls] || 0) + 1; });
    const staleOpen = enriched.filter(
      (i) => i.cls === "STALE" && !["closed", "resolved", "done"].includes((i.status || "").toLowerCase())
    );
    return (
      `Investigation Staleness: ${enriched.length} total cases — ` +
      `${counts.FRESH} fresh (≤7d), ${counts.ACTIVE} active (8-30d), ` +
      `${counts.AGING} aging (31-90d), ${counts.STALE} stale (>90d). ` +
      (staleOpen.length
        ? `${staleOpen.length} open stale cases are blind spots requiring immediate review.`
        : "No open stale cases detected.")
    );
  } catch {
    return "Investigation staleness data unavailable.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function InvestigationStaleness() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [tab, setTab]         = useState("ALL");
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = apiBase();
      const r = await fetch(`${base}/v1/investigations`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const raw = await r.json().catch(() => []);
      const invs = normaliseInvestigations(raw);
      const enriched = invs
        .map((inv) => {
          const d = ageDays(inv.createdAt);
          return { ...inv, days: d, cls: classify(d) };
        })
        .sort((a, b) => {
          const oa = CLASS_ORDER[a.cls] ?? 9;
          const ob = CLASS_ORDER[b.cls] ?? 9;
          if (oa !== ob) return oa - ob;
          return (b.days ?? 0) - (a.days ?? 0);
        });
      setRows(enriched);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen((v) => {
      if (!v) load();
      return !v;
    });
    window.addEventListener("jarvis:invstale-toggle", toggle);
    return () => window.removeEventListener("jarvis:invstale-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  // stat counts
  const counts = { FRESH: 0, ACTIVE: 0, AGING: 0, STALE: 0 };
  rows.forEach((r) => { if (counts[r.cls] !== undefined) counts[r.cls]++; });
  const staleOpenCount = rows.filter(
    (r) => r.cls === "STALE" && !["closed", "resolved", "done"].includes((r.status || "").toLowerCase())
  ).length;

  const filtered = rows.filter((r) => {
    const matchTab = tab === "ALL" || r.cls === tab;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      r.title.toLowerCase().includes(q) ||
      r.status.toLowerCase().includes(q) ||
      (r.description || "").toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = await buildInvstaleScript();
      const base = apiBase();
      const chatR = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const chatD = await chatR.json().catch(() => ({}));
      const answer = chatD.answer || script;
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: answer }),
      });
    } catch {
      // silently ignore TTS errors
    } finally {
      setAssessing(false);
    }
  }, []);

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Investigation Recency & Stale Case Tracker (INVSTALE)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 118,
          background: "transparent", border: `1px solid ${staleOpenCount > 0 ? RED : AMBER}`,
          color: staleOpenCount > 0 ? RED : AMBER, fontFamily: "monospace",
          fontSize: 10, padding: "3px 8px", cursor: "pointer", borderRadius: 3,
          animation: staleOpenCount > 0 ? "pulse-red 1.4s infinite" : "none",
        }}
      >
        ◈ INVSTALE
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", right: 16, top: 60, width: 420, maxHeight: "80vh",
      background: "#0a0a0f", border: `1px solid ${AMBER}`, borderRadius: 8,
      color: "#ccc", fontFamily: "monospace", fontSize: 11,
      zIndex: 10118, display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderBottom: "1px solid #222",
      }}>
        <span style={{ color: AMBER, fontWeight: "bold", fontSize: 12 }}>
          ◈ INVESTIGATION STALENESS
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={load} style={btnStyle(CY)} title="Refresh">↺</button>
          <button onClick={assess} disabled={assessing} style={btnStyle(GREEN)}>
            {assessing ? "…" : "▶ ASSESS"}
          </button>
          <button onClick={() => setOpen(false)} style={btnStyle("#666")}>✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(5, 1fr)",
        gap: 4, padding: "8px 10px", borderBottom: "1px solid #1a1a1a",
      }}>
        {[
          ["TOTAL",  rows.length,       CY],
          ["FRESH",  counts.FRESH,       GREEN],
          ["ACTIVE", counts.ACTIVE,      CY],
          ["AGING",  counts.AGING,       AMBER],
          ["STALE",  counts.STALE,       RED],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "#111", borderRadius: 4, padding: "5px 4px",
            textAlign: "center", border: `1px solid ${col}22`,
          }}>
            <div style={{ color: col, fontSize: 15, fontWeight: "bold" }}>{val}</div>
            <div style={{ color: "#666", fontSize: 8, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* search + filter tabs */}
      <div style={{ padding: "6px 10px", borderBottom: "1px solid #1a1a1a" }}>
        <input
          placeholder="Search investigations…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%", background: "#111", border: "1px solid #333",
            color: "#ccc", padding: "3px 6px", borderRadius: 3,
            fontFamily: "monospace", fontSize: 10, marginBottom: 6, boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {["ALL", "FRESH", "ACTIVE", "AGING", "STALE"].map((t) => (
            <button key={t} onClick={() => setTab(t)} style={tabStyle(tab === t)}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "6px 10px" }}>
        {loading && <div style={{ color: "#666", textAlign: "center", padding: 16 }}>Loading…</div>}
        {error && <div style={{ color: RED, padding: 8 }}>Error: {error}</div>}
        {!loading && !error && filtered.length === 0 && (
          <div style={{ color: "#666", textAlign: "center", padding: 16 }}>No cases match.</div>
        )}
        {filtered.map((row) => {
          const col = CLASS_COLOR[row.cls] || "#666";
          const isOpen = !["closed", "resolved", "done"].includes((row.status || "").toLowerCase());
          const isExpanded = expanded === row.id;
          return (
            <div
              key={row.id}
              style={{
                marginBottom: 6, background: "#0f0f14",
                border: `1px solid ${col}44`, borderRadius: 5, padding: "7px 9px",
                cursor: "pointer",
              }}
              onClick={() => setExpanded(isExpanded ? null : row.id)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  maxWidth: "68%", color: "#e8e8e8", fontSize: 11,
                }}>
                  {row.title}
                </span>
                <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                  <span style={{
                    background: `${col}22`, color: col, border: `1px solid ${col}`,
                    borderRadius: 3, padding: "1px 5px", fontSize: 9, fontWeight: "bold",
                    animation: (row.cls === "STALE" && isOpen) ? "pulse-red 1.4s infinite" : "none",
                  }}>
                    {row.cls}
                  </span>
                  {isExpanded ? "▲" : "▼"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 4, fontSize: 9, color: "#666" }}>
                <span>status: <span style={{ color: isOpen ? GREEN : "#888" }}>{row.status || "unknown"}</span></span>
                <span>age: <span style={{ color: col }}>
                  {row.days !== null ? `${row.days}d` : "unknown"}
                </span></span>
              </div>
              {isExpanded && (
                <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid #222" }}>
                  {row.description ? (
                    <div style={{ color: "#aaa", fontSize: 10, lineHeight: 1.5 }}>
                      {row.description.slice(0, 300)}
                      {row.description.length > 300 ? "…" : ""}
                    </div>
                  ) : (
                    <div style={{ color: "#555", fontSize: 10 }}>No description available.</div>
                  )}
                  {row.cls === "STALE" && isOpen && (
                    <div style={{ marginTop: 6, color: RED, fontSize: 10 }}>
                      ⚠ Open stale case — immediate review recommended.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function btnStyle(col) {
  return {
    background: "transparent", border: `1px solid ${col}`, color: col,
    fontFamily: "monospace", fontSize: 10, padding: "3px 8px",
    cursor: "pointer", borderRadius: 3,
  };
}

function tabStyle(active) {
  return {
    background: active ? "#FFB34722" : "transparent",
    border: `1px solid ${active ? "#FFB347" : "#333"}`,
    color: active ? "#FFB347" : "#888",
    fontFamily: "monospace", fontSize: 10, padding: "3px 7px",
    cursor: "pointer", borderRadius: 3,
  };
}
