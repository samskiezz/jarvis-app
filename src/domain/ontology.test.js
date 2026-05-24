import { describe, it, expect } from 'vitest';
import { OBJECTS, LINKS, findObjectById, getNeighborIds, getLinkCount } from './ontology';

describe('ontology', () => {
  it('has the seeded objects', () => {
    expect(OBJECTS.length).toBeGreaterThanOrEqual(14);
    expect(findObjectById('sam')?.label).toBe('Sam Kazangas');
    expect(findObjectById('does-not-exist')).toBeNull();
  });

  it('LINKS only reference real ids', () => {
    const ids = new Set(OBJECTS.map((o) => o.id));
    LINKS.forEach((l) => {
      expect(ids.has(l.a)).toBe(true);
      expect(ids.has(l.b)).toBe(true);
    });
  });

  it('getNeighborIds returns the entity plus its connected ids', () => {
    const neighbors = getNeighborIds('sam');
    expect(neighbors.has('sam')).toBe(true);
    expect(neighbors.has('psg')).toBe(true);
    expect(neighbors.has('harrison')).toBe(true);
  });

  it('getLinkCount counts both endpoints of every LINK', () => {
    const samLinks = getLinkCount('sam');
    const manual = LINKS.filter((l) => l.a === 'sam' || l.b === 'sam').length;
    expect(samLinks).toBe(manual);
    expect(samLinks).toBeGreaterThan(0);
  });
});
