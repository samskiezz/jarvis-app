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
