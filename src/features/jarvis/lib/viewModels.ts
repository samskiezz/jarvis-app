import { LINKS, OBJECTS } from "../data/intel";

export const getVisibleIds = (focusId) => {
  if (!focusId) return new Set(OBJECTS.map((o) => o.id));
  const neighbors = new Set([focusId]);
  LINKS.forEach((l) => {
    if (l.a === focusId) neighbors.add(l.b);
    if (l.b === focusId) neighbors.add(l.a);
  });
  return neighbors;
};

export const getObjectLinkCount = (id) =>
  LINKS.filter((l) => l.a === id || l.b === id).length;
