import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiBase } from "@/api/cinematicDataAdapters";
import { isStatusQuery, buildStatusScript } from "./SpokenStatusReport";
import { isMarketsQuery, buildMarketsScript } from "./MarketsTicker";
import { isEntitySearchQuery, extractEntitySearchTerm, buildEntityDossierScript } from "./EntityQuickSearch";
import { isRiskQuery, buildRiskScript } from "./RiskBoard";
import { isImpactMatrixQuery, buildImpactMatrixScript } from "./ScenarioImpactMatrix";
import { isTaskQuery, buildTaskScript } from "./TaskBoard";
import { isDatasetsQuery, buildDatasetsScript } from "./DatasetsBrowser";
import { isInvestigationsQuery, buildInvestigationsScript } from "./InvestigationsList";
import { isScenarioQuery, buildScenarioScript } from "./ScenarioLauncher";
import { isDocumentQuery, buildDocumentScript } from "./DocumentSearch";
import { isSkillQuery, buildSkillScript } from "./SkillScorecard";
import { isBrainQuery, buildBrainScript } from "./BrainGrowthSparkline";
import { isAnchorDrillQuery, buildAnchorScript } from "./PerSceneAnchorDrillDown";
import { isAmbientQuery } from "./AmbientReactorHum";
import { isShowMeQuery, buildShowMeScript } from "./ShowMeRouter";
import { isClockQuery, buildClockScript } from "./LiveClockUptime";
import { isAlertQuery, buildAlertScript } from "./AlertToasts";
import { isInvestmentQuery, buildInvestmentScript } from "./InvestmentWidget";
import { isContactsQuery, buildContactsScript } from "./ContactsDirectory";
import { isSwarmQuery, buildSwarmScript } from "./SwarmJobsMonitor";
import { isCentralityQuery, buildCentralityScript } from "./GraphCentralityView";
import { isDiagnosticsQuery, buildDiagnosticsScript } from "./ServiceDiagnostics";
import { isHistoryQuery, buildHistoryScript } from "./CommandHistory";
import { getActiveVoice, isVoiceQuery, buildVoiceScript, applyVoiceFromQuery } from "./MultiVoiceToggle";
import { isTourQuery, buildTourScript } from "./SceneAutoTour";
import { isOpsEventsQuery, buildOpsEventsScript } from "./OpsEventsFeed";
import { isTbmQuery, buildTbmScript } from "./TaskBurndownMonitor";
import { isIntelProfileQuery, buildIntelProfileScript } from "./IntelProfileDirectory";
import { isCommunitiesQuery, buildCommunitiesScript } from "./GraphCommunitiesView";
import { isSbbQuery, buildSbbScript } from "./SecondBrainBrowser";
import { isScenarioRiskAdvisorQuery, buildScenarioRiskAdvisorScript } from "./ScenarioRiskAdvisor";
import { isPathQuery, buildPathScript } from "./GraphPathExplorer";
import { isAthrepQuery, buildAthrepScript } from "./AdaptiveThreatReport";
import { isBnvmQuery, buildBnvmScript } from "./BrainNodeVelocityMonitor";
import { isRemindersQuery, buildRemindersScript } from "./RemindersPanel";
import { isMissionControlQuery, buildMissionControlScript } from "./MissionControlConsole";
import { isInvtlQuery, buildInvtlScript } from "./InvestigationTimeline";
import { isKsrecQuery, buildKsrecScript } from "./KnowledgeSkillRecommender";
import { isLitaskQuery, buildLitaskScript } from "./LiveTaskUrgencySignal";
import { isCrisisWarningQuery, buildCrisisWarningScript } from "./CrisisEarlyWarning";
import { isGraphTimelineQuery, buildGraphTimelineScript } from "./GraphTimelineScrubber";
import { isReportViewerQuery, buildReportViewerScript } from "./ReportViewer";
import { isRulesBrowserQuery, buildRulesBrowserScript } from "./DecisionRulesBrowser";
import { isSecurityAuditQuery, buildSecurityAuditScript } from "./SecurityAuditConsole";
import { isKfmQuery, buildKfmScript } from "./KnowledgeFreshnessMonitor";
import { isEvthmQuery, buildEvthmScript } from "./OpsEventHeatmap";
import { isKrgapQuery, buildKrgapScript } from "./KnowledgeReportAuditor";
import { isTaskRiskMatrixQuery, buildTaskRiskMatrixScript } from "./TaskRiskMatrix";
import { isIntelProfileRosterQuery, buildIntelProfileRosterScript } from "./IntelProfileRoster";
import { isDataIntakeQuery, buildDataIntakeScript } from "./DataIntakeMonitor";
import { isGraphNeighborhoodQuery, buildGraphNeighborhoodScript } from "./GraphNeighborhoodExplorer";
import { isContactRiskQuery, buildContactRiskScript } from "./ContactRiskNexus";
import { isRtkmonQuery, buildRtkmonScript } from "./DecisionRulesTaskMonitor";
import { isSwarmRiskQuery, buildSwarmRiskScript } from "./SwarmRiskCoverageMonitor";
import { isInvscnQuery, buildInvscnScript } from "./InvestmentScenarioExposure";
import { isKtgapQuery, buildKtgapScript } from "./KnowledgeTaskGapDetector";
import { isContactInvQuery, buildContactInvScript } from "./ContactInvestigationLinker";
import { isRriskQuery, buildRriskScript } from "./ReportRiskCoverageMonitor";
import { isSkgapQuery, buildSkgapScript } from "./ScenarioKnowledgeGap";
import { isCscnxQuery, buildCscnxScript } from "./ContactScenarioNexus";
import { isSwrinvQuery, buildSwrinvScript } from "./SwarmJobInvestigationNexus";
import { isIpinvQuery, buildIpinvScript } from "./IntelProfileInvestigationNexus";
import { isDinvQuery, buildDinvScript } from "./DatasetInvestigationNexus";
import { isScnopsQuery, buildScnopsScript } from "./ScenarioOpsEventNexus";
import { isSkillinvQuery, buildSkillinvScript } from "./SkillInvestigationNexus";
import { isInvrskQuery, buildInvrskScript } from "./InvestmentRiskExposure";
import { isTrscQuery, buildTrscScript } from "./TaskRiskSignalCorrelator";
import { isRulsrskQuery, buildRulsrskScript } from "./DecisionRulesRiskNexus";
import { isRulsinvQuery, buildRulsinvScript } from "./RulesInvestigationNexus";
import { isRtcovQuery, buildRtcovScript } from "./ReportTaskCoverageMonitor";
import { isOetaskQuery, buildOetaskScript } from "./OpsEventTaskCorrelator";
import { isThreatVelocityQuery, buildThreatVelocityScript } from "./ThreatVelocityMonitor";
import { isSsscenQuery, buildSsscenScript } from "./SystemStatusScenarioCoverage";
import { isLwriskQuery, buildLwriskScript } from "./LiveWorldRiskCorrelator";
import { isSkrskQuery, buildSkrskScript } from "./SkillRiskCoverageMonitor";
import { isDatasetScenarioQuery, buildDatasetScenarioScript } from "./DatasetScenarioCoverageMonitor";
import { isIprscQuery, buildIprscScript } from "./IntelProfileRiskCorrelator";
import { isIprskQuery, buildIprskScript } from "./IntelProfileRiskLinker";
import { isCknowQuery, buildCknowScript } from "./ContactKnowledgeNexus";
import { isIntelskillQuery, buildIntelskillScript } from "./IntelProfileSkillAlignment";
import { isRscncovQuery, buildRscncovScript } from "./ReportScenarioCoverageMonitor";
import { isTaskScenarioQuery, buildTaskScenarioScript } from "./TaskScenarioExposure";
import { isSwrknoQuery, buildSwrknoScript } from "./SwarmKnowledgeNexus";
import { isOevknoQuery, buildOevknoScript } from "./OpsEventKnowledgeNexus";
import { isStaskQuery, buildStaskScript } from "./SkillTaskNexus";
import { isRlnkQuery, buildRlnkScript } from "./ReportKnowledgeLinker";
import { isHealthScoreQuery, buildHealthScoreScript } from "./SystemHealthScorecard";
import { isDatknopQuery, buildDatknopScript } from "./DatasetKnowledgeNexus";
import { isInvknowQuery, buildInvknowScript } from "./InvestmentKnowledgeAdvisor";
import { isTexmonQuery, buildTexmonScript } from "./TaskExecutionCoverageMonitor";
import { isContactSwarmQuery, buildContactSwarmScript } from "./ContactSwarmCoverage";
import { isSwrdsetQuery, buildSwrdsetScript } from "./SwarmDatasetNexus";
import { isInvinvQuery, buildInvinvScript } from "./InvestmentInvestigationNexus";
import { isSwrscnQuery, buildSwrscnScript } from "./SwarmScenarioNexus";
import { isInvoevQuery, buildInvoevScript } from "./InvestmentOpsEventNexus";
import { isCdataQuery, buildCdataScript } from "./ContactDatasetNexus";
import { isCoevtQuery, buildCoevtScript } from "./ContactOpsEventNexus";
import { isCiprQuery, buildCiprScript } from "./ContactIntelProfileCrossRef";
import { isSkopsQuery, buildSkopsScript } from "./SkillOpsEventCoverage";
import { isInvSwjQuery, buildInvSwjScript } from "./InvestmentSwarmJobCoverage";
import { isIpscenQuery, buildIpscenScript } from "./IntelProfileScenarioCoverage";
import { isSjintelQuery, buildSjintelScript } from "./SwarmIntelProfileCoverage";
import { isAsrcQuery, buildAsrcScript } from "./AipSkillReportsCoverage";
import { isSjoeQuery, buildSjoeScript } from "./SwarmJobOpsEventsCorrelator";
import { isRulsknoQuery, buildRulsknoScript } from "./DecisionRulesKnowledgeNexus";
import { isCtrptQuery, buildCtrptScript } from "./ContactReportCoverage";
import { isTdsetQuery, buildTdsetScript } from "./TaskDatasetNexus";
import { isRuldsetQuery, buildRuldsetScript } from "./DecisionRulesDatasetNexus";
import { isGninvQuery, buildGninvScript } from "./GraphNodeInvestigationCoverage";
import { isScninvQuery, buildScninvScript } from "./ScenarioInvestmentCoverage";
import { isRinvQuery, buildRinvScript } from "./ReportInvestigationNexus";
import { isTaintelQuery, buildTaintelScript } from "./TaskIntelProfileNexus";
import { isRpopsQuery, buildRpopsScript } from "./ReportOpsEventCoverage";
import { isSwrrptQuery, buildSwrrptScript } from "./SwarmReportCoverageMonitor";
import { isCttaskQuery, buildCttaskScript } from "./ContactTaskLinker";
import { isSctmQuery, buildSctmScript } from "./AipSkillContactTaskMesh";
import { isIpdsetQuery, buildIpdsetScript } from "./IntelProfileDatasetNexus";
import { isRulscntQuery, buildRulscntScript } from "./DecisionRulesContactNexus";
import { isSkdsQuery, buildSkdsScript } from "./SkillDatasetCoverageAdvisor";
import { isRulscnQuery, buildRulscnScript } from "./DecisionRulesScenarioNexus";
import { isRulswrmQuery, buildRulswrmScript } from "./DecisionRulesSwarmNexus";
import { isLwknoQuery, buildLwknoScript } from "./LiveWorldKnowledgeNexus";
import { isDsrskQuery, buildDsrskScript } from "./DatasetRiskAnalyzer";
import { isDsriskQuery, buildDsriskScript } from "./DatasetRiskCoverage";
import { isIpoevQuery, buildIpoevScript } from "./IntelProfileOpsEventCoverage";
import { isEpulseQuery, buildEpulseScript } from "./EntityPulseDashboard";
import { isLwtaskQuery, buildLwtaskScript } from "./LiveWorldTaskCorrelator";
import { isLwscnQuery, buildLwscnScript } from "./LiveWorldScenarioCorrelator";
import { isLwswrmQuery, buildLwswrmScript } from "./LiveWorldSwarmCorrelator";
import { isLwintelQuery, buildLwintelScript } from "./LiveWorldIntelProfileCorrelator";
import { isLwcntQuery, buildLwcntScript } from "./LiveWorldContactCorrelator";
import { isLwinvQuery, buildLwinvScript } from "./LiveWorldInvestmentCorrelator";
import { isLwrulsQuery, buildLwrulsScript } from "./LiveWorldDecisionRulesCorrelator";
import { isLwrptQuery, buildLwrptScript } from "./LiveWorldReportCorrelator";
import { isLwdsetQuery, buildLwdsetScript } from "./LiveWorldDatasetCorrelator";
import { isLwopsQuery, buildLwopsScript } from "./LiveWorldOpsEventsCorrelator";
import { isOmbrfQuery, buildOmbrfScript } from "./OperationalMorningBriefing";
import { isSkasQuery, buildSkasScript } from "./AipSkillScenarioCoverage";
import { isSklswrmQuery, buildSklswrmScript } from "./SkillSwarmJobCoverage";
import { isCskillQuery, buildCskillScript } from "./ContactSkillCoverage";
import { isSkillContactQuery, buildSkillContactScript } from "./SkillContactGapAdvisor";
import { isTimelineQuery, buildTimelineScript } from "./ThreatTimeline";
import { isAsicQuery, buildAsicScript } from "./AipSkillInvestigationCoverage";
import { isRulsintelQuery, buildRulsintelScript } from "./DecisionRulesIntelProfileNexus";
import { isRulrptQuery, buildRulrptScript } from "./DecisionRulesReportsNexus";
import { isSceneAnchorMonitorQuery, buildSceneAnchorMonitorScript } from "./AllScenesAnchorMonitor";
import { isDpdigQuery, buildDpdigScript } from "./DailyPriorityDigest";
import { isGrknoQuery, buildGrknoScript } from "./GraphKnowledgeNexus";
import { isGrscnQuery, buildGrscnScript } from "./GraphScenarioCoverage";
import { isGtmxQuery, buildGtmxScript } from "./GraphTimeMachinePanel";
import { isKnoscQuery, buildKnoscScript } from "./KnowledgeScenarioCoverage";
import { isGrrptQuery, buildGrrptScript } from "./GraphReportsNexus";
import { isGrrulsQuery, buildGrrulsScript } from "./GraphDecisionRulesNexus";
import { isGrswrmQuery, buildGrswrmScript } from "./GraphSwarmCoverage";
import { isGrcntQuery, buildGrcntScript } from "./GraphContactNexus";
import { isGrinvQuery, buildGrinvScript } from "./GraphInvestmentNexus";
import { isGrtaskQuery, buildGrtaskScript } from "./GraphTaskNexus";
import { isGrdsetQuery, buildGrdsetScript } from "./GraphDatasetNexus";
import { isSwarmTaskQuery, buildSwarmTaskScript } from "./SwarmTaskAdvisor";
import { isGnsrskQuery, buildGnsrskScript } from "./GraphNodeRiskSignalCoverage";
import { isGnintelQuery, buildGnintelScript } from "./GraphNodeIntelCoverage";
import { isGcasQuery, buildGcasScript } from "./GraphCentralityAipSkillCoverage";
import { isGrremQuery, buildGrremScript } from "./GraphRemindersNexus";
import { isGcoeQuery, buildGcoeScript } from "./GraphCentralityOpsEvents";
import { isKnorskQuery, buildKnorskScript } from "./KnowledgeRiskNexus";
import { isReminvQuery, buildReminvScript } from "./RemindersInvestigationNexus";
import { isRptinvQuery, buildRptinvScript } from "./ReportsInvestigationNexus";
import { isRemtaskQuery, buildRemtaskScript } from "./RemindersTaskNexus";
import { isRemrskQuery, buildRemrskScript } from "./RemindersRiskSignalNexus";
import { isRemcntQuery, buildRemcntScript } from "./RemindersContactNexus";
import { isRemknoQuery, buildRemknoScript } from "./RemindersKnowledgeNexus";
import { isRemswrmQuery, buildRemswrmScript } from "./RemindersSwarmJobNexus";
import { isRemintelQuery, buildRemintelScript } from "./RemindersIntelProfileNexus";
import { isRemdsetQuery, buildRemdsetScript } from "./RemindersDatasetNexus";
import { isRemopsQuery, buildRemopsScript } from "./RemindersOpsEventNexus";
import { isRemscnQuery, buildRemscnScript } from "./RemindersScenarioNexus";
import { isRemrptQuery, buildRemrptScript } from "./RemindersReportsNexus";

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
    clearTimeout(hideT.current);
    setOpen(true); setThinking(true); setText("");
    const scene = detectScene(q);
    if (scene) navigate(`/cinematic/${scene}`);
    let answer = "";
    try {
      if (isVoiceQuery(q)) {
        const chosen = applyVoiceFromQuery(q);
        answer = buildVoiceScript();
        window.dispatchEvent(new CustomEvent("jarvis:voice-change", { detail: { voice: chosen } }));
      } else if (isShowMeQuery(q)) {
        answer = await buildShowMeScript(q);
      } else if (isStatusQuery(q)) {
        answer = await buildStatusScript();
      } else if (isMarketsQuery(q)) {
        answer = await buildMarketsScript();
      } else if (isImpactMatrixQuery(q)) {
        answer = await buildImpactMatrixScript();
        window.dispatchEvent(new CustomEvent("jarvis:matrix-toggle"));
      } else if (isRiskQuery(q)) {
        answer = await buildRiskScript();
      } else if (isTaskQuery(q)) {
        answer = await buildTaskScript();
      } else if (isDatasetsQuery(q)) {
        answer = await buildDatasetsScript();
      } else if (isInvestigationsQuery(q)) {
        answer = await buildInvestigationsScript();
      } else if (isScenarioQuery(q)) {
        answer = await buildScenarioScript();
      } else if (isDocumentQuery(q)) {
        answer = await buildDocumentScript();
      } else if (isSkillQuery(q)) {
        answer = await buildSkillScript();
      } else if (isBrainQuery(q)) {
        answer = await buildBrainScript();
      } else if (isAnchorDrillQuery(q)) {
        answer = await buildAnchorScript();
      } else if (isClockQuery(q)) {
        answer = await buildClockScript();
      } else if (isAlertQuery(q)) {
        answer = await buildAlertScript();
        window.dispatchEvent(new CustomEvent("jarvis:alerts-toggle"));
      } else if (isInvestmentQuery(q)) {
        answer = await buildInvestmentScript();
      } else if (isContactsQuery(q)) {
        answer = await buildContactsScript();
      } else if (isSwarmQuery(q)) {
        answer = await buildSwarmScript();
      } else if (isCentralityQuery(q)) {
        answer = await buildCentralityScript();
      } else if (isDiagnosticsQuery(q)) {
        answer = await buildDiagnosticsScript();
      } else if (isHistoryQuery(q)) {
        answer = buildHistoryScript();
      } else if (isTourQuery(q)) {
        answer = buildTourScript();
        window.dispatchEvent(new CustomEvent("jarvis:tour-start"));
      } else if (isOpsEventsQuery(q)) {
        answer = await buildOpsEventsScript();
        window.dispatchEvent(new CustomEvent("jarvis:ops-events-toggle"));
      } else if (isTbmQuery(q)) {
        answer = await buildTbmScript();
        window.dispatchEvent(new CustomEvent("jarvis:tbm-toggle"));
      } else if (isIntelProfileQuery(q)) {
        answer = await buildIntelProfileScript();
      } else if (isCommunitiesQuery(q)) {
        answer = await buildCommunitiesScript();
        window.dispatchEvent(new CustomEvent("jarvis:communities-toggle"));
      } else if (isSbbQuery(q)) {
        answer = await buildSbbScript();
        window.dispatchEvent(new CustomEvent("jarvis:sbb-toggle"));
      } else if (isScenarioRiskAdvisorQuery(q)) {
        answer = await buildScenarioRiskAdvisorScript();
        window.dispatchEvent(new CustomEvent("jarvis:srmadvisor-toggle"));
      } else if (isAthrepQuery(q)) {
        answer = await buildAthrepScript();
        window.dispatchEvent(new CustomEvent("jarvis:athrep-toggle"));
      } else if (isBnvmQuery(q)) {
        answer = await buildBnvmScript();
        window.dispatchEvent(new CustomEvent("jarvis:bnvm-toggle"));
      } else if (isMissionControlQuery(q)) {
        answer = await buildMissionControlScript();
      } else if (isRemindersQuery(q)) {
        answer = await buildRemindersScript();
      } else if (isInvtlQuery(q)) {
        answer = await buildInvtlScript();
        window.dispatchEvent(new CustomEvent("jarvis:invtl-toggle"));
      } else if (isKsrecQuery(q)) {
        answer = await buildKsrecScript();
        window.dispatchEvent(new CustomEvent("jarvis:ksrec-toggle"));
      } else if (isLitaskQuery(q)) {
        answer = await buildLitaskScript();
        window.dispatchEvent(new CustomEvent("jarvis:litask-toggle"));
      } else if (isCrisisWarningQuery(q)) {
        answer = await buildCrisisWarningScript();
        window.dispatchEvent(new CustomEvent("jarvis:crisis-warning-toggle"));
      } else if (isGraphTimelineQuery(q)) {
        answer = await buildGraphTimelineScript();
      } else if (isReportViewerQuery(q)) {
        answer = await buildReportViewerScript();
      } else if (isRulesBrowserQuery(q)) {
        answer = await buildRulesBrowserScript();
      } else if (isSecurityAuditQuery(q)) {
        answer = await buildSecurityAuditScript();
      } else if (isKfmQuery(q)) {
        answer = await buildKfmScript();
        window.dispatchEvent(new CustomEvent("jarvis:kfm-toggle"));
      } else if (isEvthmQuery(q)) {
        answer = await buildEvthmScript();
      } else if (isKrgapQuery(q)) {
        answer = await buildKrgapScript();
      } else if (isTaskRiskMatrixQuery(q)) {
        answer = await buildTaskRiskMatrixScript();
        window.dispatchEvent(new CustomEvent("jarvis:task-risk-matrix-toggle"));
      } else if (isIntelProfileRosterQuery(q)) {
        answer = await buildIntelProfileRosterScript();
        window.dispatchEvent(new CustomEvent("jarvis:intel-roster-toggle"));
      } else if (isDataIntakeQuery(q)) {
        answer = await buildDataIntakeScript();
        window.dispatchEvent(new CustomEvent("jarvis:dint-toggle"));
      } else if (isGraphNeighborhoodQuery(q)) {
        answer = await buildGraphNeighborhoodScript();
        window.dispatchEvent(new CustomEvent("jarvis:gneigh-toggle"));
      } else if (isContactRiskQuery(q)) {
        answer = await buildContactRiskScript();
        window.dispatchEvent(new CustomEvent("jarvis:crisk-toggle"));
      } else if (isRtkmonQuery(q)) {
        answer = await buildRtkmonScript();
        window.dispatchEvent(new CustomEvent("jarvis:rtkmon-toggle"));
      } else if (isSwarmRiskQuery(q)) {
        answer = await buildSwarmRiskScript();
        window.dispatchEvent(new CustomEvent("jarvis:srisk-toggle"));
      } else if (isInvscnQuery(q)) {
        answer = await buildInvscnScript();
        window.dispatchEvent(new CustomEvent("jarvis:invscn-toggle"));
      } else if (isKtgapQuery(q)) {
        answer = await buildKtgapScript();
        window.dispatchEvent(new CustomEvent("jarvis:ktgap-toggle"));
      } else if (isContactInvQuery(q)) {
        answer = await buildContactInvScript();
        window.dispatchEvent(new CustomEvent("jarvis:contact-inv-toggle"));
      } else if (isRriskQuery(q)) {
        answer = await buildRriskScript();
        window.dispatchEvent(new CustomEvent("jarvis:rrisk-toggle"));
      } else if (isSkgapQuery(q)) {
        answer = await buildSkgapScript();
        window.dispatchEvent(new CustomEvent("jarvis:skgap-toggle"));
      } else if (isSwrinvQuery(q)) {
        answer = await buildSwrinvScript();
        window.dispatchEvent(new CustomEvent("jarvis:swrinv-toggle"));
      } else if (isIpinvQuery(q)) {
        answer = await buildIpinvScript();
        window.dispatchEvent(new CustomEvent("jarvis:ipinv-toggle"));
      } else if (isDinvQuery(q)) {
        answer = await buildDinvScript();
        window.dispatchEvent(new CustomEvent("jarvis:dinv-toggle"));
      } else if (isScnopsQuery(q)) {
        answer = await buildScnopsScript();
        window.dispatchEvent(new CustomEvent("jarvis:scnops-toggle"));
      } else if (isSkillinvQuery(q)) {
        answer = await buildSkillinvScript();
        window.dispatchEvent(new CustomEvent("jarvis:skillinv-toggle"));
      } else if (isInvrskQuery(q)) {
        answer = await buildInvrskScript();
        window.dispatchEvent(new CustomEvent("jarvis:invrsk-toggle"));
      } else if (isCscnxQuery(q)) {
        answer = await buildCscnxScript();
        window.dispatchEvent(new CustomEvent("jarvis:cscnx-toggle"));
      } else if (isTrscQuery(q)) {
        answer = await buildTrscScript();
        window.dispatchEvent(new CustomEvent("jarvis:trsc-toggle"));
      } else if (isRulsrskQuery(q)) {
        answer = await buildRulsrskScript();
        window.dispatchEvent(new CustomEvent("jarvis:rulsrsk-toggle"));
      } else if (isRulsinvQuery(q)) {
        answer = await buildRulsinvScript();
        window.dispatchEvent(new CustomEvent("jarvis:rulsinv-toggle"));
      } else if (isRtcovQuery(q)) {
        answer = await buildRtcovScript();
        window.dispatchEvent(new CustomEvent("jarvis:rtcov-toggle"));
      } else if (isOetaskQuery(q)) {
        answer = await buildOetaskScript();
        window.dispatchEvent(new CustomEvent("jarvis:oetask-toggle"));
      } else if (isThreatVelocityQuery(q)) {
        answer = await buildThreatVelocityScript();
        window.dispatchEvent(new CustomEvent("jarvis:velocity-toggle"));
      } else if (isSsscenQuery(q)) {
        answer = await buildSsscenScript();
        window.dispatchEvent(new CustomEvent("jarvis:ssscen-toggle"));
      } else if (isLwriskQuery(q)) {
        answer = await buildLwriskScript();
        window.dispatchEvent(new CustomEvent("jarvis:lwrisk-toggle"));
      } else if (isSkrskQuery(q)) {
        answer = await buildSkrskScript();
        window.dispatchEvent(new CustomEvent("jarvis:skrsk-toggle"));
      } else if (isDatasetScenarioQuery(q)) {
        answer = await buildDatasetScenarioScript();
        window.dispatchEvent(new CustomEvent("jarvis:dscncov-toggle"));
      } else if (isIprscQuery(q)) {
        answer = await buildIprscScript();
        window.dispatchEvent(new CustomEvent("jarvis:iprsc-toggle"));
      } else if (isIprskQuery(q)) {
        answer = await buildIprskScript();
        window.dispatchEvent(new CustomEvent("jarvis:iprsk-toggle"));
      } else if (isCknowQuery(q)) {
        answer = await buildCknowScript();
        window.dispatchEvent(new CustomEvent("jarvis:cknow-toggle"));
      } else if (isIntelskillQuery(q)) {
        answer = await buildIntelskillScript();
        window.dispatchEvent(new CustomEvent("jarvis:intelskill-toggle"));
      } else if (isRscncovQuery(q)) {
        answer = await buildRscncovScript();
        window.dispatchEvent(new CustomEvent("jarvis:rscncov-toggle"));
      } else if (isTaskScenarioQuery(q)) {
        answer = await buildTaskScenarioScript();
        window.dispatchEvent(new CustomEvent("jarvis:taskscn-toggle"));
      } else if (isSwrknoQuery(q)) {
        answer = await buildSwrknoScript();
        window.dispatchEvent(new CustomEvent("jarvis:swrkno-toggle"));
      } else if (isOevknoQuery(q)) {
        answer = await buildOevknoScript();
        window.dispatchEvent(new CustomEvent("jarvis:oevkno-toggle"));
      } else if (isStaskQuery(q)) {
        answer = await buildStaskScript();
        window.dispatchEvent(new CustomEvent("jarvis:stask-toggle"));
      } else if (isHealthScoreQuery(q)) {
        answer = await buildHealthScoreScript();
        window.dispatchEvent(new CustomEvent("jarvis:healthscore-toggle"));
      } else if (isRlnkQuery(q)) {
        answer = await buildRlnkScript();
        window.dispatchEvent(new CustomEvent("jarvis:rlnk-toggle"));
      } else if (isDatknopQuery(q)) {
        answer = await buildDatknopScript();
        window.dispatchEvent(new CustomEvent("jarvis:datkno-toggle"));
      } else if (isInvknowQuery(q)) {
        answer = await buildInvknowScript();
        window.dispatchEvent(new CustomEvent("jarvis:invknow-toggle"));
      } else if (isTexmonQuery(q)) {
        answer = await buildTexmonScript();
      } else if (isContactSwarmQuery(q)) {
        answer = await buildContactSwarmScript();
        window.dispatchEvent(new CustomEvent("jarvis:cswrm-toggle"));
      } else if (isSwrdsetQuery(q)) {
        answer = await buildSwrdsetScript();
        window.dispatchEvent(new CustomEvent("jarvis:swrdset-toggle"));
      } else if (isInvinvQuery(q)) {
        answer = await buildInvinvScript();
        window.dispatchEvent(new CustomEvent("jarvis:invinv-toggle"));
      } else if (isSwrscnQuery(q)) {
        answer = await buildSwrscnScript();
        window.dispatchEvent(new CustomEvent("jarvis:swrscn-toggle"));
      } else if (isInvoevQuery(q)) {
        answer = await buildInvoevScript();
        window.dispatchEvent(new CustomEvent("jarvis:invoev-toggle"));
      } else if (isCdataQuery(q)) {
        answer = await buildCdataScript();
        window.dispatchEvent(new CustomEvent("jarvis:cdata-toggle"));
      } else if (isCoevtQuery(q)) {
        answer = await buildCoevtScript();
      } else if (isCiprQuery(q)) {
        answer = await buildCiprScript();
        window.dispatchEvent(new CustomEvent("jarvis:coevt-toggle"));
      } else if (isSkopsQuery(q)) {
        answer = await buildSkopsScript();
        window.dispatchEvent(new CustomEvent("jarvis:skops-toggle"));
      } else if (isInvSwjQuery(q)) {
        answer = await buildInvSwjScript();
        window.dispatchEvent(new CustomEvent("jarvis:invswj-toggle"));
      } else if (isSjintelQuery(q)) {
        answer = await buildSjintelScript();
        window.dispatchEvent(new CustomEvent("jarvis:sjintel-toggle"));
      } else if (isAsrcQuery(q)) {
        answer = await buildAsrcScript();
        window.dispatchEvent(new CustomEvent("jarvis:asrc-toggle"));
      } else if (isSjoeQuery(q)) {
        answer = await buildSjoeScript();
        window.dispatchEvent(new CustomEvent("jarvis:sjoe-toggle"));
      } else if (isRulsknoQuery(q)) {
        answer = await buildRulsknoScript();
        window.dispatchEvent(new CustomEvent("jarvis:rulskno-toggle"));
      } else if (isCtrptQuery(q)) {
        answer = await buildCtrptScript();
        window.dispatchEvent(new CustomEvent("jarvis:ctrpt-toggle"));
      } else if (isTdsetQuery(q)) {
        answer = await buildTdsetScript();
        window.dispatchEvent(new CustomEvent("jarvis:tdset-toggle"));
      } else if (isRuldsetQuery(q)) {
        answer = await buildRuldsetScript();
        window.dispatchEvent(new CustomEvent("jarvis:ruldset-toggle"));
      } else if (isGninvQuery(q)) {
        answer = await buildGninvScript();
        window.dispatchEvent(new CustomEvent("jarvis:gninv-toggle"));
      } else if (isScninvQuery(q)) {
        answer = await buildScninvScript();
        window.dispatchEvent(new CustomEvent("jarvis:scninv-toggle"));
      } else if (isRinvQuery(q)) {
        answer = await buildRinvScript();
        window.dispatchEvent(new CustomEvent("jarvis:rinv-toggle"));
      } else if (isTaintelQuery(q)) {
        answer = await buildTaintelScript();
        window.dispatchEvent(new CustomEvent("jarvis:taintel-toggle"));
      } else if (isRpopsQuery(q)) {
        answer = await buildRpopsScript();
        window.dispatchEvent(new CustomEvent("jarvis:rpops-toggle"));
      } else if (isSwrrptQuery(q)) {
        answer = await buildSwrrptScript();
        window.dispatchEvent(new CustomEvent("jarvis:swrrpt-toggle"));
      } else if (isCttaskQuery(q)) {
        answer = await buildCttaskScript();
        window.dispatchEvent(new CustomEvent("jarvis:cttask-toggle"));
      } else if (isSctmQuery(q)) {
        answer = await buildSctmScript();
        window.dispatchEvent(new CustomEvent("jarvis:sctm-toggle"));
      } else if (isIpdsetQuery(q)) {
        answer = await buildIpdsetScript();
        window.dispatchEvent(new CustomEvent("jarvis:ipdset-toggle"));
      } else if (isRulscntQuery(q)) {
        answer = await buildRulscntScript();
        window.dispatchEvent(new CustomEvent("jarvis:rulscnt-toggle"));
      } else if (isSkdsQuery(q)) {
        answer = await buildSkdsScript();
        window.dispatchEvent(new CustomEvent("jarvis:skds-toggle"));
      } else if (isRulscnQuery(q)) {
        answer = await buildRulscnScript();
        window.dispatchEvent(new CustomEvent("jarvis:rulscn-toggle"));
      } else if (isRulswrmQuery(q)) {
        answer = await buildRulswrmScript();
        window.dispatchEvent(new CustomEvent("jarvis:rulswrm-toggle"));
      } else if (isLwknoQuery(q)) {
        answer = await buildLwknoScript();
        window.dispatchEvent(new CustomEvent("jarvis:lwkno-toggle"));
      } else if (isDsrskQuery(q)) {
        answer = await buildDsrskScript();
        window.dispatchEvent(new CustomEvent("jarvis:dsrsk-toggle"));
      } else if (isDsriskQuery(q)) {
        answer = await buildDsriskScript();
        window.dispatchEvent(new CustomEvent("jarvis:dsrisk-toggle"));
      } else if (isIpoevQuery(q)) {
        answer = await buildIpoevScript();
        window.dispatchEvent(new CustomEvent("jarvis:ipoev-toggle"));
      } else if (isEpulseQuery(q)) {
        answer = await buildEpulseScript();
        window.dispatchEvent(new CustomEvent("jarvis:epulse-toggle"));
      } else if (isLwtaskQuery(q)) {
        answer = await buildLwtaskScript();
        window.dispatchEvent(new CustomEvent("jarvis:lwtask-toggle"));
      } else if (isLwscnQuery(q)) {
        answer = await buildLwscnScript();
        window.dispatchEvent(new CustomEvent("jarvis:lwscn-toggle"));
      } else if (isLwswrmQuery(q)) {
        answer = await buildLwswrmScript();
        window.dispatchEvent(new CustomEvent("jarvis:lwswrm-toggle"));
      } else if (isLwintelQuery(q)) {
        answer = await buildLwintelScript();
        window.dispatchEvent(new CustomEvent("jarvis:lwintel-toggle"));
      } else if (isLwcntQuery(q)) {
        answer = await buildLwcntScript();
        window.dispatchEvent(new CustomEvent("jarvis:lwcnt-toggle"));
      } else if (isLwinvQuery(q)) {
        answer = await buildLwinvScript();
        window.dispatchEvent(new CustomEvent("jarvis:lwinv-toggle"));
      } else if (isLwrulsQuery(q)) {
        answer = await buildLwrulsScript();
        window.dispatchEvent(new CustomEvent("jarvis:lwruls-toggle"));
      } else if (isLwrptQuery(q)) {
        answer = await buildLwrptScript();
        window.dispatchEvent(new CustomEvent("jarvis:lwrpt-toggle"));
      } else if (isLwdsetQuery(q)) {
        answer = await buildLwdsetScript();
        window.dispatchEvent(new CustomEvent("jarvis:lwdset-toggle"));
      } else if (isLwopsQuery(q)) {
        answer = await buildLwopsScript();
        window.dispatchEvent(new CustomEvent("jarvis:lwops-toggle"));
      } else if (isOmbrfQuery(q)) {
        answer = await buildOmbrfScript();
        window.dispatchEvent(new CustomEvent("jarvis:ombrf-toggle"));
      } else if (isSkasQuery(q)) {
        answer = await buildSkasScript();
        window.dispatchEvent(new CustomEvent("jarvis:skas-toggle"));
      } else if (isIpscenQuery(q)) {
        answer = await buildIpscenScript();
        window.dispatchEvent(new CustomEvent("jarvis:ipscen-toggle"));
      } else if (isSklswrmQuery(q)) {
        answer = await buildSklswrmScript();
        window.dispatchEvent(new CustomEvent("jarvis:sklswrm-toggle"));
      } else if (isCskillQuery(q)) {
        answer = await buildCskillScript();
        window.dispatchEvent(new CustomEvent("jarvis:cskill-toggle"));
      } else if (isSkillContactQuery(q)) {
        answer = await buildSkillContactScript();
        window.dispatchEvent(new CustomEvent("jarvis:skillcontact-toggle"));
      } else if (isTimelineQuery(q)) {
        answer = await buildTimelineScript();
        window.dispatchEvent(new CustomEvent("jarvis:timeline-toggle"));
      } else if (isAsicQuery(q)) {
        answer = await buildAsicScript();
        window.dispatchEvent(new CustomEvent("jarvis:asic-toggle"));
      } else if (isRulsintelQuery(q)) {
        answer = await buildRulsintelScript();
        window.dispatchEvent(new CustomEvent("jarvis:rulsintel-toggle"));
      } else if (isRulrptQuery(q)) {
        answer = await buildRulrptScript();
        window.dispatchEvent(new CustomEvent("jarvis:rulrpt-toggle"));
      } else if (isDpdigQuery(q)) {
        answer = await buildDpdigScript();
        window.dispatchEvent(new CustomEvent("jarvis:dpdig-toggle"));
      } else if (isGrknoQuery(q)) {
        answer = await buildGrknoScript();
        window.dispatchEvent(new CustomEvent("jarvis:grkno-toggle"));
      } else if (isGrscnQuery(q)) {
        answer = await buildGrscnScript();
        window.dispatchEvent(new CustomEvent("jarvis:grscn-toggle"));
      } else if (isGtmxQuery(q)) {
        answer = await buildGtmxScript();
        window.dispatchEvent(new CustomEvent("jarvis:gtmx-toggle"));
      } else if (isSwarmTaskQuery(q)) {
        answer = await buildSwarmTaskScript();
        window.dispatchEvent(new CustomEvent("jarvis:swarmtask-toggle"));
      } else if (isKnoscQuery(q)) {
        answer = await buildKnoscScript();
        window.dispatchEvent(new CustomEvent("jarvis:knosc-toggle"));
      } else if (isGrcntQuery(q)) {
        answer = await buildGrcntScript();
        window.dispatchEvent(new CustomEvent("jarvis:grcnt-toggle"));
      } else if (isGrinvQuery(q)) {
        answer = await buildGrinvScript();
        window.dispatchEvent(new CustomEvent("jarvis:grinv-toggle"));
      } else if (isGrtaskQuery(q)) {
        answer = await buildGrtaskScript();
        window.dispatchEvent(new CustomEvent("jarvis:grtask-toggle"));
      } else if (isGrdsetQuery(q)) {
        answer = await buildGrdsetScript();
        window.dispatchEvent(new CustomEvent("jarvis:grdset-toggle"));
      } else if (isGrswrmQuery(q)) {
        answer = await buildGrswrmScript();
        window.dispatchEvent(new CustomEvent("jarvis:grswrm-toggle"));
      } else if (isGnsrskQuery(q)) {
        answer = await buildGnsrskScript();
        window.dispatchEvent(new CustomEvent("jarvis:gnsrsk-toggle"));
      } else if (isGnintelQuery(q)) {
        answer = await buildGnintelScript();
        window.dispatchEvent(new CustomEvent("jarvis:gnintel-toggle"));
      } else if (isGcasQuery(q)) {
        answer = await buildGcasScript();
        window.dispatchEvent(new CustomEvent("jarvis:gcas-toggle"));
      } else if (isGcoeQuery(q)) {
        answer = await buildGcoeScript();
        window.dispatchEvent(new CustomEvent("jarvis:gcoe-toggle"));
      } else if (isGrremQuery(q)) {
        answer = await buildGrremScript();
        window.dispatchEvent(new CustomEvent("jarvis:grrem-toggle"));
      } else if (isKnorskQuery(q)) {
        answer = await buildKnorskScript();
        window.dispatchEvent(new CustomEvent("jarvis:knorsk-toggle"));
      } else if (isReminvQuery(q)) {
        answer = await buildReminvScript();
        window.dispatchEvent(new CustomEvent("jarvis:reminv-toggle"));
      } else if (isRptinvQuery(q)) {
        answer = await buildRptinvScript();
        window.dispatchEvent(new CustomEvent("jarvis:rptinv-toggle"));
      } else if (isRemtaskQuery(q)) {
        answer = await buildRemtaskScript();
        window.dispatchEvent(new CustomEvent("jarvis:remtask-toggle"));
      } else if (isRemrskQuery(q)) {
        answer = await buildRemrskScript();
        window.dispatchEvent(new CustomEvent("jarvis:remrsk-toggle"));
      } else if (isRemcntQuery(q)) {
        answer = await buildRemcntScript();
        window.dispatchEvent(new CustomEvent("jarvis:remcnt-toggle"));
      } else if (isRemknoQuery(q)) {
        answer = await buildRemknoScript();
        window.dispatchEvent(new CustomEvent("jarvis:remkno-toggle"));
      } else if (isRemswrmQuery(q)) {
        answer = await buildRemswrmScript();
        window.dispatchEvent(new CustomEvent("jarvis:remswrm-toggle"));
      } else if (isRemintelQuery(q)) {
        answer = await buildRemintelScript();
        window.dispatchEvent(new CustomEvent("jarvis:remintel-toggle"));
      } else if (isRemdsetQuery(q)) {
        answer = await buildRemdsetScript();
        window.dispatchEvent(new CustomEvent("jarvis:remdset-toggle"));
      } else if (isRemopsQuery(q)) {
        answer = await buildRemopsScript();
        window.dispatchEvent(new CustomEvent("jarvis:remops-toggle"));
      } else if (isRemscnQuery(q)) {
        answer = await buildRemscnScript();
        window.dispatchEvent(new CustomEvent("jarvis:remscn-toggle"));
      } else if (isRemrptQuery(q)) {
        answer = await buildRemrptScript();
        window.dispatchEvent(new CustomEvent("jarvis:remrpt-toggle"));
      } else if (isGrrulsQuery(q)) {
        answer = await buildGrrulsScript();
        window.dispatchEvent(new CustomEvent("jarvis:grruls-toggle"));
      } else if (isGrrptQuery(q)) {
        answer = await buildGrrptScript();
        window.dispatchEvent(new CustomEvent("jarvis:grrpt-toggle"));
      } else if (isSceneAnchorMonitorQuery(q)) {
        answer = await buildSceneAnchorMonitorScript();
        window.dispatchEvent(new CustomEvent("jarvis:sacm-toggle"));
      } else if (isPathQuery(q)) {
        answer = await buildPathScript(q);
      } else if (isAmbientQuery(q)) {
        window.dispatchEvent(new CustomEvent("jarvis:ambient-toggle"));
        answer = "Toggling ambient reactor hum, sir.";
      } else if (isEntitySearchQuery(q)) {
        const term = extractEntitySearchTerm(q);
        answer = await buildEntityDossierScript(term);
        window.dispatchEvent(new CustomEvent("jarvis:entity-search", { detail: { term } }));
      } else {
        const pageContext = { route: window.location.pathname, scene };
        const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ message: q, page_context: pageContext }),
        });
        const d = await r.json();
        answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      }
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
