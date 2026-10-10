/**
 * F203 — Contact × Dataset × Ops Event Operational Intelligence Network (CODIN)
 *
 * Parallel-fetches /entities/Contact + /v1/datasets + /v1/ops/events
 * and keyword-correlates each contact against datasets AND ops events to classify:
 *
 *   FULLY_NETWORKED — matched dataset + ops event (full intelligence network)
 *   DATA_LINKED     — dataset match only, no ops event
 *   OPS_TRACKED     — ops event match only, no dataset
 *   ISOLATED        — no matches (intelligence gap)
 *
 * Stat tiles: CONTACTS / DATASETS / OPS EVENTS + four class counts + COVERAGE%.
 * Amber badge on ISOLATED count.
 * Filter tabs ALL / FULLY_NETWORKED / DATA_LINKED / OPS_TRACKED / ISOLATED + text search.
 * Expand contact → matched dataset cards (teal) + matched ops event cards (orange) with relevance bars.
 * ▶ ASSESS NETWORK → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:codin-toggle event.
 *
 * Voice triggers:
 *   "codin / contact dataset ops / intel network / contact network /
 *    isolated contacts / contact ops data"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_056_040;
const Z_INDEX  = 264;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const CODIN_RE = /\b(codin|contact[\s-]dataset[\s-]ops|intel[\s-]network|contact[\s-]network|isolated[\s-]contacts?|contact[\s-]ops[\s-]data)\b/i;

export function isCodingQuery(q = "") { return CODIN_RE.test(q); }
// alias with canonical name for JarvisBrain import
export { isCodingQuery as isCodinQuery };

function keywords(text = "") {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function scoreText(target = "", kws = []) {
  const t = target.toLowerCase();
  return kws.filter(k => t.includes(k)).length;
}

function contactText(c) {
  return [c.name, c.role, c.org, c.organisation, c.email, (c.tags || []).join(" "), c.description, c.department].filter(Boolean).join(" ");
}

function datasetText(d) {
  return [d.name, d.description, d.type, d.category, d.source, (d.tags || []).join(" ")].filter(Boolean).join(" ");
}

function opsText(o) {
  return [o.name, o.title, o.type, o.description, o.category, o.event_type, o.source].filter(Boolean).join(" ");
}

export async function buildCodinScript() {
  const base = apiBase();
  const [conRes, datRes, opsRes] = await Promise.allSettled([
    fetch(`${base}/entities/Contact`).then(r => r.json()),
    fetch(`${base}/v1/datasets`).then(r => r.json()),
    fetch(`${base}/v1/ops/events`).then(r => r.json()),
  ]);
  const contacts  = (conRes.status === "fulfilled" ? (conRes.value?.items   || conRes.value?.contacts || conRes.value   || []) : []);
  const datasets  = (datRes.status === "fulfilled" ? (datRes.value?.items   || datRes.value?.datasets || datRes.value   || []) : []);
  const events    = (opsRes.status === "fulfilled" ? (opsRes.value?.items   || opsRes.value?.events   || opsRes.value   || []) : []);

  const isolated = contacts.filter(c => {
    const kws = keywords(contactText(c));
    return !datasets.some(d => scoreText(datasetText(d), kws) > 0) &&
           !events.some(o => scoreText(opsText(o), kws) > 0);
  }).length;
  const fully = contacts.filter(c => {
    const kws = keywords(contactText(c));
    return datasets.some(d => scoreText(datasetText(d), kws) > 0) &&
           events.some(o => scoreText(opsText(o), kws) > 0);
  }).length;
  const total  = contacts.length;
  const covPct = total ? Math.round(((total - isolated) / total) * 100) : 0;
  return `CODIN Operational Intelligence Network online, sir. I am cross-referencing ${total} contacts against ${datasets.length} datasets and ${events.length} operational events. ${fully} contact${fully === 1 ? "" : "s"} are fully networked — appearing in both datasets and operational events. ${isolated} contact${isolated === 1 ? "" : "s"} are isolated with no data or ops linkage. Overall network coverage stands at ${covPct}%. Recommend immediate review of isolated contacts to close intelligence gaps.`;
}

const CY     = "#00CFFF";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const OR     = "#F97316";
const GR     = "#22C55E";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_NETWORKED: GR,
  DATA_LINKED:     CY,
  OPS_TRACKED:     OR,
  ISOLATED:        AM,
};

function classify(c, datasets, events) {
  const kws  = keywords(contactText(c));
  const hasD = datasets.some(d => scoreText(datasetText(d), kws) > 0);
  const hasO = events.some(o => scoreText(opsText(o), kws) > 0);
  if (hasD && hasO) return "FULLY_NETWORKED";
  if (hasD)         return "DATA_LINKED";
  if (hasO)         return "OPS_TRACKED";
  return "ISOLATED";
}

function getMatches(c, list, textFn) {
  const kws = keywords(contactText(c));
  return list
    .map(item => ({ item, score: scoreText(textFn(item), kws) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export default function ContactDatasetOpsNetwork() {
  const [open,      setOpen]      = useState(false);
  const [contacts,  setContacts]  = useState([]);
  const [datasets,  setDatasets]  = useState([]);
  const [events,    setEvents]    = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const base = apiBase();
    const [conR, datR, opsR] = await Promise.allSettled([
      fetch(`${base}/entities/Contact`).then(r => r.json()),
      fetch(`${base}/v1/datasets`).then(r => r.json()),
      fetch(`${base}/v1/ops/events`).then(r => r.json()),
    ]);
    setContacts(conR.status === "fulfilled" ? (conR.value?.items   || conR.value?.contacts || conR.value   || []) : []);
    setDatasets(datR.status === "fulfilled" ? (datR.value?.items   || datR.value?.datasets || datR.value   || []) : []);
    setEvents(opsR.status   === "fulfilled" ? (opsR.value?.items   || opsR.value?.events   || opsR.value   || []) : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener("jarvis:codin-toggle", handler);
    return () => window.removeEventListener("jarvis:codin-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const classified = contacts.map(c => ({ c, cls: classify(c, datasets, events) }));
  const counts = { FULLY_NETWORKED: 0, DATA_LINKED: 0, OPS_TRACKED: 0, ISOLATED: 0 };
  classified.forEach(({ cls }) => counts[cls]++);
  const covPct = contacts.length ? Math.round(((contacts.length - counts.ISOLATED) / contacts.length) * 100) : 0;

  const filtered = classified.filter(({ c, cls }) => {
    if (tab !== "ALL" && cls !== tab) return false;
    if (!search) return true;
    return contactText(c).toLowerCase().includes(search.toLowerCase());
  });

  async function assess() {
    setAssessing(true); setBrief("");
    try {
      const base = apiBase();
      const ctx  = `${contacts.length} contacts, ${datasets.length} datasets, ${events.length} ops events. FULLY_NETWORKED:${counts.FULLY_NETWORKED} DATA_LINKED:${counts.DATA_LINKED} OPS_TRACKED:${counts.OPS_TRACKED} ISOLATED:${counts.ISOLATED} Coverage:${covPct}%`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `CODIN operational intelligence network assessment. Data: ${ctx}. Provide a 2-sentence brief on which isolated contacts represent the highest intelligence gaps and the recommended immediate action.` }),
      });
      const d = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "Assessment unavailable.";
      setBrief(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setBrief("Assessment unavailable.");
    }
    setAssessing(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: "rgba(0,207,255,0.08)", border: `1px solid ${CY}`,
          color: CY, fontFamily: FONT, fontSize: 10, padding: "3px 7px",
          cursor: "pointer", borderRadius: 3, letterSpacing: 1,
        }}
        title="Contact × Dataset × Ops Event Operational Intelligence Network"
      >
        ◈ CODIN
        {counts.ISOLATED > 0 && (
          <span style={{ marginLeft: 4, background: AM, color: "#000", borderRadius: 3, padding: "0 4px", fontSize: 9 }}>
            {counts.ISOLATED}
          </span>
        )}
      </button>
    );
  }

  const TABS = ["ALL", "FULLY_NETWORKED", "DATA_LINKED", "OPS_TRACKED", "ISOLATED"];

  return (
    <div style={{
      position: "fixed", top: 40, left: "50%", transform: "translateX(-50%)",
      width: 760, maxHeight: "80vh", overflowY: "auto",
      background: BG, border: `1px solid ${CY}`, borderRadius: 8,
      zIndex: Z_INDEX + 1000, fontFamily: FONT, color: CY, padding: 18,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>
          ◈ CODIN — CONTACT × DATASET × OPS EVENT OPERATIONAL INTELLIGENCE NETWORK
        </span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: RD, cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6, marginBottom: 12 }}>
        {[
          ["CONTACTS",         contacts.length,          CY],
          ["DATASETS",         datasets.length,          CY],
          ["OPS EVENTS",       events.length,            CY],
          ["FULLY NETWORKED",  counts.FULLY_NETWORKED,   GR],
          ["DATA LINKED",      counts.DATA_LINKED,       CY],
          ["OPS TRACKED",      counts.OPS_TRACKED,       OR],
          ["ISOLATED",         counts.ISOLATED,          AM],
        ].map(([label, val, col]) => (
          <div key={label} style={{ background: "rgba(0,207,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 5, padding: "6px 4px", textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 8, color: "#888", marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#666", marginBottom: 3 }}>
          <span>NETWORK COVERAGE</span><span>{covPct}%</span>
        </div>
        <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
          <div style={{ height: "100%", width: `${covPct}%`, background: covPct > 70 ? GR : covPct > 40 ? AM : RD, borderRadius: 2, transition: "width .4s" }} />
        </div>
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "rgba(0,207,255,0.18)" : "transparent",
            border: `1px solid ${tab === t ? CY : "#333"}`,
            color: tab === t ? CY : "#666", fontFamily: FONT, fontSize: 9,
            padding: "3px 8px", cursor: "pointer", borderRadius: 3,
          }}>
            {t}{t !== "ALL" ? ` (${counts[t] ?? 0})` : ` (${contacts.length})`}
          </button>
        ))}
        <input
          placeholder="search…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ marginLeft: "auto", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, color: CY, fontFamily: FONT, fontSize: 10, padding: "3px 8px", borderRadius: 3, width: 140, outline: "none" }}
        />
      </div>

      {loading && <div style={{ color: "#666", fontSize: 11, marginBottom: 8 }}>⟳ Loading…</div>}

      {/* Contact rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        {filtered.map(({ c, cls }, i) => {
          const id          = c.id || c._id || i;
          const isExp       = expanded === id;
          const clrCls      = CLASS_COLOR[cls];
          const dataMatches = getMatches(c, datasets, datasetText);
          const opsMatches  = getMatches(c, events,   opsText);
          return (
            <div key={id} style={{ border: `1px solid ${BORDER}`, borderRadius: 5, background: "rgba(0,207,255,0.03)" }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer" }}
              >
                <span style={{ fontSize: 8, background: `${clrCls}22`, border: `1px solid ${clrCls}`, color: clrCls, borderRadius: 3, padding: "1px 5px", minWidth: 100, textAlign: "center", letterSpacing: 1 }}>
                  {cls.replace(/_/g, " ")}
                </span>
                <span style={{ fontSize: 10, flex: 1 }}>{c.name || "Unknown Contact"}</span>
                {c.role && <span style={{ fontSize: 8, color: "#666" }}>{c.role}</span>}
                {c.org && <span style={{ fontSize: 8, color: "#555" }}>{c.org}</span>}
                <span style={{ fontSize: 9, color: isExp ? CY : "#444" }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ padding: "0 10px 10px", borderTop: `1px solid ${BORDER}` }}>
                  {c.description && <div style={{ fontSize: 9, color: "#888", marginTop: 6, marginBottom: 8 }}>{c.description}</div>}
                  {dataMatches.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 9, color: CY, marginBottom: 4, letterSpacing: 1 }}>▸ MATCHED DATASETS</div>
                      {dataMatches.map(({ item: d, score }) => (
                        <div key={d.id || d.name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, padding: "4px 8px", background: "rgba(0,207,255,0.05)", borderRadius: 3 }}>
                          <span style={{ fontSize: 9, flex: 1 }}>{d.name}</span>
                          {d.type && <span style={{ fontSize: 8, color: "#888", background: "rgba(0,207,255,0.1)", borderRadius: 2, padding: "0 4px" }}>{d.type}</span>}
                          <div style={{ width: 60, height: 3, background: "#111", borderRadius: 2 }}>
                            <div style={{ height: "100%", width: `${Math.min(100, score * 15)}%`, background: CY, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {opsMatches.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: OR, marginBottom: 4, letterSpacing: 1 }}>▸ MATCHED OPS EVENTS</div>
                      {opsMatches.map(({ item: o, score }) => (
                        <div key={o.id || o.name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, padding: "4px 8px", background: "rgba(249,115,22,0.05)", borderRadius: 3 }}>
                          <span style={{ fontSize: 9, flex: 1 }}>{o.name || o.title || o.type || "Ops Event"}</span>
                          {o.type && <span style={{ fontSize: 8, color: "#888", background: "rgba(249,115,22,0.1)", borderRadius: 2, padding: "0 4px" }}>{o.type}</span>}
                          <div style={{ width: 60, height: 3, background: "#111", borderRadius: 2 }}>
                            <div style={{ height: "100%", width: `${Math.min(100, score * 15)}%`, background: OR, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {dataMatches.length === 0 && opsMatches.length === 0 && (
                    <div style={{ fontSize: 9, color: AM, marginTop: 6 }}>⚠ No matching datasets or ops events found — isolated contact with no network linkage.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && !loading && (
          <div style={{ color: "#555", fontSize: 10, textAlign: "center", padding: 20 }}>No contacts match current filter.</div>
        )}
      </div>

      {/* Assess button */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={assess}
          disabled={assessing}
          style={{ background: "rgba(0,207,255,0.1)", border: `1px solid ${CY}`, color: CY, fontFamily: FONT, fontSize: 10, padding: "5px 14px", cursor: "pointer", borderRadius: 3, letterSpacing: 1 }}
        >
          {assessing ? "⟳ ASSESSING…" : "▶ ASSESS NETWORK"}
        </button>
        {brief && <div style={{ fontSize: 9, color: "#aaa", flex: 1 }}>{brief}</div>}
      </div>
    </div>
  );
}
