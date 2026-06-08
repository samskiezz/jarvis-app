/**
 * cinematicSceneRegistry — the NEW visual source of truth.
 *
 * The 86-page wall (legacyPageRegistry / pageRegistry.js) collapses into 10
 * render-locked immersive scenes. Each scene has a target render (the locked art
 * direction), a scene-kit GLB, and a server hydration route (/v1/cinematic/scene)
 * that routes REAL backend data to its named anchors.
 *
 * Renderer is RTX-streamed (UE5 Pixel Streaming preferred; Omniverse optional).
 * No Three.js as the primary experience.
 */

export const CINEMATIC_SCENES = [
  { id: "01_command_atrium",            label: "Command Atrium",            rail: "COMMAND" },
  { id: "02_ai_core_chamber",           label: "AI Core Chamber",           rail: "AUTOMATION" },
  { id: "03_world_control_room",        label: "World Control Room",        rail: "WORLD VIEW" },
  { id: "04_intelligence_graph_space",  label: "Intelligence Graph",        rail: "INTELLIGENCE" },
  { id: "05_operations_war_room",       label: "Operations War Room",       rail: "OPERATIONS" },
  { id: "06_data_fusion_reactor",       label: "Data Fusion Reactor",       rail: "ENTITIES" },
  { id: "07_document_intelligence_vault", label: "Document Vault",          rail: "DOCUMENTS" },
  { id: "08_simulation_theatre",        label: "Simulation Theatre",        rail: "SIMULATION" },
  { id: "09_analytics_observatory",     label: "Analytics Observatory",     rail: "ANALYTICS" },
  { id: "10_system_security_core",      label: "System Security Core",      rail: "SYSTEM" },
].map((s) => ({
  ...s,
  route: `/cinematic/${s.id}`,
  render: `/immersive/renders/web/${s.id}.jpg`,
  glb: `/immersive/glb/${s.id}.glb`,
}));

export const SCENE_BY_ID = Object.fromEntries(CINEMATIC_SCENES.map((s) => [s.id, s]));

/** Legacy page/surface name -> scene id (from the pack's alias matrix). Every old
 *  destination resolves into one of the 10 scenes as a context. */
export const LEGACY_ALIAS = {
  Launcher: "01_command_atrium", Setup: "01_command_atrium", CommandOverview: "01_command_atrium",
  Dashboard: "01_command_atrium", CommandCenter: "01_command_atrium", JarvisTerminal: "01_command_atrium",
  SystemIntel: "01_command_atrium", AlertsNotificationCenter: "01_command_atrium", DomainRail: "01_command_atrium",
  CommandPalette: "01_command_atrium", KeyboardShortcuts: "01_command_atrium",
  JarvisAssistant: "02_ai_core_chamber", AIPActions: "02_ai_core_chamber", AIPLogic: "02_ai_core_chamber",
  AgentGovernance: "02_ai_core_chamber", AutoConsole: "02_ai_core_chamber", AutopilotConsole: "02_ai_core_chamber",
  ForgeConsole: "02_ai_core_chamber", MLHub: "02_ai_core_chamber", NeuralCore: "02_ai_core_chamber",
  WorldOps: "03_world_control_room", GlobalIntel: "03_world_control_room", GeoMap: "03_world_control_room",
  GeoWorkspace: "03_world_control_room", TCIS: "03_world_control_room",
  GraphCanvas: "04_intelligence_graph_space", GraphOps: "04_intelligence_graph_space",
  GraphTimeline: "04_intelligence_graph_space", LinkAnalysis: "04_intelligence_graph_space",
  Investigations: "04_intelligence_graph_space", KGIKBrain: "04_intelligence_graph_space",
  OntologyManager: "04_intelligence_graph_space", ObjectView: "04_intelligence_graph_space",
  ObjectExplorer: "04_intelligence_graph_space", ObjectSets: "04_intelligence_graph_space",
  PlaneGraph: "04_intelligence_graph_space",
  Operations: "05_operations_war_room", CaseBoard: "05_operations_war_room", ActionApprovalQueue: "05_operations_war_room",
  War: "05_operations_war_room", GameLeaderboard: "05_operations_war_room", FleetHealth: "05_operations_war_room",
  RolloutControl: "05_operations_war_room", DesiredState: "05_operations_war_room", GatewayConsole: "05_operations_war_room",
  ActionRunner: "05_operations_war_room",
  SourceCatalogue: "06_data_fusion_reactor", SourcesConsole: "06_data_fusion_reactor", DataCatalog: "06_data_fusion_reactor",
  PipelineMonitor: "06_data_fusion_reactor", LineageGraph: "06_data_fusion_reactor", VectorMemory: "06_data_fusion_reactor",
  SearchHub: "06_data_fusion_reactor", SearchPlus: "06_data_fusion_reactor", SemanticDiscover: "06_data_fusion_reactor",
  WorkshopKit: "06_data_fusion_reactor",
  Reports: "07_document_intelligence_vault", PatentsSearch: "07_document_intelligence_vault",
  PatentRegistry: "07_document_intelligence_vault", PatentIngest: "07_document_intelligence_vault",
  SecondBrain: "07_document_intelligence_vault", KnowledgeLibrary: "07_document_intelligence_vault",
  InventionList: "07_document_intelligence_vault", InventionDetail: "07_document_intelligence_vault",
  KGIKLedger: "07_document_intelligence_vault", Activity: "07_document_intelligence_vault", Vault: "07_document_intelligence_vault",
  ScenarioLab: "08_simulation_theatre", PredictionOracle: "08_simulation_theatre", ScienceConsole: "08_simulation_theatre",
  ScienceConsoles: "08_simulation_theatre", Underworld: "08_simulation_theatre", Population: "08_simulation_theatre",
  Projects: "08_simulation_theatre", Guilds: "08_simulation_theatre", Safety: "08_simulation_theatre",
  TechTree: "08_simulation_theatre", RFSpectrum: "08_simulation_theatre", SensorGrid: "08_simulation_theatre",
  SkyOrbital: "08_simulation_theatre",
  Quiver: "09_analytics_observatory", PivotWorkshop: "09_analytics_observatory", InvestmentTracker: "09_analytics_observatory",
  DashboardBuilder: "09_analytics_observatory", MLDashboard: "09_analytics_observatory",
  SystemAdmin: "10_system_security_core", TenantAdmin: "10_system_security_core", Governance: "10_system_security_core",
  AuditReplay: "10_system_security_core", PluginControlPlane: "10_system_security_core",
  PluginIntegrationProof: "10_system_security_core", ApexCore: "10_system_security_core",
  SystemHealth: "10_system_security_core", Security: "10_system_security_core", AuthGate: "10_system_security_core",
  // pages the design pack missed — mapped after reconciling against the real pageRegistry:
  CopDashboard: "03_world_control_room", JarvisCore: "02_ai_core_chamber", HoloCADPage: "08_simulation_theatre",
  TemporalConsole: "04_intelligence_graph_space", WorkshopBuilder: "06_data_fusion_reactor",
};

export function resolveLegacyToScene(pageName) {
  return LEGACY_ALIAS[pageName] || "01_command_atrium";
}
