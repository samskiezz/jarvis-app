import { OBJECTS } from "../data/intel";

export default function WatchlistPanel({ selectedObj, onFocus }) {
  return (
    <div style={{ padding: 8, color: "#9fb" }}>
      <div style={{ marginBottom: 8 }}>Watchlist</div>
      {OBJECTS.slice(0, 6).map((item) => (
        <button key={item.id} onClick={() => onFocus?.(item.id)} style={{ display: "block", width: "100%", marginBottom: 4, textAlign: "left", background: selectedObj === item.id ? "#113" : "#000", color: "#9fb", border: "1px solid #234", padding: 6 }}>
          {item.label}
        </button>
      ))}
    </div>
  );
}
