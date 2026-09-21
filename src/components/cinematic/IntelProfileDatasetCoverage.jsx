/**
 * IntelProfileDatasetCoverage — F166
 *
 * Parallel-fetches /entities/IntelProfile + /v1/datasets then keyword-
 * correlates each threat-actor/org profile against the dataset catalog to
 * surface COVERED (at least one dataset contains intel on this profile) vs
 * DARK (profile has no dataset backing — intelligence gap).
 *
 * Stat tiles: profiles / datasets / covered / dark
 * Filter tabs: ALL / COVERED / DARK
 * Expand profile → matched datasets with relevance score.
 * Amber badge on dark count (intelligence gaps require attention).
 * Click ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence intel-dataset brief
 *   + jarvis:speak-dossier TTS.
 * 90 s auto-refresh.
 *
 * Intent: "intel data coverage" / "profile datasets" / "threat intel data" /
 *         "intel dataset coverage" / "ipdset" / "dark profiles"
 *   → jarvis:ipdset-toggle
 *
 * Toggle: ◈ IPDSET at left:55080, bottom:8, zIndex:108.
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
const BTN_LEFT   = 55080;
const REFRESH_MS = 90_000;
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,monospace";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── intent exports ───────────────────────────────────────────────────────────

const IPDSET_RE =
  /\b(intel.data.coverage|profile.dataset|threat.intel.data|intel.dataset|ipdset|dark.profiles|profile.backing|intel.gaps)\b/i;

export function isIpdsetQuery(t) { return IPDSET_RE.test(t || ""); }

export async function buildIpdsetScript() {
  const [pRaw, dRaw] = await Promise.allSettled([
    fetch(`${apiBase()}/entities/IntelProfile`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then((r) => r.json()),
    fetch(`${apiBase()}/v1/datasets`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then((r) => r.json()),
  ]);
  const profiles = normaliseProfiles(pRaw.status === "fulfilled" ? pRaw.value : []);
  const datasets = normaliseDatasets(dRaw.status === "fulfilled" ? dRaw.value : []);
  const pairs    = correlate(profiles, datasets);
  const covered  = pairs.filter((p) => p.matches.length > 0).length;
  const dark     = pairs.filter((p) => p.matches.length === 0).length;
  return (
    `Intel Profile × Dataset Coverage: ${profiles.length} profiles, ${datasets.length} datasets. ` +
    `${covered} profiles have dataset backing; ${dark} profiles are DARK (no dataset coverage). ` +
    `Provide a 2-sentence intelligence-gap brief and recommend the highest-priority profile to address.`
  );
}

// ─── data helpers ─────────────────────────────────────────────────────────────

function normaliseProfiles(raw) {
  const arr = Array.isArray(raw) ? raw : raw?.items ?? raw?.data ?? raw?.results ?? [];
  return arr.map((p) => ({
    id:   p.id   ?? p._id   ?? String(Math.random()),
    name: p.name ?? p.title ?? p.alias ?? p.subject ?? "Unknown Profile",
    type: p.type ?? p.profile_type ?? p.category ?? "",
    tags: Array.isArray(p.tags) ? p.tags : [],
  }));
}

function normaliseDatasets(raw) {
  const arr = Array.isArray(raw) ? raw : raw?.datasets ?? raw?.items ?? raw?.data ?? raw?.results ?? [];
  return arr.map((d) => ({
    id:   d.id   ?? d._id   ?? String(Math.random()),
    name: d.name ?? d.title ?? d.label ?? "Unnamed Dataset",
    desc: d.description ?? d.desc ?? d.summary ?? "",
    rows: d.row_count ?? d.rows ?? d.record_count ?? null,
  }));
}

function tokens(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s\-_/.,;:()[\]]+/)
    .filter((t) => t.length > 2);
}

function correlate(profiles, datasets) {
  return profiles.map((prof) => {
    const profTokens = new Set([
      ...tokens(prof.name),
      ...tokens(prof.type),
      ...prof.tags.flatMap(tokens),
    ]);
    const matches = datasets
      .map((ds) => {
        const dsTokens = [...tokens(ds.name), ...tokens(ds.desc)];
        const shared = dsTokens.filter((t) => profTokens.has(t));
        return { dataset: ds, score: shared.length };
      })
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { profile: prof, matches };
  });
}

// ─── component ────────────────────────────────────────────────────────────────

export default function IntelProfileDatasetCoverage() {
  const [open, setOpen]         = useState(false);
  const [pairs, setPairs]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [pRes, dRes] = await Promise.allSettled([
        fetch(`${apiBase()}/entities/IntelProfile`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
        fetch(`${apiBase()}/v1/datasets`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
      ]);
      const profiles = normaliseProfiles(pRes.status === "fulfilled" ? pRes.value : []);
      const datasets = normaliseDatasets(dRes.status === "fulfilled" ? dRes.value : []);
      setPairs(correlate(profiles, datasets));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:ipdset-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ipdset-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const covered = pairs.filter((p) => p.matches.length > 0);
  const dark    = pairs.filter((p) => p.matches.length === 0);

  const allDatasets = pairs.reduce((acc, p) => {
    p.matches.forEach((m) => {
      if (!acc.some((d) => d.id === m.dataset.id)) acc.push(m.dataset);
    });
    return acc;
  }, []);

  const visible = pairs
    .filter((p) => {
      if (tab === "COVERED") return p.matches.length > 0;
      if (tab === "DARK")    return p.matches.length === 0;
      return true;
    })
    .filter((p) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        p.profile.name.toLowerCase().includes(q) ||
        p.profile.type.toLowerCase().includes(q) ||
        p.matches.some((m) => m.dataset.name.toLowerCase().includes(q))
      );
    });

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildIpdsetScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const answer = (d.answer || d.response || "No assessment available.").trim();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: "Unable to generate assessment at this time." },
      }));
    } finally {
      setAssessing(false);
    }
  }

  const darkCount = dark.length;

  return (
    <>
      {/* ── fixed toggle button ─────────────────────────────────────────── */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("jarvis:ipdset-toggle"))}
        title="Intel Profile × Dataset Coverage"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 108,
          fontFamily: MONO, fontSize: 10, letterSpacing: 1, cursor: "pointer",
          padding: "4px 8px", borderRadius: 6, whiteSpace: "nowrap",
          background: open ? CY : "rgba(3,5,9,0.85)",
          color: open ? "#000" : darkCount > 0 ? AMBER : CY,
          border: `1px solid ${darkCount > 0 ? AMBER : CY}${open ? "" : "88"}`,
          boxShadow: open ? `0 0 12px ${CY}88` : darkCount > 0 ? `0 0 8px ${AMBER}44` : "none",
        }}
      >
        ◈ IPDSET{darkCount > 0 && !open && (
          <span style={{
            marginLeft: 5, background: AMBER, color: "#000",
            borderRadius: 8, padding: "1px 5px", fontSize: 9,
          }}>{darkCount}</span>
        )}
      </button>

      {/* ── panel ───────────────────────────────────────────────────────── */}
      {open && (
        <div style={{
          position: "fixed", left: Math.min(BTN_LEFT, window.innerWidth - 540),
          bottom: 36, zIndex: 108,
          width: 520, maxHeight: "72vh", display: "flex", flexDirection: "column",
          background: BG, border: `1px solid ${CY}44`, borderRadius: 10,
          fontFamily: MONO, fontSize: 11, color: "#c8e8f0",
          boxShadow: `0 0 40px rgba(0,0,0,0.8)`, backdropFilter: "blur(12px)",
        }}>
          {/* header */}
          <div style={{ padding: "10px 14px 8px", borderBottom: `1px solid ${CY}22` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: CY, letterSpacing: 2, fontWeight: 700 }}>
                ◈ INTEL PROFILE × DATASET COVERAGE
              </span>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
              >×</button>
            </div>

            {/* stat tiles */}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {[
                { label: "PROFILES", val: pairs.length,   color: CY },
                { label: "DATASETS", val: allDatasets.length, color: CY },
                { label: "COVERED",  val: covered.length, color: GREEN },
                { label: "DARK",     val: darkCount,      color: darkCount > 0 ? AMBER : DIM },
              ].map(({ label, val, color }) => (
                <div key={label} style={{
                  flex: 1, textAlign: "center", padding: "5px 4px",
                  background: "rgba(255,255,255,0.04)", borderRadius: 6,
                  border: `1px solid ${color}33`,
                }}>
                  <div style={{ color, fontSize: 14, fontWeight: 700 }}>{loading ? "…" : val}</div>
                  <div style={{ color: DIM, fontSize: 9, letterSpacing: 1, marginTop: 1 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* controls */}
            <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
              {["ALL", "COVERED", "DARK"].map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    padding: "3px 10px", borderRadius: 5, cursor: "pointer", fontSize: 10,
                    background: tab === t ? CY : "transparent",
                    color: tab === t ? "#000" : CY,
                    border: `1px solid ${CY}55`,
                  }}
                >{t}</button>
              ))}
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="filter…"
                style={{
                  flex: 1, background: "rgba(0,0,0,0.3)", border: `1px solid ${CY}33`,
                  borderRadius: 5, padding: "3px 8px", color: "#cfe", fontFamily: MONO,
                  fontSize: 10, outline: "none",
                }}
              />
              <button
                onClick={assess}
                disabled={assessing || pairs.length === 0}
                style={{
                  padding: "3px 10px", borderRadius: 5, cursor: "pointer", fontSize: 10,
                  background: assessing ? DIM : AMBER, color: "#000",
                  border: "none", opacity: assessing ? 0.6 : 1,
                }}
              >{assessing ? "…" : "▶ ASSESS"}</button>
            </div>
          </div>

          {/* rows */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
            {error && (
              <div style={{ padding: "8px 14px", color: RED, fontSize: 10 }}>
                ⚠ {error}
              </div>
            )}
            {!loading && !error && visible.length === 0 && (
              <div style={{ padding: "12px 14px", color: DIM }}>No profiles match filter.</div>
            )}
            {visible.map((pair) => {
              const isDark = pair.matches.length === 0;
              const isExp  = expanded === pair.profile.id;
              return (
                <div key={pair.profile.id} style={{ borderBottom: `1px solid ${CY}11` }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : pair.profile.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "6px 14px",
                      cursor: "pointer", background: isExp ? `${CY}08` : "transparent",
                    }}
                  >
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                      background: isDark ? AMBER : GREEN,
                      boxShadow: isDark ? `0 0 6px ${AMBER}` : `0 0 6px ${GREEN}`,
                    }} />
                    <span style={{ flex: 1, color: isDark ? AMBER : "#c8e8f0" }}>
                      {pair.profile.name}
                    </span>
                    {pair.profile.type && (
                      <span style={{
                        fontSize: 9, color: DIM, background: "rgba(255,255,255,0.05)",
                        borderRadius: 4, padding: "1px 5px",
                      }}>{pair.profile.type}</span>
                    )}
                    <span style={{
                      fontSize: 9,
                      color: isDark ? AMBER : GREEN,
                      marginLeft: 4,
                    }}>
                      {isDark ? "DARK" : `${pair.matches.length} ds`}
                    </span>
                    <span style={{ color: DIM, fontSize: 10 }}>{isExp ? "▴" : "▾"}</span>
                  </div>

                  {isExp && (
                    <div style={{ padding: "0 14px 8px 28px" }}>
                      {isDark ? (
                        <div style={{ color: AMBER, fontSize: 10, opacity: 0.8 }}>
                          No datasets reference this profile. Intelligence gap — no data backing.
                        </div>
                      ) : (
                        pair.matches.map(({ dataset, score }) => (
                          <div key={dataset.id} style={{
                            display: "flex", gap: 8, alignItems: "center",
                            padding: "3px 0", borderBottom: `1px solid ${CY}0a`,
                          }}>
                            <span style={{ color: CY, flex: 1, fontSize: 10 }}>{dataset.name}</span>
                            {dataset.rows != null && (
                              <span style={{ color: DIM, fontSize: 9 }}>{dataset.rows.toLocaleString()} rows</span>
                            )}
                            <span style={{
                              fontSize: 9, color: GREEN, background: `${GREEN}22`,
                              borderRadius: 4, padding: "1px 5px",
                            }}>score {score}</span>
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
            padding: "6px 14px", borderTop: `1px solid ${CY}22`,
            display: "flex", justifyContent: "space-between", color: DIM, fontSize: 9,
          }}>
            <span>90 s auto-refresh · /entities/IntelProfile · /v1/datasets</span>
            <span>{loading ? "loading…" : `${visible.length} shown`}</span>
          </div>
        </div>
      )}
    </>
  );
}
