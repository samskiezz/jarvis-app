import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiBase } from "@/api/cinematicDataAdapters";
import { isStatusQuery, buildStatusScript } from "./SpokenStatusReport";
import { isAlertQuery, buildAlertScript } from "./AlertToasts";
import { isInvScenLinkerQuery, buildInvScenLinkerScript } from "./InvestigationScenarioLinker";
import { isShowMeQuery, resolveShowMeQuery } from "./ShowMeNavigation";
import { isAmbientQuery } from "./AmbientReactorHum";
import { isClockQuery, buildClockScript } from "./LiveClockUptime";
import { isInvestmentQuery, buildInvestmentScript } from "./InvestmentWidget";
import { isContactsQuery, buildContactsScript } from "./ContactsDirectory";
import { isSwarmQuery, buildSwarmScript } from "./SwarmJobsMonitor";
import { isCentralityQuery, buildCentralityScript } from "./GraphCentralityView";
import { isDiagnosticsQuery, buildDiagnosticsScript } from "./ServiceDiagnostics";
import { isHistoryQuery, buildHistoryScript } from "./CommandHistory";
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
import { isRepInvQuery, buildRepInvScript } from "./ReportInvestigationCoverage";
import { isCrisisWarningQuery, buildCrisisWarningScript } from "./CrisisEarlyWarning";
import { isSceneRiskQuery, buildSceneRiskScript } from "./SceneRiskPresence";
import { isBrsmQuery, buildBrsmScript } from "./BrainRiskMonitor";
import { isAtscenQuery, buildAtscenScript } from "./AgentToolScenarioCoverage";
import { isBstpQuery, buildBstpScript } from "./BrainTaskProgressMonitor";
import { isCreiskQuery, buildCreiskScript } from "./ContactRiskExposure";
import { isSkrQuery, buildSkrScript } from "./ScenarioKnowledgeReadiness";
import { isOpresQuery, buildOpresScript } from "./OpsReportCoverage";
import { isScownQuery, buildScownScript } from "./SwarmContactOwnership";
import { isIsexpQuery, buildIsexpScript } from "./InvestmentScenarioRisk";
import { isItsmQuery, buildItsmScript } from "./IntelProfileScenarioThreat";
import { isTaskRepQuery, buildTaskRepScript } from "./TaskReportCoverage";
import { isScknQuery, buildScknScript } from "./SceneKnowledgeCoverage";
import { isSkkgQuery, buildSkkgScript } from "./AipSkillKnowledgeGrounding";
import { isInvkgQuery, buildInvkgScript } from "./InvestigationKnowledgeGrounding";
import { isOpeicQuery, buildOpeicScript } from "./OpsEventIntelCorrelation";
import { isCsemQuery, buildCsemScript } from "./ContactScenarioMapper";
import { isOpscenQuery, buildOpscenScript } from "./OpsScenarioGap";
import { isRsrptQuery, buildRsrptScript } from "./RiskSignalReportCoverage";
import { isCinvQuery, buildCinvScript } from "./ContactInvestigationInvolvement";
import { isAsrcQuery, buildAsrcScript } from "./AipSkillReportsCoverage";
import { isDtconQuery, buildDtconScript } from "./DatasetTaskConsumption";
import { isSwriskQuery, buildSwriskScript } from "./SwarmJobRiskCorrelation";
import { isIptaskQuery, buildIptaskScript } from "./IntelProfileTasking";
import { isInvcaseQuery, buildInvcaseScript } from "./InvestmentInvestigationCoverage";
import { isCtknowQuery, buildCtknowScript } from "./ContactKnowledgeAdvisor";
import { isScdsetQuery, buildScdsetScript } from "./ScenarioDatasetCoverage";
import { isRattrQuery, buildRattrScript } from "./RiskSignalIntelAttribution";
import { isRdlinQuery, buildRdlinScript } from "./ReportDatasetLineage";
import { isIrepQuery, buildIrepScript } from "./InvestmentReportCoverage";
import { isSjinvQuery, buildSjinvScript } from "./SwarmJobInvestigationCoverage";
import { isSjkgQuery, buildSjkgScript } from "./SwarmJobKnowledgeGrounding";
import { isCtaskQuery, buildCtaskScript } from "./ContactTaskAssignment";
import { isOpeconQuery, buildOpeconScript } from "./OpsContactOwnership";
import { isCtrptQuery, buildCtrptScript } from "./ContactReportCoverage";
import { isSjaskQuery, buildSjaskScript } from "./SwarmJobAipSkillCoverage";
import { isScrepQuery, buildScrepScript } from "./ScenarioReportIntelligence";
import { isCntrkrskQuery, buildCntrkrskScript } from "./GraphCentralityRiskConvergence";
import { isTaskkgQuery, buildTaskkgScript } from "./TaskKnowledgeGrounding";
import { isIpopsQuery, buildIpopsScript } from "./IntelProfileOpsActivation";
import { isRptkbQuery, buildRptkbScript } from "./ReportKnowledgeCoverage";
import { isOpaskQuery, buildOpaskScript } from "./OpsAipSkillCoverage";
import { isInvdsetQuery, buildInvdsetScript } from "./InvestigationDatasetEvidence";
import { isGcknQuery, buildGcknScript } from "./GraphCentralityKnowledge";
import { isInvkbQuery, buildInvkbScript } from "./InvestmentKnowledgeCoverage";
import { isIpkbQuery, buildIpkbScript } from "./IntelProfileKnowledgeCoverage";
import { isCtdsetQuery, buildCtdsetScript } from "./ContactDatasetExposure";
import { isLirptQuery, buildLirptScript } from "./LiveIntelReportCoverage";
import { isLiscenQuery, buildLiscenScript } from "./LiveIntelScenarioCoverage";
import { isGcinQuery, buildGcinScript } from "./GraphCentralityInvestigations";
import { isGcnjobQuery, buildGcnjobScript } from "./GraphCentralitySwarmJobs";
import { isLiknowQuery, buildLiknowScript } from "./LiveIntelKnowledgeCoverage";
import { isLicontactQuery, buildLicontactScript } from "./LiveIntelContactExposure";
import { isLitaskQuery, buildLitaskScript } from "./LiveIntelTaskActivation";
import { isGcaskQuery, buildGcaskScript } from "./GraphCentralityAipSkill";
import { isKfmQuery, buildKfmScript } from "./KnowledgeFreshnessMonitor";
import { isAgentToolsRunnerQuery, buildAgentToolsRunnerScript } from "./AgentToolsRunner";
import { isMarketsQuery, buildMarketsScript } from "./MarketsTicker";
import { isEntitySearchQuery, extractEntitySearchTerm, buildEntityDossierScript } from "./EntityQuickSearch";
import { isTaskQuery, buildTaskScript } from "./TaskBoard";
import { isDatasetsQuery, buildDatasetsScript } from "./DatasetsBrowser";
import { isInvestigationsQuery, buildInvestigationsScript } from "./InvestigationsList";
import { isScenarioQuery, buildScenarioScript } from "./ScenarioLauncher";
import { isDocumentQuery, buildDocumentScript } from "./DocumentSearch";
import { isSkillQuery, buildSkillScript } from "./SkillScorecard";
import { isBrainQuery, buildBrainScript } from "./BrainGrowthSparkline";
import { isAnchorQuery, buildAnchorScript } from "./SceneAnchorDrillDown";
import { isVoiceQuery, buildVoiceScript, applyVoiceFromQuery, getActiveVoice } from "./MultiVoiceToggle";
import { isTourQuery, buildTourScript } from "./SceneAutoTour";

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
    // F19: ambient reactor hum toggle — dispatch event; AmbientReactorHum handles the WebAudio.
    if (isAmbientQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ambient-toggle"));
      const script = "Ambient reactor hum toggled, sir.";
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), 5000);
      return;
    }
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
    // F07: markets queries speak live crypto+FX top-movers directly.
    if (isMarketsQuery(q)) {
      let script = "";
      try { script = await buildMarketsScript(); } catch { script = "Market data unavailable at this time, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F08: entity quick-search — open the panel and speak a one-line dossier.
    if (isEntitySearchQuery(q)) {
      const term = extractEntitySearchTerm(q) || "";
      window.dispatchEvent(new CustomEvent("jarvis:entity-search", { detail: { term } }));
      let script = "";
      try { script = await buildEntityDossierScript(term); } catch { script = "Entity search unavailable at this time, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F10: task board — TaskBoard opens on jarvis:ask; JarvisBrain speaks the summary.
    if (isTaskQuery(q)) {
      let script = "";
      try { script = await buildTaskScript(); } catch { script = "Mission board is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F11: datasets browser — DatasetsBrowser opens on jarvis:ask; JarvisBrain speaks the catalog summary.
    if (isDatasetsQuery(q)) {
      let script = "";
      try { script = await buildDatasetsScript(); } catch { script = "Data Fusion Catalog is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F12: investigations — InvestigationsList opens on jarvis:ask; JarvisBrain speaks the case brief.
    if (isInvestigationsQuery(q)) {
      let script = "";
      try { script = await buildInvestigationsScript(); } catch { script = "Investigations panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F13: scenario launcher — ScenarioLauncher opens on jarvis:ask; JarvisBrain speaks the theatre brief.
    if (isScenarioQuery(q)) {
      let script = "";
      try { script = await buildScenarioScript(); } catch { script = "Simulation theatre is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F14: document search — DocumentSearch panel opens; JarvisBrain speaks vault summary.
    if (isDocumentQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:document-search-toggle"));
      let script = "";
      try { script = await buildDocumentScript(); } catch { script = "Document vault is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F15: skill scorecard — open the panel and speak top performers.
    if (isSkillQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ask", { detail: { text: q } }));
      let script = "";
      try { script = await buildSkillScript(); } catch { script = "Skill metrics unavailable at this time, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F16: brain-growth sparkline — toggle panel + speak nodes/synapses trend.
    if (isBrainQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:brain-growth-toggle"));
      let script = "";
      try { script = await buildBrainScript(); } catch { script = "Brain growth telemetry unavailable at this time, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F17: scene anchor drill-down — open panel + speak anchor summary.
    if (isAnchorQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ask", { detail: { text: q } }));
      let script = "";
      try { script = await buildAnchorScript(); } catch { script = "Anchor data unavailable for the current scene, sir."; }
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
    // F27: diagnostics queries open the service health panel and speak a live diagnostics brief.
    if (isDiagnosticsQuery(q)) {
      let script = "";
      try { script = await buildDiagnosticsScript(); } catch { script = "Diagnostics unavailable at this time, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F28: command history — read from localStorage, speak recent entries; panel opens via Alt+H or HIST button.
    if (isHistoryQuery(q)) {
      const script = buildHistoryScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F30: scene auto-tour — "JARVIS, start tour / give me a tour / walkthrough" → narrated cycle of all 10 scenes.
    if (isTourQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tour-start"));
      const script = buildTourScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(8000, script.length * 70));
      return;
    }
    // F29: multi-voice toggle — "JARVIS, switch to fable voice" / "change voice" cycles or sets ash/fable/onyx.
    if (isVoiceQuery(q)) {
      const chosen = applyVoiceFromQuery(q);
      const script = `Voice profile switched to ${chosen}. All subsequent speech will use the ${chosen} engine, sir.`;
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(7000, script.length * 70));
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
    if (isRepInvQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:repinv-toggle"));
      let script = "";
      try { script = await buildRepInvScript(); } catch { script = "Report investigation coverage analysis is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isCrisisWarningQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:crisis-warning-toggle"));
      let script = "";
      try { script = await buildCrisisWarningScript(); } catch { script = "Crisis early warning system is standing by — endpoint temporarily unreachable, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isSceneRiskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:srisk-toggle"));
      let script = "";
      try { script = await buildSceneRiskScript(); } catch { script = "Scene risk presence panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isBrsmQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:brsm-toggle"));
      let script = "";
      try { script = await buildBrsmScript(); } catch { script = "Brain risk monitor is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isAtscenQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:atscen-toggle"));
      let script = "";
      try { script = await buildAtscenScript(); } catch { script = "Agent tool scenario coverage is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isBstpQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:bstp-toggle"));
      let script = "";
      try { script = await buildBstpScript(); } catch { script = "Brain task progress monitor is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isCreiskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:crisk-toggle"));
      let script = "";
      try { script = await buildCreiskScript(); } catch { script = "Contact risk exposure panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F60: investment × scenario risk — cross-correlates portfolio positions against threat scenarios.
    if (isIsexpQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:isexp-toggle"));
      let script = "";
      try { script = await buildIsexpScript(); } catch { script = "Investment scenario risk panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F62: task report coverage — cross-correlates tasks against reports for documentation gaps.
    if (isTaskRepQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:trep-toggle"));
      let script = "";
      try { script = await buildTaskRepScript(); } catch { script = "Task report documentation coverage panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F63: scene knowledge coverage — cross-correlates cinematic scenes against KB articles.
    if (isScknQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sckn-toggle"));
      let script = "";
      try { script = await buildScknScript(); } catch { script = "Scene knowledge coverage panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F64: AIP skill × knowledge grounding — correlates each JARVIS skill against KB articles.
    if (isSkkgQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:skkg-toggle"));
      let script = "";
      try { script = await buildSkkgScript(); } catch { script = "AIP skill knowledge grounding panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F65: investigation × knowledge grounding — correlates open investigations against KB articles.
    if (isInvkgQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:invkg-toggle"));
      let script = "";
      try { script = await buildInvkgScript(); } catch { script = "Investigation knowledge grounding panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F66: ops events × intel profile threat correlation — tracked vs untracked blind-spot events.
    if (isOpeicQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:opeic-toggle"));
      let script = "";
      try { script = await buildOpeicScript(); } catch { script = "Ops event intel correlation panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F67: contact × scenario engagement mapper — surfaces ENGAGED vs CLEAR contacts per scenario.
    if (isCsemQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:csem-toggle"));
      let script = "";
      try { script = await buildCsemScript(); } catch { script = "Contact scenario engagement panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F69: risk signal × report coverage — DOCUMENTED vs UNDOCUMENTED risk signals.
    if (isRsrptQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rsrpt-toggle"));
      let script = "";
      try { script = await buildRsrptScript(); } catch { script = "Risk signal report coverage panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F70: contact × investigation involvement — INVOLVED vs CLEAR contacts.
    if (isCinvQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cinv-toggle"));
      let script = "";
      try { script = await buildCinvScript(); } catch { script = "Contact investigation involvement panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F71: AIP skill × reports coverage — REPORTED vs UNDOCUMENTED skills.
    if (isAsrcQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:asrc-toggle"));
      let script = "";
      try { script = await buildAsrcScript(); } catch { script = "AIP skill report coverage panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F72: dataset × task data consumption — CONSUMING vs IDLE datasets.
    if (isDtconQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:dtcon-toggle"));
      let script = "";
      try { script = await buildDtconScript(); } catch { script = "Dataset task consumption panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F77: contact × knowledge advisor — LINKED vs DARK contact knowledge coverage.
    if (isCtknowQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ctknow-toggle"));
      let script = "";
      try { script = await buildCtknowScript(); } catch { script = "Contact knowledge advisor panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F78: scenario × dataset — DATA_BACKED/PARTIAL/DATA_DARK scenario data coverage.
    if (isScdsetQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scdset-toggle"));
      let script = "";
      try { script = await buildScdsetScript(); } catch { script = "Scenario dataset coverage panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F79: risk signal × intel profile — ATTRIBUTED vs UNATTRIBUTED threat attribution.
    if (isRattrQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rattr-toggle"));
      let script = "";
      try { script = await buildRattrScript(); } catch { script = "Risk attribution panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F76: investment × investigation — UNDER_INVESTIGATION vs CLEAN portfolio coverage.
    if (isInvcaseQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:invcase-toggle"));
      let script = "";
      try { script = await buildInvcaseScript(); } catch { script = "Investment investigation coverage panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F74: intel profile × task — TASKED vs AUTONOMOUS threat actor tasking analysis.
    if (isIptaskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:iptask-toggle"));
      let script = "";
      try { script = await buildIptaskScript(); } catch { script = "Threat actor tasking panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F73: swarm job × risk signal — THREATENED vs SECURE job classification.
    if (isSwriskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:swrisk-toggle"));
      let script = "";
      try { script = await buildSwriskScript(); } catch { script = "Swarm risk correlation panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F68: ops events × scenario gap — surfaces COVERED vs UNCOVERED planning blind spots.
    if (isOpscenQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:opscen-toggle"));
      let script = "";
      try { script = await buildOpscenScript(); } catch { script = "Ops scenario gap panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F61: intel profile scenario threat match — correlates intel profiles against scenarios.
    if (isItsmQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:itsm-toggle"));
      let script = "";
      try { script = await buildItsmScript(); } catch { script = "Intel profile scenario threat match panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F59: swarm contact ownership — cross-correlates swarm jobs against contacts.
    if (isScownQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scown-toggle"));
      let script = "";
      try { script = await buildScownScript(); } catch { script = "Swarm contact ownership panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F58: ops report coverage — cross-correlates ops events against reports.
    if (isOpresQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:opres-toggle"));
      let script = "";
      try { script = await buildOpresScript(); } catch { script = "Ops report coverage panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F57: scenario knowledge readiness — cross-correlates scenarios against KB articles.
    if (isSkrQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:skr-toggle"));
      let script = "";
      try { script = await buildSkrScript(); } catch { script = "Scenario knowledge readiness panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F80: report × dataset lineage — data governance / provenance.
    if (isRdlinQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rdlin-toggle"));
      let script = "";
      try { script = await buildRdlinScript(); } catch { script = "Report dataset lineage panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F81: investment × report coverage — portfolio intelligence gap.
    if (isIrepQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:irep-toggle"));
      let script = "";
      try { script = await buildIrepScript(); } catch { script = "Investment report coverage panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F82: swarm job × investigation coverage — orphan job detection.
    if (isSjinvQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sjinv-toggle"));
      let script = "";
      try { script = await buildSjinvScript(); } catch { script = "Swarm job investigation coverage panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F83: swarm job × knowledge grounding — bare job detection.
    if (isSjkgQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sjkg-toggle"));
      let script = "";
      try { script = await buildSjkgScript(); } catch { script = "Swarm job knowledge grounding panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F84: contact × task assignment — people workload coverage.
    if (isCtaskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ctask-toggle"));
      let script = "";
      try { script = await buildCtaskScript(); } catch { script = "Contact task assignment panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F85: ops events × contact ownership — orphaned event detection.
    if (isOpeconQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:opecon-toggle"));
      let script = "";
      try { script = await buildOpeconScript(); } catch { script = "Ops contact ownership panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F86: contact × report coverage — surfaces contacts with no intelligence paper trail.
    if (isCtrptQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ctrpt-toggle"));
      let script = "";
      try { script = await buildCtrptScript(); } catch { script = "Contact report coverage panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F87: swarm job × aip skill coverage — surfaces jobs with no AI capability assigned.
    if (isSjaskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sjask-toggle"));
      let script = "";
      try { script = await buildSjaskScript(); } catch { script = "Swarm job AI skill coverage panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F88: scenario × report intelligence coverage — surfaces scenarios with no intelligence report backing.
    if (isScrepQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:screp-toggle"));
      let script = "";
      try { script = await buildScrepScript(); } catch { script = "Scenario intelligence coverage panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F89: graph centrality × risk signal convergence — surfaces high-centrality nodes with live risk signal matches.
    if (isCntrkrskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cntrkrsk-toggle"));
      let script = "";
      try { script = await buildCntrkrskScript(); } catch { script = "Graph centrality risk convergence panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F90: task × knowledge grounding — surfaces BARE tasks with no KB article backing.
    if (isTaskkgQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:taskkg-toggle"));
      let script = "";
      try { script = await buildTaskkgScript(); } catch { script = "Task knowledge grounding panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F91: intel profile × ops events activation — surfaces ACTIVATED threat profiles matched by live ops events.
    if (isIpopsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ipops-toggle"));
      let script = "";
      try { script = await buildIpopsScript(); } catch { script = "Intel profile ops activation panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isRptkbQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rptkb-toggle"));
      let script = "";
      try { script = await buildRptkbScript(); } catch { script = "Report knowledge coverage panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F94: ops events × AIP skill coverage — surfaces ops events with no AI skill backing (UNSUPPORTED).
    if (isOpaskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:opask-toggle"));
      let script = "";
      try { script = await buildOpaskScript(); } catch { script = "Ops AI skill coverage panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F95: investigation × dataset evidence — surfaces DATA_DARK cases with no dataset backing.
    if (isInvdsetQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:invdset-toggle"));
      let script = "";
      try { script = await buildInvdsetScript(); } catch { script = "Investigation dataset evidence panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F96: graph centrality × knowledge coverage — surfaces BARE high-centrality nodes with no KB backing.
    if (isGcknQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gcnk-toggle"));
      let script = "";
      try { script = await buildGcknScript(); } catch { script = "Graph centrality knowledge coverage panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F97: investment × knowledge coverage — surfaces DARK portfolio positions with no KB backing.
    if (isInvkbQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:invkb-toggle"));
      let script = "";
      try { script = await buildInvkbScript(); } catch { script = "Investment knowledge coverage panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F99: intel profile × knowledge coverage — surfaces BARE threat profiles with no KB backing.
    if (isIpkbQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ipkb-toggle"));
      let script = "";
      try { script = await buildIpkbScript(); } catch { script = "Intel profile knowledge coverage panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F200: contact × dataset exposure — surfaces INVISIBLE contacts with no data trail in any dataset.
    if (isCtdsetQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ctdset-toggle"));
      let script = "";
      try { script = await buildCtdsetScript(); } catch { script = "Contact dataset exposure panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F201: live intel × reports coverage — surfaces live events with no intelligence report coverage.
    if (isLirptQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:lirpt-toggle"));
      let script = "";
      try { script = await buildLirptScript(); } catch { script = "Live intel report coverage panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F202: live intel × scenario coverage — correlates live world events against threat scenarios.
    if (isLiscenQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:liscen-toggle"));
      let script = "";
      try { script = await buildLiscenScript(); } catch { script = "Live intel scenario coverage panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F203: graph centrality × investigations — surfaces influential nodes under active investigation.
    if (isGcinQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gcin-toggle"));
      let script = "";
      try { script = await buildGcinScript(); } catch { script = "Graph centrality investigations panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isLiknowQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:liknow-toggle"));
      let script = "";
      try { script = await buildLiknowScript(); } catch { script = "Live intel knowledge coverage panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isLicontactQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:licontact-toggle"));
      let script = "";
      try { script = await buildLicontactScript(); } catch { script = "Live intel contact exposure panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isGcnjobQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gcnjob-toggle"));
      let script = "";
      try { script = await buildGcnjobScript(); } catch { script = "Graph centrality swarm job tasking panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isLitaskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:litask-toggle"));
      let script = "";
      try { script = await buildLitaskScript(); } catch { script = "Live intel task activation panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isGcaskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gcask-toggle"));
      let script = "";
      try { script = await buildGcaskScript(); } catch { script = "Graph centrality AIP skill coverage panel is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isKfmQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:kfm-toggle"));
      let script = "";
      try { script = await buildKfmScript(); } catch { script = "Knowledge freshness monitor is standing by, sir."; }
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isAgentToolsRunnerQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:atr-toggle"));
      let script = "";
      try { script = await buildAgentToolsRunnerScript(); } catch { script = "Agent tools catalogue is standing by, sir."; }
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
