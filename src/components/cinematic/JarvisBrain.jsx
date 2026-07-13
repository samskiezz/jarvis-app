import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiBase } from "@/api/cinematicDataAdapters";
import { isShowMeQuery, resolveShowMeQuery } from "./ShowMeNavigation";
import { isStatusQuery } from "./SpokenStatusReport";
import { isMarketsQuery, buildMarketsScript } from "./MarketsTicker";
import {
  isEntitySearchQuery,
  extractEntitySearchTerm,
  buildEntityDossierScript,
} from "./EntityQuickSearch";
import { isRiskQuery, buildRiskScript } from "./RiskBoard";
import { isTaskQuery, buildTaskScript } from "./TaskBoard";
import { isDatasetsQuery, buildDatasetsScript } from "./DatasetsBrowser";
import { isInvestigationsQuery, buildInvestigationsScript } from "./InvestigationsList";
import { isScenarioQuery, buildScenarioScript } from "./ScenarioLauncher";
import { isDocumentQuery, buildDocumentScript } from "./DocumentSearch";
import { isSkillQuery, buildSkillScript } from "./SkillScorecard";
import { isBrainQuery, buildBrainScript } from "./BrainGrowthSparkline";
import { isAnchorQuery, buildAnchorScript } from "./SceneAnchorDrillDown";
import { isAmbientQuery } from "./AmbientReactorHum";
import { isClockQuery, buildClockScript } from "./LiveClockUptime";
import { isAlertQuery, buildAlertScript } from "./AlertToasts";
import { isInvestmentQuery, buildInvestmentScript } from "./InvestmentWidget";
import { isContactsQuery, buildContactsScript } from "./ContactsDirectory";
import { isSwarmQuery, buildSwarmScript } from "./SwarmJobsMonitor";
import { isCentralityQuery, buildCentralityScript } from "./GraphCentralityView";
import { isDiagnosticsQuery, buildDiagnosticsScript } from "./ServiceDiagnostics";
import { isHistoryQuery, buildHistoryScript } from "./CommandHistory";
import { isVoiceQuery, buildVoiceScript, applyVoiceFromQuery, getActiveVoice } from "./MultiVoiceToggle";
import { isTourQuery, buildTourScript } from "./SceneAutoTour";
import { isImpactMatrixQuery, buildImpactMatrixScript } from "./ScenarioImpactMatrix";
import { isPriorityQueueQuery, buildPriorityQueueScript } from "./PriorityActionQueue";
import { isIntelDigestQuery, buildIntelDigestScript } from "./IntelDigest";
import { isPathQuery, buildPathScript } from "./GraphPathExplorer";
import { isModelRegistryQuery, buildModelRegistryScript } from "./ScenarioModelRegistry";
import { isScenarioRiskAdvisorQuery, buildScenarioRiskAdvisorScript } from "./ScenarioRiskAdvisor";
import { isSnapQuery, buildSnapScript } from "./SnapshotTracker";
import { isScenarioMonitorQuery, buildScenarioMonitorScript } from "./LiveScenarioMonitor";
import { isAthrepQuery, buildAthrepScript } from "./AdaptiveThreatReport";
import { isCrisisWarningQuery, buildCrisisWarningScript } from "./CrisisEarlyWarning";

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
        body: JSON.stringify({ text: answer, voice: getActiveVoice() }),
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
    // F20: "show me X / open X / view X" → normalize and re-dispatch so the
    // correct panel opens itself. isShowMeQuery never matches normalized strings
    // (they have no SHOW_PREFIX), so there is no recursive loop.
    if (isShowMeQuery(q)) {
      window.dispatchEvent(
        new CustomEvent("jarvis:ask", { detail: { text: resolveShowMeQuery(q) } })
      );
      return;
    }
    // F05: route status queries to StatusReporter which fetches real telemetry + speaks via TTS
    if (isStatusQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:status"));
      return;
    }
    // F07: route markets queries to MarketsTicker's spoken report (real getLiveIntel data)
    if (isMarketsQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildMarketsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F09: route risk queries to RiskBoard panel + spoken risk summary.
    // RiskBoard already opens itself on jarvis:ask (its own listener); we just speak the summary.
    if (isRiskQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildRiskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F10: route task/mission queries to TaskBoard panel + spoken task summary.
    // TaskBoard already opens itself on jarvis:ask (its own listener); we just speak the summary.
    if (isTaskQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildTaskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F11: route datasets queries to DatasetsBrowser panel + spoken catalog summary.
    // DatasetsBrowser already opens itself on jarvis:ask (its own listener); we just speak the summary.
    if (isDatasetsQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildDatasetsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F12: route investigations queries to InvestigationsList panel + spoken brief.
    // InvestigationsList already opens itself on jarvis:ask; we speak the summary.
    if (isInvestigationsQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildInvestigationsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F13: route scenario queries to ScenarioLauncher panel + spoken brief.
    // ScenarioLauncher already opens itself on jarvis:ask; we speak the summary.
    if (isScenarioQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildScenarioScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F14: route document/report/knowledge queries to DocumentSearch panel + spoken vault brief.
    // DocumentSearch already opens itself on jarvis:ask (its own listener); we speak the summary.
    if (isDocumentQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildDocumentScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F15: route skill/scorecard/AIP queries to SkillScorecard panel + spoken metrics brief.
    // SkillScorecard already opens itself on jarvis:ask (its own listener); we speak the summary.
    if (isSkillQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildSkillScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F16: route brain-growth / sparkline queries to BrainGrowthSparkline panel + spoken trend brief.
    // BrainGrowthSparkline already opens itself on jarvis:ask (its own listener); we speak the summary.
    if (isBrainQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildBrainScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F17: route anchor drill-down queries to SceneAnchorDrillDown panel + spoken anchor report.
    // SceneAnchorDrillDown already opens itself on jarvis:ask (its own listener); we speak the summary.
    if (isAnchorQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildAnchorScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F19: ambient reactor hum toggle — dispatch jarvis:ambient-toggle; speak confirmation
    if (isAmbientQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ambient-toggle"));
      const onScript = /\bon\b|enable|start|activ/i.test(q)
        ? "Reactor ambient hum engaged, sir."
        : /\boff\b|disable|stop|mute/i.test(q)
        ? "Ambient hum silenced, sir."
        : "Ambient reactor hum toggled, sir.";
      setOpen(true); typeOut(onScript); speak(onScript);
      hideT.current = setTimeout(() => setOpen(false), 5000);
      return;
    }
    // F21: live clock + uptime — speak current time and real process uptime from system/status.
    if (isClockQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildClockScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(6000, script.length * 70));
      return;
    }
    // F22: alert toasts — speak a summary of open alerts from /v1/alerts (real endpoint).
    if (isAlertQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildAlertScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(8000, script.length * 70));
      return;
    }
    // F23: investment/wealth widget — speak portfolio summary from /entities/Investment + WealthSnapshot.
    if (isInvestmentQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildInvestmentScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(8000, script.length * 70));
      return;
    }
    // F24: contacts directory — open the panel + speak directory brief from /entities/Contact.
    if (isContactsQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildContactsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(8000, script.length * 70));
      return;
    }
    // F25: swarm jobs monitor — open the panel + speak running/queued/failed brief from /entities/SwarmJob.
    // SwarmJobsMonitor opens itself via its own jarvis:ask listener (SWARM_RE); we add the spoken TTS summary.
    if (isSwarmQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildSwarmScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(8000, script.length * 70));
      return;
    }
    // F26: graph centrality — open panel + speak top-entity influence brief from /v1/graph/centrality.
    // GraphCentralityView opens itself via its own jarvis:ask listener; we add the TTS summary.
    if (isCentralityQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildCentralityScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(8000, script.length * 70));
      return;
    }
    // F27: diagnostics — open ServiceDiagnostics panel + speak per-service health from /v1/jarvis/system/status.
    // ServiceDiagnostics opens itself via its own jarvis:ask listener; we add the TTS summary.
    if (isDiagnosticsQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildDiagnosticsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(8000, script.length * 70));
      return;
    }
    // F29: multi-voice toggle — "switch voice to fable/onyx/ash" / "change voice" cycles or sets voice.
    if (isVoiceQuery(q)) {
      const newVoice = applyVoiceFromQuery(q);
      const script = `Voice profile switched to ${newVoice}, sir. All subsequent speech will use the ${newVoice} voice engine.`;
      setOpen(true); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), 5000);
      return;
    }
    // F28: command history — CommandHistory opens itself; we add the TTS summary from localStorage.
    if (isHistoryQuery(q)) {
      setOpen(true); setThinking(false);
      const script = buildHistoryScript();
      typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(8000, script.length * 70));
      return;
    }
    // F08: route entity search queries to EntityQuickSearch panel + spoken dossier
    if (isEntitySearchQuery(q)) {
      const term = extractEntitySearchTerm(q);
      window.dispatchEvent(new CustomEvent("jarvis:entity-search", { detail: { term: term || "" } }));
      setOpen(true); setThinking(true); setText("");
      const dossier = await buildEntityDossierScript(term || "");
      setThinking(false); typeOut(dossier); speak(dossier);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, dossier.length * 70));
      return;
    }
    // F31: scenario impact matrix — "impact matrix / risk matrix / scenario matrix" opens the
    // 3×3 probability-vs-impact grid from /v1/scenario/list and speaks a critical-count brief.
    if (isImpactMatrixQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:matrix-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildImpactMatrixScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F30: scene auto-tour — "start tour / give me a tour / walkthrough" starts SceneAutoTour.
    // SceneAutoTour opens itself via its own jarvis:ask listener; we speak the intro confirmation.
    if (isTourQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tour-start"));
      const script = buildTourScript();
      setOpen(true); typeOut(script);
      hideT.current = setTimeout(() => setOpen(false), 5000);
      return;
    }
    // F32: priority action queue — parallel-fetches Task + RiskSignal + /v1/investigations,
    // ranks by urgency, opens PriorityActionQueue panel + speaks ranked summary via TTS.
    if (isPriorityQueueQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ask", { detail: { text: "priority queue urgent items" } }));
      setOpen(true); setThinking(true); setText("");
      const script = await buildPriorityQueueScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F34: intel digest — "intel digest / live digest / news digest / daily digest" fetches
    // /functions/getLiveIntel (quakes/crypto/fx) then /v1/jarvis/agent/chat synthesises a
    // 3-sentence spoken brief. Opens IntelDigest panel via jarvis:intel-digest-toggle event.
    if (isIntelDigestQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:intel-digest-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIntelDigestScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F36: graph path finder — "path from X to Y / how is X connected to Y /
    // find link between X and Y / connection between X and Y / traverse from X to Y"
    // buildPathScript extracts entity names from the query, fetches /v1/graph/path,
    // dispatches jarvis:path-query to open GraphPathExplorer, narrates via /v1/jarvis/agent/chat.
    if (isPathQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildPathScript(q);
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F37: scenario model registry — "model registry / scenario models / available models /
    // prediction models / what models / drift status / trained models"
    // opens ScenarioModelRegistry panel and speaks model-count + drift brief from /v1/scenario/models.
    if (isModelRegistryQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:model-registry-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildModelRegistryScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(8000, script.length * 70));
      return;
    }

    // F38: scenario risk advisor — "mitigation / scenario advisor / which scenarios /
    // risk advisor / srmadv" — correlates /entities/RiskSignal against /v1/scenario/list,
    // opens ScenarioRiskAdvisor panel and speaks top mitigation recommendation.
    if (isScenarioRiskAdvisorQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:srmadvisor-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScenarioRiskAdvisorScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(8000, script.length * 70));
      return;
    }

    // F39: system snapshot tracker — "snapshot / system snapshot / take snapshot /
    // capture system / snap / metric history / system trend"
    // Opens SnapshotTracker panel (jarvis:snap-toggle) and speaks a 2-sentence
    // system-health trend brief from localStorage history + /v1/jarvis/agent/chat.
    if (isSnapQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:snap-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSnapScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(8000, script.length * 70));
      return;
    }

    // F40: live scenario monitor — "scenario monitor / running scenarios / simulation status /
    // scenario status / playbook status / smon"
    // Opens LiveScenarioMonitor panel (jarvis:scenario-monitor-toggle) and speaks a live
    // status brief: total, running, pending, completed, failed counts from /v1/scenario/list.
    if (isScenarioMonitorQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scenario-monitor-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScenarioMonitorScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(8000, script.length * 70));
      return;
    }

    // F41a: adaptive threat report — "threat report / generate threat report / threat intelligence /
    // intel report / full threat brief / athrep"
    // Opens AdaptiveThreatReport panel (jarvis:athrep-toggle) and speaks a count brief from
    // /entities/RiskSignal + /entities/IntelProfile + /v1/ops/events via buildAthrepScript().
    if (isAthrepQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildAthrepScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F41b: crisis early warning — "crisis level / crisis status / early warning / defcon /
    // global threat / crisis"
    // Opens CrisisEarlyWarning panel (jarvis:crisis-toggle) and speaks a DEFCON-level brief from
    // /entities/RiskSignal + /functions/getLiveIntel + /v1/ops/events via buildCrisisWarningScript().
    if (isCrisisWarningQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:crisis-warning-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCrisisWarningScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    clearTimeout(hideT.current);
    setOpen(true); setThinking(true); setText("");
    const scene = detectScene(q);
    if (scene) navigate(`/cinematic/${scene}`);
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

  // F08: speak dossier when user clicks a result card in EntityQuickSearch
  useEffect(() => {
    const onDossier = (e) => {
      const text = e?.detail?.text;
      if (!text) return;
      setOpen(true); typeOut(text); speak(text);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, text.length * 70));
    };
    window.addEventListener("jarvis:speak-dossier", onDossier);
    return () => window.removeEventListener("jarvis:speak-dossier", onDossier);
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
