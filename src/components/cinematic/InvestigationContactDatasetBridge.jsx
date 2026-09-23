/**
 * F66 – Investigation × Contact × Dataset Intelligence Bridge (ICDBRG)
 * Cross-correlates /v1/investigations × /entities/Contact × /v1/datasets.
 * Classifies each investigation:
 *   FULLY_BRIDGED – matched contact AND dataset
 *   CONTACT_ONLY  – matched contact, no dataset
 *   DATA_ONLY     – matched dataset, no contact
 *   ISOLATED      – no match in either (operational blind spot)
 * ISOLATED rows pulse red.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const BTN_LEFT   = 950160;
const Z          = 649;
const REFRESH_MS = 90_000;

const CY   = "#29E7FF";
const GR   = "#00c878";
const AM   = "#F5A623";
const RD   = "#FF3B3B";
const DIM  = "#3a5060";
const MONO = "'JetBrains Mono', 'Courier New', monospace";
const SANS = "'Inter', system-ui, sans-serif";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
function authHdr() { return { Authorization: `Bearer ${API_KEY}` }; }

const ICDBRG_RE = /\b(icdbrg|investigation.{0,14}(bridge|contact|dataset|data)|contact.{0,14}(investigation|dataset)|dataset.{0,14}investigation|bridged.{0,14}invest|isolated.{0,14}invest|invest.{0,14}bridge|investigation.{0,14}data.backing|investigation.{0,14}contact.link)\b/i;

export function isIcdbrgQuery(text) { return ICDBRG_RE.test(text || ""); }

export async function buildIcdbrgScript() {
  try {
    const base = apiBase();
    const [invRes, ctRes, dsRes] = await Promise.all([
      fetch(`${base}/v1/investigations`, { headers: authHdr() }),
      fetch(`${base}/entities/Contact`,  { headers: authHdr() }),
      fetch(`${base}/v1/datasets`,       { headers: authHdr() }),
    ]);
    const [investigations, contacts, datasets] = await Promise.all([
      invRes.ok ? invRes.json() : [],
      ctRes.ok  ? ctRes.json()  : [],
      dsRes.ok  ? dsRes.json()  : [],
    ]);
    const invArr = (Array.isArray(investigations) ? investigations : investigations?.data ?? []).slice(0, 100);
    const ctArr  = (Array.isArray(contacts)        ? contacts        : contacts?.data        ?? []).slice(0, 200);
    const dsArr  = (Array.isArray(datasets)        ? datasets        : datasets?.data        ?? []).slice(0, 200);
    const classified = classifyInvestigations(invArr, ctArr, dsArr);
    const isolated     = classified.filter(r => r.cls === "ISOLATED").length;
    const fullyBridged = classified.filter(r => r.cls === "FULLY_BRIDGED").length;
    return `ICDBRG bridge: ${invArr.length} investigations, ${ctArr.length} contacts, ${dsArr.length} datasets. ` +
      `Bridge status: FULLY_BRIDGED ${fullyBridged}, CONTACT_ONLY ${classified.filter(r => r.cls === "CONTACT_ONLY").length}, ` +
      `DATA_ONLY ${classified.filter(r => r.cls === "DATA_ONLY").length}, ISOLATED ${isolated}. ` +
      (isolated > 0
        ? `${isolated} investigation${isolated !== 1 ? "s" : ""} have no contact or dataset link — operational blind spots requiring triage.`
        : "All investigations are bridged to at least one contact or dataset.");
  } catch (e) {
    return `ICDBRG bridge unavailable: ${e.message}`;
  }
}

function tok(str) {
  return String(str || "").toLowerCase().split(/\W+/).filter(t => t.length > 2);
}
function overlap(a, b) {
  const setB = new Set(b);
  return a.some(t => setB.has(t));
}

function classifyInvestigations(investigations, contacts, datasets) {
  return investigations.map(inv => {
    const itoks = tok(
      (inv.title || inv.name || "") + " " +
      (inv.description || inv.summary || "") + " " +
      (inv.status || inv.type || "") + " " +
      (Array.isArray(inv.tags) ? inv.tags.join(" ") : "")
    );
    const matchedCt = contacts.filter(ct =>
      overlap(itoks, tok(
        (ct.name || ct.full_name || "") + " " +
        (ct.role || ct.title || ct.department || "") + " " +
        (ct.organisation || ct.org || ct.company || "") + " " +
        (ct.email || ct.description || "")
      ))
    );
    const matchedDs = datasets.filter(ds =>
      overlap(itoks, tok(
        (ds.name || ds.title || "") + " " +
        (ds.type || ds.kind || "") + " " +
        (ds.description || "")
      ))
    );
    const hasCt = matchedCt.length > 0;
    const hasDs = matchedDs.length > 0;
    let cls;
    if (hasCt && hasDs)       cls = "FULLY_BRIDGED";
    else if (hasCt && !hasDs) cls = "CONTACT_ONLY";
    else if (!hasCt && hasDs) cls = "DATA_ONLY";
    else                      cls = "ISOLATED";
    return { inv, cls, matchedCt, matchedDs };
  });
}

const CLS_COLOR = {
  FULLY_BRIDGED: GR,
  CONTACT_ONLY:  CY,
  DATA_ONLY:     AM,
  ISOLATED:      RD,
};
const CLS_LABEL = {
  FULLY_BRIDGED: "FULLY BRIDGED",
  CONTACT_ONLY:  "CONTACT ONLY",
  DATA_ONLY:     "DATA ONLY",
  ISOLATED:      "ISOLATED",
};
const TABS = ["ALL", "FULLY_BRIDGED", "CONTACT_ONLY", "DATA_ONLY", "ISOLATED"];

export default function InvestigationContactDatasetBridge() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [ctCount, setCtCount]     = useState(0);
  const [dsCount, setDsCount]     = useState(0);
  const [loading, setLoading]     = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const [invRes, ctRes, dsRes] = await Promise.all([
        fetch(`${base}/v1/investigations`, { headers: authHdr() }),
        fetch(`${base}/entities/Contact`,  { headers: authHdr() }),
        fetch(`${base}/v1/datasets`,       { headers: authHdr() }),
      ]);
      const [investigations, contacts, datasets] = await Promise.all([
        invRes.ok ? invRes.json() : [],
        ctRes.ok  ? ctRes.json()  : [],
        dsRes.ok  ? dsRes.json()  : [],
      ]);
      const invArr = (Array.isArray(investigations) ? investigations : investigations?.data ?? []).slice(0, 100);
      const ctArr  = (Array.isArray(contacts)        ? contacts        : contacts?.data        ?? []).slice(0, 200);
      const dsArr  = (Array.isArray(datasets)        ? datasets        : datasets?.data        ?? []).slice(0, 200);
      setCtCount(ctArr.length);
      setDsCount(dsArr.length);
      setRows(classifyInvestigations(invArr, ctArr, dsArr));
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) { load(); timerRef.current = setInterval(load, REFRESH_MS); }
    else { clearInterval(timerRef.current); }
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:icdbrg-toggle", handler);
    return () => window.removeEventListener("jarvis:icdbrg-toggle", handler);
  }, []);

  const isolated     = rows.filter(r => r.cls === "ISOLATED").length;
  const fullyBridged = rows.filter(r => r.cls === "FULLY_BRIDGED").length;
  const visible = rows
    .filter(r => tab === "ALL" || r.cls === tab)
    .filter(r => {
      if (!search) return true;
      const name = r.inv.title || r.inv.name || r.inv.description || "";
      return name.toLowerCase().includes(search.toLowerCase());
    });

  async function assess() {
    setAssessing(true);
    try {
      const base   = apiBase();
      const script = await buildIcdbrgScript();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ message: script }),
      });
      const d     = await r.json();
      const reply = (d.answer || d.response || script).slice(0, 500);
      const voice = (typeof getActiveVoice === "function" ? getActiveVoice() : null) || "ash";
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ text: reply, voice }),
      });
    } catch (_) {}
    setAssessing(false);
  }

  const btnPulse = isolated > 0;

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: Z,
          background: open ? `rgba(41,231,255,0.18)` : `rgba(5,12,20,0.82)`,
          border: `1px solid ${open ? CY : DIM}`,
          borderRadius: 6,
          color: open ? CY : DIM,
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: 1.5,
          padding: "4px 9px",
          cursor: "pointer",
          whiteSpace: "nowrap",
          animation: btnPulse && !open ? "icdbrg-pulse 2.4s ease-in-out infinite" : "none",
        }}
        title="Investigation × Contact × Dataset Intelligence Bridge"
      >
        ◈ ICDBRG
      </button>

      <style>{`
        @keyframes icdbrg-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(255,59,59,0); border-color: #3a5060; }
          50%      { box-shadow: 0 0 0 5px rgba(255,59,59,0.28); border-color: ${RD}; }
        }
      `}</style>

      {open && (
        <div
          style={{
            position: "fixed", right: 16, top: 64, zIndex: Z + 100,
            width: "min(660px, 96vw)",
            maxHeight: "82vh",
            display: "flex", flexDirection: "column",
            background: "rgba(5,12,20,0.95)",
            backdropFilter: "blur(16px)",
            border: `1px solid rgba(41,231,255,0.18)`,
            borderTop: `2px solid ${CY}`,
            borderRadius: 10,
            boxShadow: `0 0 60px rgba(41,231,255,0.10), 0 20px 48px rgba(0,0,0,0.75)`,
            fontFamily: SANS,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px",
            borderBottom: `1px solid rgba(41,231,255,0.09)`,
          }}>
            <span style={{ color: CY, fontFamily: MONO, fontSize: 11, letterSpacing: 1.5 }}>◈ ICDBRG</span>
            <span style={{ color: "#5a7a8a", fontFamily: MONO, fontSize: 10, flex: 1, letterSpacing: 1 }}>
              INVESTIGATION × CONTACT × DATASET BRIDGE
            </span>
            {loading && <span style={{ color: DIM, fontFamily: MONO, fontSize: 9 }}>SYNC…</span>}
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14, lineHeight: 1 }}
            >×</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "10px 14px 0" }}>
            {[
              { label: "INVEST.",       val: rows.length,   color: CY },
              { label: "CONTACTS",      val: ctCount,       color: CY },
              { label: "DATASETS",      val: dsCount,       color: AM },
              { label: "FULLY BRIDGED", val: fullyBridged,  color: GR },
              { label: "ISOLATED",      val: isolated,      color: RD },
            ].map(t => (
              <div key={t.label} style={{
                flex: 1, background: "rgba(255,255,255,0.03)",
                border: `1px solid rgba(41,231,255,0.08)`, borderRadius: 6,
                padding: "7px 6px", textAlign: "center",
              }}>
                <div style={{ color: t.color, fontFamily: MONO, fontSize: 15, fontWeight: 700 }}>{t.val}</div>
                <div style={{ color: DIM, fontFamily: MONO, fontSize: 8, letterSpacing: 1.2, marginTop: 2 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div style={{ display: "flex", gap: 6, padding: "10px 14px 0", flexWrap: "wrap", alignItems: "center" }}>
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `rgba(41,231,255,0.12)` : "transparent",
                  border: `1px solid ${tab === t ? CY : DIM}`,
                  borderRadius: 5, color: tab === t ? CY : DIM,
                  fontFamily: MONO, fontSize: 9, letterSpacing: 1.2,
                  padding: "3px 8px", cursor: "pointer",
                }}
              >
                {t === "ALL" ? "ALL" : CLS_LABEL[t] || t}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search investigations…"
              style={{
                marginLeft: "auto",
                background: "rgba(41,231,255,0.04)",
                border: `1px solid ${DIM}`,
                borderRadius: 5, color: "#a0c0cc",
                fontFamily: MONO, fontSize: 10, padding: "3px 8px",
                outline: "none", width: 150,
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px 0" }}>
            {visible.length === 0 && (
              <div style={{ color: DIM, fontFamily: MONO, fontSize: 11, textAlign: "center", padding: "24px 0" }}>
                {loading ? "Loading bridge…" : "No investigations match filter."}
              </div>
            )}
            {visible.map((r, i) => {
              const name  = r.inv.title || r.inv.name || r.inv.description || `Investigation ${i + 1}`;
              const color = CLS_COLOR[r.cls];
              const isExp = expanded === i;
              return (
                <div key={i}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "7px 10px", marginBottom: 3, borderRadius: 6,
                      background: isExp ? "rgba(41,231,255,0.05)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${isExp ? `rgba(41,231,255,0.18)` : "rgba(41,231,255,0.05)"}`,
                      cursor: "pointer",
                      borderLeft: `3px solid ${r.cls === "ISOLATED" ? RD : color}`,
                      animation: r.cls === "ISOLATED" ? "icdbrg-pulse 2.4s ease-in-out infinite" : "none",
                    }}
                  >
                    <span style={{ color, fontFamily: MONO, fontSize: 9, letterSpacing: 1, flexShrink: 0, width: 100 }}>
                      {CLS_LABEL[r.cls]}
                    </span>
                    <span style={{ flex: 1, color: "#b0ccd5", fontSize: 12, fontFamily: SANS, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {name}
                    </span>
                    <span style={{ color: DIM, fontFamily: MONO, fontSize: 9, flexShrink: 0 }}>
                      {r.matchedCt.length}ct / {r.matchedDs.length}ds
                    </span>
                    <span style={{ color: DIM, fontFamily: MONO, fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{
                      marginBottom: 6, padding: "8px 10px",
                      background: "rgba(41,231,255,0.02)",
                      border: "1px solid rgba(41,231,255,0.08)",
                      borderRadius: 6, borderLeft: `3px solid ${CY}44`,
                    }}>
                      {/* Contacts */}
                      {r.matchedCt.length > 0 ? (
                        <>
                          <div style={{ color: CY, fontFamily: MONO, fontSize: 9, letterSpacing: 1.2, marginBottom: 5 }}>
                            CONTACTS ({r.matchedCt.length})
                          </div>
                          {r.matchedCt.slice(0, 5).map((ct, ci) => {
                            const cname = ct.name || ct.full_name || `Contact ${ci + 1}`;
                            const crole = ct.role || ct.title || "";
                            const w = Math.round(50 + Math.random() * 45);
                            return (
                              <div key={ci} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <div style={{ height: 4, width: `${w}%`, maxWidth: 180, background: CY, borderRadius: 2, opacity: 0.7 }} />
                                <span style={{ color: "#8aabb5", fontFamily: MONO, fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {cname}{crole ? ` · ${crole}` : ""}
                                </span>
                              </div>
                            );
                          })}
                          {r.matchedCt.length > 5 && (
                            <div style={{ color: DIM, fontFamily: MONO, fontSize: 9 }}>+{r.matchedCt.length - 5} more contacts</div>
                          )}
                        </>
                      ) : (
                        <div style={{ color: DIM, fontFamily: MONO, fontSize: 9 }}>No contact matches.</div>
                      )}

                      {/* Datasets */}
                      {r.matchedDs.length > 0 && (
                        <>
                          <div style={{ color: AM, fontFamily: MONO, fontSize: 9, letterSpacing: 1.2, marginTop: 8, marginBottom: 5 }}>
                            DATASETS ({r.matchedDs.length})
                          </div>
                          {r.matchedDs.slice(0, 5).map((ds, di) => {
                            const dname = ds.name || ds.title || `Dataset ${di + 1}`;
                            const dtype = ds.type || ds.kind || "";
                            const w = Math.round(55 + Math.random() * 40);
                            return (
                              <div key={di} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <div style={{ height: 4, width: `${w}%`, maxWidth: 180, background: AM, borderRadius: 2, opacity: 0.7 }} />
                                <span style={{ color: "#8aabb5", fontFamily: MONO, fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {dname}{dtype ? ` · ${dtype}` : ""}
                                </span>
                              </div>
                            );
                          })}
                          {r.matchedDs.length > 5 && (
                            <div style={{ color: DIM, fontFamily: MONO, fontSize: 9 }}>+{r.matchedDs.length - 5} more datasets</div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "8px 14px",
            borderTop: `1px solid rgba(41,231,255,0.07)`,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ color: DIM, fontFamily: MONO, fontSize: 9, flex: 1 }}>
              {visible.length} of {rows.length} investigations · 90 s refresh
            </span>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? "rgba(41,231,255,0.06)" : "rgba(41,231,255,0.12)",
                border: `1px solid ${assessing ? DIM : CY}`,
                borderRadius: 5, color: assessing ? DIM : CY,
                fontFamily: MONO, fontSize: 10, letterSpacing: 1,
                padding: "4px 14px", cursor: assessing ? "not-allowed" : "pointer",
              }}
            >
              {assessing ? "ASSESSING…" : "▶ ASSESS"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
