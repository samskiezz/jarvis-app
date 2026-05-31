/**
 * GameLeaderboard — ranked players / agents.
 *
 * Players are sourced from Contact entities when present; otherwise a seeded
 * sample leaderboard is shown with a "seed sample" affordance. The table is
 * sortable by any numeric column and the top three rows are highlighted.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { Contact } from "@/api/entities";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";

const ACCENT = C.red;

const SAMPLE = [
  { name: "Reaper", score: 4820, wins: 142, losses: 31, delta: 2 },
  { name: "Nyx", score: 4610, wins: 128, losses: 40, delta: -1 },
  { name: "Vortex", score: 4395, wins: 119, losses: 44, delta: 1 },
  { name: "Specter", score: 4180, wins: 110, losses: 52, delta: 0 },
  { name: "Halcyon", score: 3990, wins: 101, losses: 58, delta: 3 },
  { name: "Cinder", score: 3720, wins: 94, losses: 61, delta: -2 },
  { name: "Quasar", score: 3510, wins: 88, losses: 66, delta: 0 },
  { name: "Onyx", score: 3290, wins: 80, losses: 71, delta: 1 },
];

// Derive a deterministic stat block from an arbitrary contact so the leaderboard
// is meaningful even when Contact records carry no game stats.
function contactToPlayer(c, idx) {
  const name = c.name || c.full_name || c.email || `Agent ${idx + 1}`;
  let seed = 0;
  for (let i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) % 100000;
  return {
    name,
    score: Number(c.score ?? 2000 + (seed % 3000)),
    wins: Number(c.wins ?? 40 + (seed % 110)),
    losses: Number(c.losses ?? 20 + (seed % 70)),
    delta: Number(c.rank_delta ?? ((seed % 7) - 3)),
  };
}

const COLUMNS = [
  { key: "score", label: "SCORE" },
  { key: "wins", label: "WINS" },
  { key: "losses", label: "LOSSES" },
  { key: "winrate", label: "WIN%" },
  { key: "delta", label: "Δ RANK" },
];

export default function GameLeaderboard() {
  const [players, setPlayers] = useState([]);
  const [usingSample, setUsingSample] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortKey, setSortKey] = useState("score");
  const [sortDir, setSortDir] = useState("desc");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await Contact.list();
      const arr = Array.isArray(rows) ? rows : [];
      if (arr.length) {
        setPlayers(arr.map(contactToPlayer));
        setUsingSample(false);
      } else {
        setPlayers([]);
        setUsingSample(false);
      }
    } catch (e) {
      setError(e);
      setPlayers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const seed = () => { setPlayers(SAMPLE.map((p) => ({ ...p }))); setUsingSample(true); setError(null); };

  const withRate = useMemo(
    () => players.map((p) => ({ ...p, winrate: p.wins + p.losses > 0 ? Math.round((p.wins / (p.wins + p.losses)) * 100) : 0 })),
    [players],
  );

  const sorted = useMemo(() => {
    const arr = [...withRate];
    arr.sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return arr;
  }, [withRate, sortKey, sortDir]);

  const setSort = (key) => {
    if (key === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const topScore = sorted.length ? Math.max(...sorted.map((p) => p.score)) : 0;
  const avgWinrate = withRate.length ? Math.round(withRate.reduce((s, p) => s + p.winrate, 0) / withRate.length) : 0;
  const rankColor = (i) => (i === 0 ? C.gold : i === 1 ? "#c0c8d0" : i === 2 ? C.orange : C.text);

  return (
    <PageShell
      title="GAME LEADERBOARD"
      subtitle="RANKED AGENTS · SCORE · WINS · RANK DELTA"
      accent={ACCENT}
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={seed}
            style={{
              background: "rgba(0,0,0,0.4)", border: `1px solid ${C.border}`, color: C.gold,
              fontFamily: "inherit", fontSize: 10, letterSpacing: 1, padding: "7px 12px",
              borderRadius: 5, cursor: "pointer", fontWeight: 700,
            }}
          >⚑ SEED SAMPLE</button>
          <button
            onClick={load}
            disabled={loading}
            style={{
              background: ACCENT + "1a", border: `1px solid ${ACCENT}55`, color: ACCENT,
              fontFamily: "inherit", fontSize: 10, letterSpacing: 2, padding: "7px 14px",
              borderRadius: 5, cursor: loading ? "wait" : "pointer", fontWeight: 700,
            }}
          >{loading ? "◌ SYNC" : "↻ REFRESH"}</button>
        </div>
      }
    >
      <Grid min={170} style={{ marginBottom: 14 }}>
        <StatTile label="Players" value={sorted.length} accent={ACCENT} />
        <StatTile label="Top Score" value={topScore.toLocaleString()} accent={C.gold} />
        <StatTile label="Avg Win Rate" value={`${avgWinrate}%`} accent={C.neon} />
        <StatTile label="Leader" value={sorted[0]?.name || "—"} accent={C.blue} />
      </Grid>

      <PanelCard title="RANKINGS" accent={ACCENT} right={<Badge color={ACCENT}>{sorted.length}</Badge>}>
        <DataState
          loading={loading}
          error={error}
          empty={sorted.length === 0}
          emptyLabel="No Contact records — click SEED SAMPLE to populate a demo leaderboard."
        >
          {usingSample && (
            <div style={{ fontSize: 8, color: C.gold, marginBottom: 8 }}>Showing seeded sample leaderboard.</div>
          )}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
              <thead>
                <tr style={{ color: C.text, textAlign: "left" }}>
                  <th style={{ padding: "6px 8px", fontSize: 8, letterSpacing: 1 }}>#</th>
                  <th style={{ padding: "6px 8px", fontSize: 8, letterSpacing: 1 }}>PLAYER</th>
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => setSort(col.key)}
                      style={{ padding: "6px 8px", fontSize: 8, letterSpacing: 1, cursor: "pointer", color: sortKey === col.key ? ACCENT : C.text, textAlign: "right" }}
                    >
                      {col.label}{sortKey === col.key ? (sortDir === "desc" ? " ▾" : " ▴") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, i) => {
                  const top3 = i < 3;
                  return (
                    <tr
                      key={p.name + i}
                      style={{
                        borderTop: `1px solid ${C.border}`,
                        background: top3 ? rankColor(i) + "12" : "transparent",
                      }}
                    >
                      <td style={{ padding: "7px 8px", fontWeight: 700, color: rankColor(i) }}>{i + 1}</td>
                      <td style={{ padding: "7px 8px", color: C.textB, fontWeight: top3 ? 700 : 400 }}>
                        {top3 ? "★ " : ""}{p.name}
                      </td>
                      <td style={{ padding: "7px 8px", textAlign: "right", color: C.gold, fontWeight: 700 }}>{p.score.toLocaleString()}</td>
                      <td style={{ padding: "7px 8px", textAlign: "right", color: C.neon }}>{p.wins}</td>
                      <td style={{ padding: "7px 8px", textAlign: "right", color: C.text }}>{p.losses}</td>
                      <td style={{ padding: "7px 8px", textAlign: "right", color: C.blue }}>{p.winrate}%</td>
                      <td style={{ padding: "7px 8px", textAlign: "right", color: p.delta > 0 ? C.neon : p.delta < 0 ? C.red : C.text }}>
                        {p.delta > 0 ? `▲ ${p.delta}` : p.delta < 0 ? `▼ ${Math.abs(p.delta)}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </DataState>
      </PanelCard>
    </PageShell>
  );
}
