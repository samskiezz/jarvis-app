export default function MarketsPanel({ liveData }) {
  const markets = liveData?.markets || [];
  return (
    <div style={{ padding: 8, color: "#9fb" }}>
      <div style={{ marginBottom: 8 }}>Markets</div>
      {markets.length ? markets.map((m, i) => <div key={m.symbol || i}>{m.symbol || m.name}: {m.price ?? "n/a"}</div>) : <div>No market data.</div>}
    </div>
  );
}
