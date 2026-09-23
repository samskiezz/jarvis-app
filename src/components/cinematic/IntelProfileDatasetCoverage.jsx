/**
 * F68 — IntelProfile × Dataset Coverage (IPDC)
 *
 * Answers: "Which intel profiles have supporting datasets, and which are data-dark?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/IntelProfile  → registered intelligence profiles
 *   GET /v1/datasets            → dataset catalog
 *
 * Each IntelProfile's name/tags/description/aliases are keyword-matched against
 * each dataset's name/description/tags/source to produce:
 *   DATA_BACKED — at least one dataset references this profile's context
 *   DATA_DARK   — no dataset correlates to this profile
 *
 * Stat tiles:  profiles / datasets / data-backed / data-dark
 * Amber badge: dark count on button (unsupported profiles are the intelligence gap).
 * Expand row:  matched datasets with topic badge + relevance score bar.
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ IPDF  at left:1620 bottom:18, zIndex:68.
 * Event:   jarvis:ipdf-toggle
 * Voice:   "intel profile dataset / profile data / ipds / data-backed profiles /
 *           dark profiles / which profiles have data / profile coverage /
 *           profile dataset coverage / intel data coverage"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3B6B";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 1620;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise ───────────────────────────────────────────────────────────────

function normArr(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  return [];
}

function tokens(str) {
  return String(str || "").toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function score(profile, dataset) {
  const pTokens = new Set([
    ...tokens(profile.name),
    ...tokens(profile.description),
    ...tokens(profile.aliases),
    ...tokens(Array.isArray(profile.tags) ? profile.tags.join(" ") : profile.tags),
    ...tokens(profile.role),
    ...tokens(profile.organization),
  ]);
  const dSrc = [
    dataset.name, dataset.description,
    Array.isArray(dataset.tags) ? dataset.tags.join(" ") : dataset.tags,
    dataset.source, dataset.category,
  ].join(" ");
  const dTokens = tokens(dSrc);
  const hits = dTokens.filter(t => pTokens.has(t));
  return hits.length;
}

// ─── fetch ───────────────────────────────────────────────────────────────────

async function fetchAll() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [pr, dr] = await Promise.all([
    fetch(`${base}/entities/IntelProfile`, { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/v1/datasets`,           { headers }).then(r => r.json()).catch(() => []),
  ]);
  const profiles  = normArr(pr);
  const datasets  = normArr(dr);
  const correlated = profiles.map(p => {
    const matches = datasets
      .map(d => ({ dataset: d, sc: score(p, d) }))
      .filter(x => x.sc > 0)
      .sort((a, b) => b.sc - a.sc);
    return {
      profile: p,
      classification: matches.length > 0 ? "DATA_BACKED" : "DATA_DARK",
      matches,
    };
  });
  return { correlated, profileCount: profiles.length, datasetCount: datasets.length };
}

// ─── assess ──────────────────────────────────────────────────────────────────

async function runAssess(correlated, setText, speak) {
  const dark    = correlated.filter(c => c.classification === "DATA_DARK").length;
  const backed  = correlated.filter(c => c.classification === "DATA_BACKED").length;
  const prompt  =
    `You are JARVIS. In 2 sentences, brief the operator on IntelProfile × Dataset coverage: ` +
    `${backed} profiles are data-backed, ${dark} are data-dark (no dataset correlates). ` +
    `Mention the top data-dark profile name if any: ${
      correlated.find(c => c.classification === "DATA_DARK")?.profile?.name || "none"
    }. Conclude with the most urgent action.`;
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
  try {
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST", headers, body: JSON.stringify({ message: prompt }),
    });
    const j = await r.json();
    const text = j.response || j.reply || j.message || JSON.stringify(j);
    setText(text);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    speak(text);
  } catch (e) {
    setText(`ASSESS error: ${e.message}`);
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function IntelProfileDatasetCoverage() {
  const [open, setOpen]           = useState(false);
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState(null);
  const [filter, setFilter]       = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const result = await fetchAll();
      setData(result);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener("jarvis:ipdf-toggle", handler);
    return () => window.removeEventListener("jarvis:ipdf-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const speak = useCallback((text) => {
    const base = apiBase();
    fetch(`${base}/v1/voice/tts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: localStorage.getItem("jarvis_voice") || "ash" }),
    }).then(r => r.blob()).then(b => {
      const url = URL.createObjectURL(b);
      new Audio(url).play().catch(() => {});
    }).catch(() => {});
  }, []);

  if (!open) {
    const darkCount = data?.correlated?.filter(c => c.classification === "DATA_DARK").length ?? 0;
    return (
      <button
        onClick={() => setOpen(true)}
        title="IntelProfile × Dataset Coverage (IPDC)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
          background: "rgba(4,7,14,0.82)", border: `1px solid ${AMBER}44`,
          color: AMBER, fontFamily: MONO, fontSize: 10, letterSpacing: 1,
          padding: "3px 8px", borderRadius: 3, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 5,
        }}
      >
        ◈ IPDF
        {darkCount > 0 && (
          <span style={{
            background: AMBER, color: "#000", borderRadius: 8,
            padding: "0 5px", fontSize: 9, fontWeight: 700,
          }}>{darkCount}</span>
        )}
      </button>
    );
  }

  const { correlated = [], profileCount = 0, datasetCount = 0 } = data || {};
  const backed = correlated.filter(c => c.classification === "DATA_BACKED").length;
  const dark   = correlated.filter(c => c.classification === "DATA_DARK").length;

  const visible = correlated.filter(c => {
    if (filter === "DATA_BACKED" && c.classification !== "DATA_BACKED") return false;
    if (filter === "DATA_DARK"   && c.classification !== "DATA_DARK")   return false;
    if (search) {
      const q = search.toLowerCase();
      const name = String(c.profile?.name || "").toLowerCase();
      const desc = String(c.profile?.description || "").toLowerCase();
      if (!name.includes(q) && !desc.includes(q)) return false;
    }
    return true;
  });

  const TAB_STYLE = (active) => ({
    background: active ? AMBER : "transparent",
    color: active ? "#000" : MUTED,
    border: `1px solid ${active ? AMBER : MUTED}44`,
    borderRadius: 3, padding: "2px 8px", fontSize: 9,
    fontFamily: MONO, cursor: "pointer", letterSpacing: 1,
  });

  return (
    <div style={{
      position: "fixed", right: 18, top: 60, width: 520, maxHeight: "80vh",
      background: BG, border: `1px solid ${AMBER}55`, borderRadius: 6,
      fontFamily: MONO, fontSize: 11, color: CY, zIndex: 160,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderBottom: `1px solid ${AMBER}33`,
        background: "rgba(245,166,35,0.06)",
      }}>
        <span style={{ color: AMBER, fontWeight: 700, letterSpacing: 2 }}>
          ◈ INTEL PROFILE — DATASET COVERAGE
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          {!assessing && (
            <button onClick={async () => {
              setAssessing(true); setAssessText("");
              await runAssess(correlated, setAssessText, speak);
              setAssessing(false);
            }} style={{
              background: "transparent", border: `1px solid ${CY}55`,
              color: CY, fontFamily: MONO, fontSize: 9, cursor: "pointer",
              padding: "2px 8px", borderRadius: 3,
            }}>▶ ASSESS</button>
          )}
          <button onClick={() => setOpen(false)} style={{
            background: "transparent", border: "none", color: MUTED,
            cursor: "pointer", fontSize: 13, lineHeight: 1,
          }}>✕</button>
        </div>
      </div>

      {/* assess result */}
      {(assessing || assessText) && (
        <div style={{
          padding: "6px 12px", background: "rgba(41,231,255,0.05)",
          borderBottom: `1px solid ${CY}22`, color: CY, fontSize: 10,
          fontStyle: "italic", lineHeight: 1.5,
        }}>
          {assessing ? "▸ assessing…" : assessText}
        </div>
      )}

      {/* stat tiles */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4,1fr)",
        gap: 4, padding: "8px 12px", borderBottom: `1px solid ${AMBER}22`,
      }}>
        {[
          ["PROFILES",  profileCount, CY],
          ["DATASETS",  datasetCount, MUTED],
          ["BACKED",    backed,       GREEN],
          ["DATA-DARK", dark,         AMBER],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(255,255,255,0.03)", borderRadius: 4,
            padding: "4px 6px", textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: MUTED, fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* filter + search */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "6px 12px", borderBottom: `1px solid ${AMBER}22`,
        flexWrap: "wrap",
      }}>
        {["ALL", "DATA_BACKED", "DATA_DARK"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={TAB_STYLE(filter === f)}>
            {f}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search profile…"
          style={{
            background: "rgba(255,255,255,0.04)", border: `1px solid ${MUTED}44`,
            borderRadius: 3, color: CY, fontFamily: MONO, fontSize: 10,
            padding: "2px 8px", flex: 1, minWidth: 100, outline: "none",
          }}
        />
      </div>

      {/* body */}
      <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
        {loading && !data && (
          <div style={{ color: MUTED, padding: "12px 16px" }}>◌ loading…</div>
        )}
        {err && (
          <div style={{ color: RED, padding: "8px 16px", fontSize: 10 }}>⚠ {err}</div>
        )}
        {visible.length === 0 && !loading && (
          <div style={{ color: MUTED, padding: "12px 16px" }}>no profiles match</div>
        )}
        {visible.map((c, i) => {
          const { profile, classification, matches } = c;
          const isBacked = classification === "DATA_BACKED";
          const isExp    = expanded === i;
          return (
            <div key={i} style={{
              borderBottom: `1px solid ${AMBER}18`,
              background: isExp ? "rgba(245,166,35,0.04)" : "transparent",
            }}>
              <div
                onClick={() => setExpanded(isExp ? null : i)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "5px 14px", cursor: "pointer",
                }}
              >
                <span style={{
                  fontSize: 8, padding: "1px 6px", borderRadius: 2, fontWeight: 700,
                  background: isBacked ? `${GREEN}22` : `${AMBER}22`,
                  color: isBacked ? GREEN : AMBER,
                  minWidth: 76, textAlign: "center",
                }}>
                  {classification}
                </span>
                <span style={{ color: CY, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {profile.name || profile.id || "Unknown"}
                </span>
                {isBacked && (
                  <span style={{ color: MUTED, fontSize: 9 }}>
                    {matches.length} dataset{matches.length !== 1 ? "s" : ""}
                  </span>
                )}
                <span style={{ color: MUTED, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "0 14px 8px 14px" }}>
                  {profile.description && (
                    <div style={{ color: MUTED, fontSize: 9, marginBottom: 6, lineHeight: 1.4 }}>
                      {profile.description}
                    </div>
                  )}
                  {isBacked ? (
                    matches.map((m, mi) => (
                      <div key={mi} style={{
                        background: "rgba(255,255,255,0.03)", borderRadius: 3,
                        padding: "4px 8px", marginBottom: 4,
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ color: CY, fontSize: 10 }}>
                            {m.dataset.name || m.dataset.id}
                          </span>
                          {m.dataset.category && (
                            <span style={{
                              fontSize: 8, background: `${CY}22`, color: CY,
                              borderRadius: 2, padding: "0 4px",
                            }}>{m.dataset.category}</span>
                          )}
                        </div>
                        {/* relevance bar */}
                        <div style={{
                          height: 2, background: `${MUTED}33`, borderRadius: 1,
                          marginTop: 4, overflow: "hidden",
                        }}>
                          <div style={{
                            height: "100%", borderRadius: 1,
                            background: GREEN,
                            width: `${Math.min(100, m.sc * 20)}%`,
                          }} />
                        </div>
                        <div style={{ color: MUTED, fontSize: 8, marginTop: 2 }}>
                          relevance: {m.sc}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: AMBER, fontSize: 9, fontStyle: "italic" }}>
                      no datasets correlate to this profile — data gap identified
                    </div>
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
        color: MUTED, fontSize: 9, display: "flex", justifyContent: "space-between",
      }}>
        <span>↺ {REFRESH_MS / 1000}s refresh</span>
        <span>{loading ? "◌ refreshing…" : `${correlated.length} profiles correlated`}</span>
      </div>
    </div>
  );
}

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

const IPDC_VOICE_TERMS = [
  "intel profile dataset", "profile data", "ipdc", "data-backed profiles",
  "dark profiles", "which profiles have data", "profile coverage",
  "profile dataset", "intel data coverage", "intel profile coverage",
  "data dark profiles", "unsupported profiles", "profile data gap",
];

export function isIpdfQuery(q) {
  const lq = q.toLowerCase();
  return IPDC_VOICE_TERMS.some(t => lq.includes(t));
}

export async function buildIpdfScript() {
  try {
    const base = apiBase();
    const headers = { Authorization: `Bearer ${API_KEY}` };
    const [pr, dr] = await Promise.all([
      fetch(`${base}/entities/IntelProfile`, { headers }).then(r => r.json()).catch(() => []),
      fetch(`${base}/v1/datasets`,           { headers }).then(r => r.json()).catch(() => []),
    ]);
    const profiles = normArr(pr);
    const datasets = normArr(dr);
    const dark = profiles.filter(p =>
      datasets.every(d => score(p, d) === 0)
    );
    return (
      `Intel profile dataset coverage: ${profiles.length} profiles versus ` +
      `${datasets.length} datasets. ` +
      `${profiles.length - dark.length} profiles are data-backed. ` +
      `${dark.length} profiles are data-dark — no datasets correlate. ` +
      (dark.length > 0
        ? `Top data-dark profile: ${dark[0].name || dark[0].id || "unknown"}. ` +
          `Recommend sourcing datasets for uncovered intelligence profiles.`
        : `All profiles have dataset coverage. Intelligence base appears solid.`)
    );
  } catch {
    return "Intel profile dataset coverage status unavailable — check endpoint health.";
  }
}
