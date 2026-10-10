import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const AM = "#FFB300"; const GN = "#4CAF50"; const RD = "#FF3D3D";
const CY = "#00E5FF"; const OR = "#FF9800"; const PU = "#CE93D8";
const TE = "#26C6DA"; const YL = "#FFF176";
const DIM = "rgba(255,255,255,0.04)"; const BG = "rgba(6,10,18,0.94)";
const MN = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) || "dev-key";
const REFRESH_MS = 90_000;
const BTN_LEFT = 1107360;
const Z_IDX = 693;

function normContacts(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.contacts || raw?.items || raw?.data || []);
  return arr.map((c, i) => ({
    id: c.id || c._id || `ct${i}`,
    name: c.name || c.full_name || c.display_name || `Contact ${i + 1}`,
    role: c.role || c.job_title || c.title || "",
    org: c.organization || c.org || c.company || "",
    tags: Array.isArray(c.tags) ? c.tags : [],
    desc: c.description || c.notes || c.bio || "",
  }));
}

function normScenarios(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.scenarios || raw?.items || raw?.data || []);
  return arr.map((s, i) => ({
    id: s.id || s._id || `sc${i}`,
    name: s.name || s.title || s.scenario_name || `Scenario ${i + 1}`,
    type: s.type || s.category || s.scenario_type || "",
    tags: Array.isArray(s.tags) ? s.tags : [],
    desc: s.description || s.summary || "",
  }));
}

function normKnowledge(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.articles || raw?.items || raw?.data || raw?.results || []);
  return arr.map((k, i) => ({
    id: k.id || k._id || `kb${i}`,
    title: k.title || k.name || `Article ${i + 1}`,
    category: k.category || k.type || k.domain || "",
    tags: Array.isArray(k.tags) ? k.tags : [],
    content: k.content || k.summary || k.body || k.description || "",
  }));
}

function normRiskSignals(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.signals || raw?.items || raw?.data || []);
  return arr.map((r, i) => ({
    id: r.id || r._id || `rs${i}`,
    name: r.name || r.title || r.signal_name || `Signal ${i + 1}`,
    severity: r.severity || r.level || r.priority || "medium",
    type: r.type || r.category || "",
    tags: Array.isArray(r.tags) ? r.tags : [],
    desc: r.description || r.summary || r.details || "",
  }));
}

function kw(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2); }

function overlap(aWords, bText) {
  const bWords = kw(bText);
  return aWords.filter(w => bWords.includes(w)).length;
}

function matchScore(contact, targets) {
  const cWords = kw(`${contact.name} ${contact.role} ${contact.org} ${contact.tags.join(" ")} ${contact.desc}`);
  if (!cWords.length) return 0;
  const best = targets.reduce((mx, t) => {
    const tText = t.title || t.name || t.desc || t.content || t.description || "";
    const score = overlap(cWords, `${tText} ${(t.tags || []).join(" ")} ${t.category || t.type || ""}`);
    return Math.max(mx, score);
  }, 0);
  return Math.min(100, Math.round((best / Math.max(cWords.length, 1)) * 200));
}

function classify(contact, scenarios, knowledge, signals) {
  const scScore = matchScore(contact, scenarios);
  const kbScore = matchScore(contact, knowledge);
  const rsScore = matchScore(contact, signals);
  const hits = [scScore > 10, kbScore > 10, rsScore > 10].filter(Boolean).length;
  return {
    bucket: hits >= 3 ? "FULLY_BRIDGED" : hits === 2 ? "DUAL_BRIDGED" : hits === 1 ? "SINGLE_LINKED" : "ISOLATED",
    scScore, kbScore, rsScore,
    topScenario: scenarios.slice().sort((a, b) => matchScore(contact, [b]) - matchScore(contact, [a]))[0] || null,
    topKb: knowledge.slice().sort((a, b) => matchScore(contact, [b]) - matchScore(contact, [a]))[0] || null,
    topSignal: signals.slice().sort((a, b) => matchScore(contact, [b]) - matchScore(contact, [a]))[0] || null,
    matchedScenarios: scenarios.filter(s => matchScore(contact, [s]) > 10).slice(0, 3),
    matchedKb: knowledge.filter(k => matchScore(contact, [k]) > 10).slice(0, 3),
    matchedSignals: signals.filter(s => matchScore(contact, [s]) > 10).slice(0, 3),
  };
}

function Bar({ val, color }) {
  return (
    <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden", margin: "2px 0" }}>
      <div style={{ width: `${val}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.4s" }} />
    </div>
  );
}

function CsksrbPanel({ contacts, scenarios, knowledge, signals }) {
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");

  const rows = contacts.map(c => ({ ...c, ...classify(c, scenarios, knowledge, signals) }));

  const totals = {
    fully: rows.filter(r => r.bucket === "FULLY_BRIDGED").length,
    dual: rows.filter(r => r.bucket === "DUAL_BRIDGED").length,
    single: rows.filter(r => r.bucket === "SINGLE_LINKED").length,
    isolated: rows.filter(r => r.bucket === "ISOLATED").length,
  };
  const cov = rows.length ? Math.round(((totals.fully + totals.dual * 0.6 + totals.single * 0.3) / rows.length) * 100) : 0;

  const filtered = rows.filter(r =>
    (filter === "ALL" || r.bucket === filter) &&
    (!search || `${r.name} ${r.role} ${r.org}`.toLowerCase().includes(search.toLowerCase()))
  );

  const TABS = ["ALL", "FULLY_BRIDGED", "DUAL_BRIDGED", "SINGLE_LINKED", "ISOLATED"];
  const BUCKET_COLORS = { FULLY_BRIDGED: GN, DUAL_BRIDGED: CY, SINGLE_LINKED: AM, ISOLATED: RD };

  const assess = async () => {
    setAssessing(true);
    setAssessment("");
    try {
      const base = apiBase();
      const h = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
      const prompt = `CSKSRB Contact Intelligence Bridge: ${rows.length} contacts analysed. ${totals.fully} fully bridged across scenario/knowledge/risk, ${totals.isolated} isolated with no coverage. Coverage score: ${cov}%. Summarise top bridge gaps and recommended actions in 2 sentences.`;
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers: h,
        body: JSON.stringify({ message: prompt }),
      }).then(r => r.json()).catch(() => null);
      const txt = res?.response || res?.content || res?.message || "Analysis complete.";
      setAssessment(txt);
      const voice = getActiveVoice ? getActiveVoice() : "nova";
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST", headers: h,
        body: JSON.stringify({ text: txt.slice(0, 300), voice }),
      }).catch(() => null);
    } catch { setAssessment("Assessment unavailable."); }
    setAssessing(false);
  };

  return (
    <div>
      {/* Stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
        {[
          ["CONTACTS", rows.length, CY],
          ["SCENARIOS", scenarios.length, YL],
          ["KNOWLEDGE", knowledge.length, PU],
          ["RISK SIGS", signals.length, OR],
          ["FULLY BRIDGED", totals.fully, GN],
          ["DUAL BRIDGED", totals.dual, CY],
          ["SINGLE LINKED", totals.single, AM],
          ["ISOLATED", totals.isolated, RD],
        ].map(([label, val, col]) => (
          <div key={label} style={{ background: DIM, border: `1px solid ${col}33`, borderRadius: 6, padding: "5px 7px", textAlign: "center" }}>
            <div style={{ color: col, fontFamily: MN, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#8099AA", fontSize: 8 }}>{label}</div>
          </div>
        ))}
      </div>
      {/* COV% */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ color: "#8099AA", fontFamily: MN, fontSize: 9 }}>BRIDGE COV%</span>
        <div style={{ flex: 1 }}><Bar val={cov} color={cov >= 70 ? GN : cov >= 40 ? AM : RD} /></div>
        <span style={{ color: cov >= 70 ? GN : cov >= 40 ? AM : RD, fontFamily: MN, fontSize: 10, fontWeight: 700 }}>{cov}%</span>
        {totals.isolated > 0 && (
          <span style={{ background: RD, color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 9, fontWeight: 700 }}>{totals.isolated} ISOLATED</span>
        )}
      </div>
      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setFilter(t)} style={{
            padding: "2px 8px", borderRadius: 4, border: `1px solid ${filter === t ? CY : "#334"}`,
            background: filter === t ? `${CY}22` : "transparent",
            color: filter === t ? CY : "#8099AA", fontFamily: MN, fontSize: 9, cursor: "pointer"
          }}>{t.replace("_", " ")}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search contacts…"
          style={{ flex: 1, minWidth: 100, background: DIM, border: "1px solid #334", borderRadius: 4, color: "#ccc", fontFamily: MN, fontSize: 9, padding: "2px 6px" }} />
      </div>
      {/* Rows */}
      <div style={{ maxHeight: 320, overflowY: "auto" }}>
        {filtered.map(r => (
          <div key={r.id} style={{
            borderRadius: 6, marginBottom: 4,
            border: `1px solid ${BUCKET_COLORS[r.bucket]}33`,
            background: r.bucket === "ISOLATED" ? `${RD}08` : DIM,
            animation: r.bucket === "ISOLATED" ? "pulse-red 2s infinite" : "none",
          }}>
            <div onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", cursor: "pointer" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: BUCKET_COLORS[r.bucket], flexShrink: 0 }} />
              <span style={{ color: "#ddd", fontFamily: MN, fontSize: 10, flex: 1 }}>{r.name}</span>
              <span style={{ color: "#8099AA", fontSize: 9 }}>{r.role || r.org || ""}</span>
              <span style={{ color: BUCKET_COLORS[r.bucket], fontFamily: MN, fontSize: 9, fontWeight: 700 }}>{r.bucket.replace("_", " ")}</span>
            </div>
            {expanded === r.id && (
              <div style={{ padding: "0 8px 8px 24px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 6 }}>
                  {[["SC", r.scScore, YL], ["KB", r.kbScore, PU], ["RS", r.rsScore, OR]].map(([lbl, sc, col]) => (
                    <div key={lbl} style={{ background: DIM, borderRadius: 4, padding: "4px 6px" }}>
                      <div style={{ color: "#8099AA", fontSize: 8 }}>{lbl} RELEVANCE</div>
                      <Bar val={sc} color={col} />
                      <div style={{ color: col, fontFamily: MN, fontSize: 10 }}>{sc}%</div>
                    </div>
                  ))}
                </div>
                {r.matchedScenarios.length > 0 && (
                  <div style={{ marginBottom: 5 }}>
                    <div style={{ color: YL, fontSize: 9, marginBottom: 3 }}>▸ MATCHED SCENARIOS</div>
                    {r.matchedScenarios.map(s => (
                      <div key={s.id} style={{ background: `${YL}11`, border: `1px solid ${YL}33`, borderRadius: 4, padding: "3px 6px", marginBottom: 2, fontSize: 9, color: "#ccc" }}>
                        <span style={{ color: YL, fontWeight: 700 }}>{s.name}</span>
                        {s.type && <span style={{ color: "#8099AA", marginLeft: 6 }}>[{s.type}]</span>}
                      </div>
                    ))}
                  </div>
                )}
                {r.matchedKb.length > 0 && (
                  <div style={{ marginBottom: 5 }}>
                    <div style={{ color: PU, fontSize: 9, marginBottom: 3 }}>▸ MATCHED KNOWLEDGE</div>
                    {r.matchedKb.map(k => (
                      <div key={k.id} style={{ background: `${PU}11`, border: `1px solid ${PU}33`, borderRadius: 4, padding: "3px 6px", marginBottom: 2, fontSize: 9, color: "#ccc" }}>
                        <span style={{ color: PU, fontWeight: 700 }}>{k.title}</span>
                        {k.category && <span style={{ color: "#8099AA", marginLeft: 6 }}>[{k.category}]</span>}
                      </div>
                    ))}
                  </div>
                )}
                {r.matchedSignals.length > 0 && (
                  <div style={{ marginBottom: 5 }}>
                    <div style={{ color: OR, fontSize: 9, marginBottom: 3 }}>▸ MATCHED RISK SIGNALS</div>
                    {r.matchedSignals.map(s => (
                      <div key={s.id} style={{ background: `${OR}11`, border: `1px solid ${OR}33`, borderRadius: 4, padding: "3px 6px", marginBottom: 2, fontSize: 9, color: "#ccc" }}>
                        <span style={{ color: OR, fontWeight: 700 }}>{s.name}</span>
                        {s.severity && <span style={{ color: s.severity === "high" || s.severity === "critical" ? RD : AM, marginLeft: 6 }}>[{s.severity}]</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <div style={{ color: "#8099AA", fontSize: 10, textAlign: "center", padding: 12 }}>No contacts match filter.</div>}
      </div>
      {/* Assess button */}
      <button onClick={assess} disabled={assessing} style={{
        marginTop: 8, width: "100%", padding: "6px 0", borderRadius: 6,
        border: `1px solid ${CY}88`, background: assessing ? `${CY}08` : `${CY}18`,
        color: CY, fontFamily: MN, fontSize: 10, cursor: assessing ? "not-allowed" : "pointer",
      }}>{assessing ? "ASSESSING…" : "▶ ASSESS CONTACT BRIDGE"}</button>
      {assessment && (
        <div style={{ marginTop: 6, padding: "6px 8px", borderRadius: 6, background: `${CY}0A`, border: `1px solid ${CY}33`, color: "#ccc", fontFamily: MN, fontSize: 10 }}>
          {assessment}
        </div>
      )}
      <style>{`@keyframes pulse-red { 0%,100%{box-shadow:0 0 0 0 ${RD}00} 50%{box-shadow:0 0 6px 2px ${RD}55} }`}</style>
    </div>
  );
}

function CsksrbInner() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const h = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
      const [ctRaw, scRaw, kbRaw, rsRaw] = await Promise.all([
        fetch(`${base}/entities/Contact`, { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/scenario/list`, { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/knowledge/`, { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/entities/RiskSignal`, { headers: h }).then(r => r.json()).catch(() => []),
      ]);
      setData({
        contacts: normContacts(ctRaw),
        scenarios: normScenarios(scRaw),
        knowledge: normKnowledge(kbRaw),
        signals: normRiskSignals(rsRaw),
      });
    } catch { setData(null); }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT, bottom: 48, zIndex: Z_IDX,
      width: 560, maxHeight: "80vh", overflowY: "auto",
      background: BG, border: `1px solid ${CY}44`, borderRadius: 12,
      padding: 14, backdropFilter: "blur(12px)",
      boxShadow: `0 4px 32px ${RD}22`
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ color: CY, fontFamily: MN, fontSize: 12, fontWeight: 700 }}>◈ CSKSRB — Contact Intelligence Bridge</span>
        <span style={{ color: "#8099AA", fontSize: 9 }}>Contact × Scenario × Knowledge × RiskSignal</span>
      </div>
      {loading && !data && <div style={{ color: "#8099AA", fontSize: 11, textAlign: "center", padding: 20 }}>Loading CSKSRB data…</div>}
      {data && <CsksrbPanel contacts={data.contacts} scenarios={data.scenarios} knowledge={data.knowledge} signals={data.signals} />}
    </div>
  );
}

export async function isCsksrbQuery(q) {
  const lower = q.toLowerCase();
  return ["csksrb", "contact bridge", "contact scenario", "scenario knowledge risk", "isolated contact",
    "contact knowledge bridge", "contact risk signal", "contact scenario coverage", "contact intelligence bridge",
    "scenario knowledge contact", "risk signal contact"].some(kw => lower.includes(kw));
}

export async function buildCsksrbScript() {
  try {
    const base = apiBase();
    const h = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
    const [ctRaw, scRaw, kbRaw, rsRaw] = await Promise.all([
      fetch(`${base}/entities/Contact`, { headers: h }).then(r => r.json()).catch(() => []),
      fetch(`${base}/v1/scenario/list`, { headers: h }).then(r => r.json()).catch(() => []),
      fetch(`${base}/knowledge/`, { headers: h }).then(r => r.json()).catch(() => []),
      fetch(`${base}/entities/RiskSignal`, { headers: h }).then(r => r.json()).catch(() => []),
    ]);
    const contacts = normContacts(ctRaw);
    const scenarios = normScenarios(scRaw);
    const knowledge = normKnowledge(kbRaw);
    const signals = normRiskSignals(rsRaw);
    const rows = contacts.map(c => ({ ...c, ...classify(c, scenarios, knowledge, signals) }));
    const isolated = rows.filter(r => r.bucket === "ISOLATED").length;
    const cov = rows.length ? Math.round(((rows.filter(r => r.bucket === "FULLY_BRIDGED").length + rows.filter(r => r.bucket === "DUAL_BRIDGED").length * 0.6 + rows.filter(r => r.bucket === "SINGLE_LINKED").length * 0.3) / rows.length) * 100) : 0;
    return `CSKSRB Contact Intelligence Bridge online, sir. ${contacts.length} contacts cross-correlated against ${scenarios.length} scenarios, ${knowledge.length} knowledge articles, and ${signals.length} risk signals. Bridge coverage at ${cov}%. ${isolated} contacts are fully isolated with no scenario, knowledge, or risk signal linkage.`;
  } catch {
    return "CSKSRB Contact Intelligence Bridge online, sir. Correlating contacts against scenarios, knowledge base, and risk signals.";
  }
}

export default function ContactScenarioKnowledgeRiskBridge() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:csksrb-toggle", onToggle);
    return () => window.removeEventListener("jarvis:csksrb-toggle", onToggle);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="CSKSRB: Contact × Scenario × Knowledge × RiskSignal Bridge"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_IDX,
          padding: "3px 10px", borderRadius: 5,
          border: `1px solid ${CY}88`, background: `${CY}18`,
          color: CY, fontFamily: MN, fontSize: 10, cursor: "pointer",
          whiteSpace: "nowrap"
        }}
      >◈ CSKSRB</button>
      {open && <CsksrbInner />}
    </>
  );
}
