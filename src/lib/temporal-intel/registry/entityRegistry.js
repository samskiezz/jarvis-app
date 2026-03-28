function jaccardSimilarity(a, b) {
  const setA = new Set(a.toLowerCase().split(/\W+/));
  const setB = new Set(b.toLowerCase().split(/\W+/));
  const intersection = [...setA].filter((v) => setB.has(v)).length;
  const union = new Set([...setA, ...setB]).size || 1;
  return intersection / union;
}

export class EntityRegistryService {
  constructor({ threshold = 0.85 } = {}) {
    this.threshold = threshold;
    this.entities = new Map();
    this.aliasIndex = new Map();
  }

  upsertEntity({ id, name, type = 'UNKNOWN', aliases = [], attributes = {} }) {
    const canonicalId = id || globalThis.crypto.randomUUID();
    this.entities.set(canonicalId, { id: canonicalId, name, type, aliases: [name, ...aliases], attributes });
    [name, ...aliases].forEach((alias) => this.aliasIndex.set(alias.toLowerCase(), canonicalId));
    return canonicalId;
  }

  resolveMention(mention) {
    const direct = this.aliasIndex.get(mention.toLowerCase());
    if (direct) {
      return { entity_id: direct, confidence: 1 };
    }

    let best = { entity_id: null, confidence: 0 };
    for (const entity of this.entities.values()) {
      for (const alias of entity.aliases) {
        const sim = jaccardSimilarity(mention, alias);
        if (sim > best.confidence) {
          best = { entity_id: entity.id, confidence: sim };
        }
      }
    }

    if (best.confidence >= this.threshold) {
      return best;
    }

    const newId = this.upsertEntity({ name: mention });
    return { entity_id: newId, confidence: 0.6 };
  }

  lookup(entityId) {
    return this.entities.get(entityId) || null;
  }
}
