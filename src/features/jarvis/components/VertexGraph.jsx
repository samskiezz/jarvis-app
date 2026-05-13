import { LINKS, OBJECTS } from "../data/intel";
import { getVisibleIds } from "../lib/viewModels";

export default function VertexGraph({ selectedObj, focusId, onSelect }) {
  const visibleIds = getVisibleIds(focusId);
  const visibleNodes = OBJECTS.filter((obj) => visibleIds.has(obj.id));

  return (
    <div style={{ padding: 8, color: "#9fb" }}>
      <div style={{ marginBottom: 8 }}>Vertex graph · {visibleNodes.length} visible nodes · {LINKS.length} links</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 }}>
        {visibleNodes.map((node) => (
          <button
            key={node.id}
            onClick={() => onSelect?.(node.id)}
            style={{
              textAlign: "left",
              border: "1px solid #234",
              padding: 6,
              color: "#9fb",
              background: selectedObj === node.id ? "#113" : "#000",
            }}
          >
            {node.label}
          </button>
        ))}
      </div>
    </div>
  );
}
