import archive from '../assets/vanilla-1.20.1.json.gz';
import metadata from '../assets/vanilla-1.20.1.meta.json';
import kitchen from '../assets/farmers-delight.json.gz';
import { gunzipSync } from 'fflate';
import { importMaterials } from './materials.js';

let files;
// Embedded in the single HTML: no CDN, fetch, account or resource-pack selection.
export function vanillaFiles() {
  if (!files) {
    const bytes = Uint8Array.from(atob(archive), (c) => c.charCodeAt(0));
    const addon = Uint8Array.from(atob(kitchen), (c) => c.charCodeAt(0));
    const data = {
      ...JSON.parse(new TextDecoder().decode(gunzipSync(bytes))),
      ...JSON.parse(new TextDecoder().decode(gunzipSync(addon))),
    };
    files = Object.fromEntries(
      Object.entries(data).map(([name, value]) => [
        name,
        Uint8Array.from(atob(value), (c) => c.charCodeAt(0)),
      ]),
    );
  }
  return files;
}

export async function vanillaMaterials(model) {
  const result = await importMaterials(model, vanillaFiles());
  result.source = 'vanilla';
  result.version = metadata.version;
  return result;
}

export async function customMaterials(model, overrides) {
  // A small resource pack can inherit the built-in client's models and textures.
  const result = await importMaterials(model, { ...vanillaFiles(), ...overrides });
  result.source = 'custom';
  result.version = metadata.version;
  return result;
}
