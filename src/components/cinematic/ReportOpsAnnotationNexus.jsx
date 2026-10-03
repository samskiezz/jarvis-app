import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const AM = "#FFB300"; const GN = "#4CAF50"; const RD = "#FF3D3D";
const CY = "#00E5FF"; const OR = "#FF9800"; const PU = "#CE93D8";
const DIM = "rgba(255,255,255,0.04)"; const BG = "rgba(6,10,18,0.94)";
const MN = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) || "dev-key";
const REFRESH_MS = 90_000;
const BTN_LEFT = 1108480;
const Z_IDX = 695;

function normReports(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.reports || raw?.items || raw?.data || []);
  return arr.map((r, i) => ({
    id: r.id || r._id || `rpt${i}`,
    name: r.name || r.title || r.report_name || `Report ${i + 1}`,
    type: r.type || r.category || r.report_type || "",
    tags: Array.isArray(r.tags) ? r.tags : [],
    desc: r.description || r.summary || r.content || r.body || "",
  }));
}

function normOpsEvents(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.events || raw?.ops_events || raw?.items || raw?.data || []);
  return arr.map((e, i) => ({
    id: e.id || e._id || `oe${i}`,
    name: e.name || e.title || e.event_name || `Ops Event ${i + 1}`,
    type: e.type || e.event_type || e.category || "",
    severity: e.severity || e.priority || e.level || "",
    tags: Array.isArray(e.tags) ? e.tags : [],
    desc: e.description || e.summary || e.message || "",
  }));
}

function normAnnotations(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.annotations || raw?.items || raw?.data || []);
  return arr.map((a, i) => ({
    id: a.id || a._id || `ann${i}`,
    name: a.name || a.title || a.label || a.annotation || `Annotation ${i + 1}`,
    entity: a.entity || a.entity_id || a.node || a.target || "",
    tags: Array.isArray(a.tags) ? a.tags : [],
    desc: a.description || a.summary || a.content || a.text || "",
  }));
}

function kw(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2); }

function overlap(aWords, bText) {
  const bWords = kw(bText);
  return aWords.filter(w => bWords.includes(w)).length;
}

function matchScore(report, targets) {
  const rWords = kw(`${report.name} ${report.type} ${report.tags.join(" ")} ${report.desc}`);
  if (!rWords.length) return 0;
  const best = targets.reduce((mx, t) => {
    const tText = `${t.name || t.title || ""} ${t.desc || t.description || ""} ${(t.tags || []).join(" ")} ${t.type || t.severity || t.entity || ""}`;
    const score = overlap(rWords, tText);
    return Math.max(mx, score);
  }, 0);
  return Math.min(100, Math.round((best / Math.max(rWords.length, 1)) * 200));
}

function classify(report, opsEvents, annotations) {
  const evScore = matchScore(report, opsEvents);
  const annScore = matchScore(report, annotations);
  const hasEv = evScore > 10;
  const hasAnn = annScore > 10;
  return {
    bucket: hasEv && hasAnn ? "FULLY_LINKED" : hasEv ? "EVENT_DRIVEN" : hasAnn ? "ANNOTATION_LINKED" : "ISOLATED",
    evScore,
    annScore,
    matchedEvents: opsEvents.filter(e => matchScore(report, [e]) > 10).slice(0, 3),
    matchedAnnotations: annotations.filter(a => matchScore(report, [a]) > 10).slice(0, 3),
  };
}

function Bar({ val, color }) {
  return (
    <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden", margin: "2px 0" }}>
      <div style={{ width: `${val}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.4s" }} />
    </div>
  );
}

const BUCKET_COLOR = { FULLY_LINKED: GN, EVENT_DRIVEN: OR, ANNOTATION_LINKED: PU, ISOLATED: RD };
const BUCKET_LABEL = { FULLY_LINKED: "FULLY LINKED", EVENT_DRIVEN: "EVENT DRIVEN", ANNOTATION_LINKED: "ANNOTATION LINKED", ISOLATED: "ISOLATED" };

function RoganexPanel({ reports, opsEvents, annotations }) {
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");

  const rows = reports.map(r => ({ ...r, ...classify(r, opsEvents, annotations) }));

  const totals = {
    full: rows.filter(r => r.bucket === "FULLY_LINKED").length,
    ev: rows.filter(r => r.bucket === "EVENT_DRIVEN").length,
    ann: rows.filter(r => r.bucket === "ANNOTATION_LINKED").length,
    none: rows.filter(r => r.bucket === "ISOLATED").length,
  };
  const cov = rows.length ? Math.round(((totals.full + totals.ev * 0.5 + totals.ann * 0.5) / rows.length) * 100) : 0;

  const FILTERS = ["ALL", "FULLY_LINKED", "EVENT_DRIVEN", "ANNOTATION_LINKED", "ISOLATED"];
  const visible = rows
    .filter(r => filter === "ALL" || r.bucket === filter)
    .filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.type.toLowerCase().includes(search.toLowerCase()));

  const covColor = cov >= 70 ? GN : cov >= 40 ? AM : RD;

  async function assess() {
    setAssessing(true);
    setAssessment("");
    try {
      const voice = getActiveVoice ? getActiveVoice() : "alloy";
      const prompt = `ROGANEX — Report × Ops Event × Graph Annotation Intelligence Response Nexus. ${rows.length} intelligence reports analysed. ${totals.full} fully linked (both ops event + annotation), ${totals.ev} event-driven only, ${totals.ann} annotation-linked only, ${totals.none} isolated (no response nexus). Coverage ${cov}%. Top isolated: ${rows.filter(r => r.bucket === "ISOLATED").slice(0, 3).map(r => r.name).join(", ") || "none"}. Provide a 2-sentence operational brief on intelligence response gaps and recommended action prioritisation.`;
      const res = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const json = await res.json();
      const text = json?.response || json?.message || json?.content || "ROGANEX assessment complete.";
      setAssessment(text);
      const ttsRes = await fetch(`${apiBase}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text, voice }),
      });
      if (ttsRes.ok) {
        const blob = await ttsRes.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play();
      }
    } catch {
      setAssessment("ROGANEX assessment complete. Intelligence response nexus analysis ready for review.");
    } finally {
      setAssessing(false);
    }
  }

  return (
    <div style={{ fontFamily: MN, color: "#D0E8F8", padding: "16px 18px", minWidth: 540, maxWidth: 680 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 13, textShadow: `0 0 14px ${CY}` }}>ROGANEX</span>
        <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>Report × Ops Event × Graph Annotation Intelligence Response Nexus</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 12 }}>
        {[
          { label: "REPORTS", val: rows.length, color: CY },
          { label: "OPS EVENTS", val: opsEvents.length, color: OR },
          { label: "ANNOTATIONS", val: annotations.length, color: PU },
          { label: "FULLY LINKED", val: totals.full, color: GN },
          { label: "EVENT DRIVEN", val: totals.ev, color: OR },
          { label: "ANNOT. LINKED", val: totals.ann, color: PU },
          { label: "ISOLATED", val: totals.none, color: RD, badge: totals.none > 0 },
          { label: "COV%", val: `${cov}%`, color: covColor },
        ].map(({ label, val, color, badge }) => (
          <div key={label} style={{ background: DIM, border: `1px solid ${color}33`, borderRadius: 8, padding: "8px 10px", position: "relative" }}>
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>{label}</div>
            <div style={{ color, fontSize: 18, fontWeight: 700 }}>{val}</div>
            {badge && val > 0 && <div style={{ position: "absolute", top: 6, right: 8, background: RD, borderRadius: "50%", width: 8, height: 8, boxShadow: `0 0 8px ${RD}` }} />}
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>
          <span>INTELLIGENCE RESPONSE NEXUS COVERAGE</span><span style={{ color: covColor }}>{cov}%</span>
        </div>
        <Bar val={cov} color={covColor} />
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? CY : DIM, color: filter === f ? "#04060A" : "rgba(255,255,255,0.6)",
            border: `1px solid ${CY}44`, borderRadius: 6, padding: "3px 9px", fontSize: 10, cursor: "pointer", letterSpacing: 1,
          }}>{f.replace(/_/g, " ")}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search reports…"
          style={{ marginLeft: "auto", background: DIM, border: `1px solid ${CY}33`, borderRadius: 6, color: "#D0E8F8", padding: "3px 9px", fontSize: 11, fontFamily: MN, outline: "none", width: 160 }} />
      </div>

      <div style={{ maxHeight: 240, overflowY: "auto" }}>
        {visible.length === 0 && <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, textAlign: "center", padding: 18 }}>No reports match current filter.</div>}
        {visible.map(row => {
          const isExp = expanded === row.id;
          const bc = BUCKET_COLOR[row.bucket] || CY;
          return (
            <div key={row.id}
              onClick={() => setExpanded(isExp ? null : row.id)}
              style={{ background: DIM, border: `1px solid ${bc}33`, borderRadius: 8, padding: "8px 12px", marginBottom: 6, cursor: "pointer", animation: row.bucket === "ISOLATED" ? "roganex_pulse 2s ease-in-out infinite" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: bc, fontSize: 10, fontWeight: 700, letterSpacing: 1, minWidth: 140 }}>{BUCKET_LABEL[row.bucket]}</span>
                <span style={{ color: "#C8E4F5", fontSize: 12, flex: 1 }}>{row.name}</span>
                {row.type && <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>{row.type}</span>}
                <span style={{ color: CY, fontSize: 11 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      <div style={{ color: OR, fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>OPS EVENTS ({row.matchedEvents.length})</div>
                      {row.matchedEvents.length === 0
                        ? <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>No ops event links found.</div>
                        : row.matchedEvents.map(ev => (
                          <div key={ev.id} style={{ background: "rgba(255,152,0,0.06)", border: `1px solid ${OR}44`, borderRadius: 6, padding: "6px 8px", marginBottom: 4 }}>
                            <div style={{ color: OR, fontSize: 11, fontWeight: 600 }}>{ev.name}</div>
                            {ev.type && <div style={{ background: `${OR}33`, borderRadius: 4, padding: "1px 5px", display: "inline-block", fontSize: 9, color: OR, marginTop: 2 }}>{ev.type}</div>}
                            <Bar val={Math.min(100, matchScore(row, [ev]) * 2)} color={OR} />
                          </div>
                        ))
                      }
                    </div>
                    <div>
                      <div style={{ color: PU, fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>ANNOTATIONS ({row.matchedAnnotations.length})</div>
                      {row.matchedAnnotations.length === 0
                        ? <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>No annotation links found.</div>
                        : row.matchedAnnotations.map(ann => (
                          <div key={ann.id} style={{ background: "rgba(206,147,216,0.06)", border: `1px solid ${PU}44`, borderRadius: 6, padding: "6px 8px", marginBottom: 4 }}>
                            <div style={{ color: PU, fontSize: 11, fontWeight: 600 }}>{ann.name}</div>
                            {ann.entity && <div style={{ background: `${PU}33`, borderRadius: 4, padding: "1px 5px", display: "inline-block", fontSize: 9, color: PU, marginTop: 2 }}>{ann.entity}</div>}
                            <Bar val={Math.min(100, matchScore(row, [ann]) * 2)} color={PU} />
                          </div>
                        ))
                      }
                    </div>
                  </div>
                  {row.desc && <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, marginTop: 8 }}>{row.desc.slice(0, 180)}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {assessment && (
        <div style={{ background: "rgba(0,229,255,0.05)", border: `1px solid ${CY}44`, borderRadius: 8, padding: "10px 12px", marginTop: 10, fontSize: 12, color: "#C8E4F5", lineHeight: 1.5 }}>
          {assessment}
        </div>
      )}

      <button onClick={assess} disabled={assessing} style={{
        marginTop: 12, width: "100%", background: assessing ? "rgba(0,229,255,0.05)" : `${CY}18`,
        color: CY, border: `1px solid ${CY}66`, borderRadius: 8, padding: "9px 0", fontSize: 11, letterSpacing: 2,
        cursor: assessing ? "not-allowed" : "pointer", fontFamily: MN,
      }}>
        {assessing ? "ASSESSING…" : "▶ ASSESS INTELLIGENCE RESPONSE NEXUS"}
      </button>
      <style>{`@keyframes roganex_pulse{0%,100%{opacity:1}50%{opacity:0.55}}`}</style>
    </div>
  );
}

export default function ReportOpsAnnotationNexus() {
  const [open, setOpen] = useState(false);
  const [reports, setReports] = useState([]);
  const [opsEvents, setOpsEvents] = useState([]);
  const [annotations, setAnnotations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
      const [rRes, eRes, aRes] = await Promise.all([
        fetch(`${apiBase}/v1/reports`, { headers: hdrs }),
        fetch(`${apiBase}/v1/ops/events`, { headers: hdrs }),
        fetch(`${apiBase}/v1/graph/annotations`, { headers: hdrs }),
      ]);
      const [rRaw, eRaw, aRaw] = await Promise.all([rRes.json(), eRes.json(), aRes.json()]);
      setReports(normReports(rRaw));
      setOpsEvents(normOpsEvents(eRaw));
      setAnnotations(normAnnotations(aRaw));
    } catch (e) {
      setError(`Load failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => {
      setOpen(o => {
        if (!o) load();
        return !o;
      });
    };
    window.addEventListener("jarvis:roganex-toggle", toggle);
    return () => window.removeEventListener("jarvis:roganex-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  if (!open) {
    return (
      <button onClick={() => { setOpen(true); load(); }} title="Report × Ops Event × Graph Annotation Intelligence Response Nexus" style={{
        position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_IDX,
        background: "rgba(6,10,18,0.82)", border: `1px solid ${CY}55`, borderRadius: 7,
        color: CY, fontFamily: MN, fontSize: 10, letterSpacing: 1,
        padding: "5px 9px", cursor: "pointer", whiteSpace: "nowrap",
        boxShadow: `0 0 14px ${CY}22`,
      }}>◈ ROGANEX</button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT - 560, bottom: 48, zIndex: Z_IDX,
      background: BG, border: `1px solid ${CY}55`, borderRadius: 14,
      boxShadow: `0 0 50px ${CY}18`, backdropFilter: "blur(14px)",
      minWidth: 540, maxWidth: 680,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px 0" }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 12, letterSpacing: 2 }}>◈ ROGANEX</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>
      {loading && <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, padding: "14px 18px" }}>Loading intelligence response nexus…</div>}
      {error && <div style={{ color: RD, fontSize: 11, padding: "10px 18px" }}>{error}</div>}
      {!loading && !error && reports.length > 0 && <RoganexPanel reports={reports} opsEvents={opsEvents} annotations={annotations} />}
      {!loading && !error && reports.length === 0 && <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "14px 18px" }}>No report data available.</div>}
    </div>
  );
}

export function isRoganexQuery(text) {
  const t = text.toLowerCase();
  return ["roganex", "report ops annotation", "intelligence response nexus",
    "report annotation ops", "ops annotation report", "annotation report ops",
    "report graph annotation", "report ops graph", "intelligence nexus report",
    "roganex coverage", "report response nexus"].some(k => t.includes(k));
}

export async function buildRoganexScript() {
  const hdrs = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
  try {
    const [rRes, eRes, aRes] = await Promise.all([
      fetch(`${apiBase}/v1/reports`, { headers: hdrs }),
      fetch(`${apiBase}/v1/ops/events`, { headers: hdrs }),
      fetch(`${apiBase}/v1/graph/annotations`, { headers: hdrs }),
    ]);
    const [rRaw, eRaw, aRaw] = await Promise.all([rRes.json(), eRes.json(), aRes.json()]);
    const reports = normReports(rRaw);
    const opsEvents = normOpsEvents(eRaw);
    const annotations = normAnnotations(aRaw);
    const rows = reports.map(r => ({ ...r, ...classify(r, opsEvents, annotations) }));
    const full = rows.filter(r => r.bucket === "FULLY_LINKED").length;
    const none = rows.filter(r => r.bucket === "ISOLATED").length;
    const cov = rows.length ? Math.round(((full + rows.filter(r => r.bucket === "EVENT_DRIVEN").length * 0.5 + rows.filter(r => r.bucket === "ANNOTATION_LINKED").length * 0.5) / rows.length) * 100) : 0;
    return `ROGANEX online, sir. ${rows.length} intelligence reports assessed against ${opsEvents.length} ops events and ${annotations.length} graph annotations. ${full} fully linked, ${none} isolated. Intelligence response nexus coverage at ${cov} percent.`;
  } catch {
    return "ROGANEX online, sir. Report ops annotation intelligence response nexus analysis ready.";
  }
}
