/**
 * F171 — AIP Skill × Dataset × Investigation — Capability Enablement Audit (SDICEA)
 *
 * Parallel-fetches /v1/aip/skill + /v1/datasets + /v1/investigations every 90 s.
 * Keyword-correlates each AIP skill against the dataset catalog AND open
 * investigations to classify operational capability enablement:
 *
 *   FULLY_ENABLED — skill backed by ≥1 dataset AND referenced in ≥1 investigation
 *   DATA_ONLY     — dataset backing, no active investigation usage
 *   CASE_ONLY     — used in investigations, no dataset backing
 *   LATENT        — neither — capability exists but is operationally dormant
 *
 * Stat tiles: skills / datasets / investigations / fully enabled / latent
 * Filter tabs: ALL | FULLY_ENABLED | DATA_ONLY | CASE_ONLY | LATENT
 * Text search on skill name/domain.
 * Expand row → matched datasets (green bars) + matched investigations (amber bars).
 * Red badge + pulse on LATENT count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence capability brief + TTS.
 *
 * Toggle:  ◈ SDICEA  at bottom:8 left:966500, zIndex:671.
 * Event:   jarvis:sdicea-toggle
 * Voice:   "sdicea / skill enablement / skill capability / skill dataset /
 *           skill investigation / latent skill / skill gap / skill audit /
 *           capability audit / dormant skill / skill coverage"
 * Refresh: 90 s auto-poll.
 */
import { useEffect, useRef, useState } from "react";

const BTN_LEFT = 966_500;
const POLL_MS  = 90_000;

const API_KEY =
  (typeof window !== "undefined" && window.__JARVIS_API_KEY__) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function apiBase() {
  if (typeof window !== "undefined" && window.__JARVIS_API_BASE__) return window.__JARVIS_API_BASE__;
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    return `${window.location.protocol}//${window.location.hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── Exported intent helpers ────────────────────────────────────────────────────

const SDICEA_RE =
  /\b(sdicea|skill\s+enablement|skill\s+capability|skill\s+dataset|skill\s+investigation|latent\s+skill|skill\s+gap|skill\s+audit|capability\s+audit|dormant\s+skill|skill\s+coverage|capability\s+enablement|skill\s+data\s+gap)\b/i;

export function isSdiceaQuery(q) { return SDICEA_RE.test(q || ""); }

export async function buildSdiceaScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [skRes, dsRes, invRes] = await Promise.all([
      fetch(`${base}/v1/aip/skill`,      { headers: hdr }),
      fetch(`${base}/v1/datasets`,        { headers: hdr }),
      fetch(`${base}/v1/investigations`,  { headers: hdr }),
    ]);
    const skills  = normArr(await skRes.json(),  ["skills",  "data", "items", "results"]);
    const datasets = normArr(await dsRes.json(), ["datasets","data", "items", "results"]);
    const invs    = normArr(await invRes.json(), ["investigations","data","items","results"]);

    const rows = classifySkills(skills, datasets, invs);
    const latent = rows.filter((r) => r.cls === "LATENT").length;
    const full   = rows.filter((r) => r.cls === "FULLY_ENABLED").length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS skill capability enablement audit (SDICEA): ${skills.length} AIP skills ` +
          `cross-referenced against ${datasets.length} datasets and ${invs.length} investigations — ` +
          `${full} fully enabled, ${latent} latent (no data, no case usage). ` +
          `Give a 2-sentence operational capability readiness brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return d?.response || d?.answer || d?.message || "Capability audit complete.";
  } catch (e) {
    return `Capability audit error: ${e.message}`;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normArr(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function tokens(str) {
  return String(str || "").toLowerCase().split(/\W+/).filter((t) => t.length > 2);
}

function hasOverlap(skillTokens, candidate) {
  const candToks = tokens(`${candidate.name || ""} ${candidate.title || ""} ${candidate.description || ""} ${candidate.domain || ""}`);
  return skillTokens.some((t) => candToks.includes(t));
}

function classifySkills(skills, datasets, invs) {
  return skills.map((sk) => {
    const skToks = tokens(`${sk.name || ""} ${sk.domain || ""} ${sk.description || ""}`);
    const matchedDs  = datasets.filter((ds) => hasOverlap(skToks, ds));
    const matchedInv = invs.filter((inv) => hasOverlap(skToks, inv));
    const hasDs  = matchedDs.length  > 0;
    const hasInv = matchedInv.length > 0;
    let cls = "LATENT";
    if (hasDs && hasInv) cls = "FULLY_ENABLED";
    else if (hasDs)      cls = "DATA_ONLY";
    else if (hasInv)     cls = "CASE_ONLY";
    return { sk, cls, matchedDs, matchedInv };
  });
}

// ── Colours ───────────────────────────────────────────────────────────────────

const CY  = "#29E7FF";
const GR  = "#2ECC71";
const AM  = "#F39C12";
const RD  = "#E74C3C";

const CLS_COLOR = {
  FULLY_ENABLED: GR,
  DATA_ONLY:     CY,
  CASE_ONLY:     AM,
  LATENT:        RD,
};
const TABS = ["ALL", "FULLY_ENABLED", "DATA_ONLY", "CASE_ONLY", "LATENT"];

// ── Component ─────────────────────────────────────────────────────────────────

export default function SkillDatasetInvestigationAudit() {
  const [visible, setVisible] = useState(false);
  const [rows,    setRows]    = useState([]);
  const [skills,  setSkills]  = useState(0);
  const [dsCnt,   setDsCnt]   = useState(0);
  const [invCnt,  setInvCnt]  = useState(0);
  const [tab,     setTab]     = useState("ALL");
  const [search,  setSearch]  = useState("");
  const [expanded,setExpanded]= useState(null);
  const [answer,  setAnswer]  = useState("");
  const [loading, setLoading] = useState(false);
  const [assessing,setAssessing]=useState(false);
  const timer = useRef(null);

  const latentCount = rows.filter((r) => r.cls === "LATENT").length;
  const fullCount   = rows.filter((r) => r.cls === "FULLY_ENABLED").length;

  async function load() {
    try {
      setLoading(true);
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [skRes, dsRes, invRes] = await Promise.all([
        fetch(`${base}/v1/aip/skill`,     { headers: hdr }),
        fetch(`${base}/v1/datasets`,       { headers: hdr }),
        fetch(`${base}/v1/investigations`, { headers: hdr }),
      ]);
      const sks  = normArr(await skRes.json(),  ["skills",  "data","items","results"]);
      const dss  = normArr(await dsRes.json(),  ["datasets","data","items","results"]);
      const invs = normArr(await invRes.json(), ["investigations","data","items","results"]);
      setSkills(sks.length);
      setDsCnt(dss.length);
      setInvCnt(invs.length);
      setRows(classifySkills(sks, dss, invs));
    } catch (_) { /* silent — badge stays stale */ }
    finally    { setLoading(false); }
  }

  useEffect(() => {
    const toggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:sdicea-toggle", toggle);
    return () => window.removeEventListener("jarvis:sdicea-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [visible]);

  async function assess() {
    setAssessing(true);
    const text = await buildSdiceaScript();
    setAnswer(text);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const filtered = rows
    .filter((r) => tab === "ALL" || r.cls === tab)
    .filter((r) => {
      const q = search.toLowerCase();
      return !q || String(r.sk.name || "").toLowerCase().includes(q) || String(r.sk.domain || "").toLowerCase().includes(q);
    });

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("jarvis:sdicea-toggle"))}
        title="Skill × Dataset × Investigation — Capability Audit"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 671,
          background: visible ? CY : "rgba(5,8,13,0.82)",
          border: `1px solid ${CY}66`, borderRadius: 6,
          color: visible ? "#04060A" : CY,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
          padding: "3px 7px", cursor: "pointer", letterSpacing: 1,
          boxShadow: latentCount > 0 ? `0 0 10px ${RD}88` : "none",
        }}
      >
        ◈ SDICEA
        {latentCount > 0 && (
          <span style={{
            marginLeft: 5, background: RD, color: "#fff",
            borderRadius: 3, padding: "0 4px", fontSize: 8,
            animation: "sdpulse 1.4s ease-in-out infinite",
          }}>
            {latentCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position: "fixed", bottom: 36, left: Math.max(8, BTN_LEFT - 380), zIndex: 672,
            width: "min(760px,96vw)", maxHeight: "78vh",
            background: "rgba(4,8,14,0.96)", border: `1px solid ${CY}44`,
            borderRadius: 14, overflow: "hidden",
            boxShadow: `0 0 60px ${CY}18, 0 24px 48px rgba(0,0,0,0.9)`,
            fontFamily: "'JetBrains Mono',monospace", display: "flex", flexDirection: "column",
          }}
        >
          {/* Header */}
          <div style={{
            padding: "10px 16px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              ◈ SKILL × DATASET × INVESTIGATION — CAPABILITY AUDIT
            </span>
            {loading && <span style={{ color: "#4E6070", fontSize: 9 }}>updating…</span>}
            <button
              onClick={assess} disabled={assessing}
              style={{
                marginLeft: "auto", background: assessing ? "#111" : `${GR}22`,
                border: `1px solid ${GR}66`, borderRadius: 5,
                color: GR, fontSize: 9, padding: "3px 8px", cursor: "pointer", letterSpacing: 1,
              }}
            >
              {assessing ? "assessing…" : "▶ ASSESS"}
            </button>
            <button
              onClick={() => setVisible(false)}
              style={{
                background: "transparent", border: "none",
                color: "#4E6070", fontSize: 14, cursor: "pointer", padding: "0 4px",
              }}
            >
              ×
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "8px 16px", flexWrap: "wrap" }}>
            {[
              { label: "SKILLS",       val: skills,                        col: CY  },
              { label: "DATASETS",     val: dsCnt,                         col: GR  },
              { label: "INVESTS.",     val: invCnt,                        col: AM  },
              { label: "FULLY ENBL",  val: fullCount,                     col: GR  },
              { label: "LATENT",       val: latentCount,                   col: RD  },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                background: `${col}12`, border: `1px solid ${col}44`,
                borderRadius: 6, padding: "4px 10px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 14, fontWeight: 700 }}>{val}</div>
                <div style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 6, padding: "0 16px 8px", flexWrap: "wrap" }}>
            {TABS.map((t) => (
              <button
                key={t} onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CLS_COLOR[t] || CY}22` : "transparent",
                  border: `1px solid ${tab === t ? (CLS_COLOR[t] || CY) : "#2E4050"}`,
                  borderRadius: 5, color: tab === t ? (CLS_COLOR[t] || CY) : "#4E6070",
                  fontSize: 9, padding: "3px 8px", cursor: "pointer", letterSpacing: 1,
                }}
              >
                {t}
              </button>
            ))}
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="search skills…"
              style={{
                marginLeft: "auto", background: "transparent",
                border: `1px solid ${CY}33`, borderRadius: 5,
                color: "#DCEBF5", fontSize: 9, padding: "3px 8px",
                outline: "none", width: 120, fontFamily: "inherit",
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {filtered.length === 0 && (
              <div style={{ padding: 20, color: "#4E6070", fontSize: 11, textAlign: "center" }}>
                No skills match filter
              </div>
            )}
            {filtered.map((r, i) => {
              const col   = CLS_COLOR[r.cls] || CY;
              const isExp = expanded === i;
              return (
                <div key={i}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "7px 16px", cursor: "pointer",
                      borderBottom: `1px solid ${CY}0A`,
                      background: isExp ? `${CY}08` : "transparent",
                    }}
                  >
                    <span style={{ color: col, fontSize: 10, width: 100, letterSpacing: 1, flexShrink: 0 }}>
                      {r.cls}
                    </span>
                    <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>
                      {r.sk.name || r.sk.id || "Unnamed Skill"}
                    </span>
                    {r.sk.domain && (
                      <span style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1 }}>
                        {r.sk.domain}
                      </span>
                    )}
                    <span style={{ color: GR, fontSize: 9, width: 22, textAlign: "right", flexShrink: 0 }}>
                      {r.matchedDs.length > 0 ? `${r.matchedDs.length}DS` : ""}
                    </span>
                    <span style={{ color: AM, fontSize: 9, width: 26, textAlign: "right", flexShrink: 0 }}>
                      {r.matchedInv.length > 0 ? `${r.matchedInv.length}INV` : ""}
                    </span>
                    <span style={{ color: "#4E6070", fontSize: 10 }}>{isExp ? "▴" : "▾"}</span>
                  </div>

                  {isExp && (
                    <div style={{ padding: "6px 24px 10px", background: `${CY}06`, borderBottom: `1px solid ${CY}0A` }}>
                      {/* Matched datasets */}
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ color: GR, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          DATASETS ({r.matchedDs.length})
                        </div>
                        {r.matchedDs.length === 0 && (
                          <div style={{ color: "#4E6070", fontSize: 9 }}>None matched</div>
                        )}
                        {r.matchedDs.map((ds, j) => (
                          <div key={j} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <div style={{ width: 80, height: 4, borderRadius: 2, background: `${GR}33` }}>
                              <div style={{ width: "60%", height: "100%", background: GR, borderRadius: 2 }} />
                            </div>
                            <span style={{ color: "#7A95AB", fontSize: 10 }}>
                              {ds.name || ds.title || ds.id || "Dataset"}
                            </span>
                          </div>
                        ))}
                      </div>
                      {/* Matched investigations */}
                      <div>
                        <div style={{ color: AM, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          INVESTIGATIONS ({r.matchedInv.length})
                        </div>
                        {r.matchedInv.length === 0 && (
                          <div style={{ color: "#4E6070", fontSize: 9 }}>None matched</div>
                        )}
                        {r.matchedInv.map((inv, j) => (
                          <div key={j} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <div style={{ width: 80, height: 4, borderRadius: 2, background: `${AM}33` }}>
                              <div style={{ width: "60%", height: "100%", background: AM, borderRadius: 2 }} />
                            </div>
                            <span style={{ color: "#7A95AB", fontSize: 10 }}>
                              {inv.title || inv.name || inv.id || "Investigation"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ASSESS answer */}
          {answer && (
            <div style={{
              padding: "8px 16px", borderTop: `1px solid ${CY}22`,
              color: "#A0BAC8", fontSize: 11, lineHeight: 1.5,
            }}>
              {answer}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes sdpulse {
          0%,100% { opacity:1; box-shadow: 0 0 6px ${RD}; }
          50%      { opacity:.6; box-shadow: 0 0 14px ${RD}; }
        }
      `}</style>
    </>
  );
}
