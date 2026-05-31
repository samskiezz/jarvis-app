/**
 * AxisCommand — multi-axis status grid.
 * Loads IntelProfile entities and groups them by their `type` axis
 * (person / org / invest / asset / property / creative / client / target …),
 * rendering each axis as a column of cards showing label + classification mark
 * + confidence. Real data from IntelProfile.list().
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { IntelProfile } from "@/api/entities";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";

const ACCENT = C.blue;

// Stable column ordering for known axes; unknown types append after.
const AXIS_ORDER = ["person", "org", "invest", "asset", "property", "creative", "client", "target"];

const axisColor = (type) => C.type[type] || C.text;
const markColor = (mark) => C.mark[String(mark || "").toUpperCase()] || C.text;

const confOf = (p) => {
  const raw = p.conf ?? p.confidence ?? p.score;
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n <= 1 ? Math.round(n * 100) : Math.round(n);
};

export default function AxisCommand() {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await IntelProfile.list();
      setProfiles(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const axes = useMemo(() => {
    const groups = {};
    profiles.forEach((p) => {
      const t = p.type || "unclassified";
      (groups[t] ||= []).push(p);
    });
    const keys = Object.keys(groups).sort((a, b) => {
      const ia = AXIS_ORDER.indexOf(a); const ib = AXIS_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return keys.map((k) => ({ type: k, items: groups[k] }));
  }, [profiles]);

  const empty = !loading && !error && profiles.length === 0;

  return (
    <PageShell
      title="AXIS COMMAND"
      subtitle="INTEL PROFILES · GROUPED BY CLASSIFICATION AXIS"
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
        >{loading ? "◌ SYNC" : "↻ REFRESH"}</button>
      }
    >
      <Grid min={150} style={{ marginBottom: 14 }}>
        <StatTile label="Profiles" value={profiles.length} accent={ACCENT} />
        <StatTile label="Active Axes" value={axes.length} accent={C.neon} sub="distinct types" />
        <StatTile
          label="Top Axis"
          value={axes[0] ? axes[0].type.toUpperCase() : "—"}
          accent={axes[0] ? axisColor(axes[0].type) : C.text}
          sub={axes[0] ? `${axes[0].items.length} entities` : undefined}
        />
      </Grid>

      <DataState loading={loading} error={error} empty={empty} emptyLabel="No intel profiles indexed yet.">
        <Grid min={240} gap={12} style={{ alignItems: "start" }}>
          {axes.map((axis) => {
            const col = axisColor(axis.type);
            return (
              <PanelCard
                key={axis.type}
                title={axis.type.toUpperCase()}
                accent={col}
                right={<Badge color={col}>{axis.items.length}</Badge>}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {axis.items.map((p, i) => {
                    const conf = confOf(p);
                    const mk = p.mark || p.classification;
                    return (
                      <div key={p.id ?? i} style={{
                        background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`,
                        borderRadius: 5, padding: "9px 11px",
                      }}>
                        <div style={{
                          fontSize: 11, color: C.textB, fontWeight: 700,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {p.label || p.name || p.title || `Profile ${p.id ?? i}`}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                          {mk && <Badge color={markColor(mk)}>{String(mk).toUpperCase()}</Badge>}
                          <span style={{ flex: 1 }} />
                          {conf != null && (
                            <span style={{ fontSize: 9, color: col, fontWeight: 700 }}>{conf}% conf</span>
                          )}
                        </div>
                        {conf != null && (
                          <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginTop: 6, overflow: "hidden" }}>
                            <div style={{ width: `${conf}%`, height: "100%", background: col }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </PanelCard>
            );
          })}
        </Grid>
      </DataState>
    </PageShell>
  );
}
