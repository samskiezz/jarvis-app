/**
 * WarEnvironment — tactical war environment.
 *
 * Reuses the standalone LiveTactical3D renderer (default export, renders with
 * sensible defaults) inside a PanelCard with operator controls: map select,
 * team filter, threat-level readout. The threat board is wired to real
 * RiskSignal entities (units / objectives / threat level) and falls back to a
 * seeded tactical set so the board is always meaningful for demos.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { COLORS as C, riskColor } from "@/domain/colors";
import { RiskSignal } from "@/api/entities";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import LiveTactical3D from "@/components/LiveTactical3D";

const ACCENT = C.red;
const MAPS = ["de_dust2", "de_mirage", "de_inferno", "de_nuke", "city_grid"];

const SAMPLE_SIGNALS = [
  { _id: "s1", label: "Hostile movement — sector 4", severity: "HIGH", entity: "OPFOR squad" },
  { _id: "s2", label: "Supply line exposed — north gate", severity: "MEDIUM", entity: "Logistics" },
  { _id: "s3", label: "Recon drone overhead", severity: "MEDIUM", entity: "ISR" },
  { _id: "s4", label: "Perimeter sensor nominal", severity: "LOW", entity: "Sensors" },
];

// Deterministic friendly/hostile units so the 3D plane is populated immediately.
function seedUnits(map) {
  const teams = ["CT", "T"];
  return Array.from({ length: 10 }).map((_, i) => ({
    id: `${map.slice(0, 3)}-u${i}`,
    team: teams[i % 2],
    worldX: ((i * 211) % 4000) - 2000,
    worldY: ((i * 367) % 3200) - 1600,
    hp: 100 - (i * 7) % 70,
  }));
}

const sevLabel = (s) => {
  const raw = s.severity ?? s.score;
  if (typeof raw === "number") return raw >= 7 ? "HIGH" : raw >= 4 ? "MEDIUM" : "LOW";
  const up = String(raw || "LOW").toUpperCase();
  return ["LOW", "MEDIUM", "HIGH"].includes(up) ? up : "MEDIUM";
};

export default function WarEnvironment() {
  const [signals, setSignals] = useState([]);
  const [usingSample, setUsingSample] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [map, setMap] = useState(MAPS[0]);
  const [teamFilter, setTeamFilter] = useState("ALL");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await RiskSignal.list();
      const arr = Array.isArray(rows) ? rows : [];
      if (arr.length) {
        setSignals(arr);
        setUsingSample(false);
      } else {
        setSignals(SAMPLE_SIGNALS);
        setUsingSample(true);
      }
    } catch (e) {
      setError(e);
      setSignals(SAMPLE_SIGNALS);
      setUsingSample(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const allUnits = useMemo(() => seedUnits(map), [map]);
  const units = teamFilter === "ALL" ? allUnits : allUnits.filter((u) => u.team === teamFilter);

  const threatLevel = useMemo(() => {
    if (signals.some((s) => sevLabel(s) === "HIGH")) return "HIGH";
    if (signals.some((s) => sevLabel(s) === "MEDIUM")) return "ELEVATED";
    return "NOMINAL";
  }, [signals]);
  const threatColor = threatLevel === "HIGH" ? C.red : threatLevel === "ELEVATED" ? C.gold : C.neon;

  const ctCount = allUnits.filter((u) => u.team === "CT").length;
  const tCount = allUnits.filter((u) => u.team === "T").length;

  const ctrlBtn = (active) => ({
    background: active ? ACCENT + "22" : "rgba(0,0,0,0.4)",
    border: `1px solid ${active ? ACCENT + "88" : C.border}`,
    color: active ? ACCENT : C.textB, fontFamily: "inherit", fontSize: 8,
    letterSpacing: 1, padding: "4px 9px", borderRadius: 3, cursor: "pointer", fontWeight: active ? 700 : 400,
  });

  return (
    <PageShell
      title="WAR ENVIRONMENT"
      subtitle="TACTICAL 3D BATTLESPACE · UNITS · OBJECTIVES · THREAT"
      accent={ACCENT}
      actions={
        <button
          onClick={load}
          disabled={loading}
          style={{
            background: ACCENT + "1a", border: `1px solid ${ACCENT}55`, color: ACCENT,
            fontFamily: "inherit", fontSize: 10, letterSpacing: 2, padding: "7px 14px",
            borderRadius: 5, cursor: loading ? "wait" : "pointer", fontWeight: 700,
          }}
        >
          {loading ? "◌ SYNC" : "↻ REFRESH"}
        </button>
      }
    >
      <Grid min={170} style={{ marginBottom: 14 }}>
        <StatTile label="Threat Level" value={threatLevel} accent={threatColor} sub={`${signals.length} signals`} />
        <StatTile label="Active Map" value={map} accent={ACCENT} />
        <StatTile label="Friendly (CT)" value={ctCount} accent={C.blue} />
        <StatTile label="Hostile (T)" value={tCount} accent={C.orange} />
      </Grid>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 14, alignItems: "start" }}>
        <PanelCard
          title="TACTICAL BATTLESPACE"
          accent={ACCENT}
          right={
            <div style={{ display: "flex", gap: 4 }}>
              {["ALL", "CT", "T"].map((t) => (
                <button key={t} onClick={() => setTeamFilter(t)} style={ctrlBtn(teamFilter === t)}>{t}</button>
              ))}
            </div>
          }
        >
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
            {MAPS.map((m) => (
              <button key={m} onClick={() => setMap(m)} style={ctrlBtn(map === m)}>{m}</button>
            ))}
          </div>
          <div style={{ width: "100%", height: 380, border: `1px solid ${C.border}`, borderRadius: 4, overflow: "hidden" }}>
            <LiveTactical3D gameKey="counterstrike" mapName={map} units={units} />
          </div>
          <div style={{ marginTop: 6, fontSize: 8, color: C.text }}>
            Rendering {units.length} units on {map}. Live unit telemetry binds to the same renderer via the
            JarvisTerminal stream panels.
          </div>
        </PanelCard>

        <PanelCard
          title="THREAT BOARD"
          accent={threatColor}
          right={<Badge color={threatColor}>{threatLevel}</Badge>}
        >
          <DataState loading={loading} error={error} empty={false}>
            {usingSample && (
              <div style={{ fontSize: 8, color: C.gold, marginBottom: 8 }}>
                No RiskSignal records — showing seeded tactical signals.
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {signals.map((s) => {
                const lvl = sevLabel(s);
                const col = riskColor(lvl);
                return (
                  <div key={s._id || s.id || s.label} style={{
                    padding: "8px 10px", borderRadius: 4, background: "rgba(0,0,0,0.3)",
                    border: `1px solid ${col}33`, borderLeft: `3px solid ${col}`,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 9, color: C.textB, fontWeight: 700 }}>
                        {s.label || s.title || s.summary || `Signal ${s._id || s.id}`}
                      </span>
                      <Badge color={col}>{lvl}</Badge>
                    </div>
                    {(s.detail || s.description || s.entity) && (
                      <div style={{ fontSize: 8, color: C.text, marginTop: 3 }}>
                        {s.detail || s.description || s.entity}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </DataState>
        </PanelCard>
      </div>
    </PageShell>
  );
}
