/**
 * F107 — Ops Event × Dataset × Contact
 *         Situational Response Coverage (ODCSRC)
 *
 * Parallel-fetches /v1/ops/events + /v1/datasets + /entities/Contact.
 * Keyword-correlates each ops event against datasets AND contacts to classify:
 *   FULLY_RESOURCED  (dataset + contact match)
 *   DATA_BACKED      (dataset only)
 *   CONTACT_ENGAGED  (contact only)
 *   UNRESOURCED      (no data or contact backing — coverage gap)
 *
 * Amber badge on UNRESOURCED count.
 * Stat tiles OPS EVENTS / DATASETS / CONTACTS + all four class counts + COVERAGE%.
 * Filter tabs ALL/FULLY_RESOURCED/DATA_BACKED/CONTACT_ENGAGED/UNRESOURCED + search.
 * Expand event → matched dataset cards (purple) + contact cards (orange)
 *   with relevance bars.
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Voice trigger: "odcsrc/ops dataset contact/situational response coverage/
 *   unresourced events/ops event coverage/event resource coverage".
 * Event: jarvis:odcsrc-toggle | 90-s auto-refresh.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_002_840;
const Z_INDEX  = 169;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const ODCSRC_RE = /\b(odcsrc|ops[\s-]dataset[\s-]contact|situational[\s-]response[\s-]coverage|unresourced[\s-]events?|ops[\s-]event[\s-]coverage|event[\s-]resource[\s-]coverage)\b/i;

const PU    = "#A78BFA";
const OR    = "#F97316";
const AM    = "#F59E0B";
const GR    = "#22C55E";
const CY    = "#00CFFF";
const BG    = "rgba(6,11,22,0.97)";
const BORDER = "rgba(167,139,250,0.18)";
const FONT  = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_RESOURCED:  GR,
  DATA_BACKED:      PU,
  CONTACT_ENGAGED:  OR,
  UNRESOURCED:      AM,
};

const TABS = ["ALL","FULLY_RESOURCED","DATA_BACKED","CONTACT_ENGAGED","UNRESOURCED"];

// ── exports for JarvisBrain ───────────────────────────────────────────────────

export function isOdcsrcQuery(text) {
  return ODCSRC_RE.test(text || "");
}

// ── helpers ───────────────────────────────────────────────────────────────────

function norm(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function kwTokens(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function overlap(aStr, bStr) {
  const at = new Set(kwTokens(aStr));
  const bt = kwTokens(bStr);
  if (!at.size || !bt.length) return 0;
  return bt.filter(w => at.has(w)).length / Math.max(at.size, bt.length);
}

function eventKey(e) {
  return [e.name, e.title, e.description, e.type, e.category, e.id].filter(Boolean).join(" ");
}

function datasetKey(d) {
  return [d.name, d.title, d.description, d.type, d.tags, d.id].filter(Boolean).join(" ");
}

function contactKey(c) {
  return [c.name, c.role, c.org, c.email, c.tags, c.id].filter(Boolean).join(" ");
}

async function fetchAll() {
  const base = apiBase();
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [opsRes, dsRes, ctRes] = await Promise.all([
    fetch(`${base}/v1/ops/events`, { headers }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/v1/datasets`, { headers }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/entities/Contact`, { headers }).then(r => r.ok ? r.json() : []),
  ]);
  const events   = norm(opsRes, ["events","data","items","results"]);
  const datasets = norm(dsRes,  ["datasets","data","items","results"]);
  const contacts = norm(ctRes,  ["contacts","data","items","results"]);
  return { events, datasets, contacts };
}

function classify(events, datasets, contacts) {
  return events.map(ev => {
    const ek = eventKey(ev);
    const matchedDatasets = datasets.filter(d => overlap(ek, datasetKey(d)) > 0.08);
    const matchedContacts = contacts.filter(c => overlap(ek, contactKey(c)) > 0.08);
    const hasDS = matchedDatasets.length > 0;
    const hasCT = matchedContacts.length > 0;
    const cls =
      hasDS && hasCT ? "FULLY_RESOURCED" :
      hasDS           ? "DATA_BACKED"    :
      hasCT           ? "CONTACT_ENGAGED" :
                        "UNRESOURCED";
    return {
      ...ev,
      _class:    cls,
      _datasets: matchedDatasets.map(d => ({ ...d, _rel: overlap(ek, datasetKey(d)) })),
      _contacts: matchedContacts.map(c => ({ ...c, _rel: overlap(ek, contactKey(c)) })),
    };
  });
}

export async function buildOdcsrcScript() {
  const base = apiBase();
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const { events, datasets, contacts } = await fetchAll();
  const classified     = classify(events, datasets, contacts);
  const total          = classified.length;
  const fullyRes       = classified.filter(e => e._class === "FULLY_RESOURCED").length;
  const dataBacked     = classified.filter(e => e._class === "DATA_BACKED").length;
  const contactEngaged = classified.filter(e => e._class === "CONTACT_ENGAGED").length;
  const unresourced    = classified.filter(e => e._class === "UNRESOURCED").length;
  const pct            = total > 0 ? Math.round((fullyRes + dataBacked + contactEngaged) / total * 100) : 0;

  const context = `Ops events: ${total}. Datasets: ${datasets.length}. Contacts: ${contacts.length}. Fully resourced: ${fullyRes}. Data-backed: ${dataBacked}. Contact-engaged: ${contactEngaged}. Unresourced: ${unresourced}. Situational coverage: ${pct}%.`;
  const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ message: `You are JARVIS. Given this situational response coverage summary: ${context} — write exactly 2 sentences assessing operational response capacity and the risk posed by unresourced events.` }),
  });
  const j = await res.json();
  return j?.response || j?.message || j?.text || `Situational response coverage: ${unresourced} of ${total} ops events lack any dataset or contact backing — ${pct}% coverage achieved.`;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function OpsDatasetContactCoverage() {
  const [open,      setOpen]      = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [rows,      setRows]      = useState([]);
  const [dsCnt,     setDsCnt]     = useState(0);
  const [ctCnt,     setCtCnt]     = useState(0);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [brief,     setBrief]     = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { events, datasets, contacts } = await fetchAll();
      setDsCnt(datasets.length);
      setCtCnt(contacts.length);
      setRows(classify(events, datasets, contacts));
    } catch { /* network error */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const toggle = () => { setOpen(v => !v); if (!rows.length) load(); };
    window.addEventListener("jarvis:odcsrc-toggle", toggle);
    return () => window.removeEventListener("jarvis:odcsrc-toggle", toggle);
  }, [load, rows.length]);

  const total          = rows.length;
  const fullyRes       = rows.filter(r => r._class === "FULLY_RESOURCED").length;
  const dataBacked     = rows.filter(r => r._class === "DATA_BACKED").length;
  const contactEngaged = rows.filter(r => r._class === "CONTACT_ENGAGED").length;
  const unresourced    = rows.filter(r => r._class === "UNRESOURCED").length;
  const coveragePct    = total > 0 ? Math.round((fullyRes + dataBacked + contactEngaged) / total * 100) : 0;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r._class !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.name || r.title || r.id || "").toLowerCase().includes(q);
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const script = await buildOdcsrcScript();
      setBrief(script);
      const base = apiBase();
      const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ text: script }),
      }).then(async r => {
        if (!r.ok) return;
        const blob = await r.blob();
        const url  = URL.createObjectURL(blob);
        const aud  = new Audio(url);
        aud.play();
      });
    } catch {}
    setAssessing(false);
  }

  const btnStyle = {
    position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
    background: unresourced > 0 ? "rgba(245,158,11,0.18)" : "rgba(167,139,250,0.12)",
    border: `1px solid ${unresourced > 0 ? AM : PU}55`,
    color: unresourced > 0 ? AM : PU,
    borderRadius: 6, padding: "3px 9px", fontSize: 10, fontFamily: FONT,
    cursor: "pointer", letterSpacing: 1, userSelect: "none",
    boxShadow: open ? `0 0 10px ${AM}55` : "none",
  };

  return (
    <>
      <button style={btnStyle} onClick={() => { setOpen(v => !v); if (!rows.length) load(); }}>
        ◈ ODCSRC
        {unresourced > 0 && (
          <span style={{
            marginLeft: 5, background: AM, color: "#000",
            borderRadius: 4, padding: "1px 5px", fontSize: 9, fontWeight: 700,
          }}>{unresourced}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: BTN_LEFT - 200, zIndex: Z_INDEX + 1,
          width: 560, maxHeight: "78vh",
          background: BG, border: `1px solid ${BORDER}`,
          borderRadius: 12, fontFamily: FONT, color: "#C8DFF0",
          display: "flex", flexDirection: "column",
          boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
          overflow: "hidden",
        }}>
          {/* header */}
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: PU, fontWeight: 700, letterSpacing: 1, fontSize: 11 }}>◈ ODCSRC</span>
            <span style={{ fontSize: 10, color: "#6E8AA0", flex: 1 }}>Ops Event × Dataset × Contact Response Coverage</span>
            <button onClick={assess} disabled={assessing} style={{
              background: "rgba(167,139,250,0.1)", border: `1px solid ${PU}44`, color: PU,
              borderRadius: 4, padding: "2px 8px", fontSize: 9, cursor: "pointer",
            }}>
              {assessing ? "ASSESSING…" : "▶ ASSESS COVERAGE"}
            </button>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 14, lineHeight: 1,
            }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 6, padding: "8px 14px", flexWrap: "wrap" }}>
            {[
              ["OPS EVENTS",       total,          PU],
              ["DATASETS",         dsCnt,          PU],
              ["CONTACTS",         ctCnt,          OR],
              ["FULLY RESOURCED",  fullyRes,       GR],
              ["DATA BACKED",      dataBacked,     PU],
              ["CONTACT ENGAGED",  contactEngaged, OR],
              ["UNRESOURCED",      unresourced,    AM],
              ["COVERAGE %",       `${coveragePct}%`, coveragePct > 60 ? GR : AM],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: "rgba(0,0,0,0.3)", border: `1px solid ${col}33`,
                borderRadius: 6, padding: "4px 8px", minWidth: 72, textAlign: "center",
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: col }}>{val}</div>
                <div style={{ fontSize: 8, color: "#6E8AA0", marginTop: 1, letterSpacing: 0.5 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* coverage bar */}
          <div style={{ padding: "0 14px 8px", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${coveragePct}%`, background: coveragePct > 60 ? GR : AM, borderRadius: 2, transition: "width 0.6s" }} />
            </div>
            <span style={{ fontSize: 9, color: "#6E8AA0" }}>situational coverage</span>
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "0 14px 8px", flexWrap: "wrap" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => { setTab(t); setExpanded(null); }} style={{
                background: tab === t ? `${CLASS_COLOR[t] || PU}22` : "rgba(0,0,0,0.3)",
                border: `1px solid ${tab === t ? (CLASS_COLOR[t] || PU) : "rgba(255,255,255,0.08)"}`,
                color: tab === t ? (CLASS_COLOR[t] || PU) : "#6E8AA0",
                borderRadius: 4, padding: "2px 7px", fontSize: 9, cursor: "pointer", letterSpacing: 0.5,
              }}>{t}</button>
            ))}
            <input
              value={search} onChange={e => { setSearch(e.target.value); setExpanded(null); }}
              placeholder="search events…"
              style={{
                marginLeft: "auto", background: "rgba(0,0,0,0.4)", border: `1px solid ${BORDER}`,
                color: "#C8DFF0", borderRadius: 4, padding: "2px 8px", fontSize: 9, fontFamily: FONT, width: 140,
              }}
            />
          </div>

          {/* brief */}
          {brief && (
            <div style={{ margin: "0 14px 8px", padding: "8px 10px", background: "rgba(167,139,250,0.06)", borderRadius: 6, fontSize: 11, lineHeight: 1.5, color: "#C8DFF0" }}>
              {brief}
            </div>
          )}

          {/* list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "8px 12px" }}>
            {loading && <div style={{ color: "#6E8AA0", fontSize: 11, padding: 8 }}>loading…</div>}
            {!loading && visible.length === 0 && (
              <div style={{ color: "#6E8AA0", fontSize: 11, padding: 8 }}>No events match the current filter.</div>
            )}
            {visible.map((ev, i) => {
              const col   = CLASS_COLOR[ev._class] || AM;
              const isExp = expanded === i;
              return (
                <div key={ev.id || i} style={{
                  marginBottom: 6, border: `1px solid ${col}33`, borderRadius: 8,
                  background: ev._class === "UNRESOURCED" ? "rgba(245,158,11,0.05)" : "rgba(0,0,0,0.25)",
                }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <span style={{ color: col, fontSize: 10, fontWeight: 700, minWidth: 110 }}>{ev._class}</span>
                    <span style={{ fontWeight: 600, fontSize: 12, flex: 1 }}>{ev.name || ev.title || ev.id || "Unknown Event"}</span>
                    <span style={{ fontSize: 10, color: PU, marginLeft: "auto" }}>
                      {ev._datasets.length}DS · {ev._contacts.length}CT
                    </span>
                    <span style={{ color: "#6E8AA0", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                  </div>
                  {isExp && (
                    <div style={{ padding: "0 12px 10px" }}>
                      {/* datasets */}
                      {ev._datasets.length > 0 && (
                        <>
                          <div style={{ fontSize: 10, color: PU, marginBottom: 4, letterSpacing: 1 }}>DATASETS</div>
                          {ev._datasets.map((d, di) => (
                            <div key={di} style={{
                              marginBottom: 4, padding: "6px 10px",
                              background: "rgba(167,139,250,0.06)", border: `1px solid ${PU}33`, borderRadius: 6,
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <span style={{ fontSize: 11, fontWeight: 600 }}>{d.name || d.title || d.id || "Dataset"}</span>
                                {d.type && <span style={{ fontSize: 10, color: "#6E8AA0" }}>{d.type}</span>}
                              </div>
                              <div style={{ height: 3, background: "rgba(167,139,250,0.2)", borderRadius: 2, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${Math.min(100, Math.round(d._rel * 100 * 4))}%`, background: PU, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                      {/* contacts */}
                      {ev._contacts.length > 0 && (
                        <>
                          <div style={{ fontSize: 10, color: OR, marginBottom: 4, marginTop: 6, letterSpacing: 1 }}>CONTACTS</div>
                          {ev._contacts.map((c, ci) => (
                            <div key={ci} style={{
                              marginBottom: 4, padding: "6px 10px",
                              background: "rgba(249,115,22,0.06)", border: `1px solid ${OR}33`, borderRadius: 6,
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <span style={{ fontSize: 11, fontWeight: 600 }}>{c.name || c.id || "Contact"}</span>
                                {c.role && <span style={{ fontSize: 10, color: "#6E8AA0" }}>{c.role}</span>}
                                {c.org && <span style={{ fontSize: 10, color: OR }}>{c.org}</span>}
                              </div>
                              <div style={{ height: 3, background: "rgba(249,115,22,0.2)", borderRadius: 2, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${Math.min(100, Math.round(c._rel * 100 * 4))}%`, background: OR, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                      {ev._datasets.length === 0 && ev._contacts.length === 0 && (
                        <div style={{ color: AM, fontSize: 11, padding: "4px 0" }}>
                          ⚠ No dataset or contact matches found for this event.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
