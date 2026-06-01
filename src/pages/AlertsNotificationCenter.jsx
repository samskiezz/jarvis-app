import { useCallback, useEffect, useMemo, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { RiskSignal } from "@/api/entities";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";

const ACCENT = C.red;

// Severity ordering + colour. RiskSignal severity may be a label or a number.
const SEV_ORDER = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
const sevColor = (s) =>
  ({ CRITICAL: C.red, HIGH: C.orange, MEDIUM: C.gold, LOW: C.neon }[s] || C.text);

const normalizeSev = (sig) => {
  const raw = sig.severity ?? sig.score;
  if (typeof raw === "number") {
    if (raw >= 8) return "CRITICAL";
    if (raw >= 6) return "HIGH";
    if (raw >= 3) return "MEDIUM";
    return "LOW";
  }
  const up = String(raw || "").toUpperCase();
  return SEV_ORDER[up] ? up : "LOW";
};

const LEVELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export default function AlertsNotificationCenter() {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [acked, setAcked] = useState({}); // local-only acknowledge state, by id

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await RiskSignal.list();
      setSignals(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const enriched = useMemo(
    () => signals
      .map((s, i) => ({ ...s, _id: s.id ?? i, _sev: normalizeSev(s) }))
      .sort((a, b) => SEV_ORDER[b._sev] - SEV_ORDER[a._sev]),
    [signals],
  );

  const counts = useMemo(() => {
    const c = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    enriched.forEach((s) => { c[s._sev] += 1; });
    return c;
  }, [enriched]);

  const visible = filter === "ALL" ? enriched : enriched.filter((s) => s._sev === filter);
  const toggleAck = (id) => setAcked((a) => ({ ...a, [id]: !a[id] }));

  return (
    <PageShell
      title="ALERTS & NOTIFICATIONS"
      subtitle="RISK SIGNAL TRIAGE · SEVERITY-SORTED"
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
        {LEVELS.map((lvl) => (
          <StatTile key={lvl} label={lvl} value={counts[lvl]} accent={sevColor(lvl)} sub="open signals" />
        ))}
      </Grid>

      <PanelCard
        title="ALERT QUEUE"
        accent={ACCENT}
        right={
          <div style={{ display: "flex", gap: 5 }}>
            {["ALL", ...LEVELS].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setFilter(lvl)}
                style={{
                  fontSize: 8, letterSpacing: 1, padding: "3px 7px", borderRadius: 3, cursor: "pointer",
                  fontFamily: "inherit", fontWeight: 700,
                  background: filter === lvl ? (lvl === "ALL" ? ACCENT : sevColor(lvl)) + "33" : "transparent",
                  color: filter === lvl ? (lvl === "ALL" ? ACCENT : sevColor(lvl)) : C.text,
                  border: `1px solid ${(filter === lvl ? (lvl === "ALL" ? ACCENT : sevColor(lvl)) : C.text)}44`,
                }}
              >{lvl}</button>
            ))}
          </div>
        }
      >
        <DataState
          loading={loading}
          error={error}
          empty={!loading && enriched.length === 0}
          emptyLabel="No risk signals — all clear."
        >
          {visible.length === 0 ? (
            <div style={{ color: C.text, fontSize: 10, padding: 8 }}>No alerts at {filter} severity.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {visible.map((s) => {
                const col = sevColor(s._sev);
                const isAck = !!acked[s._id];
                return (
                  <div key={s._id} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
                    background: "rgba(0,0,0,0.3)", border: `1px solid ${isAck ? C.border : col + "44"}`,
                    borderRadius: 5, opacity: isAck ? 0.55 : 1,
                  }}>
                    <span style={{ width: 4, alignSelf: "stretch", background: col, borderRadius: 2, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: C.textB, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.label || s.title || s.summary || `Signal ${s._id}`}
                      </div>
                      {(s.detail || s.description || s.entity) && (
                        <div style={{ fontSize: 9, color: C.text, marginTop: 3 }}>
                          {s.detail || s.description || s.entity}
                        </div>
                      )}
                    </div>
                    <Badge color={col}>{s._sev}</Badge>
                    <button
                      onClick={() => toggleAck(s._id)}
                      style={{
                        fontSize: 8, letterSpacing: 1, padding: "4px 9px", borderRadius: 3, cursor: "pointer",
                        fontFamily: "inherit", fontWeight: 700,
                        background: isAck ? C.neon + "22" : "transparent",
                        color: isAck ? C.neon : C.text, border: `1px solid ${(isAck ? C.neon : C.text)}44`,
                      }}
                    >{isAck ? "✓ ACK'D" : "ACK"}</button>
                  </div>
                );
              })}
            </div>
          )}
        </DataState>
      </PanelCard>
    </PageShell>
  );
}
