import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiBase } from "@/api/cinematicDataAdapters";
import SceneKeyboardNav from "@/components/cinematic/SceneKeyboardNav";
import { isStatusQuery, buildStatusScript } from "@/components/cinematic/SpokenStatusReport";
import { isMarketsQuery, buildMarketsScript } from "@/components/cinematic/MarketsTicker";
import {
  isEntitySearchQuery,
  extractEntitySearchTerm,
  buildEntityDossierScript,
} from "@/components/cinematic/EntityQuickSearch";
import { isRiskQuery, buildRiskScript } from "@/components/cinematic/RiskBoard";
import { isDatasetsQuery, buildDatasetsScript } from "@/components/cinematic/DatasetsBrowser";
import { isInvestigationsQuery, buildInvestigationsScript } from "@/components/cinematic/InvestigationsList";
import { isScenarioQuery, buildScenarioScript } from "@/components/cinematic/ScenarioLauncher";
import { isDocumentQuery, buildDocumentScript } from "@/components/cinematic/DocumentSearch";
import { isSkillQuery, buildSkillScript } from "@/components/cinematic/SkillScorecard";
import { isBrainQuery, buildBrainScript } from "@/components/cinematic/BrainGrowthSparkline";
import { isAnchorQuery, buildAnchorScript } from "@/components/cinematic/SceneAnchorDrillDown";
import { isAmbientQuery } from "@/components/cinematic/AmbientReactorHum";
import { isShowMeQuery, resolveShowMeQuery } from "@/components/cinematic/ShowMeNavigation";
import { isClockQuery, buildClockScript } from "@/components/cinematic/LiveClockUptime";
import { isInvestmentQuery, buildInvestmentScript } from "@/components/cinematic/InvestmentWidget";
import { isContactsQuery, buildContactsScript } from "@/components/cinematic/ContactsDirectory";
import { isSwarmQuery, buildSwarmScript } from "@/components/cinematic/SwarmJobsMonitor";
import { isCentralityQuery, buildCentralityScript } from "@/components/cinematic/GraphCentralityView";
import { isDiagnosticsQuery, buildDiagnosticsScript } from "@/components/cinematic/ServiceDiagnostics";
import { isHistoryQuery, buildHistoryScript } from "@/components/cinematic/CommandHistory";
import { isVoiceQuery, buildVoiceScript, applyVoiceFromQuery, getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";
import { isTourQuery, buildTourScript } from "@/components/cinematic/SceneAutoTour";
import { isIntelProfileQuery, buildIntelProfileScript } from "@/components/cinematic/IntelProfileDirectory";
import { isSceneHealthQuery, buildSceneHealthScript } from "@/components/cinematic/SceneHealthHeatmap";
import { isBriefingQuery, buildBriefingScript } from "@/components/cinematic/MorningBriefing";
import { isKnowledgeQuery, buildKnowledgeScript } from "@/components/cinematic/KnowledgeBrowser";
import { isOpsQuery, buildOpsScript } from "@/components/cinematic/OpsEventStream";
import { isPathQuery, buildPathScript } from "@/components/cinematic/GraphPathExplorer";
import { isReportSummariserQuery, buildReportSummariserScript } from "@/components/cinematic/ReportSummariser";
import { isAcquisitionQuery, buildAcquisitionScript } from "@/components/cinematic/DataAcquisitionMonitor";
import { isEntityRegistryQuery, buildEntityRegistryScript } from "@/components/cinematic/EntityRegistryOverview";
import { isTimelineQuery, buildTimelineScript } from "@/components/cinematic/ThreatTimeline";
import { isCommandPaletteQuery } from "@/components/cinematic/JarvisCommandPalette";
import { isSituationQuery, buildSituationScript } from "@/components/cinematic/SituationRoom";
import { isIntelDigestQuery, buildIntelDigestScript } from "@/components/cinematic/IntelDigest";
import { isNetworkExplorerQuery, buildNetworkExplorerScript } from "@/components/cinematic/GraphNetworkExplorer";
import { isPriorityQueueQuery, buildPriorityQueueScript } from "@/components/cinematic/PriorityActionQueue";
import { isSkillGapQuery, buildSkillGapScript } from "@/components/cinematic/SkillGapAdvisor";
import { isChatQuery, buildChatScript } from "@/components/cinematic/AgentChatTranscript";
import { isThreatCorrelationQuery, buildThreatCorrelationScript } from "@/components/cinematic/ThreatCorrelationEngine";
import { isSceneCompareQuery, buildSceneCompareScript } from "@/components/cinematic/SceneCompareView";
import { isImpactMatrixQuery, buildImpactMatrixScript } from "@/components/cinematic/ScenarioImpactMatrix";

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
      try { audioRef.current?.pause(); } catch (_) {}
      const a = new Audio(url); audioRef.current = a;
      a.onplay = () => setSpeaking(true);
      a.onended = () => { setSpeaking(false); URL.revokeObjectURL(url); };
      a.play().catch(() => setSpeaking(false));
    } catch (_) {}
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

    // "show me X" / "open X" → silently re-route to normalized query BEFORE opening
    // the overlay, so the correct panel opens and speaks its own data brief.
    if (isShowMeQuery(q)) {
      const showScene = detectScene(q);
      if (showScene) navigate(`/cinematic/${showScene}`);
      const normalized = resolveShowMeQuery(q);
      window.dispatchEvent(new CustomEvent("jarvis:ask", { detail: { text: normalized } }));
      return;
    }

    clearTimeout(hideT.current);
    setOpen(true); setThinking(true); setText("");
    const scene = detectScene(q);
    if (scene) navigate(`/cinematic/${scene}`);

    if (isStatusQuery(q)) {
      try {
        const answer = await buildStatusScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(9000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isMarketsQuery(q)) {
      try {
        const answer = await buildMarketsScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(9000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isEntitySearchQuery(q)) {
      const term = extractEntitySearchTerm(q);
      window.dispatchEvent(new CustomEvent("jarvis:entity-search", { detail: { term: term || q } }));
      try {
        const answer = await buildEntityDossierScript(term || q);
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(9000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isRiskQuery(q)) {
      try {
        const answer = await buildRiskScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(9000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isDatasetsQuery(q)) {
      try {
        const answer = await buildDatasetsScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(9000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isInvestigationsQuery(q)) {
      try {
        const answer = await buildInvestigationsScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(9000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isScenarioQuery(q)) {
      try {
        const answer = await buildScenarioScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(9000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isReportSummariserQuery(q)) {
      try {
        const answer = await buildReportSummariserScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(9000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isDocumentQuery(q)) {
      try {
        const answer = await buildDocumentScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(9000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isSkillQuery(q)) {
      try {
        const answer = await buildSkillScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(9000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isBrainQuery(q)) {
      try {
        const answer = await buildBrainScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(9000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isAnchorQuery(q)) {
      try {
        const answer = await buildAnchorScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(9000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isClockQuery(q)) {
      try {
        const answer = await buildClockScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(7000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isInvestmentQuery(q)) {
      try {
        const answer = await buildInvestmentScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(9000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isContactsQuery(q)) {
      try {
        const answer = await buildContactsScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(9000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isSwarmQuery(q)) {
      try {
        const answer = await buildSwarmScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(9000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isCentralityQuery(q)) {
      try {
        const answer = await buildCentralityScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(9000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isDiagnosticsQuery(q)) {
      try {
        const answer = await buildDiagnosticsScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(9000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isHistoryQuery(q)) {
      const answer = buildHistoryScript();
      setThinking(false); typeOut(answer); speak(answer);
      hideT.current = setTimeout(() => setOpen(false), Math.max(7000, answer.length * 70));
      return;
    }

    if (isVoiceQuery(q)) {
      const newVoice = applyVoiceFromQuery(q);
      const answer = `Voice profile switched to ${newVoice}, sir. All subsequent speech will use the ${newVoice} voice engine.`;
      setThinking(false); typeOut(answer); speak(answer);
      hideT.current = setTimeout(() => setOpen(false), 7000);
      return;
    }

    if (isTourQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tour-start"));
      const answer = buildTourScript();
      setThinking(false); typeOut(answer); speak(answer);
      hideT.current = setTimeout(() => setOpen(false), 7000);
      return;
    }

    if (isIntelProfileQuery(q)) {
      try {
        const answer = await buildIntelProfileScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(9000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isSceneHealthQuery(q)) {
      try {
        const answer = await buildSceneHealthScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(9000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isBriefingQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:briefing-open"));
      try {
        const answer = await buildBriefingScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(12000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isKnowledgeQuery(q)) {
      try {
        const answer = await buildKnowledgeScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(9000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isOpsQuery(q)) {
      try {
        const answer = await buildOpsScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(9000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isPathQuery(q)) {
      try {
        const answer = await buildPathScript(q);
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(9000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isAcquisitionQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:acquisition-toggle"));
      try {
        const answer = await buildAcquisitionScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(9000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isEntityRegistryQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:registry-toggle"));
      try {
        const answer = await buildEntityRegistryScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(9000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isTimelineQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:timeline-toggle"));
      try {
        const answer = await buildTimelineScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(9000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isCommandPaletteQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:open-palette"));
      const answer = "Command palette open, sir. Use the arrow keys to navigate and Enter to execute.";
      setThinking(false); typeOut(answer); speak(answer);
      hideT.current = setTimeout(() => setOpen(false), 7000);
      return;
    }

    if (isSituationQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:situation-toggle"));
      try {
        const answer = await buildSituationScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(10000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isIntelDigestQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:intel-digest-toggle"));
      try {
        const answer = await buildIntelDigestScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(10000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isNetworkExplorerQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:network-toggle"));
      try {
        const answer = await buildNetworkExplorerScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(10000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isPriorityQueueQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:queue-toggle"));
      try {
        const answer = await buildPriorityQueueScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(10000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isSkillGapQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:skillgap-toggle"));
      try {
        const answer = await buildSkillGapScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(10000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isChatQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:chat-toggle"));
      const history = (() => {
        try { return JSON.parse(localStorage.getItem("jarvis_chat_history") || "[]"); } catch (_) { return []; }
      })();
      const answer = buildChatScript(history);
      setThinking(false); typeOut(answer); speak(answer);
      hideT.current = setTimeout(() => setOpen(false), 7000);
      return;
    }

    if (isSceneCompareQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:compare-toggle"));
      try {
        const answer = await buildSceneCompareScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(10000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isThreatCorrelationQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:correlation-toggle"));
      try {
        const answer = await buildThreatCorrelationScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(10000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isImpactMatrixQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:matrix-toggle"));
      try {
        const answer = await buildImpactMatrixScript();
        setThinking(false); typeOut(answer); speak(answer);
        hideT.current = setTimeout(() => setOpen(false), Math.max(9000, answer.length * 70));
      } catch (_) {
        setThinking(false); setOpen(false);
      }
      return;
    }

    if (isAmbientQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ambient-toggle"));
      const answer = "Ambient reactor hum toggled, sir.";
      setThinking(false); typeOut(answer); speak(answer);
      hideT.current = setTimeout(() => setOpen(false), 6000);
      return;
    }

    let answer = "";
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: q }),
      });
      const d = await r.json();
      answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
    } catch (_) {
      answer = "I'm afraid I couldn't reach my reasoning core just now, sir.";
    }
    if (scene && !answer) answer = `Summoning the ${SCENE_LABEL[scene]}, sir.`;
    if (!answer) answer = "At your service, sir.";
    setThinking(false); typeOut(answer); speak(answer);
    hideT.current = setTimeout(() => setOpen(false), Math.max(9000, answer.length * 70));
  }

  useEffect(() => {
    const onAsk = (e) => { const q = e?.detail?.text || e?.detail?.query; if (q) ask(q); };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onDossier = (e) => {
      const t = e?.detail?.text;
      if (!t) return;
      clearTimeout(hideT.current);
      setOpen(true); typeOut(t); speak(t);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, t.length * 70));
    };
    window.addEventListener("jarvis:speak-dossier", onDossier);
    return () => window.removeEventListener("jarvis:speak-dossier", onDossier);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function mic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { ask("are you online"); return; }
    const r = new SR(); r.lang = "en-GB"; r.interimResults = false; r.maxAlternatives = 1;
    setListening(true);
    r.onresult = (e) => { setListening(false); ask(e.results[0][0].transcript); };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    try { r.start(); } catch (_) { setListening(false); }
  }

  return (
    <>
      <SceneKeyboardNav />
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
