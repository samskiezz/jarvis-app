// Generated GLB assets — populated by `python underworld/scripts/generate_glb.py`.
// The script writes /public/models/generated/manifest.json after each new
// asset; this module loads it at scene-mount time so the asset list is
// available without a rebuild.
//
// Every entry is a URL under /models/generated/. Three.js's useGLTF caches
// them by URL so duplicates across components are cheap.

export interface GeneratedAsset {
  slug: string;
  prompt: string;
  glb: string;
  provider: string;
  generated_at: string;
  size_bytes: number;
}

export async function loadGeneratedManifest(): Promise<GeneratedAsset[]> {
  try {
    const res = await fetch("/models/generated/manifest.json");
    if (!res.ok) return [];
    const data: Record<string, Omit<GeneratedAsset, "slug">> = await res.json();
    return Object.entries(data).map(([slug, entry]) => ({ slug, ...entry }));
  } catch {
    return [];
  }
}
