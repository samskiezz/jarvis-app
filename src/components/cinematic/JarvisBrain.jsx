import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiBase } from "@/api/cinematicDataAdapters";
import { isStatusQuery, buildStatusScript } from "./SpokenStatusReport";
import { isMarketsQuery, buildMarketsScript } from "./MarketsTicker";
import {
  isEntitySearchQuery,
  extractEntitySearchTerm,
  buildEntityDossierScript,
} from "./EntityQuickSearch";
import { isRiskQuery, buildRiskScript } from "./RiskBoard";
import { isShowMeQuery, resolveShowMeQuery } from "./ShowMeNavigation";
import { isMBriefQuery, buildMBriefScript } from "./MorningMissionBrief";
import { isOpsCasesQuery, buildOpsCasesScript } from "./OpsCasesMonitor";
import { isSwarmCoverageQuery, buildSwarmCoverageScript } from "./SwarmRiskCoverageMap";
import { isDicomQuery, buildDicomScript } from "./DecisionIntelCompleteness";
import { isGninvQuery, buildGninvScript } from "./GraphNodeInvestigationCoverage";
import { isTattrQuery, buildTattrScript } from "./ThreatAttributionMapper";
import { isGcscenQuery, buildGcscenScript } from "./GraphCommunityScenarioCoverage";
import { isKscovQuery, buildKscovScript } from "./KnowledgeSkillCoverageGap";
import { isOalinvQuery, buildOalinvScript } from "./OpsAlertInvestigationCoverage";
import { isGnintelQuery, buildGnintelScript } from "./GraphNodeIntelCoverage";
import { isDsriskQuery, buildDsriskScript } from "./DatasetRiskCoverage";
import { isConvinQuery, buildConvinScript } from "./ContactInvestmentCoverage";
import { isRiibQuery, buildRiibScript } from "./ReportInvestigationBridge";
import { isScntaskQuery, buildScntaskScript } from "./ScenarioTaskCoverage";
import { isGctaskQuery, buildGctaskScript } from "./GraphCommunityTaskCoverage";
import { isInvknowQuery, buildInvknowScript } from "./InvestigationKnowledgeCoverage";
import { isLiscenQuery, buildLiscenScript } from "./LiveIntelScenarioAlignment";
import { isInvrisexQuery, buildInvrisexScript } from "./InvestmentRiskExposureTracker";
import { isLirisconvQuery, buildLirisconvScript } from "./LiveIntelRiskConvergence";
import { isIntelskillQuery, buildIntelskillScript } from "./IntelProfileSkillAlignment";
import { isLitaskQuery, buildLitaskScript } from "./LiveTaskUrgencySignal";
import { isDscontQuery, buildDscontScript } from "./DatasetContactBridge";
import { isGcontQuery, buildGcontScript } from "./GraphCommunityContactCoverage";
import { isSjintelQuery, buildSjintelScript } from "./SwarmIntelProfileCoverage";
import { isGnscenQuery, buildGnscenScript } from "./GraphNodeScenarioCoverage";
import { isRskillQuery, buildRskillScript } from "./ReportSkillCoverage";

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
    // F20: "show me X" pre-router — normalise to panel intent keyword, re-dispatch,
    // then return so the agent chat doesn't fire on top of the panel's own voice.
    if (isShowMeQuery(q)) {
      const normalized = resolveShowMeQuery(q);
      window.dispatchEvent(
        new CustomEvent("jarvis:ask", { detail: { text: normalized, _sm: true } })
      );
      return;
    }
    clearTimeout(hideT.current);
    setOpen(true); setThinking(true); setText("");
    const scene = detectScene(q);
    if (scene) navigate(`/cinematic/${scene}`);
    let answer = "";
    if (isStatusQuery(q)) {
      try {
        answer = await buildStatusScript();
      } catch {
        answer = "I'm unable to retrieve system telemetry at this moment, sir.";
      }
    } else if (isMarketsQuery(q)) {
      try {
        answer = await buildMarketsScript();
      } catch {
        answer = "Market data is unavailable at this moment, sir.";
      }
    } else if (isEntitySearchQuery(q)) {
      const term = extractEntitySearchTerm(q);
      window.dispatchEvent(new CustomEvent("jarvis:entity-search", { detail: { term } }));
      try {
        answer = await buildEntityDossierScript(term);
      } catch {
        answer = "I was unable to retrieve the entity dossier at this moment, sir.";
      }
    } else if (isRiskQuery(q)) {
      try {
        answer = await buildRiskScript();
      } catch {
        answer = "I'm unable to retrieve the risk board at this moment, sir.";
      }
    } else if (isMBriefQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:mbrief-toggle"));
      try {
        answer = await buildMBriefScript();
      } catch {
        answer = "I'm compiling your mission brief now, sir. Opening the briefing panel.";
      }
    } else if (isOpsCasesQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:opcases-toggle"));
      try {
        answer = await buildOpsCasesScript();
      } catch {
        answer = "Opening the ops cases board, sir. Retrieving active case files now.";
      }
    } else if (isSwarmCoverageQuery(q)) {
      try {
        answer = await buildSwarmCoverageScript();
      } catch {
        answer = "Opening the swarm–risk coverage map, sir.";
      }
    } else if (isDicomQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:dicom-toggle"));
      try {
        answer = await buildDicomScript();
      } catch {
        answer = "Opening the decision intelligence completeness monitor, sir.";
      }
    } else if (isGninvQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gninv-toggle"));
      try {
        answer = await buildGninvScript();
      } catch {
        answer = "Opening the graph node investigation coverage panel, sir.";
      }
    } else if (isTattrQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tattr-toggle"));
      try {
        answer = await buildTattrScript();
      } catch {
        answer = "Opening the threat attribution mapper, sir.";
      }
    } else if (isGcscenQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gcscen-toggle"));
      try {
        answer = await buildGcscenScript();
      } catch {
        answer = "Opening the graph community scenario coverage panel, sir.";
      }
    } else if (isKscovQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:kscov-toggle"));
      try {
        answer = await buildKscovScript();
      } catch {
        answer = "Opening the knowledge-skill coverage gap panel, sir.";
      }
    } else if (isOalinvQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:oalinv-toggle"));
      try {
        answer = await buildOalinvScript();
      } catch {
        answer = "Opening the ops-alert investigation coverage panel, sir.";
      }
    } else if (isGnintelQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gnintel-toggle"));
      try {
        answer = await buildGnintelScript();
      } catch {
        answer = "Opening the graph node intel profile coverage panel, sir.";
      }
    } else if (isDsriskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:dsrisk-toggle"));
      try {
        answer = await buildDsriskScript();
      } catch {
        answer = "Opening the dataset risk coverage panel, sir.";
      }
    } else if (isConvinQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:convin-toggle"));
      try {
        answer = await buildConvinScript();
      } catch {
        answer = "Opening the contact investment coverage panel, sir.";
      }
    } else if (isRiibQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:riib-toggle"));
      try {
        answer = await buildRiibScript();
      } catch {
        answer = "Opening the report-investigation intelligence bridge, sir.";
      }
    } else if (isScntaskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scntask-toggle"));
      try {
        answer = await buildScntaskScript();
      } catch {
        answer = "Opening the scenario task coverage panel, sir.";
      }
    } else if (isGctaskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gctask-toggle"));
      try {
        answer = await buildGctaskScript();
      } catch {
        answer = "Opening the community task coverage panel, sir.";
      }
    } else if (isInvknowQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:invknow-toggle"));
      try {
        answer = await buildInvknowScript();
      } catch {
        answer = "Opening the investigation knowledge coverage panel, sir.";
      }
    } else if (isLiscenQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:liscen-toggle"));
      try {
        answer = await buildLiscenScript();
      } catch {
        answer = "Opening the live intel scenario alignment panel, sir.";
      }
    } else if (isInvrisexQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:invrisex-toggle"));
      try {
        answer = await buildInvrisexScript();
      } catch {
        answer = "Opening the investment risk exposure tracker, sir.";
      }
    } else if (isLirisconvQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:lirisconv-toggle"));
      try {
        answer = await buildLirisconvScript();
      } catch {
        answer = "Opening the live intel risk convergence monitor, sir.";
      }
    } else if (isIntelskillQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:intelskill-toggle"));
      try {
        answer = await buildIntelskillScript();
      } catch {
        answer = "Opening the intel profile skill alignment monitor, sir.";
      }
    } else if (isLitaskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:litask-toggle"));
      try {
        answer = await buildLitaskScript();
      } catch {
        answer = "Opening the live task urgency signal monitor, sir.";
      }
    } else if (isDscontQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:dscont-toggle"));
      try {
        answer = await buildDscontScript();
      } catch {
        answer = "Opening the dataset contact intelligence bridge, sir.";
      }
    } else if (isGcontQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gcont-toggle"));
      try {
        answer = await buildGcontScript();
      } catch {
        answer = "Opening the graph community contact coverage monitor, sir.";
      }
    } else if (isSjintelQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sjintel-toggle"));
      try {
        answer = await buildSjintelScript();
      } catch {
        answer = "Opening the swarm intel profile coverage monitor, sir.";
      }
    } else if (isGnscenQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gnscen-toggle"));
      try {
        answer = await buildGnscenScript();
      } catch {
        answer = "Opening the graph node scenario coverage monitor, sir.";
      }
    } else if (isRskillQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rskill-toggle"));
      try {
        answer = await buildRskillScript();
      } catch {
        answer = "Opening the report skill domain coverage monitor, sir.";
      }
    } else {
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
    }
    if (scene && !answer) answer = `Summoning the ${SCENE_LABEL[scene]}, sir.`;
    if (!answer) answer = "At your service, sir.";
    setThinking(false); typeOut(answer); speak(answer);
    hideT.current = setTimeout(() => setOpen(false), Math.max(9000, answer.length * 70));
  }

  useEffect(() => {
    const onAsk = (e) => {
      // Skip events that ShowMeNavigation already normalized — panels handle them.
      if (e?.detail?._sm) return;
      // JarvisAssistant owns chat on /apex routes; avoid duplicate handling there.
      if (typeof window !== "undefined" && window.location.pathname.startsWith("/apex")) return;
      const q = e?.detail?.text || e?.detail?.query;
      if (q) ask(q);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  // F08: speak entity dossiers dispatched by EntityQuickSearch result clicks
  useEffect(() => {
    const onDossier = (e) => {
      const t = e?.detail?.text;
      if (!t) return;
      clearTimeout(hideT.current);
      setOpen(true); setThinking(false); typeOut(t); speak(t);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, t.length * 70));
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
