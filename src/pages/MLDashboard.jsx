/**
 * MLDashboard — ML model-quality / self-improvement dashboard.
 *
 * Wired to the REAL AIP self-improvement surface the backend already ships
 * (server/services/aip.py + server/routes/aip.py):
 *   - GET /v1/aip/skill?domain=          → the self-improvement scorecard:
 *       skill_summary (n_scored, MAE, RMSE, interval coverage, mean skill vs
 *       baseline) + the forward-test scorecard (directional accuracy roll-up).
 *   - GET /v1/aip/oracle?asset=&source=  → the trained model's live conviction /
 *       direction / volatility for a handful of crypto assets.
 *
 * These are the engine's OWN measured metrics over truly-realized, scored
 * forecasts — not fabricated charts. Empty store renders honest zero/None
 * states. Keeps the cyberpunk-glass identity (stat tiles, gauges, div-bars).
 */
import { useState, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { apiGet, qs } from "@/lib/wave1";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";

const ACCENT = C.purple;

// Domains the scorecard can be filtered by + the live-oracle asset probes.
const DOMAINS = ["", "crypto", "series", "growth"];
const PROBE_ASSETS = ["bitcoin", "ethereum", "xrp", "solana"];

const pctStr = (v) => (typeof v === "number" && Number.isFinite(v) ? `${Math.round(v * 100)}%` : "—");
const num = (v, d = 4) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "—");

const DIR_COLOR = { up: C.neon, down: C.red };

export default function MLDashboard() {
  const [domain, setDomain] = useState("");
  const [card, setCard] = useState(null);
  const [oracles, setOracles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [skill, ...sigs] = await Promise.all([
        apiGet(`/v1/aip/skill${qs({ domain: domain || undefined })}`).catch(() => null),
        ...PROBE_ASSETS.map((a) =>
          apiGet(`/v1/aip/oracle${qs({ asset: a, source: "crypto" })}`)
            .then((r) => ({ asset: a, ...r }))
            .catch(() => ({ asset: a, status: "error" })),
        ),
      ]);
      setCard(skill);
      setOracles(sigs);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [domain]);

  useEffect(() => { load(); }, [load]);

  const summary = card?.skill_summary || {};
  const score = card?.scorecard || {};
  const nScored = summary.n_scored ?? score.n_scored ?? 0;
  const dirAcc = score.directional_accuracy;
  const nDir = score.n_directional ?? 0;

  // Metric bars (normalised 0..1 where sensible). Coverage & directional accuracy
  // are already fractions; skill-vs-baseline is centred at 0 (positive = beats
  // the naive baseline) so we map it onto a 0..1 bar around 0.5.
  const metricBars = [
    { key: "coverage", label: "INTERVAL COVERAGE", frac: summary.coverage, color: C.blue },
    { key: "dir", label: "DIRECTIONAL ACCURACY", frac: dirAcc, color: C.neon },
    {
      key: "skill", label: "SKILL VS BASELINE",
      frac: typeof summary.mean_skill_vs_baseline === "number"
        ? Math.max(0, Math.min(1, 0.5 + summary.mean_skill_vs_baseline / 2))
        : null,
      raw: summary.mean_skill_vs_baseline, color: C.gold,
    },
  ];

  const okOracles = oracles.filter((o) => o.status === "ok");

  return (
    <PageShell title="ML DASHBOARD" subtitle="SELF-IMPROVEMENT SCORECARD · TRAINED-MODEL LIVE SIGNALS" accent={ACCENT}
      actions={
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={domain} onChange={(e) => setDomain(e.target.value)}
            style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${ACCENT}55`, borderRadius: 4,
              color: C.textB, padding: "6px 8px", fontSize: 10, fontFamily: "inherit", outline: "none" }}>
            {DOMAINS.map((d) => <option key={d || "all"} value={d}>{d ? d.toUpperCase() : "ALL DOMAINS"}</option>)}
          </select>
          <button onClick={load} style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${ACCENT}55`, borderRadius: 4,
            color: ACCENT, padding: "7px 9px", fontSize: 10, fontFamily: "inherit", cursor: "pointer" }}>↻ REFRESH</button>
        </div>
      }>
      <DataState loading={loading} error={error} empty={false}>
        <Grid min={160} gap={10} style={{ marginBottom: 14 }}>
          <StatTile label="Scored Forecasts" value={nScored} accent={ACCENT} sub={domain || "all domains"} />
          <StatTile label="MAE" value={num(summary.mae)} accent={C.blue} sub="mean abs error" />
          <StatTile label="RMSE" value={num(summary.rmse)} accent={C.gold} sub="root mean sq" />
          <StatTile label="Dir. Accuracy" value={pctStr(dirAcc)} accent={C.neon} sub={`${nDir} directional`} />
        </Grid>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 14 }}>
          <PanelCard title="MODEL QUALITY" accent={ACCENT}>
            {nScored === 0 ? (
              <div style={{ fontSize: 10, color: C.text, padding: 12 }}>
                No scored forecasts yet for this domain — the forward-test loop scores
                forecasts once their horizon elapses, then these metrics populate.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                {metricBars.map((m) => (
                  <div key={m.key}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: C.text, marginBottom: 3 }}>
                      <span style={{ letterSpacing: 1 }}>{m.label}</span>
                      <span>{m.key === "skill" ? num(m.raw, 3) : pctStr(m.frac)}</span>
                    </div>
                    <div style={{ height: 14, background: "rgba(255,255,255,0.04)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${typeof m.frac === "number" ? Math.max(0, Math.min(100, m.frac * 100)) : 0}%`,
                        height: "100%", background: m.color, transition: "width .4s" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </PanelCard>

          <PanelCard title="TRAINED-MODEL LIVE SIGNALS" accent={C.gold}
            right={<Badge color={C.gold}>{okOracles.length}/{oracles.length}</Badge>}>
            {oracles.length === 0 ? (
              <div style={{ fontSize: 10, color: C.text, padding: 12 }}>No oracle probes.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {oracles.map((o) => {
                  const ok = o.status === "ok";
                  const conv = typeof o.conviction === "number" ? o.conviction : 0;
                  const dirCol = DIR_COLOR[o.direction] || C.text;
                  return (
                    <div key={o.asset}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: C.text, marginBottom: 3 }}>
                        <span style={{ textTransform: "uppercase", letterSpacing: 1 }}>{o.asset}</span>
                        <span>
                          {ok ? (
                            <>
                              <span style={{ color: dirCol, fontWeight: 700 }}>{String(o.direction || "").toUpperCase()}</span>
                              {" · "}{pctStr(o.conviction)} conv · vol {num(o.vol_pred)}
                            </>
                          ) : (
                            <span style={{ color: C.gold }}>{o.status}</span>
                          )}
                        </span>
                      </div>
                      <div style={{ height: 10, background: "rgba(255,255,255,0.04)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${Math.max(0, Math.min(100, conv * 100))}%`, height: "100%", background: dirCol }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </PanelCard>
        </div>
      </DataState>
    </PageShell>
  );
}
