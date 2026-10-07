import { loadJson } from "./assets.js";

export async function loadBossConfig(manifest) {
  const path = manifest.data?.bossConfig;
  if (!path) throw new Error("asset-manifest.json does not declare data.bossConfig");
  const config = await loadJson(path);
  if (config?._meta?.schemaVersion !== 2) {
    throw new Error(`Unsupported boss config schema: ${config?._meta?.schemaVersion}`);
  }
  return config;
}
