/**
 * IntelProfileDatasetEvidence — F49.
 *
 * Cross-references threat intelligence profiles against the dataset catalogue
 * to surface which profiles have EVIDENCED backing datasets and which are
 * UNSUPPORTED (no dataset contains relevant data for that profile).
 *
 * Endpoints used:
 *   /entities/IntelProfile  — threat intelligence profiles
 *   /v1/datasets             — data catalogue with names, descriptions, row counts
 *
 * Stat tiles: profiles / datasets / evidenced / unsupported
 * Filter tabs: ALL / EVIDENCED / UNSUPPORTED
 * Expand profile → matched dataset cards (name + row count)
 * ▶ ASSESS per profile → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *   via jarvis:speak-dossier
 * 90 s auto-refresh.
 *
 * Voice: "intel evidence" / "profile dataset" / "threat data" / "idepc" /
 *        "unsupported profiles" / "intel data coverage" / "data backed intel"
 *   → jarvis:idepc-toggle + TTS via buildIdepcScript()
 *
 * Toggle: ◈ IDEPC at left:11800, bottom:8, zIndex:131.
 * Mounted in App.jsx; wired in JarvisBrain.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3D5A";
const BTN_LEFT   = 11800;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise helpers ────────────────────────────────────────────────────────

function toArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseProfiles(raw) {
  return toArray(raw).map((p) => ({
    id:          p.id || p.profile_id || String(Math.random()),
    name:        p.name || p.title || p.profile_name || "Unnamed Profile",
    type:        p.type || p.category || p.threat_type || "",
    description: p.description || p.summary || p.bio || "",
    tags:        Array.isArray(p.tags) ? p.tags : [],
    threat_level: Number(p.threat_level ?? p.severity ?? p.risk_score ?? 0),
    keywords: [
      p.name || "", p.title || "", p.type || "", p.category || "",
      ...(Array.isArray(p.tags) ? p.tags : []),
      p.description || "",
    ].join(" ").toLowerCase(),
  }));
}

function normaliseDatasets(raw) {
  return toArray(raw).map((d) => ({
    id:          d.id || d.dataset_id || String(Math.random()),
    name:        d.name || d.title || d.dataset_name || "Unnamed Dataset",
    description: d.description || d.summary || "",
    row_count:   Number(d.row_count ?? d.rows ?? d.count ?? 0),
    category:    d.category || d.type || d.domain || "",
    tags:        Array.isArray(d.tags) ? d.tags : [],
    keywords: [
      d.name || "", d.title || "", d.category || "", d.domain || "",
      ...(Array.isArray(d.tags) ? d.tags : []),
      d.description || "",
    ].join(" ").toLowerCase(),
  }));
}

function kwMatch(a = "", b = "") {
  const words = (s) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3);
  const aw = words(a);
  const bw = words(b);
  return aw.some((w) => bw.includes(w));
}

function correlate(profiles, datasets) {
  return profiles.map((p) => {
    const matched = datasets.filter(
      (d) =>
        kwMatch(p.name, d.keywords) ||
        kwMatch(p.type, d.keywords) ||
        kwMatch(p.keywords, d.name) ||
        kwMatch(p.keywords, d.keywords)
    );
    return { ...p, datasets: matched, evidenced: matched.length > 0 };
  });
}

// ─── exported helpers for JarvisBrain voice routing ──────────────────────────

export function isIdepcQuery(q = "") {
  const lq = q.toLowerCase();
  return (
    lq.includes("idepc") ||
    lq.includes("intel evidence") ||
    lq.includes("profile dataset") ||
    lq.includes("threat data") ||
    lq.includes("unsupported profiles") ||
    lq.includes("intel data coverage") ||
    lq.includes("data backed intel") ||
    lq.includes("dataset intel") ||
    lq.includes("intel profile dataset")
  );
}

export async function buildIdepcScript() {
  const base = apiBase();
  try {
    const [profRaw, dsRaw] = await Promise.all([
      fetch(`${base}/entities/IntelProfile`).then((r) => r.json()).catch(() => []),
      fetch(`${base}/v1/datasets`).then((r) => r.json()).catch(() => []),
    ]);
    const profiles = normaliseProfiles(profRaw);
    const datasets = normaliseDatasets(dsRaw);
    const corr     = correlate(profiles, datasets);
    const nEvidenced   = corr.filter((p) => p.evidenced).length;
    const nUnsupported = corr.length - nEvidenced;
    if (!corr.length) return "No intelligence profiles found to cross-reference against datasets, sir.";
    return `Intel profile dataset evidence analysis complete, sir. ${corr.length} threat profiles reviewed against ${datasets.length} datasets. ${nEvidenced} profiles have evidenced dataset backing; ${nUnsupported} are unsupported — flagged as intelligence gaps. Review the IDEPC panel for the full breakdown.`;
  } catch {
    return "Intel profile dataset evidence coverage is standing by — endpoint temporarily unreachable, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function IntelProfileDatasetEvidence() {
  const [open, setOpen]           = useState(false);
  const [profiles, setProfiles]   = useState([]);
  const [datasets, setDatasets]   = useState([]);
  const [corr, setCorr]           = useState([]);
  const [filter, setFilter]       = useState("ALL");
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState(null);
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const base = apiBase();
      const [profRaw, dsRaw] = await Promise.all([
        fetch(`${base}/entities/IntelProfile`).then((r) => r.json()),
        fetch(`${base}/v1/datasets`).then((r) => r.json()),
      ]);
      const profs = normaliseProfiles(profRaw);
      const dss   = normaliseDatasets(dsRaw);
      setProfiles(profs);
      setDatasets(dss);
      setCorr(correlate(profs, dss));
    } catch (e) {
      setErr(e.message || "Fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:idepc-toggle", onToggle);
    return () => window.removeEventListener("jarvis:idepc-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess(profile) {
    setAssessing(profile.id);
    try {
      const dsTitles = profile.datasets.map((d) => d.name).join(", ") || "none";
      const prompt = `Intel profile: "${profile.name}" (type: ${profile.type || "unknown"}, threat level: ${profile.threat_level}). Matched datasets: ${dsTitles}. In two sentences, assess whether the available datasets adequately evidence this threat profile and what data gap exists if any.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const script = (d.answer || "Assessment complete.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch {
      // silent
    } finally {
      setAssessing(null);
    }
  }

  const nEvidenced   = corr.filter((p) => p.evidenced).length;
  const nUnsupported = corr.length - nEvidenced;

  const visible = corr.filter((p) => {
    if (filter === "EVIDENCED")   return p.evidenced;
    if (filter === "UNSUPPORTED") return !p.evidenced;
    return true;
  });

  const btnStyle = {
    position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 131,
    background: open ? `${CY}22` : "rgba(5,10,18,0.82)",
    border: `1px solid ${open ? CY : CY + "44"}`,
    borderRadius: 6, padding: "3px 10px",
    color: open ? CY : `${CY}99`, fontSize: 10, letterSpacing: 1.5,
    fontFamily: "'JetBrains Mono',monospace", cursor: "pointer",
    display: "flex", alignItems: "center", gap: 6,
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen((v) => !v)} title="IntelProfile × Dataset Evidence Coverage">
        ◈ IDEPC
        {nUnsupported > 0 && (
          <span style={{
            background: AMBER, color: "#000", borderRadius: 4,
            padding: "0 5px", fontSize: 9, fontWeight: 700,
          }}>{nUnsupported}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", top: 54, right: 18, width: 460, maxHeight: "80vh",
          background: "rgba(3,8,16,0.97)", border: `1px solid ${CY}33`,
          borderRadius: 14, zIndex: 132, display: "flex", flexDirection: "column",
          fontFamily: "'JetBrains Mono',monospace", overflow: "hidden",
          boxShadow: `0 0 60px ${CY}12`,
        }}>
          {/* Header */}
          <div style={{
            padding: "12px 16px", borderBottom: `1px solid ${CY}22`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>
              ◈ INTEL PROFILE × DATASET EVIDENCE
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {loading && <span style={{ color: `${CY}66`, fontSize: 9 }}>◌ LOADING</span>}
              <button onClick={load} style={{
                background: "transparent", border: `1px solid ${CY}33`, borderRadius: 4,
                color: `${CY}99`, fontSize: 9, padding: "2px 7px", cursor: "pointer",
                fontFamily: "inherit",
              }}>↻</button>
              <button onClick={() => setOpen(false)} style={{
                background: "transparent", border: "none",
                color: `${CY}66`, fontSize: 14, cursor: "pointer", lineHeight: 1,
              }}>✕</button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${CY}18` }}>
            {[
              { label: "PROFILES", val: corr.length,     color: CY },
              { label: "DATASETS", val: datasets.length, color: CY },
              { label: "EVIDENCED",   val: nEvidenced,   color: GREEN },
              { label: "UNSUPPORTED", val: nUnsupported, color: nUnsupported > 0 ? AMBER : `${CY}44` },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                flex: 1, background: "rgba(41,231,255,0.04)", border: `1px solid ${CY}1A`,
                borderRadius: 8, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: `${CY}55`, fontSize: 8, letterSpacing: 1.5, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${CY}18` }}>
            {["ALL", "EVIDENCED", "UNSUPPORTED"].map((tab) => (
              <button key={tab} onClick={() => setFilter(tab)} style={{
                background: filter === tab ? `${CY}18` : "transparent",
                border: `1px solid ${filter === tab ? CY : CY + "33"}`,
                borderRadius: 5, padding: "3px 10px",
                color: filter === tab ? CY : `${CY}66`,
                fontSize: 9, letterSpacing: 1, cursor: "pointer",
                fontFamily: "inherit",
              }}>{tab}</button>
            ))}
          </div>

          {/* Profile list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
            {err && (
              <div style={{ padding: "16px 18px", color: RED, fontSize: 11 }}>
                ⚠ {err}
              </div>
            )}
            {!err && visible.length === 0 && !loading && (
              <div style={{ padding: "20px 18px", color: `${CY}44`, fontSize: 11, textAlign: "center" }}>
                No profiles in this view
              </div>
            )}
            {visible.map((p) => (
              <div key={p.id}>
                {/* Profile row */}
                <div
                  onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 14px", cursor: "pointer",
                    borderLeft: `2px solid ${p.evidenced ? GREEN : AMBER}`,
                    background: expanded === p.id ? `${CY}08` : "transparent",
                  }}
                >
                  <span style={{
                    fontSize: 9, padding: "1px 6px", borderRadius: 4, fontWeight: 700,
                    background: p.evidenced ? `${GREEN}22` : `${AMBER}22`,
                    color: p.evidenced ? GREEN : AMBER,
                    flexShrink: 0,
                  }}>
                    {p.evidenced ? "EVIDENCED" : "UNSUPPORTED"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "#DCEBF5", fontSize: 11, letterSpacing: 0.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {p.name}
                    </div>
                    {p.type && (
                      <div style={{ color: `${CY}66`, fontSize: 9, marginTop: 2 }}>{p.type}</div>
                    )}
                  </div>
                  {p.evidenced && (
                    <span style={{ color: `${CY}55`, fontSize: 9, flexShrink: 0 }}>
                      {p.datasets.length} ds
                    </span>
                  )}
                  <span style={{ color: `${CY}33`, fontSize: 10 }}>
                    {expanded === p.id ? "▲" : "▼"}
                  </span>
                </div>

                {/* Expanded detail */}
                {expanded === p.id && (
                  <div style={{ background: "rgba(41,231,255,0.04)", padding: "10px 14px 12px 28px", borderBottom: `1px solid ${CY}12` }}>
                    {p.description && (
                      <p style={{ color: `${CY}88`, fontSize: 10, margin: "0 0 8px", lineHeight: 1.5 }}>
                        {p.description.slice(0, 180)}{p.description.length > 180 ? "…" : ""}
                      </p>
                    )}
                    {p.datasets.length > 0 ? (
                      <>
                        <div style={{ color: `${CY}55`, fontSize: 9, letterSpacing: 1.5, marginBottom: 6 }}>
                          BACKED BY {p.datasets.length} DATASET{p.datasets.length !== 1 ? "S" : ""}
                        </div>
                        {p.datasets.map((d) => (
                          <div key={d.id} style={{
                            background: "rgba(0,200,120,0.07)", border: `1px solid ${GREEN}33`,
                            borderRadius: 6, padding: "5px 10px", marginBottom: 4,
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                          }}>
                            <span style={{ color: "#DCEBF5", fontSize: 10 }}>{d.name}</span>
                            {d.row_count > 0 && (
                              <span style={{ color: GREEN, fontSize: 9, fontWeight: 700 }}>
                                {d.row_count.toLocaleString()} rows
                              </span>
                            )}
                          </div>
                        ))}
                      </>
                    ) : (
                      <div style={{ color: AMBER, fontSize: 10 }}>
                        ⚠ No backing datasets found — intelligence gap
                      </div>
                    )}
                    <button
                      onClick={() => assess(p)}
                      disabled={assessing === p.id}
                      style={{
                        marginTop: 8, background: `${CY}12`, border: `1px solid ${CY}44`,
                        borderRadius: 5, padding: "4px 12px", color: CY,
                        fontSize: 9, letterSpacing: 1, cursor: "pointer",
                        fontFamily: "inherit", opacity: assessing === p.id ? 0.5 : 1,
                      }}
                    >
                      {assessing === p.id ? "◌ ASSESSING…" : "▶ ASSESS"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            borderTop: `1px solid ${CY}18`, padding: "6px 14px",
            display: "flex", justifyContent: "space-between",
            color: `${CY}44`, fontSize: 9, letterSpacing: 1,
          }}>
            <span>↻ 90 s auto-refresh</span>
            <span>{visible.length} profile{visible.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
      )}
    </>
  );
}
