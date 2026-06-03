// Loader + grouping for the account-owned Tripo3D generated GLBs.
//
// The scraper writes a manifest at /models/scraped/assets_manifest.json whose
// keys are `tripo:<asset_id>` and whose values describe each generated asset.
// Here we read that manifest, keep only the Tripo entries that have a real
// `.glb` path, and expose a small, typed shape the scene placer can consume.

export interface GenAsset {
  id: string;
  name: string;
  path: string;
  category: string;
}

const MANIFEST_URL = "/models/scraped/assets_manifest.json";

interface RawEntry {
  path?: string;
  category?: string;
  name?: string;
  asset_id?: string;
  kind?: string;
}

/**
 * Fetch the generated-asset manifest and return the placeable Tripo GLBs.
 * Resilient: returns [] on any network / parse / shape error so a missing or
 * half-written manifest never breaks the scene.
 */
export async function loadGeneratedAssets(): Promise<GenAsset[]> {
  try {
    const res = await fetch(MANIFEST_URL, { cache: "force-cache" });
    if (!res.ok) return [];
    const raw = (await res.json()) as Record<string, RawEntry>;
    if (!raw || typeof raw !== "object") return [];

    const out: GenAsset[] = [];
    for (const [key, entry] of Object.entries(raw)) {
      if (!key.startsWith("tripo:")) continue;
      if (!entry || typeof entry !== "object") continue;
      const path = entry.path;
      if (typeof path !== "string" || !path.toLowerCase().endsWith(".glb")) continue;
      out.push({
        id: entry.asset_id ?? key.slice("tripo:".length),
        name: entry.name ?? entry.asset_id ?? key,
        path,
        category: entry.category ?? "object",
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Bucket assets by their `category` for category-driven placement. */
export function groupByCategory(assets: GenAsset[]): Record<string, GenAsset[]> {
  const out: Record<string, GenAsset[]> = {};
  for (const a of assets) {
    (out[a.category] ??= []).push(a);
  }
  return out;
}
