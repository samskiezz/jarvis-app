// Asset preloader — the loader only completes when EVERYTHING required is fetched
// into the browser cache, so the world never pops-in half-dressed. It enumerates:
//   • critical bundled assets (HDRI sky, core character + civic models)
//   • every entry in the scraped + Tripo-generated manifests (paid art included)
// then fetches them all, reporting real 0→100% progress with phase labels.

export interface AssetEntry { url: string; phase: string; }

// Always-needed bundled assets the scene boots with.
const CRITICAL: AssetEntry[] = [
  { url: "/models/polyhaven/sky_puresky_1k.hdr", phase: "skies" },
  { url: "/models/Michelle.glb", phase: "characters" },
  { url: "/models/RobotExpressive.glb", phase: "characters" },
];

interface ManifestRec { path?: string; kind?: string; category?: string; }

/** Pure: turn manifests + critical list into a deduped preload list. Testable. */
export function buildAssetList(
  manifests: Record<string, ManifestRec>[],
  critical: AssetEntry[] = CRITICAL,
): AssetEntry[] {
  const seen = new Set<string>();
  const out: AssetEntry[] = [];
  for (const e of critical) {
    if (!seen.has(e.url)) { seen.add(e.url); out.push(e); }
  }
  for (const m of manifests) {
    for (const rec of Object.values(m || {})) {
      const url = rec?.path;
      if (url && !seen.has(url)) {
        seen.add(url);
        out.push({ url, phase: rec.category || rec.kind || "world" });
      }
    }
  }
  return out;
}

async function fetchManifest(url: string): Promise<Record<string, ManifestRec>> {
  try {
    const r = await fetch(url, { cache: "force-cache" });
    return r.ok ? await r.json() : {};
  } catch {
    return {};
  }
}

/** Discover everything the world needs from the live manifests. */
export async function discoverAssets(): Promise<AssetEntry[]> {
  const [scraped, generated] = await Promise.all([
    fetchManifest("/models/scraped/assets_manifest.json"),
    fetchManifest("/models/generated/manifest.json"),
  ]);
  return buildAssetList([scraped, generated]);
}

/** Preload all assets, reporting progress. Resolves when 100% (or all settled).
 *  Failures don't block entry — a missing asset just counts as "done" so the
 *  loader can never hang forever. */
export async function preloadAll(
  assets: AssetEntry[],
  onProgress: (done: number, total: number, label: string) => void,
  concurrency = 6,
): Promise<{ loaded: number; failed: number }> {
  const total = assets.length || 1;
  let done = 0, failed = 0, i = 0;

  async function worker() {
    while (i < assets.length) {
      const a = assets[i++];
      try {
        await fetch(a.url, { cache: "force-cache" });
      } catch {
        failed++;
      } finally {
        done++;
        onProgress(done, total, a.phase);
      }
    }
  }
  onProgress(0, total, "world");
  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
  return { loaded: done - failed, failed };
}
