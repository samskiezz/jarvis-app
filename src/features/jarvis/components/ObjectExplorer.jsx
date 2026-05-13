import { OBJECTS } from "../data/intel";

export default function ObjectExplorer({ selectedObj, onSelect }) {
  return (
    <div style={{ padding: 8, overflowY: "auto", height: "100%" }}>
      {OBJECTS.map((obj) => (
        <button key={obj.id} onClick={() => onSelect(obj.id)} style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 4, background: selectedObj === obj.id ? "#113" : "#000", color: "#9fb", border: "1px solid #234", padding: 6 }}>
          {obj.label}
        </button>
      ))}
    </div>
  );
}
