import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiBase } from "@/api/cinematicDataAdapters";
import { isShowMeQuery, resolveShowMeQuery } from "./ShowMeNavigation";
import { isDsknowQuery } from "@/components/cinematic/DatasetKnowledgeCoverage";
import { isCstmxQuery } from "@/components/cinematic/ContactScenarioTaskMissionMatrix";
import { isKgcdepQuery } from "@/components/cinematic/KnowledgeGraphContactDepthMap";
import { isSthrmatQuery } from "@/components/cinematic/ScenarioRiskContactThreatMatrix";
import { isIrcapQuery } from "@/components/cinematic/OpsAlertSkillDatasetIncidentReadiness";
import { isInvactQuery } from "@/components/cinematic/InvestigationScenarioKnowledgeActionability";
import { isBrncohQuery } from "@/components/cinematic/BrainDatasetKnowledgeCoherence";
import { isRscovQuery }  from "@/components/cinematic/ReportSkillContactCoverage";
import { isGcisamQuery } from "@/components/cinematic/GraphContactInvestmentAssetMap";
import { isIelgrQuery }  from "@/components/cinematic/IntelProfileSwarmReportLedger";
import { isDctownQuery } from "@/components/cinematic/DatasetContactTaskOwnership";
import { isSrirmQuery } from "@/components/cinematic/SkillReportInvestigationRemediationCoverage";
import { isLcrcovQuery } from "@/components/cinematic/LiveIntelScenarioSkillCrisisReadiness";
import { isTginetQuery } from "@/components/cinematic/TaskGraphIntelProfileMissionNetwork";
import { isIpktexQuery } from "@/components/cinematic/IntelProfileKnowledgeTaskExecutionMap";
import { isSwskrdyQuery } from "@/components/cinematic/SwarmScenarioKnowledgeReadiness";
import { isLigdsatQuery } from "@/components/cinematic/LiveIntelGraphDatasetEventSaturation";
import { isCtgaccQuery } from "@/components/cinematic/ContactTaskGraphAccountability";
import { isLbconvQuery } from "@/components/cinematic/LiveIntelBrainSystemConvergence";
import { isOagnetQuery } from "@/components/cinematic/OpsAlertIntelProfileGraphThreatNetwork";
import { isKosamatQuery } from "@/components/cinematic/KnowledgeOpsAlertSwarmAwareness";
import { isTskintelQuery } from "@/components/cinematic/TaskSkillKnowledgeExecutionIntel";
import { isOricovQuery } from "@/components/cinematic/OpsAlertReportInvestigationCoverage";
import { isSktmrdQuery } from "@/components/cinematic/SceneKnowledgeTaskMissionReadiness";
import { isIpelscQuery } from "@/components/cinematic/IntelProfileOpsAlertTaskEscalation";
import { isScgnetQuery } from "@/components/cinematic/SwarmContactGraphOperationalNetwork";
import { isDsrtxQuery } from "@/components/cinematic/DatasetScenarioRiskThreatExposure";
import { isSgscexQuery } from "@/components/cinematic/SkillGraphScenarioExecutionCoverage";
import { isIirsrpQuery } from "@/components/cinematic/InvestigationIntelSkillResponseIndex";
import { isLtorcaQuery } from "@/components/cinematic/LiveIntelTaskOpsAlertThreatResponse";
import { isIwsdefQuery } from "@/components/cinematic/InvestmentSkillScenarioDefenseCoverage";
import { isCkobrfQuery } from "@/components/cinematic/ContactKnowledgeOpsAlertBriefing";
import { isSciramQuery } from "@/components/cinematic/SkillContactInvestmentReadiness";
import { isSwgkconvQuery } from "@/components/cinematic/SwarmGraphKnowledgeConvergence";
import { isSgrsawQuery } from "@/components/cinematic/SceneGraphRiskSituationalAwareness";
import { isObifusQuery } from "@/components/cinematic/OpsAlertBrainIntelFusion";
import { isDianexQuery } from "@/components/cinematic/DatasetIntelProfileOpsAlertNexus";
import { isScnposQuery } from "@/components/cinematic/SceneSystemStatusOpsPosture";
import { isBirsixQuery } from "@/components/cinematic/BrainOpsAlertScenarioReadiness";
import { isMxnexQuery } from "@/components/cinematic/GraphTaskKnowledgeContactNexus";
import { isCibattQuery } from "@/components/cinematic/ContactInvestigationBrainAttribution";
import { isRiwexQuery } from "@/components/cinematic/RiskInvestmentWealthExposure";
import { isKiprodQuery } from "@/components/cinematic/KnowledgeIntelSwarmOpsIndex";
import { isBcrtmapQuery } from "@/components/cinematic/BrainContactReportTaskMap";
import { isOabdcontQuery } from "@/components/cinematic/OpsAlertBrainDatasetReportContinuity";
import { isScmaauthQuery } from "@/components/cinematic/SceneContactSkillReportMissionAuthority";
import { isOmlcycQuery } from "@/components/cinematic/ScenarioInvestigationContactDatasetLifecycle";
import { isSwtraceQuery } from "@/components/cinematic/SwarmReportContactSkillTraceability";
import { isIbsrcovQuery } from "@/components/cinematic/InvestigationBrainSkillReportCoverage";
import { isDsgprodQuery } from "@/components/cinematic/DatasetSwarmGraphOpsProductionAudit";
import { isTrcnetQuery } from "@/components/cinematic/RiskSignalSkillGraphContactNetwork";
import { isTdbiexQuery } from "@/components/cinematic/TaskDatasetBrainInvestigationDepth";
import { isScknrrQuery } from "@/components/cinematic/ScenarioContactKnowledgeRiskReadiness";
import { isRbadnQuery } from "@/components/cinematic/ReportBrainOpsAlertContactNetwork";
import { isSbiatcmdQuery } from "@/components/cinematic/SwarmBrainIntelTaskCommandMatrix";
import { isIsgrmxQuery } from "@/components/cinematic/InvestmentScenarioGraphRiskWealthMap";
import { isSdkopmQuery } from "@/components/cinematic/SceneDatasetKnowledgeSkillFoundation";
import { isCtidopQuery } from "@/components/cinematic/ContactTaskInvestigationDatasetCoverage";
import { isKgonetQuery } from "@/components/cinematic/KnowledgeGraphOpsSwarmNetwork";
import { isCsbfndQuery } from "@/components/cinematic/ContactScenarioBrainDatasetFoundation";
import { isRstexQuery } from "@/components/cinematic/RiskSignalScenarioBrainTaskEscalation";
import { isErescovQuery } from "@/components/cinematic/OpsAlertSwarmContactScenarioCoverage";
import { isIdkrmapQuery } from "@/components/cinematic/IntelProfileDatasetKnowledgeRiskMap";
import { isGisraudQuery } from "@/components/cinematic/GraphIntelSwarmReportAudit";
import { isMcrchQuery } from "@/components/cinematic/TaskContactOpsAlertBrainMissionChain";
import { isSsgexQuery } from "@/components/cinematic/SkillSwarmReportGraphExecutionNetwork";
import { isIdscovQuery } from "@/components/cinematic/InvestigationDatasetSkillContactCoverage";
import { isSwarkmatQuery } from "@/components/cinematic/SwarmAlertKnowledgeReportCoverage";
import { isIpfac5Query } from "@/components/cinematic/IntelProfileFullAssetCoverage";
import { isMctrlQuery } from "@/components/cinematic/TaskBrainGraphReportOpsMissionControl";
import { isKcrionQuery } from "@/components/cinematic/KnowledgeContactGraphRiskAlertNexus";
import { isIdoagrQuery } from "@/components/cinematic/IntelProfileDatasetOpsGraphReportCommand";
import { isScsdrsQuery } from "@/components/cinematic/SceneContactSkillDatasetRiskFoundation";
import { isCrkoaQuery } from "@/components/cinematic/ContactReportKnowledgeGraphAlertDistribution";
import { isDbtscnQuery } from "@/components/cinematic/DatasetBrainTaskScenarioContactAuthorityNetwork";
import { isIrosiQuery } from "@/components/cinematic/InvestmentRiskOpsSwarmInvestigationMatrix";
import { isBsdcsQuery } from "@/components/cinematic/BrainScenarioDatasetContactSkillFoundation";
import { isSgrocovQuery } from "@/components/cinematic/ScenarioGraphReportOpsAlertContactCoverage";
import { isTexifQuery } from "@/components/cinematic/TaskSkillDatasetReportGraphFoundation";
import { isSwkciaQuery } from "@/components/cinematic/SwarmKnowledgeContactOpsInvestigationCoverage";
import { isRkdrbQuery } from "@/components/cinematic/RiskKnowledgeDatasetReportBrainDepth";
import { isInvfndQuery } from "@/components/cinematic/InvestigationIntelSwarmDatasetBrainFoundation";
import { isScauthQuery } from "@/components/cinematic/SceneOpsIntelReportGraphAuthority";
import { isCibocQuery } from "@/components/cinematic/ContactInvestmentSwarmBrainOpsMonitor";
import { isTkgroaQuery } from "@/components/cinematic/TaskKnowledgeGraphRiskOpsDepth";
import { isIptdbaQuery } from "@/components/cinematic/IntelProfileReportTaskDatasetBrainAuthority";
import { isGiscnetQuery } from "@/components/cinematic/GraphIntelProfileScenarioContactOpsCommand";
import { isSkicovQuery } from "@/components/cinematic/SkillIntelGraphDatasetOpsCommand";
import { isLtrinexQuery } from "@/components/cinematic/LiveIntelScenarioContactDatasetReportNexus";
import { isOagbcfusQuery } from "@/components/cinematic/OpsAlertDatasetGraphBrainContactFusion";
import { isKstcrmQuery } from "@/components/cinematic/KnowledgeScenarioTaskContactRiskMap";
import { isSsrrcQuery } from "@/components/cinematic/SwarmScenarioRiskReportContactResponse";
import { isIsgrcdQuery } from "@/components/cinematic/InvestigationSkillGraphContactRiskDefense";
import { isRbdoicQuery } from "@/components/cinematic/ReportBrainDatasetOpsInvestigationContinuity";
import { isScknidQuery } from "@/components/cinematic/SceneContactKnowledgeIntelDepthMap";
import { isIbcralQuery } from "@/components/cinematic/InvestmentBrainContactReportAlertChain";
import { isDkgoadQuery } from "@/components/cinematic/DatasetKnowledgeGraphOpsAlertSaturation";
import { isTrcgbxQuery } from "@/components/cinematic/TaskReportContactGraphBrainMissionWeb";
import { isIgkaudQuery } from "@/components/cinematic/IntelProfileGraphKnowledgeSkillAudit";
import { isSscrrQuery } from "@/components/cinematic/SwarmScenarioContactRiskReportCoverage";
import { isGskdcQuery } from "@/components/cinematic/GraphSwarmKnowledgeDatasetContactFoundation";
import { isIkgsmQuery } from "@/components/cinematic/InvestmentKnowledgeGraphSkillScenarioReadiness";
import { isGdtcoaQuery } from "@/components/cinematic/GraphDatasetTaskContactOpsNetwork";
import { isSigexmQuery } from "@/components/cinematic/ScenarioGraphContactBrainDatasetExecMap";
import { isSkcobrQuery } from "@/components/cinematic/SkillKnowledgeContactOpsAlertBrainCommand";
import { isDborcaQuery } from "@/components/cinematic/DatasetBrainOpsRiskContactPosture";
import { isLkgctmQuery } from "@/components/cinematic/LiveIntelKnowledgeGraphContactTask";
import { isSbgoraQuery } from "@/components/cinematic/ScenarioBrainGraphOpsReportAuthority";
import { isIopdepQuery } from "@/components/cinematic/IntelProfileOrchestrationDepthMap";
import { isBiscrQuery } from "@/components/cinematic/BrainInvestigationSkillContactReportClosure";
import { isKspbscQuery } from "@/components/cinematic/KnowledgeScenarioIntelBrainSwarmContactActivation";
import { isTocroacQuery } from "@/components/cinematic/TaskDatasetContactReportOpsGraphCoverage";
import { isIpctwebQuery } from "@/components/cinematic/IntelProfileReportContactTaskGraphOpsWeb";
import { isSitcopQuery } from "@/components/cinematic/SwarmInvestigationRiskContactReportKnowledge";
import { isSmrwebQuery } from "@/components/cinematic/ScenarioSkillContactKnowledgeGraphSwarmReadiness";
import { isTmicwbQuery } from "@/components/cinematic/TaskReportBrainSkillOpsInvestigationClosureWeb";
import { isRdcgkQuery } from "@/components/cinematic/RiskSignalDatasetContactGraphKnowledgeSaturation";
import { isDografiQuery } from "@/components/cinematic/DatasetOpsAlertGraphScenarioReportIndex";
import { isGcdrsrQuery } from "@/components/cinematic/GraphDatasetContactRiskSkillReportNexus";
import { isIkoatcQuery } from "@/components/cinematic/IntelProfileKnowledgeOpsAlertTaskChain";
import { isCgortrQuery } from "@/components/cinematic/ContactGraphOpsTaskReportAccountability";
import { isBdsitkQuery } from "@/components/cinematic/BrainDatasetSkillInvestigationTaskDepth";
import { isCsrskQuery } from "@/components/cinematic/ContactScenarioRiskSwarmKnowledgeAwareness";
import { isGdtrscQuery } from "@/components/cinematic/GraphDatasetTaskReportSkillContactAuth";
import { isIgrcatQuery } from "@/components/cinematic/IntelProfileGraphRiskOpsContactCommand";
import { isLbgkrsQuery } from "@/components/cinematic/LiveIntelBrainGraphKnowledgeRiskOpsConvergence";
import { isScdbgrQuery } from "@/components/cinematic/ScenarioDatasetContactBrainGraphRisk";
import { isSkhcmQuery, buildSkhcmScript } from "@/components/cinematic/SystemBrainKnowledgeHealthMonitor";
import { isSdbarcQuery, buildSdbarcScript } from "@/components/cinematic/SkillDatasetBrainOpsContactReportNexus";
import { isIvpwebQuery } from "@/components/cinematic/InvestigationDatasetBrainKnowledgeOpsProsecution";
import { isCidioQuery } from "@/components/cinematic/ContactSkillDatasetInvestigationOpsCoverage";
import { isIdksgfQuery } from "@/components/cinematic/IntelProfileDatasetKnowledgeSkillGraph";
import { isIccgoaQuery } from "@/components/cinematic/InvestigationContactBrainGraphOpsCommand";
import { isRsscrQuery } from "@/components/cinematic/RiskSignalScenarioContactSkillReport";
import { isSdcmapQuery } from "@/components/cinematic/SwarmRiskContactDatasetGraphDefenseMap";
import { isSkopsQuery } from "@/components/cinematic/SceneKnowledgeOpsSkillPosture";
import { isBrktwebQuery } from "@/components/cinematic/BrainRiskKnowledgeTaskCoherenceWeb";
import { isOcdtsaQuery } from "@/components/cinematic/OpsAlertContactDatasetTaskSkillMatrix";
import { isJiprodQuery } from "@/components/cinematic/JarvisIntelligenceProductionIndex";
import { isGkoatcQuery } from "@/components/cinematic/GraphKnowledgeOpsTaskContactPulse";
import { isDpscmQuery } from "@/components/cinematic/DatasetSkillSwarmScenarioReportProductionReadiness";
import { isOatkwebQuery } from "@/components/cinematic/OpsAlertContactTaskSkillKnowledgeCommandWeb";
import { isSgtmapQuery } from "@/components/cinematic/ScenarioGraphTaskKnowledgeOpsMap";
import { isWrimapQuery } from "@/components/cinematic/InvestmentReportRiskSkillGraphCoverage";
import { isItkocwQuery } from "@/components/cinematic/IntelProfileTaskKnowledgeOpsContactWeb";
import { isTasmonQuery } from "@/components/cinematic/RiskSignalGraphKnowledgeOpsContactSaturation";
import { isSdcrrQuery } from "@/components/cinematic/SwarmDatasetContactRiskReportChain";
import { isTobscmdQuery } from "@/components/cinematic/TaskOpsAlertBrainScenarioCommand";
import { isLicmnQuery } from "@/components/cinematic/LiveIntelOpsCrisisManagementNetwork";
import { isOdskfcQuery } from "@/components/cinematic/OpsAlertDatasetScenarioKnowledgeContactFoundation";
import { isSkbiamQuery } from "@/components/cinematic/SkillBrainOpsInvestigationCapabilityMonitor";
import { isPortQuery } from "@/components/cinematic/ContactBrainGraphDatasetSkillReadiness";
import { isWlcmonQuery } from "@/components/cinematic/InvestmentBrainContactInvestigationOpsMonitor";
import { isTsbcgQuery } from "@/components/cinematic/TaskSkillBrainContactGraphFoundation";
import { isRsgsmapQuery } from "@/components/cinematic/ReportSwarmGraphContactScenarioMap";
import { isItcbpcQuery } from "@/components/cinematic/InvestigationTaskContactBrainProsecutionCommand";
import { isDisproQuery } from "@/components/cinematic/DatasetInvestigationScenarioOpsAlert";
import { isThlmapQuery } from "@/components/cinematic/RiskSignalScenarioGraphDatasetLandscape";
import { isBstrcQuery } from "@/components/cinematic/BrainScenarioTaskReportCoverage";
import { isCgsbpcQuery } from "@/components/cinematic/ContactGraphSkillBrainCommand";
import { isKctrasQuery } from "@/components/cinematic/KnowledgeContactTaskRiskActivation";

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
    // F20: "show me X" / "open X" → re-dispatch normalized query so the correct panel opens.
    // JarvisBrain skips __showme events to avoid a duplicate overlay on the re-dispatch.
    if (isShowMeQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ask", {
        detail: { text: resolveShowMeQuery(q), __showme: true },
      }));
      return;
    }
    clearTimeout(hideT.current);
    setOpen(true); setThinking(true); setText("");
    const scene = detectScene(q);
    if (scene) navigate(`/cinematic/${scene}`);
    if (isDsknowQuery(q)) { window.dispatchEvent(new Event("jarvis:dsknow-toggle")); }
    if (isCstmxQuery(q))  { window.dispatchEvent(new Event("jarvis:cstmx-toggle")); }
    if (isKgcdepQuery(q))  { window.dispatchEvent(new Event("jarvis:kgcdep-toggle")); }
    if (isSthrmatQuery(q)) { window.dispatchEvent(new Event("jarvis:sthrmat-toggle")); }
    if (isIrcapQuery(q))   { window.dispatchEvent(new Event("jarvis:ircap-toggle")); }
    if (isInvactQuery(q))  { window.dispatchEvent(new Event("jarvis:invact-toggle")); }
    if (isBrncohQuery(q))  { window.dispatchEvent(new Event("jarvis:brncoh-toggle")); }
    if (isRscovQuery(q))   { window.dispatchEvent(new Event("jarvis:rscov-toggle")); }
    if (isGcisamQuery(q))  { window.dispatchEvent(new Event("jarvis:gcisam-toggle")); }
    if (isIelgrQuery(q))   { window.dispatchEvent(new Event("jarvis:ielgr-toggle")); }
    if (isDctownQuery(q))  { window.dispatchEvent(new Event("jarvis:dctown-toggle")); }
    if (isSrirmQuery(q))   { window.dispatchEvent(new Event("jarvis:srirm-toggle")); }
    if (isLcrcovQuery(q))  { window.dispatchEvent(new Event("jarvis:lcrcov-toggle")); }
    if (isTginetQuery(q))  { window.dispatchEvent(new Event("jarvis:tginet-toggle")); }
    if (isIpktexQuery(q))  { window.dispatchEvent(new Event("jarvis:ipktex-toggle")); }
    if (isSwskrdyQuery(q)) { window.dispatchEvent(new Event("jarvis:swskrdy-toggle")); }
    if (isLigdsatQuery(q)) { window.dispatchEvent(new Event("jarvis:ligsat-toggle")); }
    if (isCtgaccQuery(q))  { window.dispatchEvent(new Event("jarvis:ctgacc-toggle")); }
    if (isLbconvQuery(q))  { window.dispatchEvent(new Event("jarvis:lbconv-toggle")); }
    if (isOagnetQuery(q))  { window.dispatchEvent(new Event("jarvis:oagnet-toggle")); }
    if (isKosamatQuery(q))  { window.dispatchEvent(new Event("jarvis:kosamat-toggle")); }
    if (isTskintelQuery(q)) { window.dispatchEvent(new Event("jarvis:tskintel-toggle")); }
    if (isOricovQuery(q))   { window.dispatchEvent(new Event("jarvis:oricov-toggle")); }
    if (isSktmrdQuery(q))   { window.dispatchEvent(new Event("jarvis:sktmrd-toggle")); }
    if (isIpelscQuery(q))   { window.dispatchEvent(new Event("jarvis:ipelsc-toggle")); }
    if (isScgnetQuery(q))   { window.dispatchEvent(new Event("jarvis:scgnet-toggle")); }
    if (isDsrtxQuery(q))    { window.dispatchEvent(new Event("jarvis:dsrtx-toggle")); }
    if (isSgscexQuery(q))   { window.dispatchEvent(new Event("jarvis:sgscex-toggle")); }
    if (isIirsrpQuery(q))  { window.dispatchEvent(new Event("jarvis:iirsrp-toggle")); }
    if (isLtorcaQuery(q))  { window.dispatchEvent(new Event("jarvis:ltorca-toggle")); }
    if (isIwsdefQuery(q))  { window.dispatchEvent(new Event("jarvis:iwsdef-toggle")); }
    if (isCkobrfQuery(q))  { window.dispatchEvent(new Event("jarvis:ckobrf-toggle")); }
    if (isSciramQuery(q))   { window.dispatchEvent(new Event("jarvis:sciram-toggle")); }
    if (isSwgkconvQuery(q)) { window.dispatchEvent(new Event("jarvis:swgkconv-toggle")); }
    if (isSgrsawQuery(q))   { window.dispatchEvent(new Event("jarvis:sgrsaw-toggle")); }
    if (isObifusQuery(q))   { window.dispatchEvent(new Event("jarvis:obifus-toggle")); }
    if (isDianexQuery(q))   { window.dispatchEvent(new Event("jarvis:dianex-toggle")); }
    if (isScnposQuery(q))   { window.dispatchEvent(new Event("jarvis:scnpos-toggle")); }
    if (isBirsixQuery(q))   { window.dispatchEvent(new Event("jarvis:birsix-toggle")); }
    if (isMxnexQuery(q))    { window.dispatchEvent(new Event("jarvis:mxnex-toggle")); }
    if (isCibattQuery(q))   { window.dispatchEvent(new Event("jarvis:cibatt-toggle")); }
    if (isRiwexQuery(q))    { window.dispatchEvent(new Event("jarvis:riwex-toggle")); }
    if (isKiprodQuery(q))   { window.dispatchEvent(new Event("jarvis:kiprod-toggle")); }
    if (isBcrtmapQuery(q))   { window.dispatchEvent(new Event("jarvis:bcrtmap-toggle")); }
    if (isOabdcontQuery(q))  { window.dispatchEvent(new Event("jarvis:oabdcont-toggle")); }
    if (isScmaauthQuery(q))  { window.dispatchEvent(new Event("jarvis:scmaauth-toggle")); }
    if (isOmlcycQuery(q))    { window.dispatchEvent(new Event("jarvis:omlcyc-toggle")); }
    if (isSwtraceQuery(q))  { window.dispatchEvent(new Event("jarvis:swtrace-toggle")); }
    if (isIbsrcovQuery(q))  { window.dispatchEvent(new Event("jarvis:ibsrcov-toggle")); }
    if (isDsgprodQuery(q))  { window.dispatchEvent(new Event("jarvis:dsgprod-toggle")); }
    if (isTrcnetQuery(q))   { window.dispatchEvent(new Event("jarvis:trcnet-toggle")); }
    if (isTdbiexQuery(q))   { window.dispatchEvent(new Event("jarvis:tdbiex-toggle")); }
    if (isScknrrQuery(q))   { window.dispatchEvent(new Event("jarvis:scknrr-toggle")); }
    if (isRbadnQuery(q))     { window.dispatchEvent(new Event("jarvis:rbacdn-toggle")); }
    if (isSbiatcmdQuery(q))  { window.dispatchEvent(new Event("jarvis:sbiatcmd-toggle")); }
    if (isIsgrmxQuery(q))    { window.dispatchEvent(new Event("jarvis:isgrmx-toggle")); }
    if (isSdkopmQuery(q))    { window.dispatchEvent(new Event("jarvis:sdkopm-toggle")); }
    if (isCtidopQuery(q))    { window.dispatchEvent(new Event("jarvis:ctidop-toggle")); }
    if (isKgonetQuery(q))    { window.dispatchEvent(new Event("jarvis:kgonet-toggle")); }
    if (isCsbfndQuery(q))    { window.dispatchEvent(new Event("jarvis:csbfnd-toggle")); }
    if (isRstexQuery(q))     { window.dispatchEvent(new Event("jarvis:rstex-toggle")); }
    if (isErescovQuery(q))   { window.dispatchEvent(new Event("jarvis:erescov-toggle")); }
    if (isIdkrmapQuery(q))   { window.dispatchEvent(new Event("jarvis:idkrmap-toggle")); }
    if (isGisraudQuery(q))   { window.dispatchEvent(new Event("jarvis:gisraud-toggle")); }
    if (isMcrchQuery(q))     { window.dispatchEvent(new Event("jarvis:mcrchn-toggle")); }
    if (isSsgexQuery(q))     { window.dispatchEvent(new Event("jarvis:ssgex-toggle")); }
    if (isIdscovQuery(q))    { window.dispatchEvent(new Event("jarvis:idscov-toggle")); }
    if (isSwarkmatQuery(q))  { window.dispatchEvent(new Event("jarvis:swarkmat-toggle")); }
    if (isIpfac5Query(q))    { window.dispatchEvent(new Event("jarvis:ipfac5-toggle")); }
    if (isMctrlQuery(q))     { window.dispatchEvent(new Event("jarvis:mctrl-toggle")); }
    if (isKcrionQuery(q))    { window.dispatchEvent(new Event("jarvis:kcrion-toggle")); }
    if (isIdoagrQuery(q))    { window.dispatchEvent(new Event("jarvis:idoagr-toggle")); }
    if (isScsdrsQuery(q))    { window.dispatchEvent(new Event("jarvis:scsdrs-toggle")); }
    if (isCrkoaQuery(q))     { window.dispatchEvent(new Event("jarvis:crkoa-toggle")); }
    if (isDbtscnQuery(q))    { window.dispatchEvent(new Event("jarvis:dbtscn-toggle")); }
    if (isIrosiQuery(q))     { window.dispatchEvent(new Event("jarvis:irosi-toggle")); }
    if (isBsdcsQuery(q))     { window.dispatchEvent(new Event("jarvis:bsdcs-toggle")); }
    if (isSgrocovQuery(q))   { window.dispatchEvent(new Event("jarvis:sgrocov-toggle")); }
    if (isTexifQuery(q))     { window.dispatchEvent(new Event("jarvis:texif-toggle")); }
    if (isSwkciaQuery(q))    { window.dispatchEvent(new Event("jarvis:swkcia-toggle")); }
    if (isRkdrbQuery(q))     { window.dispatchEvent(new Event("jarvis:rkdrb-toggle")); }
    if (isInvfndQuery(q))   { window.dispatchEvent(new Event("jarvis:invfnd-toggle")); }
    if (isScauthQuery(q))   { window.dispatchEvent(new Event("jarvis:scauth-toggle")); }
    if (isCibocQuery(q))    { window.dispatchEvent(new Event("jarvis:ciboc-toggle")); }
    if (isTkgroaQuery(q))   { window.dispatchEvent(new Event("jarvis:tkgroa-toggle")); }
    if (isIptdbaQuery(q))   { window.dispatchEvent(new Event("jarvis:iptdba-toggle")); }
    if (isGiscnetQuery(q))  { window.dispatchEvent(new Event("jarvis:giscnet-toggle")); }
    if (isSkicovQuery(q))   { window.dispatchEvent(new Event("jarvis:skicov-toggle")); }
    if (isLtrinexQuery(q))    { window.dispatchEvent(new Event("jarvis:ltrinex-toggle")); }
    if (isOagbcfusQuery(q))  { window.dispatchEvent(new Event("jarvis:oagbcfus-toggle")); }
    if (isKstcrmQuery(q))    { window.dispatchEvent(new Event("jarvis:kstcrm-toggle")); }
    if (isSsrrcQuery(q))     { window.dispatchEvent(new Event("jarvis:ssrrc-toggle")); }
    if (isIsgrcdQuery(q))    { window.dispatchEvent(new Event("jarvis:isgrcd-toggle")); }
    if (isRbdoicQuery(q))    { window.dispatchEvent(new Event("jarvis:rbdoic-toggle")); }
    if (isScknidQuery(q))    { window.dispatchEvent(new Event("jarvis:scknid-toggle")); }
    if (isIbcralQuery(q))    { window.dispatchEvent(new Event("jarvis:ibcral-toggle")); }
    if (isDkgoadQuery(q))    { window.dispatchEvent(new Event("jarvis:dkgoad-toggle")); }
    if (isTrcgbxQuery(q))    { window.dispatchEvent(new Event("jarvis:trcgbx-toggle")); }
    if (isIgkaudQuery(q))    { window.dispatchEvent(new Event("jarvis:igkaud-toggle")); }
    if (isSscrrQuery(q))     { window.dispatchEvent(new Event("jarvis:sscrr-toggle")); }
    if (isGskdcQuery(q))     { window.dispatchEvent(new Event("jarvis:gskdc-toggle")); }
    if (isIkgsmQuery(q))     { window.dispatchEvent(new Event("jarvis:ikgsm-toggle")); }
    if (isGdtcoaQuery(q))    { window.dispatchEvent(new Event("jarvis:gdtcoa-toggle")); }
    if (isSigexmQuery(q))    { window.dispatchEvent(new Event("jarvis:sigexm-toggle")); }
    if (isSkcobrQuery(q))    { window.dispatchEvent(new Event("jarvis:skcobr-toggle")); }
    if (isDborcaQuery(q))    { window.dispatchEvent(new Event("jarvis:dborca-toggle")); }
    if (isLkgctmQuery(q))    { window.dispatchEvent(new Event("jarvis:lkgctm-toggle")); }
    if (isSbgoraQuery(q))    { window.dispatchEvent(new Event("jarvis:sbgora-toggle")); }
    if (isIopdepQuery(q))    { window.dispatchEvent(new Event("jarvis:iopdep-toggle")); }
    if (isBiscrQuery(q))     { window.dispatchEvent(new Event("jarvis:biscr-toggle")); }
    if (isKspbscQuery(q))   { window.dispatchEvent(new Event("jarvis:kspbsc-toggle")); }
    if (isTocroacQuery(q))  { window.dispatchEvent(new Event("jarvis:tocroa-toggle")); }
    if (isIpctwebQuery(q))  { window.dispatchEvent(new Event("jarvis:ipctweb-toggle")); }
    if (isSitcopQuery(q))   { window.dispatchEvent(new Event("jarvis:sitcop-toggle")); }
    if (isSmrwebQuery(q))   { window.dispatchEvent(new Event("jarvis:smrweb-toggle")); }
    if (isTmicwbQuery(q))   { window.dispatchEvent(new Event("jarvis:tmicwb-toggle")); }
    if (isRdcgkQuery(q))    { window.dispatchEvent(new Event("jarvis:rdcgk-toggle")); }
    if (isDografiQuery(q))  { window.dispatchEvent(new Event("jarvis:dografi-toggle")); }
    if (isGcdrsrQuery(q))   { window.dispatchEvent(new Event("jarvis:gcdrsr-toggle")); }
    if (isIkoatcQuery(q))   { window.dispatchEvent(new Event("jarvis:ikoatc-toggle")); }
    if (isCgortrQuery(q))   { window.dispatchEvent(new Event("jarvis:cgortr-toggle")); }
    if (isBdsitkQuery(q))   { window.dispatchEvent(new Event("jarvis:bdsitk-toggle")); }
    if (isCsrskQuery(q))    { window.dispatchEvent(new Event("jarvis:csrsk-toggle")); }
    if (isGdtrscQuery(q))   { window.dispatchEvent(new Event("jarvis:gdtrsc-toggle")); }
    if (isIgrcatQuery(q))   { window.dispatchEvent(new Event("jarvis:igrcat-toggle")); }
    if (isLbgkrsQuery(q))   { window.dispatchEvent(new Event("jarvis:lbgkrs-toggle")); }
    if (isScdbgrQuery(q))   { window.dispatchEvent(new Event("jarvis:scdbgr-toggle")); }
    if (isSkhcmQuery(q))    { window.dispatchEvent(new Event("jarvis:skhcm-toggle")); }
    if (isSdbarcQuery(q))   { window.dispatchEvent(new Event("jarvis:sdbarc-toggle")); }
    if (isIvpwebQuery(q))   { window.dispatchEvent(new Event("jarvis:ivpweb-toggle")); }
    if (isCidioQuery(q))    { window.dispatchEvent(new Event("jarvis:cidio-toggle")); }
    if (isIdksgfQuery(q))   { window.dispatchEvent(new Event("jarvis:idksgf-toggle")); }
    if (isIccgoaQuery(q))   { window.dispatchEvent(new Event("jarvis:iccgoa-toggle")); }
    if (isRsscrQuery(q))    { window.dispatchEvent(new Event("jarvis:rsscr-toggle")); }
    if (isSdcmapQuery(q))   { window.dispatchEvent(new Event("jarvis:sdcmap-toggle")); }
    if (isSkopsQuery(q))    { window.dispatchEvent(new Event("jarvis:skops-toggle")); }
    if (isBrktwebQuery(q))  { window.dispatchEvent(new Event("jarvis:brktweb-toggle")); }
    if (isOcdtsaQuery(q))   { window.dispatchEvent(new Event("jarvis:ocdtsa-toggle")); }
    if (isJiprodQuery(q))   { window.dispatchEvent(new Event("jarvis:jiprod-toggle")); }
    if (isGkoatcQuery(q))   { window.dispatchEvent(new Event("jarvis:gkoatc-toggle")); }
    if (isDpscmQuery(q))    { window.dispatchEvent(new Event("jarvis:dpscm-toggle")); }
    if (isOatkwebQuery(q))  { window.dispatchEvent(new Event("jarvis:oatkweb-toggle")); }
    if (isSgtmapQuery(q))   { window.dispatchEvent(new Event("jarvis:sgtmap-toggle")); }
    if (isWrimapQuery(q))   { window.dispatchEvent(new Event("jarvis:wrimap-toggle")); }
    if (isItkocwQuery(q))  { window.dispatchEvent(new Event("jarvis:itkocw-toggle")); }
    if (isTasmonQuery(q))  { window.dispatchEvent(new Event("jarvis:tasmon-toggle")); }
    if (isSdcrrQuery(q))    { window.dispatchEvent(new Event("jarvis:sdcrr-toggle")); }
    if (isTobscmdQuery(q))  { window.dispatchEvent(new Event("jarvis:tobscmd-toggle")); }
    if (isLicmnQuery(q))    { window.dispatchEvent(new Event("jarvis:licmn-toggle")); }
    if (isOdskfcQuery(q))   { window.dispatchEvent(new Event("jarvis:odskfc-toggle")); }
    if (isSkbiamQuery(q))   { window.dispatchEvent(new Event("jarvis:skbiam-toggle")); }
    if (isPortQuery(q))     { window.dispatchEvent(new Event("jarvis:pori-toggle")); }
    if (isWlcmonQuery(q))   { window.dispatchEvent(new Event("jarvis:wlcmon-toggle")); }
    if (isTsbcgQuery(q))    { window.dispatchEvent(new Event("jarvis:tsbcg-toggle")); }
    if (isRsgsmapQuery(q))  { window.dispatchEvent(new Event("jarvis:rsgsmap-toggle")); }
    if (isItcbpcQuery(q))  { window.dispatchEvent(new Event("jarvis:itcbpc-toggle")); }
    if (isDisproQuery(q))  { window.dispatchEvent(new Event("jarvis:dispro-toggle")); }
    if (isThlmapQuery(q))  { window.dispatchEvent(new Event("jarvis:thlmap-toggle")); }
    if (isBstrcQuery(q))   { window.dispatchEvent(new Event("jarvis:bstrc-toggle")); }
    if (isCgsbpcQuery(q))  { window.dispatchEvent(new Event("jarvis:cgsbpc-toggle")); }
    if (isKctrasQuery(q))  { window.dispatchEvent(new Event("jarvis:kctras-toggle")); }
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
      // Skip re-dispatched show-me events — panels handle them directly via their own listeners.
      if (e?.detail?.__showme) return;
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
