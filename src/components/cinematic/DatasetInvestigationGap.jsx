/**
 * DatasetInvestigationGap — F33.
 *
 * Parallel-fetches /v1/datasets + /v1/investigations.
 * Keyword-correlates each open investigation (title/description/subject)
 * against dataset names/descriptions to surface which cases have data
 * source coverage (SOURCED) and which are missing a backing dataset
 * (UNSOURCED — a data gap that may stall the investigation).
 *
 * Stat tiles: datasets / open cases / sourced / unsourced
 * Filter tabs: ALL / SOURCED / UNSOURCED
 * Split panel: investigation list left, matched datasets right.
 * Click ▶ ASSESS on any case → /v1/jarvis/agent/chat 2-sentence
 *   data-gap recommendation + TTS via jarvis:speak-dossier.
 * 60 s auto-refresh.
 *
 * Intent: "dataset investigation gap" / "data gap" / "datagap" /
 *         "investigation data source" / "which investigations have data" /
 *         "unsourced investigations" / "data coverage"
 *   → jarvis:datagap-toggle + TTS brief via buildDataGapScript()
 *
 * Toggle: ◈ DATAGAP at left:9000, bottom:8, zIndex 65.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3D5A";
const BTN_LEFT   = 9000;
const REFRESH_MS = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise helpers ────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseInvestigations(raw) {
  return normaliseArray(raw).map((inv) => ({
    id:          inv.id || inv.case_id || String(Math.random()),
    title:       inv.title || inv.name || inv.case_name || "Unnamed Case",
    description: inv.description || inv.summary || inv.details || "",
    status:      (inv.status || "open").toLowerCase(),
    priority:    inv.priority || inv.severity || "",
    subject:     inv.subject || inv.target || "",
  }));
}

function normaliseDatasets(raw) {
  return normaliseArray(raw).map((ds) => ({
    id:          ds.id || ds.dataset_id || String(Math.random()),
    name:        ds.name || ds.title || ds.dataset_name || "Unnamed Dataset",
    description: ds.description || ds.summary || ds.details || "",
    schema:      ds.schema || ds.schema_name || ds.type || ds.source || "",
    rows:        ds.row_count ?? ds.rows ?? ds.count ?? null,
  }));
}

function tokens(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function hasOverlap(inv, dataset) {
  const invTokens = new Set([
    ...tokens(inv.title),
    ...tokens(inv.description),
    ...tokens(inv.subject),
  ]);
  const dsTokens = [
    ...tokens(dataset.name),
    ...tokens(dataset.description),
    ...tokens(dataset.schema),
  ];
  return dsTokens.some((t) => invTokens.has(t));
}

// ─── exported voice intent helpers ───────────────────────────────────────────

export function isDataGapQuery(q = "") {
  return /data\s*gap|datagap|dataset\s*invest|invest\w*\s*data\s*(source|gap|cover)|unsourced\s*invest|data\s*cover|which\s*invest\w*\s*have\s*data|investigation\s*data\s*(source|gap)/i.test(q);
}

export async function buildDataGapScript() {
  try {
    const [dsRes, invRes] = await Promise.all([
      fetch(`${apiBase()}/v1/datasets`,       { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/v1/investigations`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const datasets = normaliseDatasets(dsRes.ok   ? await dsRes.json()  : []);
    const invs     = normaliseInvestigations(invRes.ok ? await invRes.json() : []);
    const open     = invs.filter((i) => i.status !== "closed" && i.status !== "resolved");
    const sourced   = open.filter((inv) => datasets.some((ds) => hasOverlap(inv, ds)));
    const unsourced = open.filter((inv) => !datasets.some((ds) => hasOverlap(inv, ds)));
    return (
      `Dataset-investigation coverage: ${datasets.length} datasets available, ${open.length} open cases. ` +
      `${sourced.length} investigations have matching dataset coverage; ${unsourced.length} are data gaps. ` +
      (unsourced.length > 0
        ? `Unsourced cases include: ${unsourced.slice(0, 3).map((i) => i.title).join(", ")}.`
        : "All open investigations have at least one backing dataset, sir.")
    );
  } catch {
    return "Unable to retrieve dataset-investigation coverage at this time, sir.";
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function DatasetInvestigationGap() {
  const [open, setOpen]           = useState(false);
  const [datasets, setDatasets]   = useState([]);
  const [invs, setInvs]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [filter, setFilter]       = useState("ALL");
  const [selected, setSelected]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dsRes, invRes] = await Promise.all([
        fetch(`${apiBase()}/v1/datasets`,       { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${apiBase()}/v1/investigations`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      setDatasets(normaliseDatasets(dsRes.ok   ? await dsRes.json()  : []));
      setInvs(normaliseInvestigations(invRes.ok ? await invRes.json() : []));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => { setOpen((v) => { if (!v) load(); return !v; }); };
    window.addEventListener("jarvis:datagap-toggle", onToggle);
    return () => window.removeEventListener("jarvis:datagap-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const openInvs = invs.filter((i) => i.status !== "closed" && i.status !== "resolved");

  const withCoverage = openInvs.map((inv) => {
    const matched = datasets.filter((ds) => hasOverlap(inv, ds));
    return { ...inv, matched, sourced: matched.length > 0 };
  });

  const sourcedCount   = withCoverage.filter((i) => i.sourced).length;
  const unsourcedCount = withCoverage.filter((i) => !i.sourced).length;

  const visible =
    filter === "SOURCED"   ? withCoverage.filter((i) => i.sourced) :
    filter === "UNSOURCED" ? withCoverage.filter((i) => !i.sourced) :
    withCoverage;

  async function assess(inv) {
    setAssessing(inv.id);
    try {
      const prompt =
        `In 2 sentences, recommend what datasets should be sourced to advance this investigation: ` +
        `"${inv.title}". ` +
        (inv.matched.length > 0
          ? `Currently matched datasets: ${inv.matched.map((d) => d.name).join(", ")}.`
          : "No matching datasets found yet — identify the data gap and suggest remediation.");
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Insufficient data to assess this investigation's data coverage, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch {}
    setAssessing(null);
  }

  const TABS = ["ALL", "SOURCED", "UNSOURCED"];

  return (
    <>
      {/* toggle button */}
      <button
        onClick={() => { setOpen((v) => { if (!v) load(); return !v; }); }}
        title="Dataset–Investigation Gap"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 65,
          background: open ? CY : "rgba(5,8,13,0.75)",
          color: open ? "#04060A" : CY,
          border: `1px solid ${CY}55`, borderRadius: 6, padding: "3px 8px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: 1,
          cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: unsourcedCount > 0 ? `0 0 10px ${AMBER}66` : "none",
        }}
      >
        ◈ DATAGAP{unsourcedCount > 0 && !open ? ` +${unsourcedCount}` : ""}
      </button>

      {/* panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 30, left: BTN_LEFT - 400, zIndex: 66,
          width: 680, maxHeight: "72vh",
          background: "rgba(5,8,13,0.94)", border: `1px solid ${CY}33`,
          borderRadius: 12, overflow: "hidden",
          backdropFilter: "blur(14px)", boxShadow: `0 0 60px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace", display: "flex", flexDirection: "column",
        }}>
          {/* header */}
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${CY}22`, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>◈ DATASET–INVESTIGATION GAP</span>
            {loading && <span style={{ color: "#4A6070", fontSize: 9 }}>↻</span>}
            <button onClick={load} style={{ marginLeft: "auto", background: "none", border: `1px solid ${CY}33`, color: CY, borderRadius: 4, padding: "2px 7px", cursor: "pointer", fontSize: 9 }}>↻</button>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#4A6070", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${CY}11` }}>
            {[
              { label: "DATASETS",   value: datasets.length,  c: "#A78BFA" },
              { label: "OPEN CASES", value: openInvs.length,  c: CY },
              { label: "SOURCED",    value: sourcedCount,     c: GREEN },
              { label: "UNSOURCED",  value: unsourcedCount,   c: unsourcedCount > 0 ? AMBER : "#4A6070" },
            ].map(({ label, value, c }) => (
              <div key={label} style={{ flex: 1, background: "rgba(255,255,255,0.03)", borderRadius: 6, padding: "5px 8px", textAlign: "center" }}>
                <div style={{ color: c, fontSize: 16, fontWeight: 700 }}>{value}</div>
                <div style={{ color: "#4A6070", fontSize: 8, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${CY}11` }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{
                flex: 1, padding: "5px 0", background: filter === t ? `${CY}18` : "none",
                border: "none", borderBottom: filter === t ? `2px solid ${CY}` : "2px solid transparent",
                color: filter === t ? CY : "#4A6070", cursor: "pointer", fontSize: 9, letterSpacing: 1,
              }}>{t}</button>
            ))}
          </div>

          {/* split body */}
          <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
            {/* left: investigation list */}
            <div style={{ flex: "0 0 300px", overflowY: "auto", borderRight: `1px solid ${CY}11` }}>
              {visible.length === 0 && (
                <div style={{ padding: 16, color: "#4A6070", fontSize: 11 }}>No cases to display.</div>
              )}
              {visible.map((inv) => (
                <div
                  key={inv.id}
                  onClick={() => setSelected(selected?.id === inv.id ? null : inv)}
                  style={{
                    padding: "8px 12px", cursor: "pointer", borderBottom: `1px solid ${CY}0A`,
                    background: selected?.id === inv.id ? `${CY}0F` : "transparent",
                    borderLeft: `2px solid ${inv.sourced ? GREEN : AMBER}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 8, color: inv.sourced ? GREEN : AMBER }}>
                      {inv.sourced ? "●" : "○"}
                    </span>
                    <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {inv.title}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {inv.status && (
                      <span style={{ fontSize: 8, color: "#4A6070", letterSpacing: 1 }}>{inv.status.toUpperCase()}</span>
                    )}
                    {inv.priority && (
                      <span style={{ fontSize: 8, color: inv.priority === "critical" ? RED : inv.priority === "high" ? AMBER : CY, letterSpacing: 1 }}>
                        {inv.priority.toUpperCase()}
                      </span>
                    )}
                    <span style={{ fontSize: 8, color: inv.sourced ? GREEN : AMBER, marginLeft: "auto" }}>
                      {inv.matched.length} dataset{inv.matched.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* right: matched datasets + assess */}
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
              {!selected ? (
                <div style={{ color: "#4A6070", fontSize: 10, paddingTop: 24, textAlign: "center" }}>
                  Select an investigation to see matched datasets
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: CY, fontSize: 10, fontWeight: 700, marginBottom: 2 }}>{selected.title}</div>
                    {selected.description && (
                      <div style={{ color: "#6E8AA0", fontSize: 9, lineHeight: 1.4, marginBottom: 6 }}>{selected.description}</div>
                    )}
                    <button
                      onClick={() => assess(selected)}
                      disabled={assessing === selected.id}
                      style={{
                        background: assessing === selected.id ? "#2a3a4a" : `${CY}22`,
                        border: `1px solid ${CY}55`, color: CY, borderRadius: 5,
                        padding: "4px 10px", cursor: assessing === selected.id ? "default" : "pointer",
                        fontSize: 9, letterSpacing: 1,
                      }}
                    >
                      {assessing === selected.id ? "◌ ASSESSING…" : "▶ ASSESS"}
                    </button>
                  </div>

                  {selected.matched.length === 0 ? (
                    <div style={{ color: AMBER, fontSize: 10, padding: "10px 0" }}>
                      No matching datasets found — this investigation is a data gap.
                    </div>
                  ) : (
                    selected.matched.map((ds) => (
                      <div key={ds.id} style={{
                        background: "rgba(255,255,255,0.03)", borderRadius: 6,
                        padding: "7px 10px", marginBottom: 6, borderLeft: `2px solid ${GREEN}`,
                      }}>
                        <div style={{ color: "#DCEBF5", fontSize: 10, marginBottom: 2 }}>{ds.name}</div>
                        {ds.description && (
                          <div style={{ color: "#4A6070", fontSize: 9, lineHeight: 1.4 }}>
                            {ds.description.slice(0, 140)}{ds.description.length > 140 ? "…" : ""}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 10, marginTop: 3 }}>
                          {ds.schema && (
                            <span style={{ color: "#4A6070", fontSize: 8, letterSpacing: 1 }}>
                              SCHEMA: {ds.schema}
                            </span>
                          )}
                          {ds.rows !== null && (
                            <span style={{ color: "#4A6070", fontSize: 8, letterSpacing: 1 }}>
                              {Number(ds.rows).toLocaleString()} rows
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
