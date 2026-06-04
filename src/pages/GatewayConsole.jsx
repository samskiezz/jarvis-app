/**
 * GatewayConsole — front end for the Wave-8 backend gateway (P16 #111). Shows
 * whether the underworld science/sim backend is reachable, lists the proxied
 * endpoint catalog, and lets you fire a GET through the gateway and see the
 * response. Honest about the 502 shape when the underworld server isn't running.
 * Backed by /v1/underworld/{health,catalog,proxy/{path}}.
 */
import { useState, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { Btn, inputStyle, JsonView } from "@/components/Wave1Kit";
import { apiGet, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.purple;

export default function GatewayConsole() {
  const [health, setHealth] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [path, setPath] = useState("/health");
  const [resp, setResp] = useState(null);
  const hAsync = useAsync(); const cAsync = useAsync(); const pAsync = useAsync();

  const load = useCallback(async () => {
    const h = await hAsync.run(() => apiGet("/v1/underworld/health")); setHealth(h);
    const c = await cAsync.run(() => apiGet("/v1/underworld/catalog")); setCatalog(asList(c, "catalog", "endpoints", "items"));
  }, [hAsync, cAsync]);
  useEffect(() => { load(); }, [load]);

  const fire = async (p) => {
    const target = (p || path).replace(/^\//, "");
    const b = await pAsync.run(() => apiGet(`/v1/underworld/proxy/${target}`)); setResp(b);
  };

  const reachable = health?.reachable ?? health?.ok ?? false;

  return (
    <PageShell title="GATEWAY" subtitle="unify APEX ↔ underworld science/sim backend · proxy · catalog" accent={ACCENT}
      actions={<Badge color={reachable ? C.neon : C.red}>{reachable ? "● UNDERWORLD UP" : "● UNREACHABLE"}</Badge>}>
      <Grid min={160} style={{ marginBottom: 14 }}>
        <StatTile label="underworld" value={reachable ? "reachable" : "down"} accent={reachable ? C.neon : C.red}
          sub={health?.latency_ms != null ? `${health.latency_ms}ms` : ""} />
        <StatTile label="catalog endpoints" value={catalog.length} accent={ACCENT} />
        <StatTile label="in-process bridge" value="active" accent={C.gold} sub="science_bridge (489 methods)" />
      </Grid>

      {!reachable && (
        <div style={{ marginBottom: 12, fontSize: 10, color: C.text, padding: "8px 12px",
          border: `1px solid ${C.border}`, borderRadius: 4, background: `${C.red}0a` }}>
          The underworld HTTP backend isn't running (start it on <b>UNDERWORLD_URL</b>, default :8001). The
          in-process science bridge still serves the 489 methods directly — the gateway adds HTTP access to the
          sim/worlds endpoints. This is the honest state, not an error.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <PanelCard title="ENDPOINT CATALOG" accent={ACCENT}>
          <DataState loading={cAsync.loading} empty={!catalog.length} emptyLabel="No catalog">
            <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 360, overflowY: "auto" }}>
              {catalog.map((e, i) => (
                <button key={i} onClick={() => { setPath(e.path || e); fire(e.path || e); }}
                  style={{ textAlign: "left", cursor: "pointer", fontFamily: "inherit", fontSize: 10, padding: "6px 9px",
                    borderRadius: 4, border: `1px solid ${C.border}`, background: "rgba(0,0,0,0.2)", color: C.textB }}>
                  <Badge color={C.gold}>{e.method || "GET"}</Badge> <span style={{ marginLeft: 6 }}>{e.path || e}</span>
                  {e.desc && <div style={{ fontSize: 8, color: C.text, marginTop: 2 }}>{e.desc}</div>}
                </button>
              ))}
            </div>
          </DataState>
        </PanelCard>
        <PanelCard title="PROXY REQUEST" accent={C.neon}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/worlds" style={{ ...inputStyle, flex: 1 }}
              onKeyDown={(e) => e.key === "Enter" && fire()} />
            <Btn accent={C.neon} onClick={() => fire()}>GET</Btn>
          </div>
          <DataState loading={pAsync.loading} error={pAsync.error} empty={!resp} emptyLabel="Fire a request through the gateway">
            {resp && (
              <>
                <Badge color={resp.ok === false || resp.status === 502 ? C.red : C.neon}>status {resp.status ?? "?"}</Badge>
                <div style={{ marginTop: 6 }}><JsonView data={resp} max={500} /></div>
              </>
            )}
          </DataState>
        </PanelCard>
      </div>
    </PageShell>
  );
}
