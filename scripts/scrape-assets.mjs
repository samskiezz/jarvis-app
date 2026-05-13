import fs from 'node:fs/promises';

const sources = [
  process.env.VITE_ASSET_SOURCE_QUANTINIUM,
  process.env.VITE_ASSET_SOURCE_SKETCHFAB,
  process.env.VITE_ASSET_SOURCE_POLYHAVEN,
].filter(Boolean);

const out = { generatedAt: new Date().toISOString(), games: {}, maps: {}, characters: {}, weapons: {}, vfx: {} };

for (const src of sources) {
  try {
    const res = await fetch(src);
    if (!res.ok) continue;
    const json = await res.json();
    Object.assign(out.games, json.games || {});
    Object.assign(out.maps, json.maps || {});
    Object.assign(out.characters, json.characters || {});
    Object.assign(out.weapons, json.weapons || {});
    Object.assign(out.vfx, json.vfx || {});
  } catch {}
}

await fs.mkdir('public/assets', { recursive: true });
await fs.writeFile('public/assets/runtime-manifest.json', JSON.stringify(out, null, 2));
console.log('runtime-manifest.json generated');
