import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiBase } from "@/api/cinematicDataAdapters";
import { isStatusQuery, buildStatusScript } from "./SpokenStatusReport";
import { isAlertQuery, buildAlertScript } from "./AlertToasts";
import { isInvScenLinkerQuery, buildInvScenLinkerScript } from "./InvestigationScenarioLinker";
import { isShowMeQuery, resolveShowMeQuery } from "./ShowMeNavigation";
import { isClockQuery, buildClockScript } from "./LiveClockUptime";
import { isInvestmentQuery, buildInvestmentScript } from "./InvestmentWidget";
import { isContactsQuery, buildContactsScript } from "./ContactsDirectory";
import { isSwarmQuery, buildSwarmScript } from "./SwarmJobsMonitor";
import { isCentralityQuery, buildCentralityScript } from "./GraphCentralityView";
import { isOpsCoverageQuery, buildOpsCoverageScript } from "./OpsTaskCoverageChecker";
import { isDataGapQuery, buildDataGapScript } from "./DatasetInvestigationGap";
import { isInvPipeQuery, buildInvPipeScript } from "./InvestigationScenarioTaskPipeline";
import { isRisGapQuery, buildRisGapScript } from "./RiskInvestigationMatrix";
import { isPulseQuery, buildPulseScript } from "./OperationalPulseRing";
import { isSkillProgressQuery, buildSkillProgressScript } from "./SkillProgressionTracker";
import { isSkasQuery, buildSkasScript } from "./AipSkillScenarioCoverage";
import { isToolRegistryQuery, buildToolRegistryScript } from "./AgentToolRegistry";
import { isBssfQuery, buildBssfScript } from "./BrainSystemStatusFusion";
import { isKbeQuery, buildKbeScript } from "./KnowledgeBaseExplorer";
import { isCilQuery, buildCilScript } from "./ContactInvestmentLinker";
import { isPathQuery, buildPathScript } from "./GraphPathExplorer";
import { isOpsKnowQuery, buildOpsKnowScript } from "./OpsEventKnowledgeGap";
import { isAsicQuery, buildAsicScript } from "./AipSkillInvestigationCoverage";
import { isSwdpQuery, buildSwdpScript } from "./SwarmDatasetProvenance";
import { isLitaQuery, buildLitaScript } from "./LiveIntelTaskActivator";
import { isIdepcQuery, buildIdepcScript } from "./IntelProfileDatasetEvidence";

/**
 * JarvisBrain — gives JARVIS a living presence across the cinematic HUD.
 * Mounted once (inside the Router). It:
 *   • listens for the `jarvis:ask` event the command bar already dispatches (detail.text|query)
 *   • + a floating mic button (en-GB speech-to-text)
 *   • routes navigation intents INSTANTLY (deterministic keyword map → scene)
 *   • gets a persona answer from the real agent (/v1/jarvis/agent/chat — grounded in live data)
 *   • SPEAKS it in the JARVIS British-butler voice (/v1/voice/tts → OpenAI gpt-4o-mini-tts)
 *   • shows a fancy typed response card with a pulsing core + speaking indicator
 * Self-contained — no edits to the live-iterated CinematicShell/Home.
 */
const CY = "#29E7FF";
const API_KEY = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_KEY) || "dev-key";

const SCENE_INTENTS = [
  [/command|atrium|overview|dashboard|briefing/i, "01_command_atrium"],
  [/ai ?core|reasoning|neural|cognition|think/i, "02_ai_core_chamber"],
  [/world|earth|globe|geo|\bmap\b|countr|cities|incident/i, "03_world_control_room"],
  [/graph|network|entit|\blink|constellation|investigat|ontolog/i, "04_intelligence_graph_space"],
  [/operation|war ?room|mission|\bcase|fleet|rollout/i, "05_operations_war_room"],
  [/fusion|reactor|pipeline|\bsource|dataset|ingest|catalog/i, "06_data_fusion_reactor"],
  [/document|vault|report|patent|knowledge|dossier/i, "07_document_intelligence_vault"],
  [/simulation|scenario|predict|theatre|theater|forecast/i, "08_simulation_theatre"],
  [/analytic|observatory|trend|\bkpi|metric|\bchart|market/i, "09_analytics_observatory"],
  [/security|shield|access|admin|governance|audit|permission/i, "10_system_security_core"],
];
const SCENE_LABEL = {
  "01_command_atrium": "Command Atrium", "02_ai_core_chamber": "AI Core Chamber",
  "03_world_control_room": "World Control Room", "04_intelligence_graph_space": "Intelligence Graph",
  "05_operations_war_room": "Operations War Room", "06_data_fusion_reactor": "Data Fusion Reactor",
  "07_document_intelligence_vault": "Document Vault", "08_simulation_theatre": "Simulation Theatre",
  "09_analytics_observatory": "Analytics Observatory", "10_system_security_core": "System Security Core",
};
function detectScene(t) {
  for (const [re, id] of SCENE_INTENTS) if (re.test(t || "")) return id;
  return null;
}

export default function JarvisBrain() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const audioRef = useRef(null);
  const hideT = useRef(null);
  const typeT = useRef(null);

  async function speak(answer) {
    try {
      const r = await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: answer }),
      });
      if (!r.ok) return;
      const url = URL.createObjectURL(await r.blob());
      try { audioRef.current?.pause(); } catch {}
      const a = new Audio(url); audioRef.current = a;
      a.onplay = () => setSpeaking(true);
      a.onended = () => { setSpeaking(false); URL.revokeObjectURL(url); };
      a.play().catch(() => setSpeaking(false));
    } catch {}
  }

  function typeOut(answer) {
    clearInterval(typeT.current); setText(""); let i = 0;
    typeT.current = setInterval(() => {
      i += 2; setText(answer.slice(0, i));
      if (i >= answer.length) clearInterval(typeT.current);
    }, 18);
  }

  async function ask(q) {
    if (!q || !q.trim()) return;
    // F20: "show me X" / "open X" / "view X" → re-route to the matching panel's keyword.
    if (isShowMeQuery(q)) {
      const resolved = resolveShowMeQuery(q);
      window.dispatchEvent(new CustomEvent("jarvis:ask", { detail: { text: resolved } }));
      return;
    }
    clearTimeout(hideT.current);
    setOpen(true); setThinking(true); setText("");
    const scene = detectScene(q);
    if (scene) navigate(`/cinematic/${scene}`);
    if (isClockQuery(q)) {
      const script = await buildClockScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(6000, script.length * 70));
      return;
    }
    // F05: status queries bypass the agent and speak real telemetry directly.
    if (isStatusQuery(q)) {
      let script = "";
      try { script = await buildStatusScript(); } catch { script = "Status telemetry unavailable at this time, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F22: alert queries speak the live ops alert summary directly.
    if (isAlertQuery(q)) {
      let script = "";
      try { script = await buildAlertScript(); } catch { script = "Alert feed unavailable at this time, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isInvScenLinkerQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:inv-scen-link-toggle"));
      const script = await buildInvScenLinkerScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F23: investment/wealth queries speak a live portfolio brief directly.
    if (isInvestmentQuery(q)) {
      let script = "";
      try { script = await buildInvestmentScript(); } catch { script = "Portfolio data unavailable at this time, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F24: contacts/people/directory queries speak a live directory brief directly.
    if (isContactsQuery(q)) {
      let script = "";
      try { script = await buildContactsScript(); } catch { script = "Contacts directory unavailable at this time, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F25: swarm jobs queries open the monitor and speak a live swarm brief directly.
    if (isSwarmQuery(q)) {
      let script = "";
      try { script = await buildSwarmScript(); } catch { script = "Swarm jobs data unavailable at this time, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F26: centrality queries open the graph centrality view and speak a live influence brief.
    if (isCentralityQuery(q)) {
      let script = "";
      try { script = await buildCentralityScript(); } catch { script = "Graph centrality data unavailable at this time, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F32: ops-task coverage — dispatch toggle + speak live coverage summary.
    if (isOpsCoverageQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ops-coverage-toggle"));
      let script = "";
      try { script = await buildOpsCoverageScript(); } catch { script = "Ops-task coverage checker is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F33: dataset-investigation gap — dispatch toggle + speak live data-gap summary.
    if (isDataGapQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:datagap-toggle"));
      let script = "";
      try { script = await buildDataGapScript(); } catch { script = "Dataset-investigation gap checker is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isInvPipeQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:invpipe-toggle"));
      let script = "";
      try { script = await buildInvPipeScript(); } catch { script = "Investigation resolution pipeline is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isRisGapQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:risgap-toggle"));
      let script = "";
      try { script = await buildRisGapScript(); } catch { script = "Risk-investigation matrix is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isPulseQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:pulse-show"));
      const script = buildPulseScript(null);
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(7000, script.length * 70));
      return;
    }
    if (isSkillProgressQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:skillp-toggle"));
      let script = "";
      try { script = await buildSkillProgressScript(); } catch { script = "Skill progression tracker is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isSkasQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:skas-toggle"));
      let script = "";
      try { script = await buildSkasScript(); } catch { script = "AIP skill scenario coverage analysis is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isToolRegistryQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:atr-toggle"));
      let script = "";
      try { script = await buildToolRegistryScript(); } catch { script = "Tool registry is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isBssfQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:bssf-toggle"));
      let script = "";
      try { script = await buildBssfScript(); } catch { script = "Brain system fusion standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isKbeQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:kbe-toggle"));
      let script = "";
      try { script = await buildKbeScript(); } catch { script = "Knowledge base explorer is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isCilQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cil-toggle"));
      let script = "";
      try { script = await buildCilScript(); } catch { script = "Contact investment linker is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isOpsKnowQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:opknow-toggle"));
      let script = "";
      try { script = await buildOpsKnowScript(); } catch { script = "Ops knowledge gap analysis is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isPathQuery(q)) {
      let script = "";
      try { script = await buildPathScript(q); } catch { script = "Graph path explorer is standing by. Say path from X to Y to trace a connection, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isAsicQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:asic-toggle"));
      let script = "";
      try { script = await buildAsicScript(); } catch { script = "AIP skill investigation coverage analysis is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isSwdpQuery(q)) {
      let script = "";
      try { script = await buildSwdpScript(); } catch { script = "Swarm dataset provenance panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isLitaQuery(q)) {
      let script = "";
      try { script = await buildLitaScript(); } catch { script = "Live intel task activation panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isIdepcQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:idepc-toggle"));
      let script = "";
      try { script = await buildIdepcScript(); } catch { script = "Intel profile dataset evidence coverage is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    let answer = "";
    try {
      const pageContext = { route: window.location.pathname, scene };
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: q, page_context: pageContext }),
      });
      const d = await r.json();
      answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
    } catch {
      answer = "I'm afraid I couldn't reach my reasoning core just now, sir.";
    }
    if (scene && !answer) answer = `Summoning the ${SCENE_LABEL[scene]}, sir.`;
    if (!answer) answer = "At your service, sir.";
    setThinking(false); typeOut(answer); speak(answer);
    hideT.current = setTimeout(() => setOpen(false), Math.max(9000, answer.length * 70));
  }

  useEffect(() => {
    const onAsk = (e) => {
      // JarvisAssistant owns chat on /apex routes; avoid duplicate handling there.
      if (typeof window !== "undefined" && window.location.pathname.startsWith("/apex")) return;
      const q = e?.detail?.text || e?.detail?.query;
      if (q) ask(q);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  function mic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { ask("are you online"); return; }
    const r = new SR(); r.lang = "en-GB"; r.interimResults = false; r.maxAlternatives = 1;
    setListening(true);
    r.onresult = (e) => { setListening(false); ask(e.results[0][0].transcript); };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    try { r.start(); } catch { setListening(false); }
  }

  return (
    <>
      <button onClick={mic} title="Speak to JARVIS" style={{
        position: "fixed", right: 18, bottom: 18, zIndex: 70, width: 54, height: 54, borderRadius: "50%",
        border: `1px solid ${CY}`, cursor: "pointer", background: listening ? CY : "rgba(5,8,13,0.7)",
        color: listening ? "#04060A" : CY, boxShadow: `0 0 22px ${CY}${listening ? "" : "66"}`,
        fontSize: 20, backdropFilter: "blur(6px)" }}>◉</button>

      {open && (
        <div style={{
          position: "fixed", right: 18, bottom: 84, zIndex: 70, width: "min(420px,86vw)",
          background: "rgba(8,14,22,0.86)", border: `1px solid ${CY}55`, borderRadius: 14, padding: "14px 16px",
          backdropFilter: "blur(10px)", boxShadow: `0 0 50px ${CY}22`,
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: CY, boxShadow: `0 0 14px ${CY}`,
              animation: (thinking || speaking) ? "jpulse 1s ease-in-out infinite" : "none" }} />
            <b style={{ color: CY, letterSpacing: 3, fontSize: 12, textShadow: `0 0 12px ${CY}` }}>JARVIS</b>
            {speaking && <span style={{ marginLeft: "auto", fontSize: 10, color: CY, letterSpacing: 1 }}>◍ speaking</span>}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.5, minHeight: 18 }}>
            {thinking ? <span style={{ color: "#6E8AA0" }}>consulting the knowledge graph…</span> : text}
            {(!thinking && text) && <span style={{ color: CY }}>▌</span>}
          </div>
        </div>
      )}
      <style>{`@keyframes jpulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.5);opacity:.5}}`}</style>
    </>
  );
}
