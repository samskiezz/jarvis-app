
import { create } from 'zustand';
import type { PlaneName, VisualNode, VisualEdge } from '../contracts/types';

type OperatorState = {
  plane: PlaneName;
  selectedNodeId: string | null;
  hoverNodeId: string | null;
  nodes: VisualNode[];
  edges: VisualEdge[];
  setPlane: (plane: PlaneName) => void;
  setGraph: (nodes: VisualNode[], edges: VisualEdge[]) => void;
  selectNode: (id: string | null) => void;
  hoverNode: (id: string | null) => void;
};

export const useOperatorStore = create<OperatorState>((set) => ({
  plane: 'Foundry',
  selectedNodeId: null,
  hoverNodeId: null,
  nodes: [],
  edges: [],
  setPlane: (plane) => set({ plane, selectedNodeId: null }),
  setGraph: (nodes, edges) => set({ nodes, edges }),
  selectNode: (id) => set({ selectedNodeId: id }),
  hoverNode: (id) => set({ hoverNodeId: id }),
}));
