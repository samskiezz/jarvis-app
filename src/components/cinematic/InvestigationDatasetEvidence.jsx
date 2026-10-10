/**
 * InvestigationDatasetEvidence — F95
 *
 * Parallel-fetches /v1/investigations + /v1/datasets then keyword-
 * correlates each open investigation against the dataset catalog to
 * surface DATA_BACKED (≥1 dataset match) vs DATA_DARK (no dataset
 * support — investigation has no data foundation).
 *
 * Stat tiles: cases / datasets / backed / dark
 * Filter tabs: ALL / DATA_BACKED / DATA_DARK
 * Expand case → matched dataset cards with row counts + relevance bar.
 * Click ▶ ASSESS EVIDENCE → /v1/jarvis/agent/chat 2-sentence brief
 *   + jarvis:speak-dossier TTS.
 * 90 s auto-refresh.
 *
 * Intent: "investigation dataset" / "invdset" / "case data" /
 *         "unbacked investigations" / "investigation evidence" /
 *         "data dark cases" / "case dataset"
 *   → jarvis:invdset-toggle + TTS brief via buildInvdsetScript()
 *
 * Toggle: ◈ INVDSET at left:30680, bottom:8, zIndex 95.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const RED    = "#FF4444";
const DIM    = "#4A6070";
const BG     = "rgba(3,5,9,0.97)";
const BTN_LEFT   = 30680;
const REFRESH_MS = 90_000;
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,monospace";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── intent exports ───────────────────────────────────────────────────────────

const INVDSET_RE =
  /\b(investigation.dataset|invdset|case.data(set)?|unbacked.invest|investigation.evidence|data.dark.case|case.dataset|invest.*dataset|dataset.*invest)\b/i;

export function isInvdsetQuery(t) { return INVDSET_RE.test(t || ""); }

export async function buildInvdsetScript() {
  const [iRaw, dRaw] = await Promise.allSettled([
    fetch(`${apiBase()}/v1/investigations`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then((r) => r.json()),
    fetch(`${apiBase()}/v1/datasets`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then((r) => r.json()),
  ]);
  const cases    = normaliseInvestigations(iRaw.status === "fulfilled" ? iRaw.value : []);
  const datasets = normaliseDatasets(dRaw.status === "fulfilled" ? dRaw.value : []);
  const pairs    = correlate(cases, datasets);
  const backed = pairs.filter((p) => p.matches.length > 0).length;
  const dark   = pairs.filter((p) => p.matches.length === 0).length;
  return (
    `Assess JARVIS investigation dataset evidence in 2 sentences. ` +
    `${cases.length} open investigations vs ${datasets.length} datasets: ` +
    `${backed} DATA_BACKED (at least one dataset backs the case), ` +
    `${dark} DATA_DARK (no dataset evidence — blind-spot investigations). ` +
    `Top dark cases: ${pairs
      .filter((p) => p.matches.length === 0)
      .slice(0, 3)
      .map((p) => p.inv.title)
      .join(", ") || "none"}.`
  );
}

// ─── normalise helpers ────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.investigations)) return raw.investigations;
  if (raw && Array.isArray(raw.datasets))       return raw.datasets;
  if (raw && Array.isArray(raw.items))          return raw.items;
  if (raw && Array.isArray(raw.data))           return raw.data;
  if (raw && Array.isArray(raw.results))        return raw.results;
  if (raw && typeof raw === "object")           return Object.values(raw);
  return [];
}

function normaliseInvestigations(raw) {
  return normaliseArray(raw).map((inv) => ({
    id:      inv.id || inv.investigation_id || String(Math.random()),
    title:   inv.title || inv.name || inv.case || "Untitled Case",
    summary: inv.summary || inv.description || inv.notes || "",
    status:  inv.status || inv.state || "OPEN",
    tags:    [...(inv.tags || []), ...(inv.labels || [])].map(String),
  }));
}

function normaliseDatasets(raw) {
  return normaliseArray(raw).map((d) => ({
    id:    d.id || d.dataset_id || String(Math.random()),
    name:  d.name || d.title || d.dataset || "Unnamed Dataset",
    desc:  d.description || d.summary || d.notes || "",
    rows:  d.row_count ?? d.rows ?? d.count ?? null,
    tags:  [...(d.tags || []), ...(d.labels || [])].map(String),
  }));
}

function tokens(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function matchScore(inv, ds) {
  const invWords = tokens(`${inv.title} ${inv.summary} ${inv.tags.join(" ")}`);
  const dsText   = `${ds.name} ${ds.desc} ${ds.tags.join(" ")}`.toLowerCase();
  const hits = invWords.filter((w) => dsText.includes(w));
  return hits.length / Math.max(invWords.length, 1);
}

function correlate(cases, datasets) {
  return cases.map((inv) => {
    const scored = datasets
      .map((ds) => ({ ds, score: matchScore(inv, ds) }))
      .filter((x) => x.score > 0.1)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { inv, matches: scored };
  });
}

// ─── sub-components ───────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{
      flex: "1 1 0", minWidth: 70, background: "rgba(0,0,0,0.3)",
      border: `1px solid ${color}33`, borderRadius: 6,
      padding: "6px 8px", textAlign: "center",
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: MONO }}>{value}</div>
      <div style={{ fontSize: 9, color: DIM, letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function ScoreBar({ score }) {
  const color = score > 0.5 ? GREEN : score > 0.25 ? AMBER : CY;
  return (
    <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, flex: 1 }}>
      <div style={{
        width: `${Math.round(score * 100)}%`, height: "100%",
        background: color, borderRadius: 2,
        transition: "width 0.4s ease",
      }} />
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function InvestigationDatasetEvidence() {
  const [open, setOpen]         = useState(false);
  const [pairs, setPairs]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [iRes, dRes] = await Promise.allSettled([
        fetch(`${apiBase()}/v1/investigations`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
        fetch(`${apiBase()}/v1/datasets`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
      ]);
      const cases    = normaliseInvestigations(iRes.status === "fulfilled" ? iRes.value : []);
      const datasets = normaliseDatasets(dRes.status === "fulfilled" ? dRes.value : []);
      setPairs(correlate(cases, datasets));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:invdset-toggle", onToggle);
    return () => window.removeEventListener("jarvis:invdset-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const backed = pairs.filter((p) => p.matches.length > 0);
  const dark   = pairs.filter((p) => p.matches.length === 0);

  const visible = pairs
    .filter((p) => {
      if (tab === "DATA_BACKED") return p.matches.length > 0;
      if (tab === "DATA_DARK")   return p.matches.length === 0;
      return true;
    })
    .filter((p) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        p.inv.title.toLowerCase().includes(q) ||
        p.inv.summary.toLowerCase().includes(q) ||
        p.matches.some((m) => m.ds.name.toLowerCase().includes(q))
      );
    });

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildInvdsetScript();
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: script }),
      });
      const json = await res.json();
      const text =
        json.response || json.reply || json.message || json.content ||
        JSON.stringify(json).slice(0, 200);
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text } })
      );
    } catch (_) {
      // silently ignore assessment errors
    } finally {
      setAssessing(false);
    }
  }

  const toggleRow = (id) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Investigation × Dataset Evidence (INVDSET)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 95,
          background: "rgba(3,5,9,0.85)", border: `1px solid ${AMBER}55`,
          borderRadius: 4, color: AMBER, fontFamily: MONO, fontSize: 9,
          letterSpacing: 1, padding: "3px 7px", cursor: "pointer",
        }}
      >
        ◈ INVDSET
        {dark.length > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 8, fontWeight: 700,
          }}>
            {dark.length}
          </span>
        )}
      </button>
    );
  }

  const TABS = ["ALL", "DATA_BACKED", "DATA_DARK"];
  const tabColor = (t) =>
    t === "DATA_DARK" ? AMBER : t === "DATA_BACKED" ? GREEN : CY;

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT - 200, bottom: 48, zIndex: 95,
      width: 520, maxHeight: "75vh",
      background: BG, border: `1px solid ${AMBER}66`,
      borderRadius: 8, fontFamily: MONO, fontSize: 10,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderBottom: `1px solid ${AMBER}33`,
        background: "rgba(0,0,0,0.4)",
      }}>
        <span style={{ color: AMBER, fontSize: 11, letterSpacing: 2 }}>
          ◈ INVESTIGATION × DATASET EVIDENCE
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              background: "none", border: `1px solid ${CY}66`,
              borderRadius: 4, color: CY, fontFamily: MONO, fontSize: 9,
              letterSpacing: 1, padding: "2px 8px", cursor: "pointer",
            }}
          >
            {assessing ? "…" : "▶ ASSESS EVIDENCE"}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "none", border: "none", color: DIM,
              fontSize: 14, cursor: "pointer", lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
        <Tile label="CASES"    value={pairs.length}  color={CY} />
        <Tile label="DATASETS" value={
          pairs.length > 0
            ? [...new Set(pairs.flatMap((p) => p.matches.map((m) => m.ds.id)))].length
            : 0
        } color={CY} />
        <Tile label="BACKED"   value={backed.length} color={GREEN} />
        <Tile label="DARK"     value={dark.length}   color={AMBER} />
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 12px 6px" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? `${tabColor(t)}22` : "none",
              border: `1px solid ${tab === t ? tabColor(t) : DIM}`,
              borderRadius: 3, color: tab === t ? tabColor(t) : DIM,
              fontFamily: MONO, fontSize: 8, letterSpacing: 1,
              padding: "2px 6px", cursor: "pointer",
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: "auto", background: "rgba(0,0,0,0.4)",
            border: `1px solid ${DIM}`, borderRadius: 3,
            color: CY, fontFamily: MONO, fontSize: 9,
            padding: "2px 6px", width: 120, outline: "none",
          }}
        />
      </div>

      {/* list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 12px" }}>
        {loading && (
          <div style={{ color: DIM, padding: "8px 0" }}>◌ loading…</div>
        )}
        {error && (
          <div style={{ color: RED, padding: "4px 0" }}>⚠ {error}</div>
        )}
        {!loading && visible.length === 0 && !error && (
          <div style={{ color: DIM, padding: "8px 0" }}>no results</div>
        )}
        {visible.map((p) => {
          const status = p.matches.length > 0 ? "DATA_BACKED" : "DATA_DARK";
          const statusColor = status === "DATA_BACKED" ? GREEN : AMBER;
          const isExp = expanded[p.inv.id];
          return (
            <div
              key={p.inv.id}
              style={{
                borderBottom: `1px solid rgba(255,255,255,0.04)`,
                paddingBottom: 6, marginBottom: 6,
              }}
            >
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  cursor: "pointer", padding: "4px 0",
                }}
                onClick={() => toggleRow(p.inv.id)}
              >
                <span style={{
                  fontSize: 8, border: `1px solid ${statusColor}`,
                  borderRadius: 3, color: statusColor,
                  padding: "1px 4px", letterSpacing: 1, flexShrink: 0,
                }}>
                  {status}
                </span>
                <span style={{ color: CY, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.inv.title}
                </span>
                <span style={{ color: DIM, fontSize: 8 }}>
                  {p.matches.length} ds
                </span>
                <span style={{ color: DIM, fontSize: 10 }}>
                  {isExp ? "▲" : "▼"}
                </span>
              </div>

              {isExp && (
                <div style={{ paddingLeft: 12, paddingBottom: 4 }}>
                  {p.inv.summary && (
                    <div style={{ color: DIM, fontSize: 9, marginBottom: 4, fontStyle: "italic" }}>
                      {p.inv.summary.slice(0, 100)}
                    </div>
                  )}
                  {p.matches.length === 0 ? (
                    <div style={{ color: AMBER, fontSize: 9 }}>
                      ⚠ no dataset match — DATA DARK
                    </div>
                  ) : (
                    p.matches.map(({ ds, score }) => (
                      <div key={ds.id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        marginBottom: 3,
                      }}>
                        <span style={{ color: GREEN, fontSize: 9, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {ds.name}
                        </span>
                        {ds.rows != null && (
                          <span style={{ color: DIM, fontSize: 8, flexShrink: 0 }}>
                            {ds.rows.toLocaleString()} rows
                          </span>
                        )}
                        <ScoreBar score={score} />
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{
        padding: "4px 12px", borderTop: `1px solid ${AMBER}22`,
        color: DIM, fontSize: 8, letterSpacing: 1,
        display: "flex", justifyContent: "space-between",
      }}>
        <span>INVDSET · /v1/investigations × /v1/datasets</span>
        <span
          onClick={load}
          style={{ cursor: "pointer", color: CY }}
          title="refresh now"
        >
          ↺ {REFRESH_MS / 1000}s
        </span>
      </div>
    </div>
  );
}
