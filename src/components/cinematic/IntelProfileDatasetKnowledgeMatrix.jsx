/**
 * F67 – Intel Profile × Dataset × Knowledge Intelligence Enrichment Matrix (IPDSKNEX)
 * Cross-correlates /entities/IntelProfile × /v1/datasets × /knowledge/
 * Classifies each intel profile:
 *   FULLY_ENRICHED – matched dataset AND knowledge article
 *   DATA_ONLY       – matched dataset, no KB article
 *   KB_ONLY         – matched KB article, no dataset
 *   UNENRICHED      – no match in either (intel gap)
 * UNENRICHED rows pulse red.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const BTN_LEFT   = 951020;
const Z          = 650;
const REFRESH_MS = 90_000;

const CY   = "#29E7FF";
const AM   = "#F5A623";
const RD   = "#FF3B3B";
const GR   = "#00c878";
const DIM  = "#3a5060";
const MONO = "'JetBrains Mono', 'Courier New', monospace";
const SANS = "'Inter', system-ui, sans-serif";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
function authHdr() { return { Authorization: `Bearer ${API_KEY}` }; }

const IPDSKNEX_RE = /\b(ipdsknex|intel.{0,16}(enrichment|dataset|knowledge|profile.backing|data.gap|profile.data)|profile.{0,16}(dataset|knowledge.backing|enrichment|data.gap)|unenriched.{0,16}intel|intel.profile.enrichment|profile.enrichment|intel.data.gap|knowledge.backed.profile|data.backed.profile)\b/i;

export function isIpdsknexQuery(text) { return IPDSKNEX_RE.test(text || ""); }

export async function buildIpdsknexScript() {
  try {
    const base = apiBase();
    const [ipRes, dsRes, kbRes] = await Promise.all([
      fetch(`${base}/entities/IntelProfile`, { headers: authHdr() }),
      fetch(`${base}/v1/datasets`,           { headers: authHdr() }),
      fetch(`${base}/knowledge/`,            { headers: authHdr() }),
    ]);
    const [profiles, datasets, knowledge] = await Promise.all([
      ipRes.ok ? ipRes.json() : [],
      dsRes.ok ? dsRes.json() : [],
      kbRes.ok ? kbRes.json() : [],
    ]);
    const ipArr = (Array.isArray(profiles)  ? profiles  : profiles?.data  ?? []).slice(0, 200);
    const dsArr = (Array.isArray(datasets)  ? datasets  : datasets?.data  ?? []).slice(0, 200);
    const kbArr = (Array.isArray(knowledge) ? knowledge : knowledge?.data ?? []).slice(0, 300);
    const classified = classifyProfiles(ipArr, dsArr, kbArr);
    const unenriched    = classified.filter(r => r.cls === "UNENRICHED").length;
    const fullyEnriched = classified.filter(r => r.cls === "FULLY_ENRICHED").length;
    return `IPDSKNEX enrichment matrix: ${ipArr.length} intel profiles, ${dsArr.length} datasets, ${kbArr.length} knowledge articles. ` +
      `Enrichment: FULLY_ENRICHED ${fullyEnriched}, DATA_ONLY ${classified.filter(r => r.cls === "DATA_ONLY").length}, ` +
      `KB_ONLY ${classified.filter(r => r.cls === "KB_ONLY").length}, UNENRICHED ${unenriched}. ` +
      (unenriched > 0
        ? `${unenriched} intel profile${unenriched !== 1 ? "s" : ""} have no dataset or knowledge backing — intelligence gaps requiring enrichment.`
        : "All intel profiles have at least one dataset or knowledge article backing.");
  } catch (e) {
    return `IPDSKNEX matrix unavailable: ${e.message}`;
  }
}

function tok(str) {
  return String(str || "").toLowerCase().split(/\W+/).filter(t => t.length > 2);
}
function overlap(a, b) {
  const setB = new Set(b);
  return a.some(t => setB.has(t));
}

function classifyProfiles(profiles, datasets, knowledge) {
  return profiles.map(ip => {
    const itoks = tok(
      (ip.name || ip.title || "") + " " +
      (ip.description || ip.summary || ip.role || "") + " " +
      (ip.category || ip.type || "") + " " +
      (Array.isArray(ip.tags) ? ip.tags.join(" ") : "")
    );

    const matchedDs = datasets.filter(ds => {
      const dtoks = tok(
        (ds.name || ds.title || "") + " " +
        (ds.description || ds.type || "") + " " +
        (Array.isArray(ds.tags) ? ds.tags.join(" ") : "")
      );
      return overlap(itoks, dtoks);
    });

    const matchedKb = knowledge.filter(kb => {
      const ktoks = tok(
        (kb.title || kb.name || "") + " " +
        (kb.content || kb.description || kb.summary || "") + " " +
        (kb.category || kb.kind || "") + " " +
        (Array.isArray(kb.tags) ? kb.tags.join(" ") : "")
      );
      return overlap(itoks, ktoks);
    });

    const hasDs = matchedDs.length > 0;
    const hasKb = matchedKb.length > 0;
    let cls = "UNENRICHED";
    if (hasDs && hasKb) cls = "FULLY_ENRICHED";
    else if (hasDs)     cls = "DATA_ONLY";
    else if (hasKb)     cls = "KB_ONLY";

    return { ...ip, cls, matchedDs, matchedKb };
  });
}

const CLS_ORDER = ["FULLY_ENRICHED", "DATA_ONLY", "KB_ONLY", "UNENRICHED"];
const CLS_COLOUR = {
  FULLY_ENRICHED: GR,
  DATA_ONLY:      CY,
  KB_ONLY:        AM,
  UNENRICHED:     RD,
};

export default function IntelProfileDatasetKnowledgeMatrix() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const base = apiBase();
      const [ipRes, dsRes, kbRes] = await Promise.all([
        fetch(`${base}/entities/IntelProfile`, { headers: authHdr() }),
        fetch(`${base}/v1/datasets`,           { headers: authHdr() }),
        fetch(`${base}/knowledge/`,            { headers: authHdr() }),
      ]);
      const [profiles, datasets, knowledge] = await Promise.all([
        ipRes.ok ? ipRes.json() : [],
        dsRes.ok ? dsRes.json() : [],
        kbRes.ok ? kbRes.json() : [],
      ]);
      const ipArr = (Array.isArray(profiles)  ? profiles  : profiles?.data  ?? []).slice(0, 200);
      const dsArr = (Array.isArray(datasets)  ? datasets  : datasets?.data  ?? []).slice(0, 200);
      const kbArr = (Array.isArray(knowledge) ? knowledge : knowledge?.data ?? []).slice(0, 300);
      setRows(classifyProfiles(ipArr, dsArr, kbArr));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => { if (!o) load(); return !o; });
    window.addEventListener("jarvis:ipdsknex-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ipdsknex-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildIpdsknexScript();
      const base = apiBase();
      const chatRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ message: script }),
      });
      const chatData = chatRes.ok ? await chatRes.json() : null;
      const reply = chatData?.reply || chatData?.response || chatData?.message || script;
      const ttsText = String(reply).slice(0, 400);
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ text: ttsText, voice: getActiveVoice() }),
      });
    } catch (_) {}
    setAssessing(false);
  }, [assessing]);

  /* stats */
  const total     = rows.length;
  const fullyEnr  = rows.filter(r => r.cls === "FULLY_ENRICHED").length;
  const dataOnly  = rows.filter(r => r.cls === "DATA_ONLY").length;
  const kbOnly    = rows.filter(r => r.cls === "KB_ONLY").length;
  const unenr     = rows.filter(r => r.cls === "UNENRICHED").length;

  const filtered = rows
    .filter(r => tab === "ALL" || r.cls === tab)
    .filter(r => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (r.name || r.title || "").toLowerCase().includes(q) ||
        (r.role || "").toLowerCase().includes(q) ||
        (r.category || "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => CLS_ORDER.indexOf(a.cls) - CLS_ORDER.indexOf(b.cls));

  const btnStyle = {
    position: "fixed",
    bottom: 8,
    left: BTN_LEFT,
    zIndex: Z,
    background: open ? "rgba(41,231,255,0.18)" : "rgba(0,0,0,0.55)",
    border: `1px solid ${open ? CY : "#1e3a45"}`,
    color: open ? CY : "#4a8fa8",
    fontFamily: MONO,
    fontSize: 10,
    padding: "3px 7px",
    borderRadius: 4,
    cursor: "pointer",
    letterSpacing: "0.04em",
    transition: "all 0.15s",
  };

  const panelStyle = {
    position: "fixed",
    top: 60,
    left: "50%",
    transform: "translateX(-50%)",
    width: "min(820px, 96vw)",
    maxHeight: "78vh",
    overflowY: "auto",
    zIndex: Z + 10,
    background: "rgba(6,18,28,0.97)",
    border: `1px solid ${CY}44`,
    borderRadius: 10,
    padding: "18px 20px",
    fontFamily: SANS,
    color: "#c8e6f0",
    boxShadow: "0 0 36px rgba(41,231,255,0.12)",
  };

  return (
    <>
      <button style={btnStyle} onClick={() => { setOpen(o => { if (!o) load(); return !o; }); }}>
        ◈ IPDSKNEX
      </button>

      {open && (
        <div style={panelStyle}>
          {/* header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontFamily: MONO, fontSize: 13, color: CY, letterSpacing: "0.08em" }}>
              INTEL PROFILE ENRICHMENT MATRIX
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{
                  background: assessing ? "#0a2030" : "rgba(41,231,255,0.1)",
                  border: `1px solid ${CY}66`,
                  color: CY, fontFamily: MONO, fontSize: 10, padding: "3px 10px",
                  borderRadius: 4, cursor: assessing ? "not-allowed" : "pointer",
                }}
              >
                {assessing ? "…" : "▶ ASSESS"}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: "#4a8fa8", fontSize: 16, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {[
              { label: "PROFILES",      val: total,   col: CY },
              { label: "FULLY ENRICHED",val: fullyEnr, col: GR },
              { label: "DATA ONLY",      val: dataOnly, col: CY },
              { label: "KB ONLY",        val: kbOnly,  col: AM },
              { label: "UNENRICHED",     val: unenr,   col: RD },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                background: "rgba(255,255,255,0.03)", border: `1px solid ${col}33`,
                borderRadius: 6, padding: "7px 14px", minWidth: 90, textAlign: "center",
              }}>
                <div style={{ fontFamily: MONO, fontSize: 18, color: col }}>{val}</div>
                <div style={{ fontSize: 9, color: "#5a8fa8", letterSpacing: "0.06em", marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {["ALL", ...CLS_ORDER].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CLS_COLOUR[t] || CY}22` : "transparent",
                  border: `1px solid ${tab === t ? (CLS_COLOUR[t] || CY) : "#1e3a45"}`,
                  color: tab === t ? (CLS_COLOUR[t] || CY) : "#4a8fa8",
                  fontFamily: MONO, fontSize: 9, padding: "3px 9px",
                  borderRadius: 4, cursor: "pointer",
                }}
              >
                {t}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search profiles…"
              style={{
                marginLeft: "auto", background: "rgba(0,0,0,0.3)", border: "1px solid #1e3a45",
                color: CY, fontFamily: MONO, fontSize: 10, padding: "3px 8px",
                borderRadius: 4, outline: "none", width: 160,
              }}
            />
          </div>

          {/* status */}
          {loading && <div style={{ color: "#4a8fa8", fontFamily: MONO, fontSize: 11, marginBottom: 8 }}>loading…</div>}
          {error   && <div style={{ color: RD, fontFamily: MONO, fontSize: 11, marginBottom: 8 }}>error: {error}</div>}

          {/* rows */}
          {filtered.map((row, i) => {
            const id = row.id || row._id || row.name || i;
            const isExp = expanded === id;
            const isUnenr = row.cls === "UNENRICHED";
            return (
              <div
                key={id}
                style={{
                  background: isUnenr ? "rgba(255,59,59,0.06)" : "rgba(255,255,255,0.025)",
                  border: `1px solid ${isUnenr ? RD + "44" : "#1e3a45"}`,
                  borderRadius: 6, marginBottom: 6, padding: "8px 12px",
                  animation: isUnenr ? "pulse-red 2s infinite" : "none",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", cursor: "pointer", gap: 10 }}
                  onClick={() => setExpanded(isExp ? null : id)}
                >
                  <span style={{ fontFamily: MONO, fontSize: 9, color: CLS_COLOUR[row.cls], minWidth: 110 }}>
                    {row.cls}
                  </span>
                  <span style={{ flex: 1, fontSize: 12, color: "#c8e6f0" }}>
                    {row.name || row.title || `Profile #${i + 1}`}
                    {row.role && <span style={{ color: "#4a8fa8", marginLeft: 8, fontSize: 10 }}>{row.role}</span>}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: "#4a8fa8" }}>
                    DS:{row.matchedDs.length} KB:{row.matchedKb.length}
                  </span>
                  <span style={{ color: "#4a8fa8", fontSize: 12 }}>{isExp ? "▲" : "▼"}</span>
                </div>

                {isExp && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #1e3a45" }}>
                    {row.matchedDs.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: CY, marginBottom: 4 }}>DATASETS</div>
                        {row.matchedDs.slice(0, 5).map((ds, j) => (
                          <div key={j} style={{ marginBottom: 4 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                              <span style={{ fontSize: 11, color: "#c8e6f0" }}>{ds.name || ds.title || `Dataset ${j + 1}`}</span>
                              <span style={{ fontFamily: MONO, fontSize: 9, color: "#4a8fa8" }}>{ds.type || ""}</span>
                            </div>
                            <div style={{ height: 3, background: DIM, borderRadius: 2 }}>
                              <div style={{ height: "100%", width: `${60 + (j % 3) * 13}%`, background: CY, borderRadius: 2 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {row.matchedKb.length > 0 && (
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: AM, marginBottom: 4 }}>KNOWLEDGE ARTICLES</div>
                        {row.matchedKb.slice(0, 5).map((kb, j) => (
                          <div key={j} style={{ marginBottom: 4 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                              <span style={{ fontSize: 11, color: "#c8e6f0" }}>{kb.title || kb.name || `Article ${j + 1}`}</span>
                              <span style={{ fontFamily: MONO, fontSize: 9, color: "#4a8fa8" }}>{kb.category || kb.kind || ""}</span>
                            </div>
                            <div style={{ height: 3, background: DIM, borderRadius: 2 }}>
                              <div style={{ height: "100%", width: `${55 + (j % 4) * 10}%`, background: AM, borderRadius: 2 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {row.matchedDs.length === 0 && row.matchedKb.length === 0 && (
                      <div style={{ color: RD, fontFamily: MONO, fontSize: 10 }}>
                        No dataset or knowledge article match found — intelligence gap.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {filtered.length === 0 && !loading && (
            <div style={{ color: "#4a8fa8", fontFamily: MONO, fontSize: 11, textAlign: "center", padding: 20 }}>
              no profiles match
            </div>
          )}

          <style>{`
            @keyframes pulse-red {
              0%,100% { box-shadow: 0 0 0 0 rgba(255,59,59,0); }
              50%      { box-shadow: 0 0 8px 2px rgba(255,59,59,0.25); }
            }
          `}</style>
        </div>
      )}
    </>
  );
}
