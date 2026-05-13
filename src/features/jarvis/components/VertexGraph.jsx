import { LINKS } from "../data/intel";
import { getVisibleIds } from "../lib/viewModels";

export default function VertexGraph({ selectedObj, focusId }) {
  const visible = getVisibleIds(focusId);
  return <div style={{ padding: 8, color: "#9fb" }}>Vertex graph · {visible.size} visible nodes · {LINKS.length} links · selected {selectedObj || "none"}</div>;
}
