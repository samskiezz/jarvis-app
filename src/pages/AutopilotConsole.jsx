/**
 * AutopilotConsole — cockpit for the BRAIN AUTOPILOT self-improvement loop.
 *
 * The backend now has an ACTIVE layer that detects the vault's own knowledge
 * gaps and CLOSES them — resolving dangling [[wikilinks]] into real concept
 * stubs, linking orphan notes, and promoting frequent un-named terms into
 * concepts — looping pass-by-pass until improvement plateaus (convergence).
 *
 * This page wires:
 *   GET  /v1/brain/autopilot/scan  → header stat tiles + gap breakdown (no writes)
 *   GET  /v1/brain/health          → sample orphan titles + dangling missing_titles
 *   GET  /v1/brain/catalog         → live cluster (kind) totals
 *   POST /v1/brain/autopilot/run   → ACTUALLY runs the loop, returns per-pass log
 *
 * Microcopy stays honest: every fix is grounded in evidence already in the
 * vault (no LLM, no fabricated facts); promoted "themes" are frequent un-named
 * terms whose quality tracks corpus richness. After a run, the scan is
 * re-fetched so the header tiles reflect the grown totals.
 *
 * Cyberpunk-glass via PageKit / Wave1Kit / COLORS; recharts gets a dark theme.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { apiGet, apiPost, asList, useAsync } from "@/lib/wave1";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { Btn, inputStyle } from "@/components/Wave1Kit";
import { COLORS as C } from "@/domain/colors";

const ACCENT = C.purple; // cognition/apex — the self-improving brain

// One row of the gap-breakdown panel: a labelled bar sized to the largest count.
function GapBar({ label, value, max, accent, samples }) {
  const pct = max > 0 ? Math.max(value > 0 ? 6 : 0, (value / max) * 100) : 0;
  return (
    <div style={{ padding: "6px 0" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 9, letterSpacing: 1, color: C.textB, textTransform: "uppercase", flex: 1 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: accent, fontVariantNumeric: "tabular-nums" }}>{value}</span>
      </div>
      <div style={{ height: 7, background: "rgba(255,255,255,0.05)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: accent, boxShadow: `0 0 8px ${accent}`, transition: "width .4s" }} />
      </div>
      {samples && samples.length > 0 && (
        <div style={{ marginTop: 5, display: "flex", flexWrap: "wrap", gap: 4 }}>
          {samples.map((s, i) => (
            <span key={i} style={{ fontSize: 8, color: C.text, background: "rgba(0,0,0,0.35)",
              border: `1px solid ${C.border}`, borderRadius: 3, padding: "2px 6px", maxWidth: 220,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s}>{s}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AutopilotConsole() {
  const [scan, setScan] = useState(null);
  const [clusters, setClusters] = useState(0);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(null);

  const [maxPasses, setMaxPasses] = useState(5);
  const [report, setReport] = useState(null);
  const { loading: running, error: runError, run } = useAsync();

  // Load the gap report (scan), cluster totals (catalog), and gap samples (health).
  const loadScan = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const [s, cat, h] = await Promise.all([
        apiGet("/v1/brain/autopilot/scan"),
        apiGet("/v1/brain/catalog").catch(() => null),
        apiGet("/v1/brain/health").catch(() => null),
      ]);
      setScan(s || null);
      setHealth(h || null);
      const kinds = cat && cat.counts && typeof cat.counts === "object" ? Object.keys(cat.counts).length : 0;
      setClusters(kinds);
    } catch (e) {
      setLoadErr(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadScan(); }, [loadScan]);

  const onRun = useCallback(async () => {
    const rep = await run(() => apiPost("/v1/brain/autopilot/run", { max_passes: maxPasses }));
    if (rep) {
      setReport(rep);
      // Re-scan so the header tiles reflect the grown totals after the loop wrote fixes.
      loadScan();
    }
  }, [run, maxPasses, loadScan]);

  // Cumulative neurons/synapses across the passes — for the post-run line chart.
  const passSeries = useMemo(() => {
    const passes = asList(report, "passes");
    let nCum = 0;
    let lCum = 0;
    return passes.map((p, i) => {
      nCum += Number(p.neurons_added || 0);
      lCum += Number(p.synapses_added || 0);
      return { pass: `P${i + 1}`, neurons: nCum, synapses: lCum };
    });
  }, [report]);

  const orphanSamples = useMemo(
    () => asList(health, "orphans").slice(0, 5).map((o) => o.title || o.id).filter(Boolean),
    [health],
  );
  const gapSamples = useMemo(
    () => asList(health, "gaps").slice(0, 5).map((g) => g.missing_title || g.title).filter(Boolean),
    [health],
  );

  const fixable = scan ? Number(scan.fixable || 0) : 0;
  const gapMax = scan
    ? Math.max(scan.gaps || 0, scan.orphans || 0, scan.themes || 0, scan.low_confidence || 0, scan.stale || 0, 1)
    : 1;

  const actions = (
    <Btn accent={ACCENT} onClick={loadScan} disabled={loading || running}>
      ↻ RESCAN
    </Btn>
  );

  return (
    <PageShell
      title="BRAIN AUTOPILOT"
      subtitle="SELF-IMPROVING KNOWLEDGE-GAP LOOP · DETECTS & AUTO-FILLS THE VAULT'S OWN GAPS"
      accent={ACCENT}
      actions={actions}
    >
      <DataState loading={loading} error={loadErr} empty={!scan} emptyLabel="NO SCAN — backend unreachable">
        {scan && (
          <>
            {/* ── HEADER STAT TILES — genuine DB totals from scan + catalog ───────── */}
            <Grid min={170} gap={12} style={{ marginBottom: 14 }}>
              <StatTile label="Neurons (real notes)" value={scan.notes ?? 0} accent={ACCENT} sub="live DB total" />
              <StatTile label="Synapses (real links)" value={scan.links ?? 0} accent={C.blue} sub="live DB total" />
              <StatTile label="Clusters (kinds)" value={clusters} accent={C.gold} sub="from /catalog" />
              <StatTile label="Health Score" value={scan.score ?? 0} accent={C.neon} sub="0–100 vault hygiene" />
              <StatTile label="Fixable Gaps" value={fixable} accent={fixable > 0 ? C.orange : C.neon} sub="gaps + orphans + themes" />
            </Grid>

            <Grid min={340} gap={14}>
              {/* ── GAP BREAKDOWN ─────────────────────────────────────────────────── */}
              <PanelCard title="GAP BREAKDOWN" accent={C.orange}>
                <GapBar label="Gaps (dangling links)" value={scan.gaps ?? 0} max={gapMax} accent={C.orange} samples={gapSamples} />
                <GapBar label="Orphans (island notes)" value={scan.orphans ?? 0} max={gapMax} accent={C.gold} samples={orphanSamples} />
                <GapBar label="Themes (un-named terms)" value={scan.themes ?? 0} max={gapMax} accent={ACCENT} />
                <GapBar label="Low confidence" value={scan.low_confidence ?? 0} max={gapMax} accent={C.blue} />
                <GapBar label="Stale notes" value={scan.stale ?? 0} max={gapMax} accent={C.text} />
                {fixable === 0 && (
                  <div style={{ marginTop: 10, padding: "9px 11px", borderRadius: 5, fontSize: 9, lineHeight: 1.5,
                    color: C.neon, background: C.neonD, border: `1px solid ${C.neon}44` }}>
                    BRAIN IS FULLY CONSOLIDATED — no open gaps, orphans, or emergent themes to fill.
                    Capture more notes to create new gaps for autopilot to close.
                  </div>
                )}
                <div style={{ marginTop: 10, fontSize: 8, color: C.text, lineHeight: 1.5 }}>
                  Samples are live: orphan titles + dangling <code>missing_title</code> references from
                  <code> /v1/brain/health</code>. They show WHAT is missing before you run the loop.
                </div>
              </PanelCard>

              {/* ── RUN AUTOPILOT ─────────────────────────────────────────────────── */}
              <PanelCard title="RUN AUTOPILOT" accent={ACCENT} right={<Badge color={ACCENT}>WRITES TO VAULT</Badge>}>
                <div style={{ fontSize: 9, color: C.textB, lineHeight: 1.6, marginBottom: 12 }}>
                  This ACTUALLY writes real notes and links derived from existing vault evidence — no
                  fabricated facts. Danglers become concept stubs citing their sources, orphans get
                  high-confidence links, and frequent un-named terms are promoted to concepts. The loop
                  repeats until it stops improving (convergence) or hits the pass cap.
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <span style={{ fontSize: 8, letterSpacing: 1, color: C.text, textTransform: "uppercase" }}>Max passes (1–20)</span>
                    <input
                      type="number" min={1} max={20} value={maxPasses}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setMaxPasses(Number.isFinite(v) ? Math.max(1, Math.min(20, v)) : 5);
                      }}
                      disabled={running}
                      style={{ ...inputStyle, width: 90 }}
                    />
                  </label>
                  <Btn accent={ACCENT} onClick={onRun} disabled={running} style={{ padding: "8px 22px" }}>
                    {running ? "◌ RUNNING LOOP…" : "▸ RUN AUTOPILOT"}
                  </Btn>
                </div>
                {running && (
                  <div style={{ marginTop: 12, fontSize: 9, color: ACCENT, letterSpacing: 1 }}>
                    ◌ Detecting gaps, writing fixes, re-scanning, looping to convergence…
                  </div>
                )}
                {runError && (
                  <div style={{ marginTop: 12, fontSize: 9, color: C.red }}>
                    ⚠ {String(runError.message || runError)}
                  </div>
                )}
                <div style={{ marginTop: 12, fontSize: 8, color: C.text, lineHeight: 1.5 }}>
                  Promoted themes are frequent un-named terms — their quality depends on corpus richness.
                  Re-run after capturing more notes to keep consolidating.
                </div>
              </PanelCard>
            </Grid>

            {/* ── POST-RUN REPORT ───────────────────────────────────────────────────── */}
            {report && (
              <div style={{ marginTop: 14 }}>
                {/* Summary banner */}
                <div style={{ marginBottom: 14, padding: "11px 14px", borderRadius: 7,
                  background: `linear-gradient(180deg, ${ACCENT}1f, ${ACCENT}08)`,
                  border: `1px solid ${ACCENT}55`, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: ACCENT, letterSpacing: 1 }}>
                    {report.converged
                      ? `✓ CONVERGED AFTER ${report.passes_run} PASS${report.passes_run === 1 ? "" : "ES"}`
                      : `RAN ${report.passes_run} PASS${report.passes_run === 1 ? "" : "ES"} (cap reached)`}
                  </span>
                  <span style={{ fontSize: 10, color: C.neon }}>+{report.neurons_added ?? 0} neurons</span>
                  <span style={{ fontSize: 10, color: C.blue }}>+{report.synapses_added ?? 0} synapses</span>
                  <span style={{ fontSize: 9, color: C.text }}>
                    score {report.score_before ?? "?"} → <b style={{ color: C.neon }}>{report.score_after ?? "?"}</b>
                  </span>
                  <span style={{ fontSize: 9, color: C.text }}>
                    totals: {report.notes_total ?? 0} notes · {report.links_total ?? 0} links
                  </span>
                </div>

                <Grid min={340} gap={14}>
                  {/* Per-pass log table */}
                  <PanelCard title="PASS LOG" accent={ACCENT}>
                    {passSeries.length === 0 ? (
                      <div style={{ fontSize: 9, color: C.text }}>No passes recorded.</div>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
                          <thead>
                            <tr style={{ color: C.text, textAlign: "right" }}>
                              <th style={{ textAlign: "left", padding: "4px 6px", letterSpacing: 1 }}>PASS</th>
                              <th style={{ padding: "4px 6px" }}>DANGLERS</th>
                              <th style={{ padding: "4px 6px" }}>ORPHANS</th>
                              <th style={{ padding: "4px 6px" }}>THEMES</th>
                              <th style={{ padding: "4px 6px", color: C.neon }}>+NEU</th>
                              <th style={{ padding: "4px 6px", color: C.blue }}>+SYN</th>
                              <th style={{ padding: "4px 6px" }}>SCORE</th>
                            </tr>
                          </thead>
                          <tbody>
                            {asList(report, "passes").map((p, i) => (
                              <tr key={i} style={{ borderTop: `1px solid ${C.border}`, textAlign: "right",
                                color: p.did_work ? C.textB : C.text }}>
                                <td style={{ textAlign: "left", padding: "5px 6px", fontWeight: 700, color: ACCENT }}>
                                  P{i + 1}{!p.did_work && <span style={{ color: C.text, fontWeight: 400 }}> · idle</span>}
                                </td>
                                <td style={{ padding: "5px 6px", fontVariantNumeric: "tabular-nums" }}>{p.danglers_resolved ?? 0}</td>
                                <td style={{ padding: "5px 6px", fontVariantNumeric: "tabular-nums" }}>{p.orphans_connected ?? 0}</td>
                                <td style={{ padding: "5px 6px", fontVariantNumeric: "tabular-nums" }}>{p.themes_promoted ?? 0}</td>
                                <td style={{ padding: "5px 6px", color: C.neon, fontVariantNumeric: "tabular-nums" }}>+{p.neurons_added ?? 0}</td>
                                <td style={{ padding: "5px 6px", color: C.blue, fontVariantNumeric: "tabular-nums" }}>+{p.synapses_added ?? 0}</td>
                                <td style={{ padding: "5px 6px", fontVariantNumeric: "tabular-nums" }}>
                                  {p.score_before ?? "?"}→{p.score_after ?? "?"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </PanelCard>

                  {/* Cumulative growth chart */}
                  <PanelCard title="CUMULATIVE GROWTH" accent={C.blue}>
                    {passSeries.length === 0 ? (
                      <div style={{ fontSize: 9, color: C.text }}>No data to chart.</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={passSeries} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
                          <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                          <XAxis dataKey="pass" stroke={C.text} tick={{ fill: C.text, fontSize: 9 }} />
                          <YAxis stroke={C.text} tick={{ fill: C.text, fontSize: 9 }} allowDecimals={false} />
                          <Tooltip
                            contentStyle={{ background: "rgba(4,10,18,0.95)", border: `1px solid ${C.border}`,
                              borderRadius: 5, fontSize: 10, color: C.textB }}
                            labelStyle={{ color: C.textB }}
                          />
                          <Line type="monotone" dataKey="neurons" stroke={C.neon} strokeWidth={2}
                            dot={{ r: 3, fill: C.neon }} name="neurons (cum)" />
                          <Line type="monotone" dataKey="synapses" stroke={C.blue} strokeWidth={2}
                            dot={{ r: 3, fill: C.blue }} name="synapses (cum)" />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                    <div style={{ marginTop: 8, fontSize: 8, color: C.text }}>
                      Cumulative real neurons (green) & synapses (blue) added per pass. Flatlining = convergence.
                    </div>
                  </PanelCard>
                </Grid>
              </div>
            )}
          </>
        )}
      </DataState>
    </PageShell>
  );
}
