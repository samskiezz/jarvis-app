import { useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const API_KEY = import.meta.env.VITE_JARVIS_API_KEY ?? "dev-key";
const BTN_LEFT = 227000;
const Z = 416;

export function isMsnbriefQuery(q) {
  const t = q.toLowerCase();
  return (
    t.includes("mission brief") || t.includes("msnbrief") ||
    t.includes("compose brief") || t.includes("brief composer") ||
    t.includes("mission summary") || t.includes("operational brief") ||
    t.includes("brief mission")
  );
}

export function buildMsnbriefScript(q) {
  return `Compose a concise mission brief for the query: "${q}". Return JSON with keys: objective, risks (array), personnel (array), automation (array), notes.`;
}

async function tts(text) {
  try {
    const r = await fetch(`${apiBase()}/v1/voice/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) return;
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    a.onended = () => URL.revokeObjectURL(url);
    a.play();
  } catch {}
}

export default function MissionBriefComposer() {
  const [open, setOpen] = useState(false);
  const [scenarios, setScenarios] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [tasks, setTasks] = useState([]);
  const [risks, setRisks] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [swarms, setSwarms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [briefHtml, setBriefHtml] = useState("");
  const [composing, setComposing] = useState(false);
  const [copied, setCopied] = useState(false);
  const briefTextRef = useRef("");

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:msnbrief-toggle", toggle);
    return () => window.removeEventListener("jarvis:msnbrief-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      fetch(`${apiBase()}/v1/scenario/list`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()).catch(() => []),
      fetch(`${apiBase()}/entities/Task`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()).catch(() => []),
      fetch(`${apiBase()}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()).catch(() => []),
      fetch(`${apiBase()}/entities/Contact`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()).catch(() => []),
      fetch(`${apiBase()}/entities/SwarmJob`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()).catch(() => []),
    ]).then(([sc, tk, rs, ct, sw]) => {
      const scArr = Array.isArray(sc) ? sc : (sc?.scenarios ?? sc?.items ?? []);
      const tkArr = Array.isArray(tk) ? tk : (tk?.items ?? tk?.tasks ?? []);
      const rsArr = Array.isArray(rs) ? rs : (rs?.items ?? rs?.risks ?? []);
      const ctArr = Array.isArray(ct) ? ct : (ct?.items ?? ct?.contacts ?? []);
      const swArr = Array.isArray(sw) ? sw : (sw?.items ?? sw?.jobs ?? []);
      setScenarios(scArr);
      setTasks(tkArr);
      setRisks(rsArr);
      setContacts(ctArr);
      setSwarms(swArr);
      if (scArr.length && !selectedId) setSelectedId(scArr[0]?.id ?? scArr[0]?.scenario_id ?? "");
    }).finally(() => setLoading(false));
  }, [open]);

  const selectedScenario = scenarios.find(s => (s.id ?? s.scenario_id) === selectedId);

  async function composeBrief() {
    if (!selectedScenario) return;
    setComposing(true);
    setBriefHtml("");
    briefTextRef.current = "";
    const scTitle = selectedScenario.title ?? selectedScenario.name ?? selectedId;
    const scDesc = selectedScenario.description ?? "";
    const keyWords = `${scTitle} ${scDesc}`.toLowerCase();

    const matchedTasks = tasks.filter(t => {
      const n = (t.title ?? t.name ?? "").toLowerCase();
      return keyWords.split(" ").some(w => w.length > 3 && n.includes(w));
    }).slice(0, 5);

    const matchedRisks = risks.filter(r => {
      const n = (r.title ?? r.signal ?? r.name ?? "").toLowerCase();
      return keyWords.split(" ").some(w => w.length > 3 && n.includes(w));
    }).slice(0, 5);

    const matchedContacts = contacts.filter(c => {
      const n = (c.name ?? c.title ?? "").toLowerCase();
      return keyWords.split(" ").some(w => w.length > 3 && n.includes(w));
    }).slice(0, 5);

    const matchedSwarms = swarms.filter(s => {
      const n = (s.name ?? s.title ?? s.job_type ?? "").toLowerCase();
      return keyWords.split(" ").some(w => w.length > 3 && n.includes(w));
    }).slice(0, 4);

    const contextMsg = [
      `SCENARIO: ${scTitle}`,
      scDesc ? `DESCRIPTION: ${scDesc}` : "",
      matchedTasks.length ? `TASKS: ${matchedTasks.map(t => t.title ?? t.name).join("; ")}` : "",
      matchedRisks.length ? `RISK SIGNALS: ${matchedRisks.map(r => r.title ?? r.signal ?? r.name).join("; ")}` : "",
      matchedContacts.length ? `PERSONNEL: ${matchedContacts.map(c => c.name ?? c.title).join("; ")}` : "",
      matchedSwarms.length ? `AUTOMATION: ${matchedSwarms.map(s => s.name ?? s.title ?? s.job_type).join("; ")}` : "",
      "",
      "Compose a structured MISSION BRIEF with sections: OBJECTIVE, RISKS, PERSONNEL, AUTOMATION, NOTES. Be concise and operational.",
    ].filter(Boolean).join("\n");

    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: contextMsg }),
      });
      const d = await r.json();
      const raw = (d.answer ?? d.response ?? "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      briefTextRef.current = raw;
      setBriefHtml(raw.replace(/\n/g, "<br/>").replace(/(OBJECTIVE|RISKS|PERSONNEL|AUTOMATION|NOTES):/g, '<span style="color:#00d4ff;font-weight:700">$1:</span>'));
    } catch {
      setBriefHtml('<span style="color:#ff4444">// Failed to reach reasoning core.</span>');
    }
    setComposing(false);
  }

  async function assessAndSpeak() {
    const scTitle = selectedScenario?.title ?? selectedScenario?.name ?? selectedId;
    const msg = briefTextRef.current
      ? `Mission brief composed for scenario "${scTitle}". ${briefTextRef.current.slice(0, 300)}`
      : `Mission Brief Composer open. ${scenarios.length} scenarios loaded. ${risks.length} risk signals indexed.`;
    const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ message: `ASSESS: ${msg}` }),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    const out = (d.answer ?? msg).replace(/<<ACTION:[^>]*>>/g, "").trim();
    await tts(out);
  }

  async function speakBrief() {
    if (!briefTextRef.current) return;
    await tts(briefTextRef.current.slice(0, 800));
  }

  function copyBrief() {
    if (!briefTextRef.current) return;
    navigator.clipboard.writeText(briefTextRef.current).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z,
          background: "rgba(0,212,255,0.12)", border: "1px solid rgba(0,212,255,0.45)",
          color: "#00d4ff", fontFamily: "monospace", fontSize: 11, padding: "3px 8px",
          borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap",
        }}
        title="Mission Brief Composer"
      >
        ◈ MSNBRIEF
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 40, right: 20, width: 560, maxHeight: "88vh",
      background: "rgba(6,16,26,0.97)", border: "1px solid rgba(0,212,255,0.35)",
      borderRadius: 8, zIndex: Z, display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: "#cce8f0", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid rgba(0,212,255,0.2)", background: "rgba(0,212,255,0.06)" }}>
        <span style={{ color: "#00d4ff", fontWeight: 700, fontSize: 13 }}>◈ MISSION BRIEF COMPOSER</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#00d4ff", cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        {loading ? (
          <div style={{ color: "#00d4ff", opacity: 0.7 }}>Loading scenarios…</div>
        ) : (
          <>
            {/* Scenario selector */}
            <div>
              <div style={{ fontSize: 11, color: "#00d4ff", marginBottom: 4 }}>SCENARIO ({scenarios.length})</div>
              <select
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
                style={{ width: "100%", background: "rgba(0,30,50,0.9)", color: "#cce8f0", border: "1px solid rgba(0,212,255,0.3)", borderRadius: 4, padding: "5px 8px", fontFamily: "monospace", fontSize: 12 }}
              >
                {scenarios.length === 0 && <option value="">— no scenarios —</option>}
                {scenarios.map(s => {
                  const id = s.id ?? s.scenario_id ?? s.name;
                  const label = s.title ?? s.name ?? id;
                  return <option key={id} value={id}>{label}</option>;
                })}
              </select>
            </div>

            {/* Context stats */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { label: "TASKS", val: tasks.length, color: "#0f8" },
                { label: "RISKS", val: risks.length, color: "#f80" },
                { label: "PERSONNEL", val: contacts.length, color: "#0af" },
                { label: "AUTOMATION", val: swarms.length, color: "#c8f" },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ background: "rgba(0,212,255,0.05)", border: `1px solid ${color}33`, borderRadius: 4, padding: "4px 10px", minWidth: 90 }}>
                  <div style={{ fontSize: 9, color, opacity: 0.8, marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                </div>
              ))}
            </div>

            {/* Compose button */}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={composeBrief}
                disabled={composing || !selectedId}
                style={{ flex: 1, background: composing ? "rgba(0,212,255,0.08)" : "rgba(0,212,255,0.18)", border: "1px solid rgba(0,212,255,0.5)", color: "#00d4ff", fontFamily: "monospace", fontSize: 12, padding: "7px 0", borderRadius: 4, cursor: composing ? "default" : "pointer" }}
              >
                {composing ? "COMPOSING…" : "COMPOSE BRIEF"}
              </button>
              <button
                onClick={assessAndSpeak}
                style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.3)", color: "#00d4ff", fontFamily: "monospace", fontSize: 11, padding: "7px 10px", borderRadius: 4, cursor: "pointer" }}
                title="ASSESS + TTS"
              >
                ▶ ASSESS
              </button>
            </div>

            {/* Brief output */}
            {briefHtml && (
              <div>
                <div style={{ fontSize: 11, color: "#00d4ff", marginBottom: 6 }}>MISSION BRIEF</div>
                <div
                  style={{ background: "rgba(0,20,35,0.95)", border: "1px solid rgba(0,212,255,0.2)", borderRadius: 4, padding: "10px 12px", fontSize: 12, lineHeight: 1.65, maxHeight: 320, overflowY: "auto", whiteSpace: "pre-wrap" }}
                  dangerouslySetInnerHTML={{ __html: briefHtml }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button
                    onClick={speakBrief}
                    style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.3)", color: "#00d4ff", fontFamily: "monospace", fontSize: 11, padding: "5px 12px", borderRadius: 4, cursor: "pointer" }}
                  >
                    ◉ SPEAK BRIEF
                  </button>
                  <button
                    onClick={copyBrief}
                    style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.3)", color: copied ? "#0f8" : "#00d4ff", fontFamily: "monospace", fontSize: 11, padding: "5px 12px", borderRadius: 4, cursor: "pointer" }}
                  >
                    {copied ? "✓ COPIED" : "⎘ COPY"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
