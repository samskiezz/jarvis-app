/**
 * JarvisCore — the holographic command core. Renders the real WebGL holo engine
 * (ACES renderer + UnrealBloom + Fresnel shader + orbit camera) and ties it to the
 * live platform status, so the centrepiece is an actual Iron-Man-grade hologram,
 * not a flat SVG. Drop a `.glb` into /public and set GLB_URL to load a real model.
 */
import { useEffect, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge } from "@/components/PageKit";
import { apiGet } from "@/lib/wave1";
import HoloCore from "@/components/Jarvis/HoloCore";

const GLB_URL = null; // e.g. "/models/arc_reactor.glb" — loads with the holo skin

export default function JarvisCore() {
  const [status, setStatus] = useState(null);
  const [llm, setLlm] = useState(null);
  useEffect(() => {
    apiGet("/v1/jarvis/system/status").then(setStatus).catch(() => {});
    apiGet("/v1/jarvis/research/status").then(setLlm).catch(() => {});
  }, []);
  const g = status?.gotham || {};
  const f = status?.foundry || {};
  const cap = status?.capacity?.capacity || {};

  return (
    <PageShell title="JARVIS CORE" subtitle="HOLOGRAPHIC COMMAND CORE · WEBGL · ACES + BLOOM" accent="#3ad8ff"
      actions={<Badge color={llm?.available ? C.neon : C.text}>AIP: {llm?.backend || "offline"}</Badge>}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(260px,1fr)", gap: 14, alignItems: "start" }}>
        <PanelCard title="HOLO CORE" accent="#3ad8ff" noPad>
          <div style={{ borderRadius: 8, overflow: "hidden",
            background: "radial-gradient(circle at 50% 45%, rgba(8,24,44,0.7), rgba(0,2,6,0.95))" }}>
            <HoloCore color="#3ad8ff" glbUrl={GLB_URL} height={420} />
          </div>
        </PanelCard>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <PanelCard title="LIVE STATE" accent="#3ad8ff">
            <Grid min={120} gap={10}>
              <StatTile label="Objects" value={(g.ontology_objects || 0).toLocaleString()} accent="#3ad8ff" />
              <StatTile label="Neurons" value={(g.neurons || 0).toLocaleString()} accent="#3ad8ff" />
              <StatTile label="Links" value={(g.links || 0).toLocaleString()} accent="#3ad8ff" />
              <StatTile label="Scraped" value={(g.scraped_live || 0).toLocaleString()} accent={C.neon} />
            </Grid>
          </PanelCard>
          <PanelCard title="SYNAPTIC CAPACITY" accent={C.gold}>
            <Grid min={130} gap={10}>
              <StatTile label="Neural synapses" value={fmt(cap.neural_synapses_total)} accent={C.gold} />
              <StatTile label="Full mesh" value={fmt(cap.full_mesh_undirected)} accent={C.gold} />
            </Grid>
          </PanelCard>
          <div style={{ fontSize: 9, color: C.text, lineHeight: 1.7, padding: "0 4px" }}>
            Pipeline: WebGLRenderer (ACES Filmic, sRGB) → EffectComposer → UnrealBloomPass →
            FXAA → OutputPass. PerspectiveCamera 50° + damped OrbitControls. Geometry skinned
            with a Fresnel rim + scanline + flicker additive shader. GLTFLoader (+DRACO) ready.
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function fmt(n) {
  n = Number(n) || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(n);
}
