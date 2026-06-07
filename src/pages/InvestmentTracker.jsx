import { useCallback, useEffect, useMemo, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { Investment, WealthSnapshot } from "@/api/entities";
import { getLiveIntel } from "@/api/backendFunctions";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";

const ACCENT = C.gold;
const TARGET = 100_000_000; // $100M target by 2033 (ontology context)

const fmtMoney = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
};

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Holdings are loaded from the Investment entity API.
export default function InvestmentTracker() {
  const [holdings, setHoldings] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ id: null, name: "", symbol: "", type: "crypto", amount: "", value: "" });

  const load = useCallback(async () => {
    setError(null);
    try {
      const [inv, snaps, intel] = await Promise.all([
        Investment.list(),
        WealthSnapshot.list(),
        getLiveIntel({ type: "all" }).catch(() => null),
      ]);
      setHoldings(Array.isArray(inv) ? inv : []);
      setSnapshots(Array.isArray(snaps) ? snaps : []);
      setMarkets(Array.isArray(intel?.markets) ? intel.markets : []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalValue = useMemo(
    () => holdings.reduce((s, h) => s + num(h.value), 0),
    [holdings]
  );

  // 24h change estimated from live market tickers weighted by holding value.
  const change24h = useMemo(() => {
    if (!markets.length || !totalValue) return null;
    let weighted = 0;
    let covered = 0;
    holdings.forEach((h) => {
      const sym = String(h.symbol || h.name || "").toUpperCase();
      const m = markets.find((mk) => String(mk.display || "").toUpperCase().includes(sym));
      if (m && Number.isFinite(Number(m.change_pct))) {
        weighted += num(h.value) * num(m.change_pct);
        covered += num(h.value);
      }
    });
    if (!covered) return null;
    return weighted / covered;
  }, [markets, holdings, totalValue]);

  // Net-worth trend series from WealthSnapshot (fields are loose — try common keys).
  const trend = useMemo(() => {
    const series = snapshots
      .map((s) => ({
        v: num(s.net_worth ?? s.value ?? s.total ?? s.amount),
        t: s.date || s.created_date || s.timestamp || "",
      }))
      .filter((p) => p.v > 0);
    series.sort((a, b) => String(a.t).localeCompare(String(b.t)));
    return series;
  }, [snapshots]);

  const maxTrend = useMemo(() => Math.max(1, ...trend.map((p) => p.v)), [trend]);
  const progressPct = Math.min(100, (totalValue / TARGET) * 100);

  const resetForm = () => setForm({ id: null, name: "", symbol: "", type: "crypto", amount: "", value: "" });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    const payload = {
      name: form.name.trim(),
      symbol: form.symbol.trim().toUpperCase(),
      type: form.type,
      amount: num(form.amount),
      value: num(form.value),
    };
    try {
      if (form.id) await Investment.update(form.id, payload);
      else await Investment.create(payload);
      resetForm();
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const edit = (h) => setForm({
    id: h.id,
    name: h.name || "",
    symbol: h.symbol || "",
    type: h.type || "crypto",
    amount: h.amount ?? "",
    value: h.value ?? "",
  });

  const del = async (id) => {
    setBusy(true);
    try {
      await Investment.remove(id);
      if (form.id === id) resetForm();
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const empty = !loading && !error && holdings.length === 0;

  const inputStyle = {
    background: "rgba(0,0,0,0.4)", border: `1px solid ${C.border}`, color: C.textB,
    fontFamily: "inherit", fontSize: 10, padding: "6px 8px", borderRadius: 4,
  };
  const btnStyle = (col) => ({
    background: col + "1a", border: `1px solid ${col}55`, color: col,
    fontFamily: "inherit", fontSize: 9, letterSpacing: 1, padding: "5px 10px",
    borderRadius: 4, cursor: "pointer", fontWeight: 700,
  });

  return (
    <PageShell
      title="INVESTMENT TRACKER"
      subtitle="PORTFOLIO · LIVE MARKETS · NET-WORTH TRAJECTORY → $100M / 2033"
      accent={ACCENT}
      actions={
        <button onClick={load} style={btnStyle(ACCENT)}>↻ REFRESH</button>
      }
    >
      <Grid min={180} style={{ marginBottom: 14 }}>
        <StatTile label="Portfolio Value" value={fmtMoney(totalValue)} accent={ACCENT} sub={`${holdings.length} holdings`} />
        <StatTile
          label="24h Change"
          value={change24h == null ? "—" : `${change24h >= 0 ? "+" : ""}${change24h.toFixed(2)}%`}
          accent={change24h == null ? C.text : change24h >= 0 ? C.neon : C.red}
          sub="weighted by live tickers"
        />
        <StatTile label="$100M Target" value={`${progressPct.toFixed(progressPct < 1 ? 2 : 1)}%`} accent={C.purple} sub="by 2033" />
        <StatTile label="Snapshots" value={trend.length} accent={C.blue} sub="net-worth points" />
      </Grid>

      {/* Live market tiles */}
      <PanelCard title="LIVE MARKETS" accent={ACCENT} style={{ marginBottom: 14 }}>
        <DataState loading={loading && !markets.length} error={null} empty={!loading && markets.length === 0} emptyLabel="No live tickers.">
          <Grid min={150}>
            {markets.map((m, i) => {
              const up = num(m.change_pct) >= 0;
              return (
                <div key={m.display || i} style={{
                  background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`, borderRadius: 5, padding: "10px 12px",
                }}>
                  <div style={{ fontSize: 9, letterSpacing: 1, color: C.text }}>{m.display}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: ACCENT, marginTop: 3 }}>
                    {Number.isFinite(Number(m.price)) ? Number(m.price).toLocaleString(undefined, { maximumFractionDigits: 4 }) : "—"}
                  </div>
                  <div style={{ fontSize: 9, marginTop: 2, color: up ? C.neon : C.red }}>
                    {up ? "▲" : "▼"} {Math.abs(num(m.change_pct)).toFixed(2)}%
                  </div>
                </div>
              );
            })}
          </Grid>
        </DataState>
      </PanelCard>

      {/* Target progress bar */}
      <PanelCard title="TARGET PROGRESS · $100M BY 2033" accent={C.purple} style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, height: 18, background: "rgba(0,0,0,0.4)", border: `1px solid ${C.border}`, borderRadius: 4, overflow: "hidden" }}>
            <div style={{
              width: `${Math.max(progressPct, 0.4)}%`, height: "100%",
              background: `linear-gradient(90deg, ${C.purple}, ${ACCENT})`,
              transition: "width 0.6s ease",
            }} />
          </div>
          <span style={{ fontSize: 11, color: ACCENT, fontWeight: 700, minWidth: 120, textAlign: "right" }}>
            {fmtMoney(totalValue)} / {fmtMoney(TARGET)}
          </span>
        </div>
      </PanelCard>

      <Grid min={320} gap={14}>
        {/* Holdings table + CRUD */}
        <PanelCard
          title="HOLDINGS"
          accent={ACCENT}
          right={null}
        >
          <DataState loading={loading} error={error} empty={empty} emptyLabel="No holdings found.">
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <thead>
                  <tr style={{ color: C.text, textAlign: "left" }}>
                    <th style={{ padding: "4px 6px" }}>NAME</th>
                    <th style={{ padding: "4px 6px" }}>SYM</th>
                    <th style={{ padding: "4px 6px" }}>TYPE</th>
                    <th style={{ padding: "4px 6px", textAlign: "right" }}>AMOUNT</th>
                    <th style={{ padding: "4px 6px", textAlign: "right" }}>VALUE</th>
                    <th style={{ padding: "4px 6px", textAlign: "right" }} />
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => (
                    <tr key={h.id} style={{ borderTop: `1px solid ${C.border}`, color: C.textB }}>
                      <td style={{ padding: "6px 6px" }}>{h.name}</td>
                      <td style={{ padding: "6px 6px" }}><Badge color={ACCENT}>{h.symbol || "—"}</Badge></td>
                      <td style={{ padding: "6px 6px", color: C.text }}>{h.type || "—"}</td>
                      <td style={{ padding: "6px 6px", textAlign: "right" }}>{num(h.amount).toLocaleString()}</td>
                      <td style={{ padding: "6px 6px", textAlign: "right", color: ACCENT }}>{fmtMoney(h.value)}</td>
                      <td style={{ padding: "6px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <button onClick={() => edit(h)} disabled={busy} style={{ ...btnStyle(C.blue), marginRight: 4 }}>EDIT</button>
                        <button onClick={() => del(h.id)} disabled={busy} style={btnStyle(C.red)}>DEL</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DataState>

          {/* Add / edit form */}
          <form onSubmit={submit} style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
            <input style={{ ...inputStyle, flex: "1 1 120px" }} placeholder="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input style={{ ...inputStyle, width: 70 }} placeholder="sym" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} />
            <select style={{ ...inputStyle, width: 90 }} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="crypto">crypto</option>
              <option value="equity">equity</option>
              <option value="business">business</option>
              <option value="property">property</option>
              <option value="cash">cash</option>
            </select>
            <input style={{ ...inputStyle, width: 80 }} placeholder="amount" type="number" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <input style={{ ...inputStyle, width: 90 }} placeholder="value $" type="number" step="any" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            <button type="submit" disabled={busy || !form.name.trim()} style={btnStyle(ACCENT)}>{form.id ? "SAVE" : "+ ADD"}</button>
            {form.id && <button type="button" onClick={resetForm} style={btnStyle(C.text)}>CANCEL</button>}
          </form>
        </PanelCard>

        {/* Net-worth trend bars */}
        <PanelCard title="NET-WORTH TREND" accent={C.blue}>
          <DataState loading={loading} error={error} empty={!loading && trend.length === 0} emptyLabel="No WealthSnapshot records yet.">
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 160, padding: "8px 0" }}>
              {trend.map((p, i) => (
                <div key={i} title={`${p.t}: ${fmtMoney(p.v)}`} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", height: "100%" }}>
                  <div style={{
                    width: "100%",
                    height: `${(p.v / maxTrend) * 100}%`,
                    minHeight: 2,
                    background: `linear-gradient(180deg, ${C.blue}, ${C.blueD})`,
                    border: `1px solid ${C.blue}66`,
                    borderRadius: "3px 3px 0 0",
                  }} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: C.text, marginTop: 4 }}>
              <span>{trend[0]?.t || ""}</span>
              <span>peak {fmtMoney(maxTrend)}</span>
              <span>{trend[trend.length - 1]?.t || ""}</span>
            </div>
          </DataState>
        </PanelCard>
      </Grid>
    </PageShell>
  );
}
