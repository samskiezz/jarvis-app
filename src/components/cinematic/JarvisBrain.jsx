import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiBase } from "@/api/cinematicDataAdapters";
import { isStatusQuery, buildStatusScript } from "./SpokenStatusReport";
import { isMarketsQuery, buildMarketsScript } from "./MarketsTicker";
import { isEntitySearchQuery, extractEntitySearchTerm, buildEntityDossierScript } from "./EntityQuickSearch";
import { isRiskQuery, buildRiskScript } from "./RiskBoard";
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
