import { describe, it, expect } from 'vitest';
import { PANELS, buildDefaultPanelState } from './registry';

describe('panel registry', () => {
  it('exposes the 11 panels in stable order', () => {
    expect(PANELS.length).toBe(11);
    expect(PANELS.map((p) => p.id)).toEqual([
      'MAP', 'VERTEX', 'RISK', 'EXPLORER', 'TIMELINE',
      'MARKETS', 'EMAILS', 'WATCHLIST', 'ANALYST', 'PANOPTICON', 'CS3D',
    ]);
  });

  it('buildDefaultPanelState produces one entry per panel with sane bounds', () => {
    const state = buildDefaultPanelState(1600);
    expect(Object.keys(state)).toHaveLength(PANELS.length);
    for (const id of Object.keys(state)) {
      const s = state[id];
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeGreaterThanOrEqual(48);
      expect(s.w).toBeGreaterThan(100);
      expect(s.h).toBeGreaterThan(100);
    }
    expect(state.PANOPTICON.visible).toBe(true);
    expect(state.CS3D.visible).toBe(true);
    expect(state.MAP.visible).toBe(true);
  });
});
