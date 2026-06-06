/**
 * AutoConsole — the self-building interface. It fetches the UI spec generated from
 * LIVE ontology data (/v1/jarvis/ui/spec) and renders the windows, buttons and 3D
 * renders dynamically. As the scraper + live feeds grow the data, new object types
 * appear and new windows/renders build themselves here — no hand-coded page per type.
 */
import { useEffect, useMemo, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge } from "@/components/PageKit";
import { apiGet } from "@/lib/wave1";
import HoloCore from "@/components/Jarvis/HoloCore";

const PLANE_COLOR = { jarvis: "#3ad8ff", foundry: "#00d4ff", gotham: "#ff3b6b",
  apollo: "#7cff7c", aip: "#b18cff", audit: "#8be9fd" };

export default function AutoConsole() {
  const [spec, setSpec] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = () => apiGet("/v1/jarvis/ui/spec").then((s) => {
    setSpec(s);
    setSelected((cur) => cur || (s?.modules?.[0]?.id ?? null));
  }).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  const byPlane = useMemo(() => {
    const g = {};
    (spec?.modules || []).forEach((m) => { (g[m.plane] ||= []).push(m); });
    return g;
  }, [spec]);
  const sel = (spec?.modules || []).find((m) => m.id === selected);

  return (
    <PageShell title="AUTO CONSOLE" subtitle="SELF-BUILDING INTERFACE · WINDOWS + RENDERS FROM LIVE DATA"
      accent="#3ad8ff"
      actions={spec && <Badge color="#3ad8ff">{spec.object_types} windows · {spec.renders_assigned} renders · {spec.render_gaps?.length || 0} gaps</Badge>}>

      {!spec ? <div style={{ color: C.text, fontSize: 11 }}>Building interface from live data…</div> : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(300px,420px)", gap: 14, alignItems: "start" }}>
          {/* auto-built windows, grouped by plane */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {Object.entries(byPlane).map(([plane, mods]) => {
              const col = PLANE_COLOR[plane] || C.neon;
              return (
                <PanelCard key={plane} title={`${plane.toUpperCase()} · ${mods.length} window(s)`} accent={col}>
                  <Grid min={230} gap={10}>
                    {mods.map((m) => {
                      const on = m.id === selected;
                      return (
                        <button key={m.id} onClick={() => setSelected(m.id)}
                          style={{ textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                            padding: 10, borderRadius: 6, background: on ? col + "1a" : "rgba(0,0,0,0.3)",
                            border: `1px solid ${on ? col : C.border}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ color: on ? col : C.textB, fontSize: 12, fontWeight: 700 }}>{m.title}</span>
                            <span style={{ color: C.text, fontSize: 10 }}>{m.count.toLocaleString()}</span>
                          </div>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                            {m.widgets.map((w) => (
                              <span key={w} style={{ fontSize: 7, color: col, background: col + "14",
                                border: `1px solid ${col}33`, borderRadius: 3, padding: "1px 5px" }}>{w}</span>
                            ))}
                          </div>
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
                            {m.buttons.map((b) => (
                              <span key={b} style={{ fontSize: 8, color: C.textB, background: "rgba(255,255,255,0.05)",
                                border: `1px solid ${C.border}`, borderRadius: 4, padding: "3px 8px" }}>{b}</span>
                            ))}
                          </div>
                          <div style={{ fontSize: 7, color: m.render.model ? C.neon : C.gold, marginTop: 6 }}>
                            ⬡ {m.render.model ? m.render.name : `gap → ${m.render.generate}`}
                          </div>
                        </button>
                      );
                    })}
                  </Grid>
                </PanelCard>
              );
            })}
          </div>

          {/* the selected window's live 3D render */}
          <div style={{ position: "sticky", top: 12 }}>
            <PanelCard title={sel ? `RENDER · ${sel.title.toUpperCase()}` : "RENDER"}
              accent={PLANE_COLOR[sel?.plane] || "#3ad8ff"} noPad>
              <div style={{ borderRadius: 8, overflow: "hidden",
                background: "radial-gradient(circle at 50% 45%, rgba(8,24,44,0.7), rgba(0,2,6,0.95))" }}>
                {sel?.render?.model
                  ? <HoloCore key={sel.id} color={PLANE_COLOR[sel.plane] || "#3ad8ff"} glbUrl={sel.render.model} height={360} />
                  : <HoloCore key={sel?.id || "none"} color={PLANE_COLOR[sel?.plane] || "#3ad8ff"} height={360} />}
              </div>
              {sel && (
                <div style={{ padding: 10 }}>
                  <Grid min={120} gap={8}>
                    <StatTile label="Objects" value={sel.count.toLocaleString()} accent={PLANE_COLOR[sel.plane]} />
                    <StatTile label="Type" value={sel.object_type} accent={PLANE_COLOR[sel.plane]} />
                  </Grid>
                  <div style={{ fontSize: 8, color: C.text, marginTop: 8 }}>
                    Auto-generated from live data · query {sel.query}
                  </div>
                </div>
              )}
            </PanelCard>
          </div>
        </div>
      )}
    </PageShell>
  );
}
