export const defaultAssetSources = {
  quantinium: import.meta.env.VITE_ASSET_SOURCE_QUANTINIUM || '',
  sketchfab: import.meta.env.VITE_ASSET_SOURCE_SKETCHFAB || '',
  polyhaven: import.meta.env.VITE_ASSET_SOURCE_POLYHAVEN || '',
};

export const resolveAssetForUnit = (unit = {}, manifest = {}) => {
  const character = manifest.characters?.default || manifest.characters?.[unit.role] || null;
  const weaponKey = unit.weapon || unit.loadout?.weapon || 'rifle';
  const weapon = manifest.weapons?.[weaponKey] || manifest.weapons?.default || null;
  const vfx = manifest.vfx?.[unit.vfx || 'default'] || null;
  return { character, weapon, vfx };
};

export const resolveMapAsset = (gameKey, mapName, manifest = {}) => {
  const perGame = manifest.games?.[gameKey] || {};
  return perGame.maps?.[mapName] || manifest.maps?.[mapName] || null;
};
