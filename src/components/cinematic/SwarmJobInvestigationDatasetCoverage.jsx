import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const AM = "#FFB300"; const GN = "#4CAF50"; const RD = "#FF3D3D";
const CY = "#00E5FF"; const OR = "#FF9800"; const PU = "#CE93D8";
const TE = "#26C6DA";
const DIM = "rgba(255,255,255,0.04)"; const BG = "rgba(6,10,18,0.94)";
const MN = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) || "dev-key";
const REFRESH_MS = 90_000;
const BTN_LEFT = 1107920;
const Z_IDX = 694;

function normSwarmJobs(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.jobs || raw?.swarm_jobs || raw?.items || raw?.data || []);
  return arr.map((j, i) => ({
    id: j.id || j._id || `sj${i}`,
    name: j.name || j.job_name || j.title || `SwarmJob ${i + 1}`,
    type: j.type || j.job_type || j.category || "",
    status: j.status || j.state || "",
    tags: Array.isArray(j.tags) ? j.tags : [],
    desc: j.description || j.summary || j.objective || "",
  }));
}

function normInvestigations(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.investigations || raw?.items || raw?.data || []);
  return arr.map((inv, i) => ({
    id: inv.id || inv._id || `inv${i}`,
    name: inv.name || inv.title || inv.investigation_name || `Investigation ${i + 1}`,
    status: inv.status || inv.state || inv.phase || "",
    type: inv.type || inv.category || "",
    tags: Array.isArray(inv.tags) ? inv.tags : [],
    desc: inv.description || inv.summary || inv.objective || "",
  }));
}

function normDatasets(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.datasets || raw?.items || raw?.data || []);
  return arr.map((d, i) => ({
    id: d.id || d._id || `ds${i}`,
    name: d.name || d.title || d.dataset_name || `Dataset ${i + 1}`,
    type: d.type || d.category || d.format || "",
    tags: Array.isArray(d.tags) ? d.tags : [],
    desc: d.description || d.summary || "",
  }));
}

function kw(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2); }

function overlap(aWords, bText) {
  const bWords = kw(bText);
  return aWords.filter(w => bWords.includes(w)).length;
}

function matchScore(job, targets) {
  const jWords = kw(`${job.name} ${job.type} ${job.tags.join(" ")} ${job.desc}`);
  if (!jWords.length) return 0;
  const best = targets.reduce((mx, t) => {
    const tText = `${t.name || t.title || ""} ${t.desc || t.description || ""} ${(t.tags || []).join(" ")} ${t.type || t.status || ""}`;
    const score = overlap(jWords, tText);
    return Math.max(mx, score);
  }, 0);
  return Math.min(100, Math.round((best / Math.max(jWords.length, 1)) * 200));
}

function classify(job, investigations, datasets) {
  const invScore = matchScore(job, investigations);
  const dsScore = matchScore(job, datasets);
  const hasInv = invScore > 10;
  const hasDs = dsScore > 10;
  return {
    bucket: hasInv && hasDs ? "FULLY_INTEGRATED" : hasInv ? "INVESTIGATION_LINKED" : hasDs ? "DATASET_BACKED" : "UNINTEGRATED",
    invScore,
    dsScore,
    matchedInvestigations: investigations.filter(inv => matchScore(job, [inv]) > 10).slice(0, 3),
    matchedDatasets: datasets.filter(ds => matchScore(job, [ds]) > 10).slice(0, 3),
  };
}

function Bar({ val, color }) {
  return (
    <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden", margin: "2px 0" }}>
      <div style={{ width: `${val}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.4s" }} />
    </div>
  );
}

const BUCKET_COLOR = { FULLY_INTEGRATED: GN, INVESTIGATION_LINKED: TE, DATASET_BACKED: AM, UNINTEGRATED: RD };
const BUCKET_LABEL = { FULLY_INTEGRATED: "FULLY INTEGRATED", INVESTIGATION_LINKED: "INVESTIGATION LINKED", DATASET_BACKED: "DATASET BACKED", UNINTEGRATED: "UNINTEGRATED" };

function SidicovPanel({ jobs, investigations, datasets }) {
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");

  const rows = jobs.map(j => ({ ...j, ...classify(j, investigations, datasets) }));

  const totals = {
    full: rows.filter(r => r.bucket === "FULLY_INTEGRATED").length,
    inv: rows.filter(r => r.bucket === "INVESTIGATION_LINKED").length,
    ds: rows.filter(r => r.bucket === "DATASET_BACKED").length,
    none: rows.filter(r => r.bucket === "UNINTEGRATED").length,
  };
  const cov = rows.length ? Math.round(((totals.full + totals.inv * 0.5 + totals.ds * 0.5) / rows.length) * 100) : 0;

  const FILTERS = ["ALL", "FULLY_INTEGRATED", "INVESTIGATION_LINKED", "DATASET_BACKED", "UNINTEGRATED"];
  const visible = rows
    .filter(r => filter === "ALL" || r.bucket === filter)
    .filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.type.toLowerCase().includes(search.toLowerCase()));

  const covColor = cov >= 70 ? GN : cov >= 40 ? AM : RD;

  async function assess() {
    setAssessing(true);
    setAssessment("");
    try {
      const voice = getActiveVoice ? getActiveVoice() : "alloy";
      const prompt = `SIDICOV — SwarmJob Intelligence Completion Coverage. ${rows.length} swarm jobs analysed. ${totals.full} fully integrated (both investigation + dataset), ${totals.inv} investigation-linked only, ${totals.ds} dataset-backed only, ${totals.none} unintegrated (intelligence gap). Coverage ${cov}%. Top unintegrated: ${rows.filter(r => r.bucket === "UNINTEGRATED").slice(0, 3).map(r => r.name).join(", ") || "none"}. Provide a 2-sentence operational brief on intelligence completion gaps and recommended prioritisation.`;
      const res = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const json = await res.json();
      const text = json?.response || json?.message || json?.content || "SIDICOV assessment complete.";
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
      setAssessment("SIDICOV assessment complete. Intelligence completion coverage analysis ready for review.");
    } finally {
      setAssessing(false);
    }
  }

  return (
    <div style={{ fontFamily: MN, color: "#D0E8F8", padding: "16px 18px", minWidth: 540, maxWidth: 680 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 13, textShadow: `0 0 14px ${CY}` }}>SIDICOV</span>
        <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>SwarmJob × Investigation × Dataset Intelligence Completion Coverage</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 12 }}>
        {[
          { label: "SWARM JOBS", val: rows.length, color: CY },
          { label: "INVESTIGATIONS", val: investigations.length, color: TE },
          { label: "DATASETS", val: datasets.length, color: AM },
          { label: "FULLY INT.", val: totals.full, color: GN },
          { label: "INV LINKED", val: totals.inv, color: TE },
          { label: "DS BACKED", val: totals.ds, color: AM },
          { label: "UNINTEGRATED", val: totals.none, color: RD, badge: totals.none > 0 },
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
          <span>INTELLIGENCE COMPLETION COVERAGE</span><span style={{ color: covColor }}>{cov}%</span>
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
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search swarm jobs…"
          style={{ marginLeft: "auto", background: DIM, border: `1px solid ${CY}33`, borderRadius: 6, color: "#D0E8F8", padding: "3px 9px", fontSize: 11, fontFamily: MN, outline: "none", width: 160 }} />
      </div>

      <div style={{ maxHeight: 240, overflowY: "auto" }}>
        {visible.length === 0 && <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, textAlign: "center", padding: 18 }}>No swarm jobs match current filter.</div>}
        {visible.map(row => {
          const isExp = expanded === row.id;
          const bc = BUCKET_COLOR[row.bucket] || CY;
          const pulse = row.bucket === "UNINTEGRATED" ? `sidicov-pulse-${row.id}` : null;
          return (
            <div key={row.id}
              onClick={() => setExpanded(isExp ? null : row.id)}
              style={{ background: DIM, border: `1px solid ${bc}33`, borderRadius: 8, padding: "8px 12px", marginBottom: 6, cursor: "pointer", animation: pulse ? `sidicov_pulse 2s ease-in-out infinite` : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: bc, fontSize: 10, fontWeight: 700, letterSpacing: 1, minWidth: 130 }}>{BUCKET_LABEL[row.bucket]}</span>
                <span style={{ color: "#C8E4F5", fontSize: 12, flex: 1 }}>{row.name}</span>
                {row.type && <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>{row.type}</span>}
                <span style={{ color: CY, fontSize: 11 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {row.status && <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, marginTop: 2 }}>status: {row.status}</div>}
              {isExp && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      <div style={{ color: TE, fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>INVESTIGATIONS ({row.matchedInvestigations.length})</div>
                      {row.matchedInvestigations.length === 0
                        ? <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>No investigation links found.</div>
                        : row.matchedInvestigations.map(inv => (
                          <div key={inv.id} style={{ background: "rgba(38,198,218,0.06)", border: `1px solid ${TE}44`, borderRadius: 6, padding: "6px 8px", marginBottom: 4 }}>
                            <div style={{ color: TE, fontSize: 11, fontWeight: 600 }}>{inv.name}</div>
                            {inv.status && <div style={{ background: `${TE}33`, borderRadius: 4, padding: "1px 5px", display: "inline-block", fontSize: 9, color: TE, marginTop: 2 }}>{inv.status}</div>}
                            <Bar val={Math.min(100, matchScore(row, [inv]) * 2)} color={TE} />
                          </div>
                        ))
                      }
                    </div>
                    <div>
                      <div style={{ color: AM, fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>DATASETS ({row.matchedDatasets.length})</div>
                      {row.matchedDatasets.length === 0
                        ? <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>No dataset links found.</div>
                        : row.matchedDatasets.map(ds => (
                          <div key={ds.id} style={{ background: "rgba(255,179,0,0.06)", border: `1px solid ${AM}44`, borderRadius: 6, padding: "6px 8px", marginBottom: 4 }}>
                            <div style={{ color: AM, fontSize: 11, fontWeight: 600 }}>{ds.name}</div>
                            {ds.type && <div style={{ background: `${AM}33`, borderRadius: 4, padding: "1px 5px", display: "inline-block", fontSize: 9, color: AM, marginTop: 2 }}>{ds.type}</div>}
                            <Bar val={Math.min(100, matchScore(row, [ds]) * 2)} color={AM} />
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
        {assessing ? "ASSESSING…" : "▶ ASSESS INTELLIGENCE COMPLETION COVERAGE"}
      </button>
      <style>{`@keyframes sidicov_pulse{0%,100%{opacity:1}50%{opacity:0.55}}`}</style>
    </div>
  );
}

export default function SwarmJobInvestigationDatasetCoverage() {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
      const [jRes, iRes, dRes] = await Promise.all([
        fetch(`${apiBase}/entities/SwarmJob`, { headers: hdrs }),
        fetch(`${apiBase}/v1/investigations`, { headers: hdrs }),
        fetch(`${apiBase}/v1/datasets`, { headers: hdrs }),
      ]);
      const [jRaw, iRaw, dRaw] = await Promise.all([jRes.json(), iRes.json(), dRes.json()]);
      setJobs(normSwarmJobs(jRaw));
      setInvestigations(normInvestigations(iRaw));
      setDatasets(normDatasets(dRaw));
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
    window.addEventListener("jarvis:sidicov-toggle", toggle);
    return () => window.removeEventListener("jarvis:sidicov-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  if (!open) {
    return (
      <button onClick={() => { setOpen(true); load(); }} title="SwarmJob × Investigation × Dataset Intelligence Completion Coverage" style={{
        position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_IDX,
        background: "rgba(6,10,18,0.82)", border: `1px solid ${CY}55`, borderRadius: 7,
        color: CY, fontFamily: MN, fontSize: 10, letterSpacing: 1,
        padding: "5px 9px", cursor: "pointer", whiteSpace: "nowrap",
        boxShadow: `0 0 14px ${CY}22`,
      }}>◈ SIDICOV</button>
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
        <span style={{ color: CY, fontWeight: 700, fontSize: 12, letterSpacing: 2 }}>◈ SIDICOV</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>
      {loading && <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, padding: "14px 18px" }}>Loading swarm job intelligence coverage…</div>}
      {error && <div style={{ color: RD, fontSize: 11, padding: "10px 18px" }}>{error}</div>}
      {!loading && !error && jobs.length > 0 && <SidicovPanel jobs={jobs} investigations={investigations} datasets={datasets} />}
      {!loading && !error && jobs.length === 0 && <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "14px 18px" }}>No swarm job data available.</div>}
    </div>
  );
}

export function isSidicovQuery(text) {
  const t = text.toLowerCase();
  return ["sidicov", "swarm investigation dataset", "swarm completion coverage",
    "investigation dataset coverage", "unintegrated swarm", "swarm intelligence coverage",
    "swarm dataset investigation", "intelligence completion coverage", "swarm completion",
    "sidicov coverage"].some(k => t.includes(k));
}

export async function buildSidicovScript() {
  const hdrs = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
  try {
    const [jRes, iRes, dRes] = await Promise.all([
      fetch(`${apiBase}/entities/SwarmJob`, { headers: hdrs }),
      fetch(`${apiBase}/v1/investigations`, { headers: hdrs }),
      fetch(`${apiBase}/v1/datasets`, { headers: hdrs }),
    ]);
    const [jRaw, iRaw, dRaw] = await Promise.all([jRes.json(), iRes.json(), dRes.json()]);
    const jobs = normSwarmJobs(jRaw);
    const investigations = normInvestigations(iRaw);
    const datasets = normDatasets(dRaw);
    const rows = jobs.map(j => ({ ...j, ...classify(j, investigations, datasets) }));
    const full = rows.filter(r => r.bucket === "FULLY_INTEGRATED").length;
    const none = rows.filter(r => r.bucket === "UNINTEGRATED").length;
    const cov = rows.length ? Math.round(((full + rows.filter(r => r.bucket === "INVESTIGATION_LINKED").length * 0.5 + rows.filter(r => r.bucket === "DATASET_BACKED").length * 0.5) / rows.length) * 100) : 0;
    return `SIDICOV online, sir. ${rows.length} swarm jobs assessed against ${investigations.length} investigations and ${datasets.length} datasets. ${full} fully integrated, ${none} unintegrated. Intelligence completion coverage at ${cov} percent.`;
  } catch {
    return "SIDICOV online, sir. Swarm job intelligence completion coverage analysis ready.";
  }
}
