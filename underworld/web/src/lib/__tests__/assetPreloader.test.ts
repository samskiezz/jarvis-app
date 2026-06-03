import { describe, it, expect, vi } from "vitest";
import { buildAssetList, preloadAll, type AssetEntry } from "../assetPreloader";

describe("assetPreloader", () => {
  it("includes critical assets and dedupes", () => {
    const crit: AssetEntry[] = [{ url: "/a.glb", phase: "x" }, { url: "/a.glb", phase: "x" }];
    const list = buildAssetList([], crit);
    expect(list).toHaveLength(1);
    expect(list[0].url).toBe("/a.glb");
  });

  it("flattens manifest records into preload entries", () => {
    const manifest = {
      "tripo:hut": { path: "/models/generated/tripo/hut.glb", category: "building" },
      "polyhaven:sky": { path: "/models/scraped/polyhaven/hdri/sky.hdr", kind: "hdri" },
    };
    const list = buildAssetList([manifest], []);
    const urls = list.map((e) => e.url);
    expect(urls).toContain("/models/generated/tripo/hut.glb");
    expect(urls).toContain("/models/scraped/polyhaven/hdri/sky.hdr");
    expect(list.find((e) => e.url.endsWith("hut.glb"))?.phase).toBe("building");
  });

  it("preloadAll reports 0..100% and never hangs on fetch failure", async () => {
    const g = globalThis as unknown as { fetch: typeof fetch };
    g.fetch = vi.fn().mockRejectedValue(new Error("network")) as unknown as typeof fetch;
    const seen: number[] = [];
    const res = await preloadAll(
      [{ url: "/1.glb", phase: "p" }, { url: "/2.glb", phase: "p" }],
      (done, total) => seen.push(Math.round((done / total) * 100)),
    );
    expect(res.failed).toBe(2);          // both failed
    expect(seen[seen.length - 1]).toBe(100); // still reached 100% (never hangs)
  });
});
