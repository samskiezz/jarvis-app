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
import { isOpsCoverageQuery, buildOpsCoverageScript } from "./OpsTaskCoverageChecker";
import { isWatchlistQuery, buildWatchlistScript } from "./EntityWatchlist";
import { isBriefingQuery, buildBriefingScript } from "./MorningBriefing";
import { isSkillGapQuery, buildSkillGapScript } from "./SkillGapAdvisor";
import { isGeoSeismicQuery, buildGeoSeismicScript } from "./GeoSeismicAnalyst";
import { isCommunitiesQuery, buildCommunitiesScript } from "./GraphCommunitiesView";
import { isGraphAnomalyQuery, buildGraphAnomalyScript } from "./GraphAnomalyDetector";
import { isGraphTimelineQuery, buildGraphTimelineScript } from "./GraphTimelineScrubber";
import { isIntelProfileRosterQuery, buildIntelProfileRosterScript } from "./IntelProfileRoster";
import { isMissionControlQuery, buildMissionControlScript } from "./MissionControlConsole";
import { isKrgapQuery, buildKrgapScript } from "./KnowledgeReportAuditor";
import { isRespresQuery, buildRespresScript } from "./ResourcePressureMonitor";
import { isSituationQuery, buildSituationScript } from "./SituationRoom";
import { isIfuseQuery, buildIfuseScript } from "./IntelFusionBoard";
import { isSceneAnchorMonitorQuery, buildSceneAnchorMonitorScript } from "./AllScenesAnchorMonitor";
import { isOpsClusterQuery, buildOpsClusterScript } from "./OpsEventClusterAnalyzer";
import { isSwarmTaskQuery, buildSwarmTaskScript } from "./SwarmTaskAdvisor";
import { isDsknowQuery, buildDsknowScript } from "./DatasetKnowledgeCoverage";
import { isInvOpsFreqQuery, buildInvOpsFreqScript } from "./InvestigationOpsFrequency";
import { isTaskAlignQuery, buildTaskAlignScript } from "./TaskSkillAlignment";
import { isTimelineQuery, buildTimelineScript } from "./ThreatTimeline";
import { isInvScenLinkerQuery, buildInvScenLinkerScript } from "./InvestigationScenarioLinker";
import { isInvScenarioQuery, buildInvScenarioScript } from "./InvestigationScenarioRecommender";
import { isCtrskQuery, buildCtrskScript } from "./ContactRiskExposure";
import { isForecastQuery, buildForecastScript } from "./ThreatForecastEngine";
import { isThreatVelocityQuery, buildThreatVelocityScript } from "./ThreatVelocityMonitor";
import { isWrlrskQuery, buildWrlrskScript } from "./WorldRiskCorrelator";
import { isEntityActivityQuery, buildEntityActivityScript } from "./EntityActivityHeatmap";
import { isChatQuery, buildChatScript } from "./AgentChatTranscript";
import { isDailyObjectivesQuery, buildDailyObjectivesScript } from "./DailyObjectivesPlanner";
import { isHealthScoreQuery, buildHealthScoreScript } from "./SystemHealthScorecard";
import { isVitTrendQuery, buildVitTrendScript } from "./VitalsTrendAnalyzer";
import { isKsrecQuery, buildKsrecScript } from "./KnowledgeSkillRecommender";
import { isInvScenPlanQuery, buildInvScenPlanScript } from "./InvestmentScenarioPlanner";
import { isSwarmDatasetQuery, buildSwarmDatasetScript } from "./SwarmDatasetTracker";
import { isRiskRepQuery, buildRiskRepScript } from "./RiskReportMapper";
import { isDatasetReportQuery, buildDatasetReportScript } from "./DatasetReportCrossRef";
import { isSceneHealthQuery, buildSceneHealthScript } from "./SceneHealthHeatmap";
import { isSceneCompareQuery, buildSceneCompareScript } from "./SceneCompareView";
import { isSceneDataDiffQuery, buildSceneDataDiffScript } from "./SceneDataDiff";
import { isRunbookQuery, buildRunbookScript } from "./OpsRunbookGenerator";
import { isThreatActorNetworkQuery, buildThreatActorNetworkScript } from "./ThreatActorNetwork";
import { isTattrQuery, buildTattrScript } from "./ThreatAttributionMapper";
import { isThreatCorrelationQuery, buildThreatCorrelationScript } from "./ThreatCorrelationEngine";
import { isDatasetFreshnessQuery, buildDatasetFreshnessScript } from "./DatasetFreshnessMonitor";
import { isSitrepQuery, buildSitrepScript } from "./SitrepCommander";
import { isSkillContactQuery, buildSkillContactScript } from "./SkillContactGapAdvisor";
import { isLiilinkQuery, buildLiilinkScript } from "./LiveIntelInvestigationLinker";
import { isCryptorskQuery, buildCryptorskScript } from "./CryptoRiskCorrelator";
import { isLiscQuery, buildLiscScript } from "./LiveIntelScenarioMapper";
import { isCtintlQuery, buildCtintlScript } from "./ContactIntelLinker";
import { isRpInvgQuery, buildRpInvgScript } from "./ReportInvestigationGap";
import { isSkiinvQuery, buildSkiinvScript } from "./SkillInvestigationAdvisor";
import { isIkgapQuery, buildIkgapScript } from "./LiveIntelKnowledgeGap";
import { isInvrskQuery, buildInvrskScript } from "./InvestmentRiskExposure";
import { isTaskRiskMatrixQuery, buildTaskRiskMatrixScript } from "./TaskRiskMatrix";
import { isDsrskQuery, buildDsrskScript } from "./DatasetRiskAnalyzer";
import { isDsriskQuery, buildDsriskScript } from "./DatasetRiskCoverage";
import { isCtknowQuery, buildCtknowScript } from "./ContactKnowledgeAdvisor";
import { isSwjknQuery, buildSwjknScript } from "./SwarmJobKnowledgeCoverage";
import { isCttaskQuery, buildCttaskScript } from "./ContactTaskLinker";
import { isSwconQuery, buildSwconScript } from "./SwarmContactLinker";
import { isLictxQuery, buildLictxScript } from "./LiveIntelContactAlerter";
import { isCtopsQuery, buildCtopsScript } from "./ContactOpsLinker";

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

    // F42: ops task coverage — "ops coverage / ops task coverage / uncovered events /
    // task coverage / opscov / ops gaps"
    // Opens OpsTaskCoverageChecker panel (jarvis:ops-coverage-toggle) and speaks a coverage brief
    // from /v1/ops/events + /entities/Task via buildOpsCoverageScript().
    if (isOpsCoverageQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ops-coverage-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildOpsCoverageScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F45: skill gap advisor — "skill gap / training plan / learning plan / how to improve /
    // weakest skill / upskill / capability gap / development plan"
    // Opens SkillGapAdvisor panel (jarvis:skillgap-toggle) and speaks a gap brief from
    // /v1/aip/skill via buildSkillGapScript(); AI recs fetched per weak skill via /v1/jarvis/agent/chat.
    if (isSkillGapQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:skillgap-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSkillGapScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F46: geo-seismic analyst — "geo seismic / seismic regions / earthquake regions /
    // regional seismic / quake regions / seismic analysis / geos"
    // Opens GeoSeismicAnalyst panel (jarvis:geo-seismic-toggle) and speaks a region-clustered
    // seismic brief from /functions/getLiveIntel via buildGeoSeismicScript().
    if (isGeoSeismicQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:geo-seismic-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGeoSeismicScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F47: graph communities — "communities / clusters / partition / network groups /
    // group entities / entity clusters / who belongs / graph partition"
    // Opens GraphCommunitiesView panel (jarvis:communities-toggle) and speaks a cluster
    // brief (entity count, cluster count, largest cluster size) from /v1/graph/communities.
    if (isCommunitiesQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:communities-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCommunitiesScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(8000, script.length * 70));
      return;
    }

    // F48: graph anomaly detector — "graph anomaly / node anomaly / outlier / unusual node /
    // anomalous / centrality outlier / anomaly detect / graph outlier / network outlier"
    // Opens GraphAnomalyDetector panel (jarvis:graph-anomaly-toggle) and speaks a statistical-outlier
    // brief (anomaly count, top anomaly node, z-score) from /v1/graph/centrality via buildGraphAnomalyScript().
    if (isGraphAnomalyQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildGraphAnomalyScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F49: graph timeline scrubber — "graph timeline / graph history / graph over time /
    // how did the graph grow / graph evolution / temporal graph / time series graph / gtime"
    // Opens GraphTimelineScrubber panel (jarvis:graph-timeline-toggle) and speaks a growth brief
    // (frame count, node delta, trend direction) from /v1/graph-time/playback via buildGraphTimelineScript().
    if (isGraphTimelineQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildGraphTimelineScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F50: intel profile roster — "intel profiles / intel roster / profile list / all profiles /
    // who are we tracking / tracked entities / intelligence profiles / target roster / ipro"
    // Opens IntelProfileRoster panel (jarvis:intel-roster-toggle) and speaks a threat-sorted brief
    // (total count, CRITICAL count, top subject names) from /entities/IntelProfile.
    if (isIntelProfileRosterQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:intel-roster-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIntelProfileRosterScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F44: morning briefing — "brief me / morning briefing / daily brief / debrief / report in /
    // run briefing / give me a brief / status report / daily report"
    // Opens MorningBriefing panel (jarvis:briefing-open) and speaks a real multi-source briefing
    // from /v1/jarvis/system/status + /v1/cinematic/brain + /functions/getLiveIntel via buildBriefingScript().
    if (isBriefingQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:briefing-open"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildBriefingScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(12000, script.length * 70));
      return;
    }

    // F43: entity watchlist — "watchlist / my watchlist / watched items / pinned items"
    // Opens EntityWatchlist panel (jarvis:watchlist-toggle) and speaks a summary of
    // pinned entities (from localStorage) fetching live data from
    // /entities/{Task,RiskSignal,IntelProfile,SwarmJob,Investment,Contact}.
    if (isWatchlistQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:watchlist-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildWatchlistScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(8000, script.length * 70));
      return;
    }

    // F51: mission control console — "mission control / mission console / mctl /
    // control console / ops console / ops overview / operational overview / ops cockpit"
    // Opens MissionControlConsole panel (jarvis:mission-control-toggle) and speaks a
    // 4-KPI operational brief (tasks/swarms/risks/cases) from real entity endpoints.
    if (isMissionControlQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildMissionControlScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(10000, script.length * 70));
      return;
    }

    // F52: knowledge report auditor — "knowledge report / report knowledge / doc gap /
    // documentation gap / knowledge coverage / krgap / report coverage"
    // Opens KnowledgeReportAuditor panel (jarvis:krgap-toggle) and speaks a live
    // documentation-gap brief (articles vs. reports matched/unmatched) from
    // real /knowledge/ + /v1/reports endpoints.
    if (isKrgapQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:krgap-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildKrgapScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F53: resource pressure monitor — "resource pressure / system load analysis /
    // what's using resources / respres / load analysis / resource monitor / swarm load"
    // Opens ResourcePressureMonitor panel (jarvis:respres-toggle) and speaks a real
    // pressure-score brief (CPU/MEM/load + running swarm jobs) from
    // /v1/jarvis/system/status + /entities/SwarmJob + /v1/ops/events via
    // /v1/jarvis/agent/chat + TTS.
    if (isRespresQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:respres-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRespresScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F54a: situation room — "situation room / sitrep / ops centre / command overview / mission status /
    // overall status / full status / sit rep"
    // Opens SituationRoom panel (jarvis:situation-toggle) and speaks a live ops brief from
    // /v1/jarvis/system/status + /v1/cinematic/brain + /entities/RiskSignal + /entities/SwarmJob + /v1/ops/events.
    if (isSituationQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:situation-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSituationScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F54b: intel fusion board — "intelligence fusion / fuse intel / intel board / all signals / ifuse /
    // signal aggregation / fusion board"
    // Opens IntelFusionBoard panel (jarvis:ifuse-toggle) and speaks a live multi-source fusion brief from
    // /entities/RiskSignal + /entities/IntelProfile + /v1/investigations + /v1/ops/events.
    if (isIfuseQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ifuse-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIfuseScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F54c: scene anchor monitor — "scene anchor / anchor monitor / all scene data / sacm /
    // scene anchor feed / all scenes"
    // Opens AllScenesAnchorMonitor panel (jarvis:sacm-toggle) and speaks a live scene-health brief
    // (total anchors across all 10 cinematic scenes) from /v1/cinematic/scene/{id} via buildSceneAnchorMonitorScript().
    if (isSceneAnchorMonitorQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sacm-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSceneAnchorMonitorScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F55: ops event cluster analyzer — "ops cluster / service cluster / event cluster /
    // cluster analysis / service load / opsclu"
    // Opens OpsEventClusterAnalyzer panel (jarvis:opsclu-toggle) and speaks a
    // 2-sentence cluster intelligence brief (service count, hot clusters, top services)
    // derived from /v1/ops/events grouped by service via buildOpsClusterScript().
    if (isOpsClusterQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:opsclu-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildOpsClusterScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F56: swarm-task assignment advisor — "swarm task / task automation / automate tasks /
    // task advisor / swtask / assign tasks / which tasks / task assignment"
    // Opens SwarmTaskAdvisor panel (jarvis:swarmtask-toggle) and speaks a 2-sentence
    // brief on how many active tasks have swarm automation candidates vs. require human
    // attention, derived from /entities/Task + /entities/SwarmJob.
    if (isSwarmTaskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:swarmtask-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSwarmTaskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F195: dataset × knowledge coverage — "dataset knowledge / dataset docs /
    // undocumented datasets / data documentation gap / dsknow"
    // Opens DatasetKnowledgeCoverage panel (jarvis:dsknow-toggle) and speaks a
    // 2-sentence brief on documented vs dark datasets from /v1/datasets + /knowledge/.
    if (isDsknowQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:dsknow-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildDsknowScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // Opens InvestigationOpsFrequency panel (jarvis:invopsfreq-toggle) and speaks a
    // 2-sentence brief on which investigations have correlated ops event chatter.
    if (isInvOpsFreqQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:invopsfreq-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildInvOpsFreqScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F197: task × skill alignment — "task skill / skill alignment / task coverage / skill gap
    // per task / taskalign / which skills / task readiness / team readiness"
    // Opens TaskSkillAlignment panel (jarvis:taskalign-toggle) and speaks a 2-sentence brief
    // on how many active tasks are covered by team skills vs. have uncovered skill gaps,
    // derived from /entities/Task + /v1/aip/skill.
    if (isTaskAlignQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:taskalign-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTaskAlignScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F198: unified threat timeline — "timeline / threat timeline / intel timeline /
    // unified feed / combined feed / all threats / all events"
    // Opens ThreatTimeline panel (jarvis:timeline-toggle) and speaks a reverse-chronological
    // combined brief (total items, critical count, top-3 titles) merged from
    // /entities/RiskSignal + /v1/ops/events + /v1/investigations via buildTimelineScript().
    if (isTimelineQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:timeline-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTimelineScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F59: investigation × scenario linker — "investigation scenario link / case scenario gap /
    // inv scen link / invscenlink / which scenarios cover / case scenario match"
    // Opens InvestigationScenarioLinker panel (jarvis:inv-scen-link-toggle) and speaks a 2-sentence
    // brief on case/scenario coverage from /v1/investigations + /v1/scenario/list.
    if (isInvScenLinkerQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:inv-scen-link-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildInvScenLinkerScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isInvScenarioQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:invscen-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildInvScenarioScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCtrskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ctrsk-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCtrskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F200: threat forecast engine — "forecast / threat forecast / 24h risk / predict threats /
    // risk prediction / risk outlook / what's coming / fcast"
    // Opens ThreatForecastEngine panel (jarvis:forecast-toggle) and speaks a real forward-looking
    // threat forecast generated from /entities/RiskSignal + /functions/getLiveIntel →
    // /v1/jarvis/agent/chat (2-sentence 24h risk brief) via TTS.
    if (isForecastQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:forecast-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildForecastScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F201a: threat velocity monitor — "threat velocity / velocity / threat rate / thr/min /
    // threat speed / threat surge / new threats"
    // Opens ThreatVelocityMonitor panel (jarvis:velocity-toggle) and speaks a real
    // velocity-rate brief (current signal count + SURGE/ELEVATED/NOMINAL status)
    // from /entities/RiskSignal via buildThreatVelocityScript().
    if (isThreatVelocityQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:velocity-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildThreatVelocityScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(8000, script.length * 70));
      return;
    }

    // F201b: world × risk correlator — "world risk / quake risk / geo risk / wrlrsk /
    // geophysical risk / live world risk"
    // Opens WorldRiskCorrelator panel (jarvis:wrlrsk-toggle) and speaks a real
    // geophysical-risk brief correlating /functions/getLiveIntel quakes against
    // /entities/RiskSignal via buildWrlrskScript().
    if (isWrlrskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:wrlrsk-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildWrlrskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F201c: entity activity heatmap — "entity activity / activity heatmap / domain activity /
    // entity density / entity load / eactv"
    // Opens EntityActivityHeatmap panel (jarvis:eactv-toggle) and speaks a real
    // domain-wide activity brief (most/least active type, avg score) from all
    // 6 /entities/* endpoints via buildEntityActivityScript().
    if (isEntityActivityQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:eactv-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildEntityActivityScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F202a: agent chat transcript — "open chat / chat panel / chat transcript / agent chat /
    // multi-turn / direct chat"
    // Opens AgentChatTranscript panel (jarvis:chat-toggle) and speaks a brief confirming
    // how many messages are stored in localStorage. AgentChatTranscript is mounted App.jsx
    // and provides persistent multi-turn /v1/jarvis/agent/chat with 60-msg localStorage history.
    if (isChatQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:chat-toggle"));
      const script = buildChatScript([]);
      setOpen(true); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(7000, script.length * 70));
      return;
    }

    // F202b: daily objectives planner — "daily objectives / what should i do today / daily plan /
    // today's priorities / daily planner / objectives / doplan"
    // Opens DailyObjectivesPlanner panel (jarvis:daily-objectives-toggle) and speaks a real
    // prioritised-objectives brief built from /entities/Task + /v1/aip/skill + /entities/RiskSignal.
    if (isDailyObjectivesQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:daily-objectives-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildDailyObjectivesScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F202c: system health scorecard — "health score / system score / overall health /
    // jarvis score / composite score / healthscore"
    // Opens SystemHealthScorecard panel (jarvis:healthscore-toggle) and speaks a real
    // 0–100 composite JARVIS health score from /v1/jarvis/system/status + /v1/cinematic/brain
    // + /entities/RiskSignal.
    if (isHealthScoreQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:healthscore-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildHealthScoreScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F202d: vitals trend analyzer — "vitals trend / health trend / biometric trend /
    // body trend / vital signs trend / vittrend"
    // Opens VitalsTrendAnalyzer panel (jarvis:vittrend-toggle) and speaks a real
    // 24h biometric-trend brief (metrics polled / anomaly count / trend direction)
    // from /v1/vitals/trend via buildVitTrendScript().
    if (isVitTrendQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:vittrend-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildVitTrendScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F203: knowledge-skill recommender — "knowledge skill / learning recommendation /
    // article recommend / ksrec / knowledge gap / learn skill"
    // Opens KnowledgeSkillRecommender panel (jarvis:ksrec-toggle) and speaks a real brief
    // (skill count, gap count, article count, gaps with matched articles) from
    // /v1/aip/skill + /knowledge/ via buildKsrecScript().
    if (isKsrecQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ksrec-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildKsrecScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F204: investment scenario planner — "investment scenario / scenario plan / hedge scenario /
    // portfolio scenario / inscenp / investment risk scenario"
    // Opens InvestmentScenarioPlanner panel (jarvis:invscplan-toggle) and speaks a real brief
    // (investment count, matched/unmatched scenario coverage) from /entities/Investment +
    // /v1/scenario/list via buildInvScenPlanScript().
    if (isInvScenPlanQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:invscplan-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildInvScenPlanScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F85: swarm-dataset ingestion tracker — "swarm dataset / dataset ingestion /
    // data automation / pipeline coverage / ingestion tracker / sdtrk /
    // which datasets automated / swarm pipeline"
    // Opens SwarmDatasetTracker panel (jarvis:sdtrk-toggle) and speaks a 2-sentence
    // brief on how many datasets have active swarm coverage vs manual ingestion,
    // derived from /entities/SwarmJob + /v1/datasets.
    if (isSwarmDatasetQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sdtrk-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSwarmDatasetScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRiskRepQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:riskrep-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRiskRepScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F70: dataset × report cross-reference — "dataset report / data report / data lineage /
    // report dataset / report coverage / dsrep / lineage"
    // Opens DatasetReportCrossRef panel (jarvis:dsrep-toggle) and speaks a 2-sentence brief
    // on matched vs orphaned datasets from /v1/datasets + /v1/reports.
    if (isDatasetReportQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:dsrep-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildDatasetReportScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F206a: scene health heatmap — "scene health / heatmap / anchor health / health map /
    // scene status / all scene"
    // SceneHealthHeatmap opens itself via its own jarvis:ask listener; JarvisBrain
    // builds and speaks the health summary from /v1/cinematic/scene/{id} (all 10 scenes).
    if (isSceneHealthQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildSceneHealthScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F206b: scene compare view — "compare scene / scene comp / diff scene / scene diff /
    // compare anchor / anchor comp"
    // Opens SceneCompareView panel (jarvis:compare-toggle) and speaks an anchor-count
    // brief from /v1/cinematic/scene/{id} for the default two scenes.
    if (isSceneCompareQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:compare-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSceneCompareScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F206c: scene data diff — "scene diff / scene change / anchor change / what changed /
    // scene update / scene delta / data drift"
    // Opens SceneDataDiff panel (jarvis:scene-diff-toggle) and speaks a snapshot brief
    // (live scenes, total anchor data points) from /v1/cinematic/scene/{id} (all 10 scenes).
    if (isSceneDataDiffQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scene-diff-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSceneDataDiffScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F207: ops runbook generator — "runbook / remediation / playbook / mitigation /
    // fix steps / resolve steps / ops run / incident response"
    // buildRunbookScript() fetches /v1/ops/events, dispatches jarvis:runbook-toggle
    // (opens panel), then returns a TTS brief with event count + critical count.
    // User can then click any event to generate a 3-step remediation plan via
    // /v1/jarvis/agent/chat.
    if (isRunbookQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildRunbookScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isThreatActorNetworkQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildThreatActorNetworkScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isTattrQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tattr-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTattrScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isThreatCorrelationQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:correlation-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildThreatCorrelationScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isDatasetFreshnessQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:dataset-freshness-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildDatasetFreshnessScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSitrepQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sitrep-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSitrepScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F209: Skill-Contact Gap Advisor — "skill contact / contact gaps / who can help with /
    // who knows X / skillc / network skill / reach out skill / outreach skill"
    // Opens SkillContactGapAdvisor panel (jarvis:skillcontact-toggle) and speaks a brief
    // identifying skill gaps and matched contacts from /v1/aip/skill + /entities/Contact.
    // Users can then click any gap-contact pair for an AI outreach recommendation via
    // /v1/jarvis/agent/chat + TTS.
    if (isSkillContactQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildSkillContactScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F210: live intel × investigation linker (LIILINK)
    if (isLiilinkQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:liilink-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildLiilinkScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F211: crypto × risk signal correlator (CRYPTORSK)
    if (isCryptorskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cryptorsk-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCryptorskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F212: live intel × scenario readiness mapper (LISC)
    if (isLiscQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:lisc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildLiscScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F213: contact × intel linker — cross-references /entities/Contact + /entities/IntelProfile
    if (isCtintlQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cintl-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCtintlScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F214: report-investigation gap analyzer — /v1/reports + /v1/investigations; BACKED vs DARK
    if (isRpInvgQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rpinvg-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRpInvgScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F215: skill × investigation coverage advisor — /v1/aip/skill + /v1/investigations; NEEDED vs IDLE
    if (isSkiinvQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:skiinv-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSkiinvScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F216: live intel × knowledge gap detector — /functions/getLiveIntel + /knowledge/; KNOWN vs BLIND SPOT
    if (isIkgapQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ikgap-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIkgapScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F217: investment × risk signal exposure — /entities/Investment + /entities/RiskSignal; EXPOSED vs SAFE
    if (isInvrskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:invrsk-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildInvrskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F61: task-risk matrix — "task risk / risky tasks / task exposure / tasks with risks /
    // task risk matrix / triskmat"
    // Opens TaskRiskMatrix panel (jarvis:task-risk-matrix-toggle) and speaks a 2-sentence brief
    // on how many tasks carry risk exposure vs are risk-clean, including critical severity count,
    // derived from /entities/Task + /entities/RiskSignal via buildTaskRiskMatrixScript().
    if (isTaskRiskMatrixQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:task-risk-matrix-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTaskRiskMatrixScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F218a: dataset × risk signal intelligence gap analyzer — /v1/datasets + /entities/RiskSignal;
    // DATA-BACKED vs DATA-DARK; "dataset risk / data-backed risks / risk evidence /
    // which risks have data / risk data gap / evidence gap / dsrsk"
    if (isDsrskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:dsrsk-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildDsrskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F218b: dataset × risk signal coverage — /v1/datasets + /entities/RiskSignal;
    // IMPLICATED vs CLEAR; "dataset risk / risk dataset / data risk coverage / dsrisk /
    // dataset signal / data exposure / dataset threat / risky datasets"
    if (isDsriskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:dsrisk-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildDsriskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F219: contact × knowledge advisor — /entities/Contact + /knowledge/;
    // surfaces LINKED (knowledge-backed) vs DARK contacts; 2-sentence AI coverage brief;
    // "contact knowledge / knowledge contacts / who has docs / person knowledge / ctknow"
    if (isCtknowQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ctknow-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCtknowScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F81: swarm job × knowledge coverage — dispatch toggle, speak BACKED vs DARK brief.
    if (isSwjknQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildSwjknScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F86: contact × task linker — /entities/Contact + /entities/Task; TASKED vs IDLE contacts;
    // dispatches jarvis:cttask-toggle; speaks TASKED/IDLE contact-task brief;
    // "contact task / task contact / who has tasks / active contacts / cttask"
    if (isCttaskQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildCttaskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F220: swarm job × contact accountability linker — /entities/SwarmJob + /entities/Contact;
    // ASSIGNED (human accountability found) vs UNASSIGNED (governance gap); 2-sentence AI brief;
    // dispatches jarvis:swcon-toggle; ◈ SWCON left:35160 zIndex:74; 90-s auto-refresh;
    // "swarm contact / swarm accountability / who owns swarm / swcon / unassigned swarm jobs"
    if (isSwconQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:swcon-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSwconScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F221: live intel × contact expertise alerter — /functions/getLiveIntel + /entities/Contact;
    // RELEVANT (expertise match ≥1 keyword) vs GENERAL (no overlap); 2-sentence AI outreach brief;
    // dispatches jarvis:lictx-toggle; ◈ LICTX left:35820 zIndex:75; 5-min auto-refresh;
    // "live intel contact / contact alert / who to contact / alert contacts / lictx / contact expertise"
    if (isLictxQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:lictx-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildLictxScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F94: Contact × Ops Event Linker — /entities/Contact + /v1/ops/events;
    // INVOLVED (keyword overlap with live ops events) vs CLEAR; 2-sentence brief;
    // dispatches jarvis:ctops-toggle; ◈ CTOPS left:9956 zIndex:69; 60-s auto-refresh;
    // "contact ops / ops contacts / who's involved / incident contacts / ctops"
    if (isCtopsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ctops-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCtopsScript();
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
