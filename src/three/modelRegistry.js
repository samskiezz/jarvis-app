/**
 * modelRegistry — maps the platform's planes + features to real 3D models
 * (the Tripo-generated GLBs in /public/models) and records the full asset manifest:
 * every surface that should carry a render, what it uses, and what is still a gap.
 *
 * This is the A-Z render map for Gotham / Foundry / Apollo / AIP / JARVIS. Add a
 * GLB to /public/models and register it here; HoloCore/HoloModel pick it up.
 */

const M = (file) => `/models/${file}.glb`;
const P = (file) => `/models/palantir/${file}.glb`; // custom Tripo-generated replica set

// plane / concept  ->  { model, color, label }
// These are the NEW custom Tripo-generated Palantir-replica renders (not Underworld).
export const PLANE_MODELS = {
  jarvis:  { model: P("jarvis_core_avatar"),  color: "#3ad8ff", label: "JARVIS Core" },
  aip:     { model: P("aip_neural_mesh"),     color: "#b18cff", label: "Neural Mesh" },
  foundry: { model: P("foundry_pipeline_rig"),color: "#00d4ff", label: "Pipeline Rig" },
  gotham:  { model: P("gotham_command_globe"),color: "#ff3b6b", label: "Command Globe" },
  apollo:  { model: P("apollo_delivery_rig"), color: "#7cff7c", label: "Delivery Rig" },
  audit:   { model: P("audit_ledger_vault"),  color: "#8be9fd", label: "Ledger Vault" },
  helmet:  { model: P("iron_man_helmet"),     color: "#e8a800", label: "JARVIS Helmet" },
};

// pure-FX holographic props (ambient set dressing for the HUD)
export const FX_MODELS = {
  hologram:  M("fx_hologram"),
  energyCore: M("fx_energy_core"),
  lightOrb:  M("fx_light_orb"),
};

export function planeModel(plane) {
  return PLANE_MODELS[plane] || PLANE_MODELS.jarvis;
}

/**
 * ASSET_MANIFEST — the A-Z render map. status: 'wired' (model present + loaded),
 * 'available' (Tripo model exists in the library, not yet copied), 'gap' (needs a
 * new Tripo/scraped render). The scraper + Tripo pipeline target the gaps.
 */
export const ASSET_MANIFEST = [
  // ── planes (CUSTOM Tripo-generated Palantir-replica renders) ─────────────────
  { surface: "JARVIS core (Iron Man)", plane: "jarvis", model: "palantir/jarvis_core_avatar", status: "wired", effect: "bloom+fresnel hum" },
  { surface: "JARVIS helmet avatar", plane: "jarvis", model: "palantir/iron_man_helmet", status: "wired", effect: "bloom" },
  { surface: "AIP neural mesh", plane: "aip", model: "palantir/aip_neural_mesh", status: "wired", effect: "bloom" },
  { surface: "Foundry pipeline rig", plane: "foundry", model: "palantir/foundry_pipeline_rig", status: "wired", effect: "bloom" },
  { surface: "Gotham command globe", plane: "gotham", model: "palantir/gotham_command_globe", status: "wired", effect: "bloom+scanline" },
  { surface: "Apollo delivery rig", plane: "apollo", model: "palantir/apollo_delivery_rig", status: "wired", effect: "bloom" },
  { surface: "Audit ledger vault", plane: "audit", model: "palantir/audit_ledger_vault", status: "wired", effect: "bloom" },
  // ── available in the Tripo library (677), ready to copy/wire ──────────────────
  { surface: "Quantum / oracle", plane: "aip", model: "quantum_computer", status: "available" },
  { surface: "Foundation GPU pod", plane: "aip", model: "foundation_model_gpu_pod", status: "available" },
  { surface: "Surveillance satellite", plane: "gotham", model: "satellite_sputnik", status: "available" },
  { surface: "Forge furnace", plane: "foundry", model: "forge_furnace", status: "available" },
  { surface: "Industrial robot arm", plane: "foundry", model: "industrial_robot_arm", status: "available" },
  { surface: "Orbital habitat ring", plane: "apollo", model: "orbital_habitat_ring", status: "available" },
  { surface: "Energy core FX", plane: "jarvis", model: "fx_energy_core", status: "available" },
  { surface: "Crystal spire FX", plane: "jarvis", model: "fx_crystal_spire", status: "available" },
  // ── gaps (need a NEW render via Tripo / scraper) ──────────────────────────────
  { surface: "Iron Man helmet (JARVIS avatar)", plane: "jarvis", model: null, status: "gap" },
  { surface: "Palantir-style globe console", plane: "gotham", model: null, status: "gap" },
  { surface: "Holographic city map", plane: "gotham", model: null, status: "gap" },
  { surface: "Audit ledger vault", plane: "audit", model: null, status: "gap" },
];

export function manifestSummary() {
  const by = { wired: 0, available: 0, gap: 0 };
  for (const a of ASSET_MANIFEST) by[a.status] = (by[a.status] || 0) + 1;
  return by;
}
