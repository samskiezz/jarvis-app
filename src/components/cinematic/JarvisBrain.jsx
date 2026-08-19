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
import { isKbopsQuery, buildKbopsScript } from "./KnowledgeOpsEventCoverage";
import { isScInvQuery, buildScInvScript } from "./SceneInvestmentCoverage";
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
import { isSwarmskillQuery, buildSwarmskillScript } from "./SwarmJobSkillAlignment";
import { isOpsQuery, buildOpsScript } from "./OpsEventStream";
import { isEntityRegistryQuery, buildEntityRegistryScript } from "./EntityRegistryOverview";
import { isSwrptQuery, buildSwrptScript } from "./SwarmReportCoverage";
import { isIptaskQuery, buildIptaskScript } from "./IntelProfileTaskLinker";
import { isGtopoQuery, buildGtopoScript } from "./GraphTopologyHealth";
import { isMissionReadyQuery, buildMissionReadyScript } from "./MissionReadinessIndex";
import { isInvgrphQuery, buildInvgrphScript } from "./InvestmentGraphInfluence";
import { isIpscenQuery, buildIpscenScript } from "./IntelProfileScenarioCoverage";
import { isRskscenQuery, buildRskscenScript } from "./RiskScenarioCoverage";
import { isOevrskQuery, buildOevrskScript } from "./OpsEventRiskCorrelator";
import { isRscmapQuery, buildRscmapScript } from "./ReportScenarioMapper";
import { isLiveTickerQuery, buildLiveTickerScript } from "./LiveMarketTicker";
import { isDatasetGrowthQuery, buildDatasetGrowthScript } from "./DatasetGrowthTracker";
import { isTgprQuery, buildTgprScript } from "./TaskGraphPriorityRanker";
import { isGrdnQuery, buildGrdnScript } from "./GuardianIncidentMonitor";
import { isOpcmQuery, buildOpcmScript } from "./OpsCaseManager";
import { isRcorQuery, buildRcorScript } from "./RunCorrelatorDashboard";
import { isSynapticCapacityQuery, buildSynapticCapacityScript } from "./SynapticCapacityExplorer";
import { isMfceQuery, buildMfceScript } from "./MetricForecastEngine";
import { isLbsgQuery, buildLbsgScript } from "./LlmBudgetSentinel";
import { isTopObjectsQuery, buildTopObjectsScript } from "./TopObjectsExplorer";
import { isRbldQuery, buildRbldScript } from "./RunBuilderMonitor";
import { isToolRegistryQuery, buildToolRegistryScript } from "./AgentToolRegistry";
import { isDlgrQuery, buildDlgrScript } from "./DecisionLedgerMonitor";
import { isGovQuery, buildGovScript } from "./DataGovernanceMonitor";
import { isSbbQuery, buildSbbScript } from "./SecondBrainBrowser";
import { isSolarQuery, buildSolarScript } from "./SolarEnergyMonitor";
import { isInvstQuery, buildInvstScript } from "./InvestigationsBoard";
import { isIswmQuery, buildIswmScript } from "./InferenceSwarmMonitor";
import { isRdckQuery, buildRdckScript } from "./RitualDeckMonitor";
import { isGcbdQuery, buildGcbdScript } from "./GothamCaseBoard";
import { isCplsQuery, buildCplsScript } from "./CodePulseMonitor";
import { isVtlsQuery, buildVtlsScript } from "./VitalsDashboard";
import { isInbxQuery, buildInbxScript } from "./IntentInbox";
import { isFricQuery, buildFricScript } from "./FrictionMapMonitor";
import { isRlibQuery, buildRlibScript } from "./ReportsLibrary";
import { isSpecForgeQuery, buildSpecForgeScript } from "./SpecForgeMonitor";
import { isVpnQuery, buildVpnScript } from "./VpnControlPanel";
import { isReminderQuery, buildReminderScript } from "./RemindersPanel";
import { isThoughtCompressorQuery, buildThoughtCompressorScript } from "./ThoughtCompressorPanel";
import { isOhsdQuery, buildOhsdScript } from "../overnight/OpsHealthSummaryDrawer";
import { isProofPackQuery, buildProofPackScript } from "./ProofPackLibrary";
import { isTemporalSeriesQuery, buildTemporalSeriesScript } from "./TemporalSeriesMonitor";
import { isRevdbQuery, buildRevdbScript } from "./RevDbBrowser";
import { isSnsrQuery, buildSnsrScript } from "./SensorActivityMonitor";
import { isBrrsQuery, buildBrrsScript } from "./BrainResearchStudio";
import { isMsgsQuery, buildMsgsScript } from "./MessagesCommsPanel";
import { isLiicQuery, buildLiicScript } from "./LiveIntelInvestigationCorrelator";
import { isAdcrQuery, buildAdcrScript } from "./AnomalyDecisionCorrelator";
import { isAobsQuery, buildAobsScript } from "./AstroObservatoryPanel";
import { isSchedQuery, buildSchedScript } from "./ScheduleActivityMonitor";
import { isVtrkQuery, buildVtrkScript } from "./VisionTrackingMonitor";
import { isApltQuery, buildApltScript } from "./AssuranceAutopilotPanel";
import { isSregQuery, buildSregScript } from "./SourceConnectorRegistry";
import { isMxrpQuery, buildMxrpScript } from "./ModeMixerControl";
import { isFleetQuery, buildFleetScript } from "./ServiceFleetMonitor";
import { isGeoQuery, buildGeoScript } from "./GeoIntelPanel";
import { isMgenQuery, buildMgenScript } from "./MusicStudio";
import { isPkctlQuery, buildPkctlScript } from "./PanicKeyControlPanel";
import { isAcsnQuery, buildAcsnScript } from "./AcousticContactMonitor";
import { isNxbtQuery, buildNxbtScript } from "./NexusEventBusMonitor";
import { isVcmQuery, buildVcmScript } from "./VoiceCommandMonitor";
import { isPactQuery, buildPactScript } from "./PendingActionsBoard";
import { isJosmQuery, buildJosmScript } from "./JarvisOsMonitor";
import { isClcdQuery, buildClcdScript } from "./ClaudeCodeRunMonitor";
import { isFrgmQuery, buildFrgmScript } from "./ForgeAgentMonitor";
import { isScenQuery, buildScenScript } from "./ScenarioEnginePanel";
import { isApldQuery, buildApldScript } from "./ApolloDeployMonitor";
import { isOntoQuery, buildOntoScript } from "./OntologyObjectBrowser";
import { isPhonQuery, buildPhonScript } from "./PhoneDialerPanel";
import { isDeadQuery, buildDeadScript } from "./DeadZoneFinderPanel";
import { isLabsQuery, buildLabsScript } from "./LabCapabilityWorkbench";
import { isSimlQuery, buildSimlScript } from "./SimulationIntelPanel";
import { isWkspQuery, buildWkspScript } from "./WorkshopAnalyticsPanel";
import { isGannQuery, buildGannScript } from "./GraphAnnotationBoard";
import { isSrchQuery, buildSrchScript } from "./SemanticSearchConsole";
import { isAlacQuery, buildAlacScript } from "./AlertAnomalyCorrelator";
import { isCscrQuery, buildCscrScript } from "./CrossStoreCorrelator";
import { isKgpfQuery, buildKgpfScript } from "./KnowledgeGraphPathFinder";
import { isCopQuery, buildCopScript } from "./CopFusionDashboard";
import { isSclrQuery, buildSclrScript } from "./SecurityClearancePanel";
import { isPredQuery, buildPredScript } from "./PredictionConsole";
import { isScvcQuery, buildScvcScript } from "./SpecCaseCoverage";
import { isRlnkQuery, buildRlnkScript } from "./ReportKnowledgeLinker";
import { isVltxQuery, buildVltxScript } from "./SecretsVaultPanel";
import { isLiswrmQuery, buildLiswrmScript } from "./LiveIntelSwarmAlignPanel";
import { isSpslQuery, buildSpslScript } from "./SavedSearchConsole";
import { isBrtwQuery, buildBrtwScript } from "./BrainThinkWorkbench";
import { isUe5pQuery, buildUe5pScript } from "./Ue5PipelineMonitor";
import { isWtxnQuery, buildWtxnScript } from "./WorldTaxonomyExplorer";
import { isEhscQuery, buildEhscScript } from "./EntityHealthScorecard";
import { isTracQuery, buildTracScript } from "./TaskRiskAlertCorrelator";
import { isIgapQuery, buildIgapScript } from "./IntelDecisionGapFinder";
import { isBcrmQuery, buildBcrmScript } from "./BrainCrmDirectory";
import { isTobjQuery, buildTobjScript } from "./TemporalObjectHistory";
import { isMintQuery, buildMintScript } from "./MotorIntentPanel";
import { isIvrcQuery, buildIvrcScript } from "./InvestmentRiskCorrelator";
import { isSwarmAlertQuery, buildSwarmAlertScript } from "./SwarmJobAlertCorrelator";
import { isAdnaQuery, buildAdnaScript } from "./AssetDnaScanner";
import { isCgcpQuery, buildCgcpScript } from "./ContactGraphCentralityPanel";
import { isIpliveQuery, buildIpliveScript } from "./IntelProfileLiveIntelExposure";
import { isIlipQuery, buildIlipScript } from "./InvestigationLiveIntelPulse";
import { isIspcQuery, buildIspcScript } from "./IntelSpecCoverage";
import { isRsscQuery, buildRsscScript } from "./RiskSpecCoverage";
import { isTaskSpecQuery, buildTaskSpecScript } from "./TaskSpecCoverage";
import { isIvdcQuery, buildIvdcScript } from "./InvestmentDecisionCoverage";
import { isVfstQuery, buildVfstScript } from "./VoiceForgeStudio";
import { isHlbQuery, buildHlbScript } from "./HistoryLakeBrowser";
import { isErcnQuery, buildErcnScript } from "./EntityResolutionConsole";
import { isCrscQuery, buildCrscScript } from "./ContactRiskSignalCorrelator";
import { isScrpQuery, buildScrpScript } from "./ScrapeIntelStudio";
import { isSjscQuery, buildSjscScript } from "./SwarmJobSpecCoverage";
import { isIvscQuery, buildIvscScript } from "./InvestmentSpecCoverage";
import { isTrscQuery, buildTrscScript } from "./TaskRiskSignalCorrelator";
import { isIacrQuery, buildIacrScript } from "./InvestmentAlertCorrelator";
import { isIapcQuery, buildIapcScript } from "./IntelProfileAlertCorrelator";
import { isPolpQuery, buildPolpScript } from "./PolicyDecisionPanel";
import { isWinpQuery, buildWinpScript } from "./WorldIntelPanel";
import { isCtbdQuery, buildCtbdScript } from "./ContactTaskBoard";
import { isCdcvQuery, buildCdcvScript } from "./ContactDecisionCoverage";
import { isSwarmDecisionQuery, buildSwarmDecisionScript } from "./SwarmJobDecisionCoverage";
import { isCspcQuery, buildCspcScript } from "./ContactSpecCoverage";
import { isTinvQuery, buildTinvScript } from "./TaskInvestigationCorrelator";
import { isWtwrQuery, buildWtwrScript } from "./WatchtowerRulesPanel";
import { isIpdcQuery, buildIpdcScript } from "./IntelDecisionCoverage";
import { isGnacQuery, buildGnacScript } from "./GraphNodeAlertCoverage";
import { isIgcpQuery, buildIgcpScript } from "./IntelProfileGraphCentrality";
import { isIvgcQuery, buildIvgcScript } from "./InvestmentGraphCentrality";
import { isSjinvQuery, buildSjinvScript } from "./SwarmJobInvestigationCorrelator";
import { isScTaskQuery, buildScTaskScript } from "./SceneTaskCoverage";
import { isAsstQuery, buildAsstScript } from "./JarvisAssetLibrary";
import { isContactAnomalyQuery, buildContactAnomalyScript } from "./ContactAnomalyCorrelator";
import { isTaskAnomalyQuery, buildTaskAnomalyScript } from "./TaskAnomalyCorrelator";
import { isSwarmRiskQuery, buildSwarmRiskScript } from "./SwarmJobRiskCorrelator";
import { isLgceQuery, buildLgceScript } from "./LiveIntelGraphExposure";
import { isIvacQuery, buildIvacScript } from "./InvestmentAnomalyCorrelator";
import { isIprscQuery, buildIprscScript } from "./IntelProfileRiskCorrelator";
import { isIpacQuery, buildIpacScript } from "./IntelProfileAnomalyCorrelator";
import { isEvlbQuery, buildEvlbScript } from "./AipEvalBenchmark";
import { isCinvQuery, buildCinvScript } from "./ContactInvestigationCorrelator";
import { isIpskQuery, buildIpskScript } from "./IntelProfileSkillCoverage";
import { isRsinvQuery, buildRsinvScript } from "./RiskSignalInvestigationCorrelator";
import { isInvliveQuery, buildInvliveScript } from "./InvestmentLiveIntelExposure";
import { isRsacQuery, buildRsacScript } from "./RiskSignalAnomalyCorrelator";
import { isSwarmAnomalyQuery, buildSwarmAnomalyScript } from "./SwarmJobAnomalyCorrelator";
import { isIvinQuery, buildIvinScript } from "./InvestmentInvestigationCorrelator";
import { isRsgcQuery, buildRsgcScript } from "./RiskSignalGraphCentrality";
import { isIpinvQuery, buildIpinvScript } from "./IntelProfileInvestigationCorrelator";
import { isTovsQuery, buildTovsScript } from "./OntologyTypeViewsStudio";
import { isGtmxQuery, buildGtmxScript } from "./GraphTimeMachinePanel";
import { isCsjcQuery, buildCsjcScript } from "./ContactSwarmJobCoverage";
import { isFndpQuery, buildFndpScript } from "./FoundryPipelineBrowser";
import { isNotesQuery, buildNotesScript } from "./CollabNotesPanel";
import { isTdcvQuery, buildTdcvScript } from "./TaskDecisionCoverage";
import { isIpdsQuery, buildIpdsScript } from "./IntelProfileDatasetCorrelator";
import { isCdstQuery, buildCdstScript } from "./ContactDatasetCoverage";
import { isSdmcQuery, buildSdmcScript } from "./SciDomainConsolePanel";
import { isScanQuery, buildScanScript } from "./ScenarioAnomalyCorrelator";
import { isSci3dQuery, buildSci3dScript } from "./Sci3dStudio";
import { isTnrpQuery, buildTnrpScript } from "./TenantRegistryPanel";
import { isMecmQuery, buildMecmScript } from "./MultiEntityCoverageMatrix";
import { isUwbrQuery, buildUwbrScript } from "./UnderworldBridgeConsole";
import { isRsdcQuery, buildRsdcScript } from "./RiskSignalDecisionCoverage";
import { isOeanQuery, buildOeanScript } from "./OpsEventAnomalyCorrelator";
import { isCaclQuery, buildCaclScript } from "./ContactAlertCorrelator";
import { isDspcQuery, buildDspcScript } from "./DatasetSpecCoverage";
import { isDsalQuery, buildDsalScript } from "./DatasetAlertCorrelator";
import { isOeiaQuery, buildOeiaScript } from "./OpsEventInvestmentCorrelator";
import { isDsanQuery, buildDsanScript } from "./DatasetAnomalyCorrelator";
import { isOescQuery, buildOescScript } from "./OpsEventSpecCoverage";
import { isAlscQuery, buildAlscScript } from "./AlertSpecCoverage";
import { isIprcQuery, buildIprcScript } from "./IntelProfileReportCoverage";
import { isInvRptQuery, buildInvRptScript } from "./InvestmentReportCoverage";
import { isRsrptQuery, buildRsrptScript } from "./RiskSignalReportCoverage";
import { isOedcQuery, buildOedcScript } from "./OpsEventDecisionCoverage";
import { isIavrQuery, buildIavrScript } from "./InvestigationAnomalyCorrelator";
import { isDdcvQuery, buildDdcvScript } from "./DatasetDecisionCoverage";
import { isAldcQuery, buildAldcScript } from "./AlertDecisionCoverage";
import { isTkrpQuery, buildTkrpScript } from "./TaskReportCoverage";
import { isGnsrskQuery, buildGnsrskScript } from "./GraphNodeRiskSignalCoverage";
import { isRsliveQuery, buildRsliveScript } from "./RiskSignalLiveIntelCoverage";
import { isGnscenQuery, buildGnscenScript } from "./GraphNodeScenarioCoverage";
import { isGntaskQuery, buildGntaskScript } from "./GraphNodeTaskCoverage";
import { isGninvQuery, buildGninvScript } from "./GraphNodeInvestmentCoverage";
import { isInvscQuery, buildInvscScript } from "./InvestigationSpecCoverage";
import { isInvdcQuery, buildInvdcScript } from "./InvestigationDecisionCoverage";
import { isSwarmJobRptQuery, buildSwarmJobRptScript } from "./SwarmJobReportCoverage";
import { isIrpcQuery, buildIrpcScript } from "./InvestigationReportCoverage";
import { isTaskAlcQuery, buildTaskAlcScript } from "./TaskAlertCorrelator";
import { isSevdashQuery, buildSevdashScript } from "./OpsEventSeverityDashboard";
import { isLitaQuery, buildLitaScript } from "./LiveIntelTaskActivator";
import { isSkildQuery, buildSkildScript } from "./SkillLiveIntelDemand";
import { isCxlintelQuery, buildCxlintelScript } from "./ContactLiveIntelExposure";
import { isGndcQuery, buildGndcScript } from "./GraphNodeDatasetCoverage";
import { isInvintelQuery, buildInvintelScript } from "./InvestmentIntelExposure";
import { isRpipQuery, buildRpipScript } from "./ReportIntelProfileCoverage";
import { isSCIPQuery, buildSCIPScript } from "./ScenarioIntelProfileCoverage";
import { isInvdataQuery, buildInvdataScript } from "./InvestigationDatasetCoverage";
import { isSwjopsQuery, buildSwjopsScript } from "./SwarmJobOpsEventCoverage";
import { isSkopsQuery, buildSkopsScript } from "./SkillOpsEventCoverage";
import { isScoeQuery, buildScoeScript } from "./ScenarioOpsEventCoverage";
import { isRptdsQuery, buildRptdsScript } from "./ReportDatasetCoverage";
import { isTintelQuery, buildTintelScript } from "./TaskIntelProfileCoverage";
import { isTkopsQuery, buildTkopsScript } from "./TaskOpsEventCoverage";
import { isCskillQuery, buildCskillScript } from "./ContactSkillCoverage";
import { isGnskQuery, buildGnskScript } from "./GraphNodeSkillCoverage";
import { isRpliveQuery, buildRpliveScript } from "./LiveIntelReportCoverage";
import { isGnopsQuery, buildGnopsScript } from "./GraphNodeOpsEventCoverage";
import { isCkbaseQuery, buildCkbaseScript } from "./KnowledgeContactCoverage";
import { isScKbQuery, buildScKbScript } from "./SceneKnowledgeCoverage";
import { isScscenQuery, buildScscenScript } from "./SceneScenarioCoverage";
import { isKbriskQuery, buildKbriskScript } from "./KnowledgeRiskSignalCoverage";
import { isScdsQuery, buildScdsScript } from "./SceneDatasetCoverage";
import { isSwkbQuery, buildSwkbScript } from "./KnowledgeSwarmJobCoverage";
import { isInvscenQuery, buildInvscenScript } from "./InvestmentScenarioCoverage";
import { isSliveQuery, buildSliveScript } from "./SceneLiveIntelExposure";
import { isKbinvQuery, buildKbinvScript } from "./KnowledgeInvestigationCoverage";
import { isOeliveQuery, buildOeliveScript } from "./OpsEventLiveIntelCoverage";
import { isRpopsQuery, buildRpopsScript } from "./ReportOpsEventCoverage";
import { isScopsQuery, buildScopsScript } from "./SceneOpsEventCoverage";
import { isCtrptQuery, buildCtrptScript } from "./ContactReportCoverage";
import { isInvscnQuery, buildInvscnScript } from "./InvestigationScenarioCoverage";
import { isDsliveQuery, buildDsliveScript } from "./LiveIntelDatasetCoverage";
import { isGcinvQuery, buildGcinvScript } from "./GraphCommunityInvestmentCoverage";
import { isGcontQuery, buildGcontScript } from "./GraphCommunityContactCoverage";
import { isGcskQuery, buildGcskScript } from "./GraphCommunitySkillCoverage";
import { isGcscenQuery, buildGcscenScript } from "./GraphCommunityScenarioCoverage";
import { isKscovQuery, buildKscovScript } from "./KnowledgeSkillCoverageGap";
import { isGctaskQuery, buildGctaskScript } from "./GraphCommunityTaskCoverage";
import { isGcliveQuery, buildGcliveScript } from "./GraphCommunityLiveIntelExposure";
import { isGcrptQuery, buildGcrptScript } from "./GraphCommunityReportCoverage";
import { isGcrskQuery, buildGcrskScript } from "./GraphCommunityRiskSignalCoverage";
import { isGciplQuery, buildGciplScript } from "./GraphCommunityIntelProfileCoverage";
import { isTaskKnowledgeQuery, buildTaskKnowledgeScript } from "./TaskKnowledgeCoverage";
import { isKbliveQuery, buildKbliveScript } from "./KnowledgeLiveIntelCoverage";
import { isGcdsQuery, buildGcdsScript } from "./GraphCommunityDatasetCoverage";
import { isIpoevQuery, buildIpoevScript } from "./IntelProfileOpsEventCoverage";
import { isKbscenQuery, buildKbscenScript } from "./KnowledgeScenarioCoverage";
import { isConvinQuery, buildConvinScript } from "./ContactInvestmentCoverage";
import { isGnintelQuery, buildGnintelScript } from "./GraphNodeIntelCoverage";
import { isScIntelQuery, buildScIntelScript } from "./SceneIntelProfileCoverage";
import { isRsktskQuery, buildRsktskScript } from "./RiskSignalTaskCoverage";
import { isGcswjQuery, buildGcswjScript } from "./GraphCommunitySwarmJobCoverage";
import { isTaskScenQuery, buildTaskScenScript } from "./TaskScenarioCoverage";
import { isScnrptQuery, buildScnrptScript } from "./SceneReportCoverage";
import { isInvdsQuery, buildInvdsScript } from "./InvestmentDatasetCoverage";
import { isScskQuery, buildScskScript } from "./SceneSkillCoverage";
import { isGcopsQuery, buildGcopsScript } from "./GraphCommunityOpsEventCoverage";
import { isGknowQuery, buildGknowScript } from "./GraphNodeKnowledgeCoverage";
import { isGnswjQuery, buildGnswjScript } from "./GraphNodeSwarmJobCoverage";
import { isSwscenQuery, buildSwscenScript } from "./SwarmScenarioCoverage";
import { isRsskQuery, buildRsskScript } from "./RiskSignalSkillCoverage";
import { isTaskSwjQuery, buildTaskSwjScript } from "./TaskSwarmJobCoverage";
import { isSkscenQuery, buildSkscenScript } from "./SkillScenarioCoverage";
import { isInvscnmapQuery, buildInvscnmapScript } from "./InvestigationSceneMapper";
import { isScconQuery, buildScconScript } from "./SceneContactCoverage";
import { isCscenQuery, buildCscenScript } from "./ContactScenarioCoverage";
import { isTaskDsQuery, buildTaskDsScript } from "./TaskDatasetCoverage";
import { isCoecQuery, buildCoecScript } from "./ContactOpsEventCoverage";
import { isRskillQuery, buildRskillScript } from "./ReportSkillCoverage";
import { isCtskQuery, buildCtskScript } from "./ContactTaskCoverage";
import { isInvkbQuery, buildInvkbScript } from "./InvestmentKnowledgeCoverage";
import { isScswjQuery, buildScswjScript } from "./SceneSwarmJobCoverage";
import { isTrsscenQuery, buildTrsscenScript } from "./TaskRiskScenarioTripleCoverage";
import { isGcilQuery, buildGcilScript } from "./GraphCommunityInvestigationLinker";
import { isRsoeQuery, buildRsoeScript } from "./RiskSignalOpsEventCoverage";
import { isSjintelQuery, buildSjintelScript } from "./SwarmIntelProfileCoverage";
import { isGcknowQuery, buildGcknowScript } from "./GraphCommunityKnowledgeCoverage";
import { isKbtaskQuery, buildKbtaskScript } from "./KnowledgeTaskCoverage";
import { isInvSwjQuery, buildInvSwjScript } from "./InvestmentSwarmJobCoverage";
import { isSkscen3Query, buildSkscen3Script } from "./ScenarioSkillSwarmCoverage";
import { isCorklQuery, buildCorklScript } from "./ContactKnowledgeRiskTriple";
import { isIgntriQuery, buildIgntriScript } from "./InvestmentGraphRiskTriple";
import { isSwjdsQuery, buildSwjdsScript } from "./SwarmDatasetCoverage";
import { isScctriQuery, buildScctriScript } from "./ScenarioContactTaskTriple";
import { isIrttriQuery, buildIrttriScript } from "./InvestigationRiskTaskTriple";
import { isScrtriQuery, buildScrtriScript } from "./SceneRiskTaskTriple";
import { isKgctriQuery, buildKgctriScript } from "./KnowledgeGraphCommunityTaskTriple";
import { isDirsigQuery, buildDirsigScript } from "./DatasetInvestigationRiskTriple";
import { isIpstriQuery, buildIpstriScript } from "./IntelProfileScenarioTaskTriple";
import { isGncstpQuery, buildGncstpScript } from "./GraphNodeContactScenarioTriple";
import { isCsjitriQuery, buildCsjitriScript } from "./ContactSwarmInvestTriple";
import { isInsrisiQuery, buildInsrisiScript } from "./InvestmentScenarioRiskTriple";
import { isSjcstriQuery, buildSjcstriScript } from "./SwarmJobContactScenarioTriple";
import { isGnrstpQuery, buildGnrstpScript } from "./GraphNodeRiskSwarmTriple";
import { isRtswtriQuery, buildRtswtriScript } from "./ReportTaskSwarmTriple";
import { isGcipswjQuery, buildGcipswjScript } from "./GraphCommunityIntelSwarmTriple";
import { isKirstriQuery, buildKirstriScript } from "./KnowledgeInvestmentRiskTriple";
import { isCtoptQuery, buildCtoptScript } from "./ContactTaskOpsTriple";
import { isOcrstriQuery, buildOcrstriScript } from "./OpsEventContactRiskTriple";
import { isIipdQuery, buildIipdScript } from "./InvestigationIntelDatasetTriple";
import { isDscontQuery, buildDscontScript } from "./DatasetContactBridge";
import { isGccitpQuery, buildGccitpScript } from "./GraphCommunityContactInvestTriple";
import { isTcdsomQuery, buildTcdsomScript } from "./TaskOperationalReadinessMatrix";
import { isGcoetriQuery, buildGcoetriScript } from "./GraphCommunityOpsTaskTriple";
import { isGcrktriQuery, buildGcrktriScript } from "./GraphCommunityReportKnowledgeTriple";
import { isSidtriQuery, buildSidtriScript } from "./ScenarioIntelDatasetTriple";
import { isSjcskQuery, buildSjcskScript } from "./SwarmJobContactSkillTriple";
import { isKstriQuery, buildKstriScript } from "./KnowledgeScenarioTaskTriple";
import { isOksrdyQuery, buildOksrdyScript } from "./OpsEventKnowledgeScenarioReadiness";
import { isRcdtriQuery, buildRcdtriScript } from "./RiskSignalQuadCoverage";
import { isGnlitQuery, buildGnlitScript } from "./GraphNodeLiveIntelTaskTriple";
import { isGclrstriQuery, buildGclrstriScript } from "./GraphCommunityLiveIntelRiskTriple";
import { isIttriQuery, buildIttriScript } from "./InvestmentTaskOpsTriple";
import { isGnroetQuery, buildGnroetScript } from "./GraphNodeReportOpsTriple";
import { isLkrstriQuery, buildLkrstriScript } from "./LiveIntelKnowledgeRiskTriple";
import { isSsjdtriQuery, buildSsjdtriScript } from "./ScenarioSwarmDatasetTriple";
import { isCiprtriQuery, buildCiprtriScript } from "./ContactIntelReportTriple";
import { isGnctriQuery, buildGnctriScript } from "./GraphNodeContactTaskTriple";
import { isSjrskQuery, buildSjrskScript } from "./SwarmJobReportSkillTriple";
import { isKcstpQuery, buildKcstpScript } from "./KnowledgeContactScenarioTriple";
import { isGniktrQuery, buildGniktrScript } from "./GraphNodeInvestmentKnowledgeTriple";
import { isSkctriQuery, buildSkctriScript } from "./ScenarioKnowledgeContactTriple";
import { isIcktqQuery, buildIcktqScript } from "./InvestigationContactKnowledgeTaskQuad";
import { isKrstqQuery, buildKrstqScript } from "./KnowledgeReportScenarioTaskQuad";
import { isRgctormQuery, buildRgctormScript } from "./RiskSignalGraphCommunityTaskMatrix";
import { isSysrskQuery, buildSysrskScript } from "./SystemStatusRiskMonitor";
import { isSscstpQuery, buildSscstpScript } from "./SystemContactScenarioTriple";
import { isTgcovQuery, buildTgcovScript } from "./TaskGraphCommunityCoverage";
import { isIptriQuery, buildIptriScript } from "./IntelProfileTaskOpsTriple";
import { isScitriQuery, buildScitriScript } from "./ScenarioContactInvestTriple";
import { isCroetriQuery, buildCroetriScript } from "./ContactReportOpsTriple";
import { isDtcovQuery, buildDtcovScript } from "./DatasetTaskContactCoverage";
import { isLscovQuery, buildLscovScript } from "./LiveIntelSwarmContactCoverage";
import { isSgktriQuery, buildSgktriScript } from "./SceneGraphKnowledgeTriple";
import { isIrsecovQuery, buildIrsecovScript } from "./InvestmentRiskScenarioCoverage";
import { isRktriQuery, buildRktriScript } from "./ReportKnowledgeTaskTriple";
import { isScivtriQuery, buildScivtriScript } from "./SceneContactInvestmentTriple";
import { isSjsktriQuery, buildSjsktriScript } from "./SwarmJobSkillKnowledgeTriple";
import { isCdswtriQuery, buildCdswtriScript } from "./ContactDatasetSwarmTriple";
import { isIgcoeQuery, buildIgcoeScript } from "./IntelProfileGraphCommOpsTriple";
import { isScgnQuery, buildScgnScript } from "./SceneGraphNodeCoverage";
import { isInvswscQuery, buildInvswscScript } from "./InvestigationSwarmScenarioTriple";
import { isGncipQuery, buildGncipScript } from "./GraphNodeContactIntelTriple";
import { isRskscnQuery, buildRskscnScript } from "./RiskSignalSceneKnowledgeTriple";
import { isLgcstriQuery, buildLgcstriScript } from "./LiveIntelGraphCommunityScenarioTriple";
import { isIdrtriQuery, buildIdrtriScript } from "./InvestigationDatasetReportTriple";
import { isTkrptriQuery, buildTkrptriScript } from "./TaskKnowledgeReportTriple";
import { isScstsQuery, buildScstsScript } from "./SceneSystemStatusCoverage";
import { isIgcsklQuery, buildIgcsklScript } from "./InvestigationGraphCommunitySkillTriple";
import { isRgctriQuery, buildRgctriScript } from "./ReportGraphCommunityTaskTriple";
import { isKgnoeQuery, buildKgnoeScript } from "./KnowledgeGraphNodeOpsTriple";
import { isScgoetriQuery, buildScgoetriScript } from "./SceneGraphCommunityOpsTriple";
import { isSstknQuery, buildSstknScript } from "./SystemStatusTaskKnowledgeCoverage";
import { isCscrsQuery, buildCscrsScript } from "./ContactSceneRiskTriple";
import { isSiltriQuery, buildSiltriScript } from "./SkillInvestigationLiveIntelTriple";
import { isRsitripQuery, buildRsitripScript } from "./ReportSwarmIntelTriple";
import { isOekctriQuery, buildOekctriScript } from "./OpsEventKnowledgeContactTriple";
import { isIkoeQuery, buildIkoeScript } from "./InvestmentKnowledgeOpsTriple";
import { isDssrtriQuery, buildDssrtriScript } from "./DatasetScenarioRiskTriple";
import { isTgcliQuery, buildTgcliScript } from "./TaskGraphCommunityLiveIntelTriple";
import { isSjdknQuery, buildSjdknScript } from "./SwarmJobDatasetKnowledgeTriple";
import { isIgrcovQuery, buildIgrcovScript } from "./InvestmentGraphReportTriple";
import { isSccoskQuery, buildSccoskScript } from "./SceneContactSkillTriple";
import { isSsdscovQuery, buildSsdscovScript } from "./SystemStatusDatasetCoverage";
import { isRsdktriQuery, buildRsdktriScript } from "./RiskSignalDatasetKnowledgeTriple";
import { isTgnoeQuery, buildTgnoeScript } from "./TaskGraphNodeOpsTriple";
import { isCgnsktrQuery, buildCgnsktrScript } from "./ContactGraphNodeSkillTriple";
import { isIssktriQuery, buildIssktriScript } from "./InvestigationScenarioSkillTriple";
import { isCsdtriQuery, buildCsdtriScript } from "./ContactScenarioDatasetTriple";
import { isSjioeQuery, buildSjioeScript } from "./SwarmJobIntelProfileOpsTriple";
import { isCgcoeQuery, buildCgcoeScript } from "./ContactGraphCommunityOpsTriple";
import { isSiptriQuery, buildSiptriScript } from "./SceneIntelProfileTaskTriple";
import { isIpgcoeQuery, buildIpgcoeScript } from "./IntelProfileGraphCommunityOpsTriple";
import { isGnkscenQuery, buildGnkscenScript } from "./GraphNodeKnowledgeScenarioTriple";
import { isSjkstriQuery, buildSjkstriScript } from "./SwarmJobKnowledgeScenarioTriple";
import { isIsrtriQuery, buildIsrtriScript } from "./InvestmentSkillReportTriple";
import { isOecdtriQuery, buildOecdtriScript } from "./OpsEventContactDatasetTriple";
import { isLsrtriQuery, buildLsrtriScript } from "./LiveIntelSystemRiskTriple";
import { isRcstriQuery, buildRcstriScript } from "./RiskContactScenarioTriple";
import { isCklitriQuery, buildCklitriScript } from "./ContactKnowledgeLiveIntelTriple";
import { isLgnsQuery, buildLgnsScript } from "./LiveIntelGraphNodeSceneCoverage";
import { isIrktriQuery, buildIrktriScript } from "./InvestigationReportKnowledgeTriple";
import { isSsswrskQuery, buildSsswrskScript } from "./SystemSwarmRiskTriple";
import { isGcipdsQuery, buildGcipdsScript } from "./GraphCommunityIntelDatasetTriple";
import { isGcsitrQuery, buildGcsitrScript } from "./GraphCommunityScenarioInvestTriple";
import { isTaskContactLiveQuery, buildTaskContactLiveScript } from "./TaskContactLiveIntelTriple";
import { isSkillGraphNodeLiveQuery, buildSkillGraphNodeLiveScript } from "./SkillGraphNodeLiveIntelTriple";
import { isRgntriQuery, buildRgntriScript } from "./ReportGraphNodeContactTriple";
import { isDipseenQuery, buildDipseenScript } from "./DatasetIntelProfileSceneTriple";
import { isIrscnQuery, buildIrscnScript } from "./InvRiskScenTriple";
import { isSjcscnQuery, buildSjcscnScript } from "./SwarmJobContactSceneTriple";
import { isScswdsQuery, buildScswdsScript } from "./SceneSwarmDatasetTriple";
import { isScrliveQuery, buildScrliveScript } from "./ScenarioReportLiveIntelTriple";
import { isIsltriQuery, buildIsltriScript } from "./InvestigationSkillLiveIntelTriple";
import { isKcrstriQuery, buildKcrstriScript } from "./KnowledgeContactRiskTriple";
import { isGckliveQuery, buildGckliveScript } from "./GraphCommunityKnowledgeLiveIntelTriple";
import { isRskgctriQuery, buildRskgctriScript } from "./RiskSignalKnowledgeCommunityTriple";
import { isTirrepQuery, buildTirrepScript } from "./TaskInvestigationReportTriple";
import { isSsivcoQuery, buildSsivcoScript } from "./SystemStatusInvestigationCoverage";
import { isSsgncoQuery, buildSsgncoScript } from "./SystemStatusGraphNodeCoverage";
import { isSsscenQuery, buildSsscenScript } from "./SystemStatusScenarioCoverage";
import { isSwjdcQuery, buildSwjdcScript } from "./SwarmJobDatasetCoverage";
import { isCivktriQuery, buildCivktriScript } from "./ContactInvestKnowledgeTriple";
import { isIsoetriQuery, buildIsoetriScript } from "./InvestSystemOpsTriple";
import { isRpscnQuery, buildRpscnScript } from "./ReportScenarioCoverage";
import { isOesrtriQuery, buildOesrtriScript } from "./OpsEventScenarioReportTriple";
import { isIdsctriQuery, buildIdsctriScript } from "./IntelProfileDatasetScenarioTriple";
import { isTrscovQuery, buildTrscovScript } from "./TaskRiskSignalCoverage";
import { isCoeknowQuery, buildCoeknowScript } from "./ContactOpsKnowledgeTriple";
import { isLsttriQuery, buildLsttriScript } from "./LiveIntelSystemTaskTriple";
import { isIsctriQuery, buildIsctriScript } from "./InvestScenarioReportTriple";
import { isGcitriQuery, buildGcitriScript } from "./GraphCommunityInvestTaskTriple";
import { isSjcktriQuery, buildSjcktriScript } from "./SwarmJobContactKnowledgeTriple";
import { isGnoestriQuery, buildGnoestriScript } from "./GraphNodeOpsScenarioTriple";
import { isIpeotriQuery, buildIpeotriScript } from "./IntelProfileOpsTaskTriple";
import { isRiknowQuery, buildRiknowScript } from "./RiskSignalInvestKnowledge";
import { isCirsktriQuery, buildCirsktriScript } from "./ContactInvestRiskTriple";
import { isRoetriQuery, buildRoetriScript } from "./ReportOpsTaskTriple";
import { isDkrstriQuery, buildDkrstriScript } from "./DatasetKnowledgeRiskTriple";
import { isAipkrstriQuery, buildAipkrstriScript } from "./AipSkillKnowledgeRiskTriple";
import { isScsriskQuery, buildScsriskScript } from "./SceneSystemRiskTriple";
import { isSoektriQuery, buildSoektriScript } from "./ScenarioOpsKnowledgeTriple";
import { isCskntriQuery, buildCskntriScript } from "./ContactScenarioKnowledgeTriple";
import { isTikvtriQuery, buildTikvtriScript } from "./TaskInvestigationKnowledgeTriple";
import { isRcscenQuery, buildRcscenScript } from "./ReportContactScenarioTriple";
import { isSwjoestriQuery, buildSwjoestriScript } from "./SwarmJobOpsScenarioTriple";
import { isRdasTriQuery, buildRdasTriScript } from "./RiskSignalDatasetSkillTriple";
import { isLkstriQuery, buildLkstriScript } from "./LiveIntelKnowledgeSkillTriple";
import { isCascntriQuery, buildCascntriScript } from "./ContactAipScenarioTriple";
import { isCirskQuery, buildCirskScript } from "./ContactInvestigationRiskTriple";
import { isCgcdsQuery, buildCgcdsScript } from "./ContactGraphCommunityDatasetTriple";
import { isSjaskcoQuery, buildSjaskcoScript } from "./SwarmJobAipSkillKnowledgeTriple";
import { isTdaskcoQuery, buildTdaskcoScript } from "./TaskDatasetSkillTriple";
import { isIpaskdsQuery, buildIpaskdsScript } from "./IntelProfileAipDatasetTriple";
import { isGnascQuery, buildGnascScript } from "./GraphAnnotationSkillScenarioTriple";
import { isRskliscQuery, buildRskliscScript } from "./RiskSignalLiveIntelScenarioTriple";
import { isGalieQuery, buildGalieScript } from "./GraphAnnotationLiveIntelExposure";
import { isGaricQuery, buildGaricScript } from "./GraphAnnotationReportInvestigationTriple";
import { isIpgarepQuery, buildIpgarepScript } from "./IntelProfileAnnotationReportTriple";
import { isGacrtriQuery, buildGacrtriScript } from "./GraphAnnotationContactRiskTriple";
import { isGatoeQuery, buildGatoeScript } from "./GraphAnnotationTaskOpsTriple";
import { isGasjinvQuery, buildGasjinvScript } from "./GraphAnnotationSwarmInvestTriple";
import { isGadkcoQuery, buildGadkcoScript } from "./GraphAnnotationDatasetKnowledgeTriple";
import { isCtskillQuery, buildCtskillScript } from "./ContactTaskSkillTriple";
import { isIgckcoQuery, buildIgckcoScript } from "./InvestGraphCommunityKnowledgeTriple";
import { isIgoetriQuery, buildIgoetriScript } from "./InvestGraphCommunityOpsTriple";
import { isSjgcriskQuery, buildSjgcriskScript } from "./SwarmJobGraphCommunityRiskTriple";
import { isCgascQuery, buildCgascScript } from "./ContactGraphAnnotationScenarioTriple";
import { isRsgakcoQuery, buildRsgakcoScript } from "./RiskSignalGraphAnnotationKnowledgeTriple";
import { isTaskipinvQuery, buildTaskipinvScript } from "./TaskIntelInvestigationTriple";
import { isSjipinvQuery, buildSjipinvScript } from "./SwarmJobIntelInvestTriple";
import { isIpgcscQuery, buildIpgcscScript } from "./IntelProfileGraphCommunityScenarioTriple";
import { isInvkscQuery, buildInvkscScript } from "./InvestmentKnowledgeScenarioTriple";
import { isCgcskcoQuery, buildCgcskcoScript } from "./ContactGraphCommunitySkillTriple";
import { isGasoeQuery, buildGasoeScript } from "./GraphAnnotationSkillOpsTriple";
import { isTrrskQuery, buildTrrskScript } from "./TaskReportRiskSignalTriple";
import { isSjoekbQuery, buildSjoekbScript } from "./SwarmJobOpsKnowledgeTriple";
import { isIsrtripQuery, buildIsrtripScript } from "./InvestigationScenarioRiskTriple";
import { isDrinvcoQuery, buildDrinvcoScript } from "./DatasetReportInvestTriple";
import { isGairtripQuery, buildGairtripScript } from "./GraphAnnotationIntelReportTriple";
import { isGccntriQuery, buildGccntriScript } from "./GraphCentralityContactInvestTriple";
import { isScinopsQuery, buildScinopsScript } from "./SceneIntelProfileOpsTriple";
import { isTsjscQuery, buildTsjscScript } from "./TaskSwarmScenarioTriple";
import { isIpgckcoQuery, buildIpgckcoScript } from "./IntelProfileCentralityKnowledgeTriple";
import { isRcsjQuery, buildRcsjScript } from "./ReportContactSwarmTriple";
import { isIvcoeQuery, buildIvcoeScript } from "./InvestContactOpsTriple";
import { isGcrriskQuery, buildGcrriskScript } from "./GraphCommunityReportRiskTriple";
import { isKgcoeQuery, buildKgcoeScript } from "./KnowledgeCentralityOpsTriple";
import { isGcskliQuery, buildGcskliScript } from "./GraphCommunitySkillLiveTriple";
import { isDictriQuery, buildDictriScript } from "./DatasetInvestContactTriple";
import { isKrsctriQuery, buildKrsctriScript } from "./KnowledgeReportScenarioTriple";
import { isScswtriQuery, buildScswtriScript } from "./SceneSwarmKnowledgeTriple";
import { isGcdsscQuery, buildGcdsscScript } from "./GraphCentralityDatasetScenarioTriple";
import { isCgntoeQuery, buildCgntoeScript } from "./ContactGraphCentralityOpsTriple";
import { isIsjrepQuery, buildIsjrepScript } from "./InvestmentSwarmReportTriple";
import { isKgcaskQuery, buildKgcaskScript } from "./KnowledgeAipCentralityTriple";
import { isRsgckcoQuery, buildRsgckcoScript } from "./RiskSignalCommunityKnowledgeTriple";
import { isSdsitriQuery, buildSdsitriScript } from "./SceneDatasetInvestigationTriple";
import { isSganscQuery, buildSganscScript } from "./SceneAnnotationScenarioTriple";
import { isTgcrepQuery, buildTgcrepScript } from "./TaskGraphCentralityReportTriple";
import { isCgaoeQuery, buildCgaoeScript } from "./ContactGraphAnnotationOpsTriple";
import { isScckcoQuery, buildScckcoScript } from "./SceneContactKnowledgeTriple";
import { isSiscQuery, buildSiscScript } from "./SceneInvestigationSkillTriple";
import { isGadsjQuery, buildGadsjScript } from "./GraphAnnotationDatasetSwarmTriple";
import { isRisoeQuery, buildRisoeScript } from "./RiskSignalIntelOpsTriple";
import { isSjgcscQuery, buildSjgcscScript } from "./SwarmJobCentralityScenarioTriple";
import { isCasitriQuery, buildCasitriScript } from "./ContactSkillInvestigationTriple";
import { isDasoetriQuery, buildDasoetriScript } from "./DatasetSkillOpsTriple";
import { isIganscQuery, buildIganscScript } from "./InvestmentAnnotationScenarioTriple";
import { isKgaoeQuery, buildKgaoeScript } from "./KnowledgeAnnotationOpsTriple";
import { isClgannQuery, buildClgannScript } from "./ContactLiveIntelAnnotationTriple";
import { isRsgatriQuery, buildRsgatriScript } from "./RiskSignalAnnotationTaskTriple";
import { isIpligaQuery, buildIpligaScript } from "./IntelProfileLiveAnnotationTriple";
import { isTlgannQuery, buildTlgannScript } from "./TaskLiveIntelAnnotationTriple";
import { isScliannQuery, buildScliannScript } from "./ScenarioLiveIntelAnnotationTriple";
import { isCliannQuery, buildCliannScript } from "./ContactLiveAnnotationTriple";
import { isSjliannQuery, buildSjliannScript } from "./SwarmJobLiveAnnotationTriple";
import { isInvliannQuery, buildInvliannScript } from "./InvestmentLiveAnnotationTriple";
import { isRsliannQuery, buildRsliannScript } from "./RiskSignalLiveAnnotationTriple";
import { isIpsoeQuery, buildIpsoeScript } from "./IntelProfileSkillOpsTriple";
import { isDlgannQuery, buildDlgannScript } from "./DatasetLiveAnnotationTriple";
import { isRpliannQuery, buildRpliannScript } from "./ReportLiveAnnotationTriple";
import { isKliannQuery, buildKliannScript } from "./KnowledgeLiveAnnotationTriple";
import { isSclgannQuery, buildSclgannScript } from "./SceneLiveAnnotationTriple";
import { isInlgannQuery, buildInlgannScript } from "./InvestigationLiveAnnotationTriple";
import { isAsliannQuery, buildAsliannScript } from "./AipSkillLiveAnnotationTriple";
import { isGatadsQuery, buildGatadsScript } from "./GraphAnnotationTaskDatasetTriple";
import { isCoedQuery, buildCoedScript } from "./ContactOpsDatasetTriple";
import { isScgcriskQuery, buildScgcriskScript } from "./SceneGraphCommunityRiskTriple";
import { isSwjkgcenQuery, buildSwjkgcenScript } from "./SwarmJobKnowledgeCentralityTriple";
import { isTkgcknowQuery, buildTkgcknowScript } from "./TaskGraphCommunityKnowledgeTriple";
import { isIgcdsQuery, buildIgcdsScript } from "./InvestmentGraphCommunityDatasetTriple";
import { isCsrepQuery, buildCsrepScript } from "./ContactScenarioReportTriple";
import { isIiknowQuery, buildIiknowScript } from "./InvestmentInvestigationKnowledgeTriple";
import { isRrdsQuery, buildRrdsScript } from "./RiskSignalReportDatasetTriple";
import { isScaskdsQuery, buildScaskdsScript } from "./SceneAipSkillDatasetTriple";
import { isTipgcQuery, buildTipgcScript } from "./TaskIntelProfileCommunityTriple";
import { isTgcknQuery, buildTgcknScript } from "./TaskCentralityKnowledgeTriple";
import { isIpinvscQuery, buildIpinvscScript } from "./IntelProfileInvestmentScenarioTriple";
import { isCkiknowQuery, buildCkiknowScript } from "./ContactKnowledgeInvestigationTriple";
import { isSjroeQuery, buildSjroeScript } from "./SwarmJobReportOpsTriple";
import { isRsdscnQuery, buildRsdscnScript } from "./RiskSignalDatasetScenarioTriple";
import { isRsgcoeQuery, buildRsgcoeScript } from "./RiskSignalGraphCommunityOpsTriple";
import { isIpcoeQuery, buildIpcoeScript } from "./IntelProfileContactOpsTriple";
import { isGnscdsQuery, buildGnscdsScript } from "./GraphNodeScenarioDatasetTriple";
import { isScasoeQuery, buildScasoeScript } from "./SceneAipSkillOpsTriple";
import { isScgcaskQuery, buildScgcaskScript } from "./SceneGraphCentralitySkillTriple";
import { isCgcrQuery, buildCgcrScript } from "./ContactGraphCentralityReportTriple";
import { isRsgcaskQuery, buildRsgcaskScript } from "./RiskSignalGraphCentralitySkillTriple";
import { isInvgcaskQuery, buildInvgcaskScript } from "./InvestigationGraphCentralitySkillTriple";
import { isDgcconQuery, buildDgcconScript } from "./DatasetGraphCentralityContactTriple";
import { isInvgcrQuery, buildInvgcrScript } from "./InvestmentGraphCentralityReportTriple";
import { isSjgcrQuery, buildSjgcrScript } from "./SwarmJobGraphCentralityReportTriple";
import { isTirsigQuery, buildTirsigScript } from "./TaskInvestmentRiskSignalTriple";
import { isCiitQuery, buildCiitScript } from "./ContactIntelInvestigationTriple";
import { isKipoeQuery, buildKipoeScript } from "./KnowledgeIntelProfileOpsTriple";
import { isIasoeQuery, buildIasoeScript } from "./InvestmentAipSkillOpsTriple";
import { isScgcknQuery, buildScgcknScript } from "./SceneGraphCommunityKnowledgeTriple";
import { isTskivQuery, buildTskivScript } from "./TaskSkillInvestigationTriple";
import { isIpscoeQuery, buildIpscoeScript } from "./IntelProfileScenarioOpsTriple";
import { isBssfQuery, buildBssfScript } from "./BrainSystemStatusFusion";
import { isTkliveQuery, buildTkliveScript } from "./TaskKnowledgeLiveIntelTriple";

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

  const SKILLGAP_RE = /\b(skill.gap|gap.advisor|training.plan|learning.plan|development.plan|improve.skill|skill.improve|growth.plan|upskill|weakest.skill|skill.deficit|capability.gap)\b/i;

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

    // F134: knowledge × ops event coverage — "ops knowledge / knowledge ops / kbops /
    // informed ops / blind ops / ops knowledge gap"
    // Opens KnowledgeOpsEventCoverage panel (jarvis:kbops-toggle) and speaks a 2-sentence
    // ops-knowledge coverage brief from /knowledge/ + /v1/ops/events.
    if (isKbopsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:kbops-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildKbopsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F137: scene × investment coverage — "scene invest / invest scene / scinv /
    // scene portfolio / portfolio scene / which scenes have investments"
    // Opens SceneInvestmentCoverage panel (jarvis:scinv-toggle) and speaks a 2-sentence
    // scene-portfolio coverage brief from /v1/cinematic/scene/{id} + /entities/Investment.
    if (isScInvQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scinv-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScInvScript();
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
    // F193: Swarm Job × Skill Domain Alignment — /entities/SwarmJob + /v1/aip/skill;
    // DEPLOYED (swarm job exercises skill) vs DORMANT (no swarm coverage); 2-sentence AI brief;
    // dispatches jarvis:swarmskill-toggle; ◈ SWARMSKILL left:69640 zIndex:134; 90-s auto-refresh;
    // "swarm skill / swarmskill / skill deployment / deployed skills / dormant skills / swarm capability"
    if (isSwarmskillQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:swarmskill-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSwarmskillScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F71: Scene × Scenario Coverage — /v1/cinematic/scene/{id} × /v1/scenario/list;
    // SCRIPTED (scenario coverage found) vs UNPLANNED (no scenario — action gap);
    // dispatches jarvis:scscen-toggle; ◈ SCSCEN left:686320 zIndex:254; 120-s auto-refresh;
    // "scene scenario / scenario scene / scscen / scripted scene / unplanned scene / scene coverage"
    if (isScscenQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scscen-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScscenScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F222: Ops Event Stream voice wiring — /v1/ops/events; real event count + critical flag;
    // OpsEventStream panel opens itself via its own jarvis:ask listener (OPS_RE);
    // JarvisBrain adds TTS spoken brief (total events + critical count) from real /v1/ops/events;
    // "ops log / ops events / ops stream / operations log / operations events"
    if (isOpsQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildOpsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F223: Entity Registry Overview — parallel-fetches all 6 entity types (Task, RiskSignal,
    // IntelProfile, SwarmJob, Investment, Contact); speaks total object count across the JARVIS
    // ontology; dispatches jarvis:registry-toggle; ◫ REGISTRY left:2780 zIndex:60;
    // "entity / entities / registry / object count / entity count / all entities / entity overview"
    if (isEntityRegistryQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:registry-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildEntityRegistryScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F138: Swarm Job × Report Coverage voice wiring — "swarm report / job report /
    // swarm documentation / which swarm jobs have reports / swrpt"
    // Opens SwarmReportCoverage panel (jarvis:swrpt-toggle) and speaks a brief on
    // DOCUMENTED vs UNDOCUMENTED swarm jobs from /entities/SwarmJob + /v1/reports.
    if (isSwrptQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:swrpt-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSwrptScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F115: Intel Profile × Task Linker voice wiring — parallel-fetches /entities/IntelProfile +
    // /entities/Task; keyword-correlates threat profiles to tasks (TASKED vs UNTASKED); dispatches
    // jarvis:iptask-toggle (opens panel); speaks 2-sentence AI threat-coverage brief + TTS;
    // ◈ IPTASK button left:9332 zIndex:69; 90-s auto-refresh;
    // "intel task / threat task / profile task / iptask / who's handling this threat"
    if (isIptaskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:iptask-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIptaskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F_GTOPO: Graph Topology Health voice wiring — parallel-fetches /v1/graph/centrality +
    // /v1/graph/communities; computes 0-100 health score; dispatches jarvis:gtopo-toggle (opens
    // panel); speaks health score + node count + community count + concentration advisory + TTS;
    // ⬡ GTOPO button left:9340; 90-s auto-refresh;
    // "graph topology / network topology / topology health / graph health / gtopo"
    if (isGtopoQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gtopo-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGtopoScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F67: Mission Readiness Index voice wiring — parallel-fetches /entities/Task + /v1/aip/skill +
    // /entities/SwarmJob + /v1/jarvis/system/status; computes 0-100 composite readiness score;
    // buildMissionReadyScript() dispatches jarvis:mission-ready-toggle (opens panel) internally;
    // "mission ready / readiness / ready index / operational ready / MRI / ready status"
    if (isMissionReadyQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildMissionReadyScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F224 — 5 scenario/graph panels voice-wired
    // InvestmentGraphInfluence: /entities/Investment × /v1/graph/centrality
    // "investment graph / portfolio influence / network investments / invgrph"
    if (isInvgrphQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildInvgrphScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // IntelProfileScenarioCoverage: /entities/IntelProfile × /v1/scenario/list
    // "intel scenario / threat scenario / ipscen / unplanned threats"
    if (isIpscenQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildIpscenScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // RiskScenarioCoverage: /entities/RiskSignal × /v1/scenario/list
    // "risk scenario / scenario risk / rskscen / unplanned risks"
    if (isRskscenQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildRskscenScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // OpsEventRiskCorrelator: /v1/ops/events × /entities/RiskSignal
    // "ops event risk / event risk signal / oevrsk / flagged events"
    if (isOevrskQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildOevrskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // ReportScenarioMapper: /v1/reports × /v1/scenario/list
    // "report scenario / scenario report / rscmap / playbook report"
    if (isRscmapQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildRscmapScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F225: LiveMarketTicker — fixed bottom strip; real /functions/getLiveIntel data;
    // speaks top movers + latest seismic event brief;
    // "live ticker / market strip / price ticker / lticker / show ticker / live prices"
    if (isLiveTickerQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildLiveTickerScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F226: DatasetGrowthTracker — tracks per-dataset row-count deltas from /v1/datasets;
    // opens DSGR panel + speaks fastest-growing dataset brief;
    // "dataset growth / data growth / which dataset is growing / dataset trends / row count / dsgr"
    if (isDatasetGrowthQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildDatasetGrowthScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F227: TaskGraphPriorityRanker — /entities/Task × /v1/graph/centrality;
    // ranks tasks by centrality overlap; dispatches jarvis:tgpr-toggle + speaks priority brief;
    // "task graph / graph task rank / tgpr / high centrality tasks / network task priority /
    //  which tasks matter most / network priority / tasks by network importance"
    if (isTgprQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildTgprScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F228: GuardianIncidentMonitor — /v1/guardian/status + /v1/guardian/incidents;
    // shows sensor/security incidents, severity badges, ACK control;
    // dispatches jarvis:grdn-toggle + speaks unacked/high-severity brief;
    // "guardian / security incidents / sensor alerts / unacked incidents /
    //  home security / grdn / physical security / incident monitor"
    if (isGrdnQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildGrdnScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F229: OpsCaseManager — /v1/alerts + /v1/cases;
    // shows open alerts with ACK, investigation cases with status transitions;
    // dispatches jarvis:opcm-toggle + speaks open alert / open case brief;
    // "ops case / case manager / alerts board / active alerts /
    //  open cases / opcm / ops board / case board / alert queue / incident cases"
    if (isOpcmQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildOpcmScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // Run Correlator Dashboard — correlated event clusters from the correlation engine;
    // fetches /v1/run-correlator/clusters (90-s poll), expands per-cluster detail;
    // dispatches jarvis:rcor-toggle + speaks cluster count / critical brief;
    // "run correlator / correlated events / event clusters / rcor /
    //  incident clusters / correlation engine / sensor correlation"
    if (isRcorQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildRcorScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // dispatches jarvis:synap-toggle + speaks neuron/synapse capacity brief;
    // "synaptic capacity / brain capacity / neural capacity / capacity explorer /
    //  synap / synaptic scale / how big is the brain"
    if (isSynapticCapacityQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildSynapticCapacityScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // dispatches jarvis:mfce-toggle + speaks worst anomaly + forecast brief;
    // "metric forecast / forecast engine / mfce / metric anomaly /
    //  measurement forecast / predict metric / anomaly forecast /
    //  zscore forecast / forecast metrics / metric predictor"
    if (isMfceQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildMfceScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // dispatches jarvis:lbsg-toggle + speaks daily budget + provider brief;
    // "provider status / llm providers / token budget / daily budget /
    //  spend status / budget ceiling / llm spend / budget sentinel /
    //  which providers / model providers / provider health / archon budget / lbsg"
    if (isLbsgQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildLbsgScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F234: dispatches jarvis:top-objects-toggle + speaks top-ranked PageRank/centrality nodes brief;
    // "top objects / top nodes / most influential / influential entities /
    //  pagerank / graph rank / top ranked / who are the top / highest rank"
    if (isTopObjectsQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildTopObjectsScript();
      window.dispatchEvent(new CustomEvent("jarvis:top-objects-toggle"));
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F235: dispatches jarvis:rbld-toggle + speaks workflow run health brief;
    // "run builder / workflow runs / compiled runs / rbld / graph run /
    //  run monitor / workflow builder / build history / which runs /
    //  run status / build runs / run log / workflow log"
    if (isRbldQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildRbldScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F236: dispatches jarvis:atr-toggle + speaks tool count + category brief;
    // "tool registry / agent tools / what tools / jarvis capabilities /
    //  available tools / tool catalogue / tool list / tool set / atr"
    if (isToolRegistryQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:atr-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildToolRegistryScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F237: dispatches jarvis:dlgr-toggle + speaks decision state brief;
    // "decision ledger / dlgr / decisions / decision log / decision record /
    //  which decisions / decision review / decision audit / decision history"
    if (isDlgrQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildDlgrScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGovQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildGovScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSbbQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildSbbScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSolarQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildSolarScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isInvstQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:invst-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildInvstScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIswmQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:iswm-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIswmScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRdckQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rdck-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRdckScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGcbdQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gcbd-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGcbdScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCplsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cpls-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCplsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isVtlsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:vtls-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildVtlsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isInbxQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:inbx-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildInbxScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isFricQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:fric-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildFricScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRlibQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rlib-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRlibScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSpecForgeQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sfm-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSpecForgeScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isVpnQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:vpn-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildVpnScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isReminderQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rmndr-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildReminderScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isThoughtCompressorQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tcmpr-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildThoughtCompressorScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isOhsdQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ohsd-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildOhsdScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isProofPackQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ppak-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildProofPackScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isTemporalSeriesQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tmprl-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTemporalSeriesScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRevdbQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rvdb-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRevdbScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSnsrQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:snsr-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSnsrScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isBrrsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:brrs-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildBrrsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isMsgsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:msgs-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildMsgsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isLiicQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:liic-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildLiicScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isAdcrQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:adcr-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildAdcrScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isAobsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:aobs-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildAobsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSchedQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sched-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = buildSchedScript({});
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isVtrkQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:vtrk-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = buildVtrkScript([]);
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isApltQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildApltScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSregQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildSregScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isMxrpQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildMxrpScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isFleetQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildFleetScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGeoQuery(q)) {
      setOpen(true); setThinking(true); setText("");
      const script = await buildGeoScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isMgenQuery(q)) {
      window.dispatchEvent(new Event("jarvis:mgen-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildMgenScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isPkctlQuery(q)) {
      window.dispatchEvent(new Event("jarvis:pkctl-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildPkctlScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isAcsnQuery(q)) {
      window.dispatchEvent(new Event("jarvis:acsn-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildAcsnScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isNxbtQuery(q)) {
      window.dispatchEvent(new Event("jarvis:nxbt-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildNxbtScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isVcmQuery(q)) {
      window.dispatchEvent(new Event("jarvis:vcmd-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildVcmScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isPactQuery(q)) {
      window.dispatchEvent(new Event("jarvis:pact-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildPactScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isJosmQuery(q)) {
      window.dispatchEvent(new Event("jarvis:josm-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildJosmScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isClcdQuery(q)) {
      window.dispatchEvent(new Event("jarvis:clcd-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildClcdScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isFrgmQuery(q)) {
      window.dispatchEvent(new Event("jarvis:frgm-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildFrgmScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isScenQuery(q)) {
      window.dispatchEvent(new Event("jarvis:scen-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScenScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isApldQuery(q)) {
      window.dispatchEvent(new Event("jarvis:apld-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildApldScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F283: Ontology Object Browser — polls GET /v1/ontology/types + /v1/ontology/objects;
    // type filter chips + expand → neighbors; jarvis:onto-toggle; ◈ ONTO left:310800 zIndex:161;
    // "ontology / object model / knowledge model / entity types / object types / onto /
    //  ontology browser / ontology objects / object catalog / type catalog / ontology types /
    //  what types exist / knowledge objects"
    if (isOntoQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:onto-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildOntoScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // "phone / dial / sms / phone control / dialer / outbound call / send sms /
    //  phone panel / text message / phon / phone status / call control / phone provider"
    if (isPhonQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:phon-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildPhonScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // "dead zone / deadzone / dead zones / stale files / duplicate features /
    //  missing files / dead code / cleanup intel / dzf / repo cleanup /
    //  dead zone finder / unused features"
    if (isDeadQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:dead-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildDeadScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // "labs / lab capabilities / drug discovery / quantum demo / disease model /
    //  patent classify / materials / manufacturing sim / science lab / lab catalog /
    //  available labs / run lab / lab workbench"
    if (isLabsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:labs-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildLabsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // "simulation intel / siml / what-if / risk propagation / monte carlo /
    //  action recommend / object simulation / recommend action / blast radius /
    //  risk sim / sim engine / decision engine / propagate risk / sim intelligence"
    if (isSimlQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:siml-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSimlScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // "workshop / analytics panel / group by / histogram / pivot table / wksp /
    //  data analysis / object analytics / explore data / workshop analytics /
    //  field analysis / distribution / data explorer"
    if (isWkspQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:wksp-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildWkspScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // "graph annotations / annotate graph / graph notes / annotation board /
    //  gann / annotate node / graph markup"
    if (isGannQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gann-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGannScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // "semantic search / vector search / rag / knowledge search /
    //  natural language query / srch / knowledge retrieval /
    //  search ontology / search knowledge / nl query / reindex"
    if (isSrchQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:srch-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSrchScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // "alert anomaly / anomaly alert / alac / alert correlator / linked alerts /
    //  orphan alerts / alert anomaly match / correlated alerts / alert correlation /
    //  which alerts have anomalies"
    if (isAlacQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:alac-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildAlacScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // "cross-store / correlate object / knowledge fusion / cscr / graph fusion /
    //  vector correlation / cross-store correlation / object correlator /
    //  fuse knowledge / which objects link"
    if (isCscrQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cscr-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCscrScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // "graph path / find path / path finder / kgpf / shortest path / connect nodes /
    //  path between / how are connected / node path / graph route / object path"
    if (isKgpfQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:kgpf-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildKgpfScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // "cop fusion / common operating picture / cop snapshot / cop layers /
    //  fused snapshot / cop panel / cop dashboard / cop monitor / cop view / cop"
    if (isCopQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cop-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCopScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // "security clearance / acl / who am i / my role / audit chain / compliance status /
    //  sclr / clearance level / access control / permission check / security audit / data classification"
    if (isSclrQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sclr-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSclrScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // "predict / prediction / forecast / pred / prediction engine / prediction console /
    //  model forecast / forecast models / what will happen / make a prediction"
    if (isPredQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:pred-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildPredScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // "spec case coverage / case coverage / scvc / spec cases / spec linked / unlinked specs /
    //  case coverage tracker / spec to case / spec coverage map / spec backing / spec evidence"
    if (isScvcQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scvc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScvcScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // "report knowledge / knowledge report / rlnk / report articles / linked reports /
    //  document knowledge / report coverage / report to knowledge / knowledge linker"
    if (isRlnkQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rlnk-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRlnkScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // "secrets vault / vault panel / secret keys / vltx / vault secrets / stored secrets /
    //  api keys vault / credential vault / secret registry / connector secrets"
    if (isVltxQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:vltx-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildVltxScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F302: live intel × swarm job alignment — "live swarm / world swarm / liswrm /
    //   swarm world response / automated response / swarm live event / swarm alignment"
    if (isLiswrmQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:liswrm-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildLiswrmScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F303: saved search console — "saved search / search console / search manager / spls /
    //   search plus / faceted search / saved queries / search alerts / new matches / faceted filter"
    if (isSpslQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:spls-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSpslScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F304: brain thinking workbench — "brain think / think tool / challenge idea / red team /
    //   thought panel / emerge themes / connect concepts / brtw / thinking tools / vault health /
    //   brain workbench / think with jarvis / knowledge think / vault think"
    if (isBrtwQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:brtw-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildBrtwScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F305 — "ue5 / pipeline / render pipeline / pipeline status / ue5 pipeline /
    //   unreal engine / render status / pipeline launch / pipeline steps /
    //   render steps / deploy pipeline / ue5p"
    if (isUe5pQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ue5p-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildUe5pScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F306 WorldTaxonomyExplorer — /v1/jarvis/taxonomy/*
    // "world taxonomy / taxonomy explorer / ontology cells / acquisition families /
    //   world topics / taxonomy map / wtxn / knowledge map / world model /
    //   world ontology / topic cells / taxonomy browser"
    if (isWtxnQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:wtxn-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildWtxnScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F307 EntityHealthScorecard — /v1/ontology/objects + /v1/jarvis/analytics/anomalies + /v1/alerts
    // "entity health / entity scorecard / ehsc / object health / entity status /
    //   which entities have alerts / entity health check / object anomaly /
    //   health scorecard / entity risk"
    if (isEhscQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ehsc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildEhscScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F308 TaskRiskAlertCorrelator — /entities/Task + /v1/alerts
    // "task alerts / task risk / trac / tasks with alerts / exposed tasks /
    //   alert tasks / task coverage / which tasks have alerts / task alert map"
    if (isTracQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:trac-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTracScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F309 IntelDecisionGapFinder — /entities/IntelProfile + /v1/decision/list
    // "intel gap / decision intel / igap / intel coverage / uncovered intel /
    //   intel decisions / intel decision coverage / which intel has no decisions /
    //   intelligence gap / decision coverage intel"
    if (isIgapQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:igap-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIgapScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F310 BrainCrmDirectory — /v1/brain/people + /v1/brain/people/{name} + POST /v1/brain/mention
    // "people directory / crm / brain crm / who do you know / contact directory /
    //   bcrm / tiered contacts / known people / mention person / record observation /
    //   person profile / my contacts / contact crm"
    if (isBcrmQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:bcrm-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildBcrmScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F311 TemporalObjectHistory — /v1/jarvis/temporal/history/{id} + /v1/jarvis/temporal/as-of/{id}
    // + POST /v1/jarvis/temporal/snapshot/{id}
    // "temporal history / object history / tobj / time travel / object timeline /
    //   property history / what changed / object changes / temporal object /
    //   bitemporal / property timeline / temporal facts / fact history / object facts"
    if (isTobjQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tobj-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTobjScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F312 MotorIntentPanel — /v1/motor/stats + /v1/motor/predict + /v1/motor/train
    // "motor intent / intent predict / dock predict / next app / predict dock /
    //   mint panel / motor predict / action predictor / motor model /
    //   dock suggest / next panel / predict panel / dock intent"
    if (isMintQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:mint-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildMintScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F313 InvestmentRiskCorrelator — /entities/Investment + /entities/RiskSignal
    // "investment risk / risk signals / ivrc / exposed investments /
    //   investment alerts / invest risk signals / risky investments /
    //   which investments have risks / investment coverage / risk invest"
    if (isIvrcQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ivrc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIvrcScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F314 SwarmJobAlertCorrelator — /entities/SwarmJob + /v1/alerts
    // "swarm alert / alert swarm / sjac / alert automation / swarm alert coverage /
    //   unmonitored alerts / which alerts have swarm / swarm incident /
    //   alert swarm jobs / swarm response alert"
    if (isSwarmAlertQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sjac-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSwarmAlertScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F315 AssetDnaScanner — /v1/asset/list
    // "asset dna / repo assets / asset health / stale assets / high risk assets /
    //   adna / asset scanner / asset registry / which assets are stale / asset quality /
    //   file health / repo health scan"
    if (isAdnaQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:adna-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildAdnaScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F316 ContactGraphCentralityPanel — /entities/Contact + /v1/graph/centrality
    // "contact centrality / network contacts / cgcp / influential contacts /
    //   high centrality contacts / contacts by network / contact graph centrality /
    //   contact network influence / which contacts are most networked / contact network rank"
    if (isCgcpQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cgcp-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCgcpScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F43-backlog IntelProfileLiveIntelExposure — /entities/IntelProfile + /functions/getLiveIntel
    // "intel profile live / profile world / active profiles / iplive /
    //   profiles activated / profile world events / intel profile exposure /
    //   world intel profile / which profiles are active / profile live intel"
    if (isIpliveQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:iplive-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIpliveScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F44 InvestigationLiveIntelPulse — /v1/investigations + /functions/getLiveIntel
    // "investigation intel / live cases / case pulse / ilip / cases active /
    //   investigation live / case world / cases accelerating / open case intel /
    //   which cases are live"
    if (isIlipQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ilip-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIlipScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F318 IntelSpecCoverage — /entities/IntelProfile + /v1/spec/list
    // "intel spec / spec coverage / ispc / intel coverage / uncovered intel spec /
    //   intel specifications / intel spec gaps / spec backed intel / intel to spec /
    //   spec for intel / which intel has specs"
    if (isIspcQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ispc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIspcScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F319 RiskSpecCoverage — /entities/RiskSignal + /v1/spec/list
    // "risk spec / spec risk / rssc / risk coverage / uncovered risk /
    //   risk specification / risk spec gaps / spec backed risk / risk to spec /
    //   spec for risk / which risks have specs"
    if (isRsscQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rssc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRsscScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F320 TaskSpecCoverage — /entities/Task + /v1/spec/list
    // "task spec / spec task / tspc / task coverage / which tasks have specs /
    //   uncovered tasks / spec for tasks / task specification / task spec gap /
    //   tasks without specs / spec backed task"
    if (isTaskSpecQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tspc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTaskSpecScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // "investment decision / decision invest / ivdc / investment coverage / uncovered investments /
    //   investment decisions / investment decision coverage / which investments have decisions /
    //   investment governance / decision coverage invest"
    if (isIvdcQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ivdc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIvdcScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F322: VoiceForgeStudio — "voice forge / voice profile / voice cloning / vfst /
    //   clone voice / voice studio / active voice / which voice / voice settings / voice profiles"
    if (isVfstQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:vfst-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildVfstScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F323: HistoryLakeBrowser — "history lake / pattern oracle / series catalog / hlb /
    //   skill metrics / forecast skill / history series / observation data / data series /
    //   history lake browser / predict skill / skill score"
    if (isHlbQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:hlb-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildHlbScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F324: EntityResolutionConsole — "entity resolution / duplicate entities / master data /
    //   ercn / entity dedup / duplicate records / merge entities / resolve duplicates /
    //   golden record / canonical entity / find duplicates / entity merge"
    if (isErcnQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ercn-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildErcnScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCrscQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:crsc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCrscScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isScrpQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scrp-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScrpScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSjscQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sjsc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSjscScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIvscQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ivsc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIvscScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isTrscQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:trsc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTrscScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIacrQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:iacr-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIacrScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIapcQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:iapc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIapcScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isPolpQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:polp-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildPolpScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isWinpQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:winp-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildWinpScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCtbdQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ctbd-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCtbdScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCdcvQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cdcv-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCdcvScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSwarmDecisionQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sjdc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSwarmDecisionScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCspcQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cspc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCspcScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isTinvQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tinv-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTinvScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isWtwrQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:wtwr-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildWtwrScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIpdcQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ipdc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIpdcScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGnacQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gnac-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGnacScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIgcpQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:igcp-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIgcpScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIvgcQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ivgc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIvgcScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSjinvQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sjinv-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSjinvScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isAsstQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:asst-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildAsstScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isContactAnomalyQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cacr-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildContactAnomalyScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isTaskAnomalyQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tacr-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTaskAnomalyScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSwarmRiskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sjrs-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSwarmRiskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIvacQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ivac-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIvacScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIprscQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:iprsc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIprscScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIpacQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ipac-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIpacScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isEvlbQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:evlb-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildEvlbScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isInvdataQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:invdata-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildInvdataScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCinvQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cinv-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCinvScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIpskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ipsk-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIpskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRsinvQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rsinv-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRsinvScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isInvliveQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:invlive-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildInvliveScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRsacQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rsac-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRsacScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSwarmAnomalyQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sjan-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSwarmAnomalyScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIvinQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ivin-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIvinScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRsgcQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rsgc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRsgcScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIpinvQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ipinv-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIpinvScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isTovsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tovs-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTovsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGtmxQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gtmx-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGtmxScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCsjcQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:csjc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCsjcScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isFndpQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:fndp-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildFndpScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isNotesQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:notes-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildNotesScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isTdcvQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tdcv-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTdcvScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIpdsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ipds-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIpdsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCdstQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cdst-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCdstScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSdmcQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sdmc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSdmcScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isScanQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scan-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScanScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSci3dQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sci3d-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSci3dScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isTnrpQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tnrp-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTnrpScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isMecmQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:mecm-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildMecmScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isUwbrQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:uwbr-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildUwbrScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRsdcQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rsdc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRsdcScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isOeanQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:oean-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildOeanScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCaclQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cacl-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCaclScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isDspcQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:dspc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildDspcScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isDsalQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:dsal-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildDsalScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isOeiaQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:oeia-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildOeiaScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isDsanQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:dsan-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildDsanScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isOescQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:oesc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildOescScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isAlscQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:alsc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildAlscScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIprcQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:iprc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIprcScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isInvRptQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:invrpt-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildInvRptScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRsrptQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rsrpt-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRsrptScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isOedcQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:oedc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildOedcScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIavrQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:iavr-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIavrScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isDdcvQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ddcv-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildDdcvScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isAldcQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:aldc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildAldcScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isTkrpQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tkrp-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTkrpScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGnsrskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gnsrsk-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGnsrskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRsliveQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rslive-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRsliveScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGnscenQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gnscen-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGnscenScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGntaskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gntask-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGntaskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGninvQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gninv-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGninvScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isInvscQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:invsc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildInvscScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isInvdcQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:invdc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildInvdcScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSwarmJobRptQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sjrp-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSwarmJobRptScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIrpcQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:irpc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIrpcScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isTaskAlcQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tacl-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTaskAlcScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSevdashQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sevdash-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSevdashScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isLitaQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:lita-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildLitaScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSkildQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:skild-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSkildScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCxlintelQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cxlintel-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCxlintelScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isLgceQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:lgce-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildLgceScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGndcQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gndc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGndcScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F47: investment × intel profile exposure — /entities/Investment + /entities/IntelProfile;
    // EXPOSED vs CLEAR; "investment intel / intel investment / invintel /
    // investment threat actor / portfolio threat exposure / exposed investments"
    if (isInvintelQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:invintel-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildInvintelScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F48: report × intel profile coverage — /v1/reports + /entities/IntelProfile;
    // PROFILED vs UNMONITORED; "report intel profile / intel profile report / rpip /
    // profiled reports / unmonitored profiles / threat actor report coverage /
    // intelligence gap / report gap"
    if (isRpipQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rpip-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRpipScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F54: scene × task coverage — all 10 /v1/cinematic/scene/{id} + /entities/Task;
    // TASKED vs UNATTENDED; "scene task / task scene / sctask / scene operations / unattended scenes / scene coverage"
    if (isScTaskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sctask-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScTaskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F49: scenario × intel profile coverage — /v1/scenario/list + /entities/IntelProfile;
    // THREATENED vs CLEAR; "scenario intel / scenario threat / scenario profile / scip /
    // threat scenario / intel scenario coverage / scenario intel profile / scenario threat actor"
    if (isSCIPQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scip-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSCIPScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F57: swarm job × ops event automation coverage — /entities/SwarmJob + /v1/ops/events;
    // AUTOMATED (swarm backing found) vs MANUAL (automation gap);
    // "swarm ops / ops swarm / swjops / automated ops / manual ops / ops automation gap /
    // swarm ops coverage / unautomated ops / automation coverage"
    if (isSwjopsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:swjops-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSwjopsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F58: skill × ops event coverage — /v1/aip/skill + /v1/ops/events;
    // IN-DEMAND (skill matches active ops) vs DORMANT (no ops relevance);
    // "skill ops / ops skill / skops / in-demand skills / skill readiness /
    // operational skill gap / dormant skills / skill ops alignment"
    if (isSkopsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:skops-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSkopsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F60: scenario × ops event coverage — /v1/scenario/list + /v1/ops/events;
    // TRIGGERED (scenario activated by live ops) vs DORMANT (no ops event coverage);
    // "scenario ops event / ops scenario / scoe / triggered scenarios /
    // scenario ops coverage / live scenario / ops triggered scenario"
    if (isScoeQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scoe-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScoeScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // report dataset coverage / backed report / unsourced report / report data gap
    if (isRptdsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rptds-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRptdsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // task intel profile coverage / threat-backed tasks / task adversary / task threat
    if (isTintelQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tintel-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTintelScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // task × ops event coverage / responding tasks / task ops alignment / unresponsive ops
    if (isTkopsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tkops-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTkopsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // contact × skill coverage / uncovered contacts / contact capability gap / skilled contacts
    if (isCskillQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cskill-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCskillScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // graph node × skill coverage / unskilled nodes / graph capability gap / graph skill readiness
    if (isGnskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gnsk-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGnskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // live intel × report coverage / triggered reports / report world event / report live / rplive
    if (isRpliveQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rplive-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRpliveScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // graph node × ops event coverage / active graph nodes / gnops / node ops coverage / graph operational
    if (isGnopsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gnops-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGnopsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // knowledge × contact coverage / contact kb / ckbase / unknown contacts / contact knowledge gap
    if (isCkbaseQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ckbase-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCkbaseScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isScKbQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sckb-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScKbScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    // F72: Knowledge × Risk Signal Coverage — /knowledge/ × /entities/RiskSignal;
    // RISK-TAGGED (threat signal overlap) vs CLEAR (no active risk alignment);
    // dispatches jarvis:kbrisk-toggle; ◈ KBRISK left:686880 zIndex:255; 90-s auto-refresh;
    // "knowledge risk / risk knowledge / kbrisk / risk kb / knowledge risk signal"
    if (isKbriskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:kbrisk-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildKbriskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F73: Scene × Dataset Coverage — /v1/cinematic/scene/{id} (all 10) × /v1/datasets;
    // BACKED (dataset support found) vs UNCHARTED (no dataset coverage — intelligence gap);
    // dispatches jarvis:scds-toggle; ◈ SCDS left:687440 zIndex:256; 120-s auto-refresh;
    // "scene dataset / dataset scene / scds / data backed scene / scene data gap /
    //  scene data coverage / scene dataset coverage / which scenes have datasets / uncharted scenes"
    if (isScdsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scds-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScdsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F74: Knowledge × SwarmJob Coverage — /knowledge/ × /entities/SwarmJob;
    // INFORMED (KB backing found) vs FLYING-BLIND (no KB coverage — operational knowledge gap);
    // dispatches jarvis:swkb-toggle; ◈ SWKB left:688000 zIndex:257; 90-s auto-refresh;
    // "swarm knowledge / knowledge swarm / swkb / swarm kb / informed swarm /
    //  flying blind swarm / swarm intel base / swarm without knowledge / kb swarm /
    //  swarm knowledge gap / which swarm jobs have knowledge"
    if (isSwkbQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:swkb-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSwkbScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F75: Investment × Scenario Coverage — /entities/Investment × /v1/scenario/list;
    // EXPOSED (scenario threat alignment) vs STABLE (no overlap);
    // dispatches jarvis:invscen-toggle; ◈ INVSCEN left:688560 zIndex:258; 90-s auto-refresh;
    // "investment scenario / scenario investment / invscen / exposed investments /
    //  investment threat scenario / portfolio scenario / scenario portfolio /
    //  scenario exposure / which investments have scenarios"
    if (isInvscenQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:invscen-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildInvscenScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F77: Scene × Live Intel Exposure — /v1/cinematic/scene/{id} (all 10) × /functions/getLiveIntel;
    // LIVE (live world event aligns with scene domain) vs QUIET (no current signal);
    // dispatches jarvis:slive-toggle; ◈ SLIVE left:689120 zIndex:259; 60-s auto-refresh;
    // "scene live / live scene / slive / scene intel live / live scene exposure /
    //  scene world event / scene live intel / which scenes are live / active scenes"
    if (isSliveQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:slive-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSliveScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F78 — Knowledge × Investigation Coverage
    // dispatches jarvis:kbinv-toggle; ◈ KBINV left:689680 zIndex:260; 90-s auto-refresh;
    // "knowledge invest / invest knowledge / kbinv / investigation kb /
    //  uninformed case / investigation knowledge gap / kb investigation /
    //  case knowledge / case kb / blind investigation"
    if (isKbinvQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:kbinv-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildKbinvScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isOeliveQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:oelive-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildOeliveScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F80: report × ops event coverage — dispatches jarvis:rpops-toggle; ◈ RPOPS left:690800 zIndex:262; 90-s auto-refresh;
    // "report ops / ops report / rpops / unreported ops / ops reporting gap / ops report coverage /
    //  which ops events have reports / ops without reports / unresolved ops reporting"
    if (isRpopsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rpops-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRpopsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F81 — "scene ops / ops scene / scops / active ops scene / live ops scene /
    //  scene operational / ops event scene / which scenes have ops events /
    //  operationally live scenes"
    if (isScopsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scops-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScopsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F82 — "contact report / report contact / ctrpt / documented contacts /
    //  contacts in reports / contact report coverage / unrecorded contacts /
    //  contact report gap / contacts without reports / who has reports"
    if (isCtrptQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ctrpt-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCtrptScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F83 — "invest scenario / scenario invest / invscn / scripted investigation /
    //  unplanned investigation / investigation scenario coverage / case scenario /
    //  investigation response plan / scenario coverage invest"
    if (isInvscnQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:invscn-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildInvscnScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F84 — "live dataset / dataset live / dslive / reactive dataset / live data coverage /
    //  active dataset / dataset live intel / live intel dataset / which datasets are live"
    if (isDsliveQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:dslive-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildDsliveScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F85 — "graph community invest / community invest / gcinv / portfolio community /
    //  community portfolio / investment community / community investment alignment"
    if (isGcinvQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gcinv-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGcinvScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F86 — "community contact / contact community / gcont / graph contact /
    //  which communities have contacts / unrepresented communities / community representation"
    if (isGcontQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gcont-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGcontScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F87 — "community skill / skill community / gcsk / graph skill community /
    //  unskilled community / community capability gap / community skill coverage"
    if (isGcskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gcsk-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGcskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F88 — "community scenario / graph community scenario / scenario community /
    //  scenario gap / cluster scenario / gcscen"
    if (isGcscenQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gcscen-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGcscenScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F89 — "knowledge skills / skill knowledge / kscov /
    //  skill knowledge gap / knowledge skill audit / skill learning gaps"
    if (isKscovQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:kscov-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildKscovScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGctaskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gctask-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGctaskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGcliveQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gclive-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGcliveScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGcrptQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gcrpt-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGcrptScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGcrskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gcrsk-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGcrskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGciplQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gcipl-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGciplScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isTaskKnowledgeQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tknow-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTaskKnowledgeScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isKbliveQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:kblive-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildKbliveScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGcdsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gcds-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGcdsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIpoevQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ipoev-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIpoevScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isKbscenQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:kbscen-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildKbscenScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isConvinQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:convin-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildConvinScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGnintelQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gnintel-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGnintelScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isScIntelQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scintel-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScIntelScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRsktskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rsktsk-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRsktskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGcswjQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gcswj-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGcswjScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isTaskScenQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:taskscen-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTaskScenScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isScnrptQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scnrpt-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScnrptScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isInvdsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:invds-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildInvdsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isScskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scsk-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGcopsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gcops-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGcopsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGknowQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gknow-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGknowScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGnswjQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gnswj-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGnswjScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F118: SwarmJob × Scenario Coverage — voice bridge for the pre-built SwarmScenarioCoverage panel.
    // Opens the panel (jarvis:swscen-toggle) + speaks a 2-sentence automation-coverage brief via TTS.
    if (isSwscenQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:swscen-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSwscenScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F122: RiskSignal × Skill Coverage — voice bridge for the RiskSignalSkillCoverage panel.
    if (isRsskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rssk-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRsskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F123: Task × SwarmJob Coverage — voice bridge for the TaskSwarmJobCoverage panel.
    if (isTaskSwjQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tkswj-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTaskSwjScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F125: Skill × Scenario Coverage — voice bridge for the SkillScenarioCoverage panel.
    if (isSkscenQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:skscen-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSkscenScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F126: Investigation × Scene Mapper — voice bridge for the InvestigationSceneMapper panel.
    if (isInvscnmapQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:invscnmap-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildInvscnmapScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F127: Scene × Contact Coverage — voice bridge for the SceneContactCoverage panel.
    if (isScconQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sccon-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScconScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F129: Contact × Scenario Coverage — voice bridge for the ContactScenarioCoverage panel.
    if (isCscenQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cscen-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCscenScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F132: Task × Dataset Coverage — voice bridge for the TaskDatasetCoverage panel.
    if (isTaskDsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tkds-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTaskDsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F139: Contact × Ops Event Exposure — voice bridge for the ContactOpsEventCoverage panel.
    if (isCoecQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:coec-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCoecScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F140: Report × Skill Domain Coverage — voice bridge for the ReportSkillCoverage panel.
    if (isRskillQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rskill-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRskillScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F142: Contact × Task Coverage — voice bridge for the ContactTaskCoverage panel.
    if (isCtskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ctsk-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCtskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isInvkbQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:invkb-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildInvkbScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F144: Scene × SwarmJob Coverage — voice bridge for the SceneSwarmJobCoverage panel.
    // "scene swarm" / "swarm scene" / "scswj" / "automated scene" /
    // "scene swarm job" / "scene automation coverage" / "which scenes have swarm"
    if (isScswjQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scswj-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScswjScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F145: Task × Risk Signal × Scenario Triple Coverage — voice bridge for the TaskRiskScenarioTripleCoverage panel.
    // "task risk scenario" / "triple coverage" / "trsscen" / "task readiness matrix" /
    // "mission readiness matrix" / "fully prepared tasks" / "task intel readiness"
    if (isTrsscenQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:trsscen-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTrsscenScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F146: Graph Community × Investigation Coverage — voice bridge for the GraphCommunityInvestigationLinker panel.
    // "graph community investigation" / "cluster investigation" / "which clusters have cases" /
    // "blind clusters" / "gcil"
    if (isGcilQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gcil-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGcilScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // "risk signal ops" / "rsoe" / "unmonitored risk signal" / "risk ops monitoring"
    if (isRsoeQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rsoe-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRsoeScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // "swarm intel" / "intel hunt" / "sjintel" / "threat hunting coverage" / "which threats are being hunted"
    if (isSjintelQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sjintel-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSjintelScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGcknowQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gcknow-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGcknowScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isKbtaskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:kbtask-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildKbtaskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isInvSwjQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:invswj-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildInvSwjScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSkscen3Query(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:skscen3-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSkscen3Script();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCorklQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:crkl-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCorklScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIgntriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:igntri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIgntriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F157: SwarmJob × Dataset Coverage — voice bridge for the pre-built SwarmDatasetCoverage panel.
    // Opens ◈ SWJDS (jarvis:swjds-toggle) + speaks a 2-sentence swarm-data coverage brief.
    if (isSwjdsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:swjds-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSwjdsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F159: Scenario × Contact × Task Triple Coverage — opens ◈ SCCTRI + speaks staffing brief.
    if (isScctriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scctri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScctriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F160: Investigation × RiskSignal × Task Triple Coverage — opens ◈ IRTTRI + speaks accountability brief.
    if (isIrttriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:irttri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIrttriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isScrtriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:srtri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScrtriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F162: Knowledge × Graph Community × Task Triple Coverage — opens ◈ KGCTRI + speaks knowledge-operational readiness brief.
    if (isKgctriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:kgctri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildKgctriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F163: Dataset × Investigation × RiskSignal Triple Coverage — opens ◈ DIRSIG + speaks data blindspot brief.
    if (isDirsigQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:dirsig-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildDirsigScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    // F164: Intel Profile × Scenario × Task Triple Coverage — opens ◈ IPSTRI + speaks threat response brief.
    if (isIpstriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ipstri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIpstriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCsjitriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:csjitri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCsjitriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isInsrisiQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:insrisi-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildInsrisiScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSjcstriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sjcstri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSjcstriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGncstpQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gncstp-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGncstpScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGnrstpQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gnrstp-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGnrstpScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRtswtriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rtswtri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRtswtriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGcipswjQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gcipswj-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGcipswjScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isKirstriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:kirstri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildKirstriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCtoptQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ctopt-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCtoptScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isOcrstriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ocrstri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildOcrstriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIipdQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:iipd-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIipdScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isDscontQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:dscont-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildDscontScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGccitpQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gccitp-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGccitpScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isTcdsomQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tcdsom-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTcdsomScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGcoetriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gcoetri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGcoetriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGcrktriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gcrktri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGcrktriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSidtriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sidtri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSidtriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSjcskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sjcsk-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSjcskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isKstriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:kstri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildKstriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isOksrdyQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:oksrdy-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildOksrdyScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRcdtriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rcdtri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRcdtriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGnlitQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gnlit-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGnlitScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGclrstriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gclrstri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGclrstriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIttriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ittri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIttriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGnroetQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gnroet-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGnroetScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isLkrstriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:lkrstri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildLkrstriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSsjdtriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ssjdtri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSsjdtriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCiprtriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ciprtri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCiprtriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGnctriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gnctri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGnctriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSjrskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sjrsk-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSjrskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isKcstpQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:kcstp-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildKcstpScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGniktrQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gniktr-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGniktrScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSkctriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:skctri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSkctriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIcktqQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:icktq-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIcktqScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isKrstqQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:krstq-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildKrstqScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRgctormQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rgctorm-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRgctormScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSysrskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sysrsk-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSysrskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSscstpQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sscstp-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSscstpScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isTgcovQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tgcov-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTgcovScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIptriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:iptri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIptriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isScitriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scitri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScitriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCroetriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:croetri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCroetriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isDtcovQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:dtcov-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildDtcovScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isLscovQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:lscov-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildLscovScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSgktriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sgktri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSgktriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIrsecovQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:irsecov-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIrsecovScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRktriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rktri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRktriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isScivtriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scivtri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScivtriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSjsktriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sjsktri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSjsktriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCdswtriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cdswtri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCdswtriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIgcoeQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:igcoe-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIgcoeScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isScgnQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scgn-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScgnScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isInvswscQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:invswsc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildInvswscScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGncipQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gncip-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGncipScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRskscnQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rskscn-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRskscnScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isLgcstriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:lgcstri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildLgcstriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIdrtriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:idrtri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIdrtriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isTkrptriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tkrptri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTkrptriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isScstsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scsts-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScstsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIgcsklQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:igcskl-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIgcsklScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRgctriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rgctri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRgctriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isKgnoeQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:kgnoe-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildKgnoeScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isScgoetriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scgoetri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScgoetriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSstknQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sstkn-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSstknScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCscrsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cscrs-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCscrsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSiltriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:siltri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSiltriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRsitripQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rsitrip-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRsitripScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isOekctriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:oekctri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildOekctriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIkoeQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ikoe-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIkoeScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isDssrtriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:dssrtri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildDssrtriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isTgcliQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tgcli-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTgcliScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSjdknQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sjdkn-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSjdknScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIgrcovQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:igrcov-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIgrcovScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSccoskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sccosk-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSccoskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSsdscovQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ssdscov-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSsdscovScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRsdktriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rsdktri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRsdktriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isTgnoeQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tgnoe-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTgnoeScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCgnsktrQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cgnsktr-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCgnsktrScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIssktriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:issktri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIssktriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCsdtriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:csdtri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCsdtriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSjioeQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sjioe-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSjioeScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCgcoeQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cgcoe-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCgcoeScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSiptriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:siptri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSiptriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIpgcoeQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ipgcoe-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIpgcoeScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGnkscenQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gnkscen-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGnkscenScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSjkstriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sjkstri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSjkstriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIsrtriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:isrtri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIsrtriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isOecdtriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:oecdtri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildOecdtriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isLsrtriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:lsrtri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = buildLsrtriScript(null);
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRcstriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rcstri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = buildRcstriScript(null);
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCklitriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cklitri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = buildCklitriScript(null);
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isLgnsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:lgns-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildLgnsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIrktriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:irktri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIrktriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSsswrskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ssswrsk-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSsswrskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGcipdsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gcipds-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGcipdsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGcsitrQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gcsitr-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGcsitrScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isTaskContactLiveQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tclit-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTaskContactLiveScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSkillGraphNodeLiveQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sgnitri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSkillGraphNodeLiveScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRgntriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rgntri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRgntriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isDipseenQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:dipseen-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildDipseenScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIrscnQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:irscn-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIrscnScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSjcscnQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sjcscn-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSjcscnScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isScswdsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scswds-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScswdsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isScrliveQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scrlive-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScrliveScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIsltriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:isltri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIsltriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isKcrstriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:kcrstri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildKcrstriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGckliveQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gcklive-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGckliveScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRskgctriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rskgctri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRskgctriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isTirrepQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tirrep-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTirrepScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSsivcoQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ssivco-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSsivcoScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSsgncoQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ssgnco-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSsgncoScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSsscenQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ssscen-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSsscenScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSwjdcQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:swjdc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSwjdcScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCivktriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:civktri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCivktriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIsoetriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:isoetri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIsoetriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRpscnQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rpscn-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRpscnScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isOesrtriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:oesrtri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildOesrtriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIdsctriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:idsctri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIdsctriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isTrscovQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:trscov-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTrscovScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCoeknowQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:coeknow-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCoeknowScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isLsttriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:lsttri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildLsttriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIsctriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:isctri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIsctriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGcitriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gcitri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGcitriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSjcktriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sjcktri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSjcktriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGnoestriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gnoestri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGnoestriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIpeotriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ipeotri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIpeotriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRiknowQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:riknow-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRiknowScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isCirsktriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cirsktri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCirsktriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isRoetriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:roetri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRoetriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isDkrstriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:dkrstri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildDkrstriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isAipkrstriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:aipkrstri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildAipkrstriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isScsriskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scsrisk-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScsriskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isSoektriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:soektri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSoektriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isCskntriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cskntri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCskntriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isTikvtriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tikvtri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTikvtriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isRcscenQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rcscen-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRcscenScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isSwjoestriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sjoetri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSwjoestriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRdasTriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rdastri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRdasTriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isLkstriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:lkstri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildLkstriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCascntriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cascntri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCascntriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCirskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cirsk-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCirskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCgcdsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cgcds-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCgcdsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSjaskcoQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sjaskco-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSjaskcoScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isTdaskcoQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tdaskco-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTdaskcoScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIpaskdsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ipaskds-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIpaskdsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGnascQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gnasc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGnascScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRskliscQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rsklisc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRskliscScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGalieQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:galie-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGalieScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGaricQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:garic-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGaricScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIpgarepQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ipgarep-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIpgarepScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGacrtriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gacrtri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGacrtriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGatoeQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gatoe-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGatoeScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGasjinvQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gasjinv-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGasjinvScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGadkcoQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gadkco-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGadkcoScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCtskillQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ctskill-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCtskillScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIgckcoQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:igckco-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIgckcoScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIgoetriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:igoetri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIgoetriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSjgcriskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sjgcrisk-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSjgcriskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCgascQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cgasc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCgascScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRsgakcoQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rsgakco-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRsgakcoScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isTaskipinvQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:taskipinv-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTaskipinvScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSjipinvQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sjipinv-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSjipinvScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIpgcscQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ipgcsc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIpgcscScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isInvkscQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:invksc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildInvkscScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCgcskcoQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cgcskco-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCgcskcoScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGasoeQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gasoe-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGasoeScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isTrrskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:trrsk-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTrrskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSjoekbQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sjoekb-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSjoekbScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIsrtripQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:isrtrip-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIsrtripScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isDrinvcoQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:drinvco-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildDrinvcoScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGairtripQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gairtrip-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGairtripScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGccntriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gccntri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGccntriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isScinopsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scinops-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScinopsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isTsjscQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tsjsc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTsjscScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIpgckcoQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ipgckco-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIpgckcoScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRcsjQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rcsj-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRcsjScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIvcoeQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ivcoe-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIvcoeScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGcrriskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gcrrisk-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGcrriskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isKgcoeQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:kgcoe-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildKgcoeScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGcskliQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gcskli-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGcskliScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isDictriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:dictri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildDictriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isKrsctriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:krsctri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildKrsctriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isScswtriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scswtri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScswtriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGcdsscQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gcdssc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGcdsscScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCgntoeQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cgntoe-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCgntoeScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIsjrepQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:isjrep-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIsjrepScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isKgcaskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:kgcask-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildKgcaskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRsgckcoQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rsgckco-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRsgckcoScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isSdsitriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sdsitri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSdsitriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isSganscQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sgansc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSganscScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isTgcrepQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tgcrep-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTgcrepScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isCgaoeQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cgaoe-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCgaoeScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isScckcoQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scckco-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScckcoScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }
    if (isSiscQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sisc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSiscScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGadsjQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gadsj-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGadsjScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRisoeQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:risoe-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRisoeScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSjgcscQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sjgcsc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSjgcscScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCasitriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:casitri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCasitriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isDasoetriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:dasoetri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildDasoetriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIganscQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:igansc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIganscScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isKgaoeQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:kgaoe-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildKgaoeScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isClgannQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:clgann-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildClgannScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRsgatriQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rsgatri-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRsgatriScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIpligaQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ipliga-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIpligaScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isTlgannQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tlgann-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTlgannScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isScliannQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scliann-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScliannScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCliannQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cliann-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCliannScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSjliannQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sjliann-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSjliannScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isInvliannQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:invliann-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildInvliannScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRsliannQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rsliann-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRsliannScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIpsoeQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ipsoe-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIpsoeScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isDlgannQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:dlgann-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildDlgannScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRpliannQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rpliann-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRpliannScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isKliannQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:kliann-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildKliannScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSclgannQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sclgann-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSclgannScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isInlgannQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:inlgann-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildInlgannScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isAsliannQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:asliann-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildAsliannScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGatadsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gatads-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGatadsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCoedQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:coeds-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCoedScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isScgcriskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scgcrisk-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScgcriskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSwjkgcenQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sjkgcen-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSwjkgcenScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isTkgcknowQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tkgcknow-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTkgcknowScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIgcdsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:igcds-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIgcdsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCsrepQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:csrep-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCsrepScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIiknowQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:iiknow-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIiknowScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRrdsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rrds-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRrdsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isScaskdsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scaskds-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScaskdsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isTipgcQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tipgc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTipgcScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isTgcknQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tgckn-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTgcknScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIpinvscQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ipinvsc-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIpinvscScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCkiknowQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ckiknow-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCkiknowScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSjroeQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sjroe-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSjroeScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRsdscnQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rsdscn-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRsdscnScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRsgcoeQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rsgcoe-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRsgcoeScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIpcoeQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ipcoe-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIpcoeScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isGnscdsQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:gnscds-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildGnscdsScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isScasoeQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scasoe-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScasoeScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isScgcaskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scgcask-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScgcaskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCgcrQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:cgcr-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCgcrScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isRsgcaskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:rsgcask-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildRsgcaskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isInvgcaskQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:invgcask-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildInvgcaskScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isDgcconQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:dgccon-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildDgcconScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isInvgcrQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:invgcr-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildInvgcrScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isSjgcrQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:sjgcr-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildSjgcrScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isTirsigQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tirsig-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTirsigScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isCiitQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ciit-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildCiitScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isKipoeQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:kipoe-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildKipoeScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIasoeQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:iasoe-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIasoeScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isScgcknQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:scgckn-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildScgcknScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isTskivQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tskiv-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTskivScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isIpscoeQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:ipscoe-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildIpscoeScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isBssfQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:bssf-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildBssfScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    if (isTkliveQuery(q)) {
      window.dispatchEvent(new CustomEvent("jarvis:tklive-toggle"));
      setOpen(true); setThinking(true); setText("");
      const script = await buildTkliveScript();
      setThinking(false); typeOut(script); speak(script);
      hideT.current = setTimeout(() => setOpen(false), Math.max(9000, script.length * 70));
      return;
    }

    clearTimeout(hideT.current);
    setOpen(true); setThinking(true); setText("");
    const scene = detectScene(q);
    if (scene) navigate(`/cinematic/${scene}`);
    if (SKILLGAP_RE.test(q)) window.dispatchEvent(new CustomEvent("jarvis:skillgap-toggle"));
    let answer = "";
    if (!answer) {
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
