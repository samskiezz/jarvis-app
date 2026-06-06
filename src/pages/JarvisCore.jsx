/**
 * JarvisCore — the holographic command core. Renders the real WebGL holo engine
 * (ACES + UnrealBloom + Fresnel/solid holo skin + orbit camera) loading actual
 * Tripo-generated GLB models per plane (Gotham/Foundry/Apollo/AIP/JARVIS), tied to
 * live status. This is the A-Z render surface — switch planes to load each model.
 */
import { useEffect, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge } from "@/components/PageKit";
import { apiGet } from "@/lib/wave1";
import HoloCore from "@/components/Jarvis/HoloCore";
import { PLANE_MODELS, ASSET_MANIFEST, manifestSummary } from "@/three/modelRegistry";

const PLANES = ["jarvis", "aip", "foundry", "gotham", "apollo"];

export default function JarvisCore() {
  const [status, setStatus] = useState(null);
  const [plane, setPlane] = useState("jarvis");
  useEffect(() => { apiGet("/v1/jarvis/system/status").then(setStatus).catch(() => {}); }, []);
  const g = status?.gotham || {};
  const pm = PLANE_MODELS[plane];
  const ms = manifestSummary();

  return (
    <PageShell title="JARVIS CORE" subtitle="HOLOGRAPHIC COMMAND CORE · WEBGL · ACES+BLOOM · TRIPO GLB" accent={pm.color}
      actions={<Badge color={pm.color}>{ms.wired} wired · {ms.available} available · {ms.gap} gaps</Badge>}>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {PLANES.map((p) => {
          const m = PLANE_MODELS[p]; const on = plane === p;
          return (
            <button key={p} onClick={() => setPlane(p)}
              style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                fontFamily: "inherit", fontSize: 11, letterSpacing: 1, fontWeight: 700,
                padding: "8px 16px", borderRadius: 6, textTransform: "uppercase",
                border: `1px solid ${on ? m.color : C.border}`,
                background: on ? m.color + "1f" : "rgba(0,0,0,0.25)", color: on ? m.color : C.text }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: m.color,
                boxShadow: on ? `0 0 8px ${m.color}` : "none" }} />
              {p} · {m.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) minmax(260px,1fr)", gap: 14, alignItems: "start" }}>
        <PanelCard title={`HOLO RENDER · ${pm.label.toUpperCase()}`} accent={pm.color} noPad>
          <div style={{ borderRadius: 8, overflow: "hidden",
            background: "radial-gradient(circle at 50% 45%, rgba(8,24,44,0.7), rgba(0,2,6,0.95))" }}>
            {/* key={plane} forces a fresh engine + model load on plane switch */}
            <HoloCore key={plane} color={pm.color} glbUrl={pm.model} height={440} />
          </div>
        </PanelCard>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <PanelCard title="LIVE STATE" accent={pm.color}>
            <Grid min={120} gap={10}>
              <StatTile label="Objects" value={(g.ontology_objects || 0).toLocaleString()} accent={pm.color} />
              <StatTile label="Neurons" value={(g.neurons || 0).toLocaleString()} accent={pm.color} />
              <StatTile label="Links" value={(g.links || 0).toLocaleString()} accent={pm.color} />
              <StatTile label="Scraped" value={(g.scraped_live || 0).toLocaleString()} accent={C.neon} />
            </Grid>
          </PanelCard>
          <PanelCard title="ASSET MANIFEST (A–Z RENDER MAP)" accent={C.gold}>
            <div style={{ maxHeight: 260, overflowY: "auto", fontSize: 9 }}>
              {ASSET_MANIFEST.map((a, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8,
                  padding: "4px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: C.textB }}>{a.surface}</span>
                  <span style={{ color: a.status === "wired" ? C.neon : a.status === "available" ? C.gold : C.red,
                    whiteSpace: "nowrap" }}>{a.status}</span>
                </div>
              ))}
            </div>
          </PanelCard>
        </div>
      </div>
    </PageShell>
  );
}
