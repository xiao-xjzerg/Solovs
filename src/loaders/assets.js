import { expandDirectionConfigs } from "../logic/directions.js";

function encodeAssetUrl(path) {
  return encodeURI(path);
}

function frameName(frame) {
  return String(frame).padStart(2, "0");
}

function framePath(pattern, direction, frame) {
  return pattern
    .replace("{DIR}", direction)
    .replace("{FRAME}", frameName(frame));
}

export async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load JSON: ${path}`);
  return response.json();
}

export async function loadOptionalJson(path) {
  try {
    return await loadJson(path);
  } catch (error) {
    console.warn(error.message);
    return null;
  }
}

export async function loadManifest(path = "assets/asset-manifest.json") {
  const manifest = await loadJson(path);
  manifest.player.directionConfigs = expandDirectionConfigs(manifest.player.directions);
  return manifest;
}

export function loadImage(path, { required = true } = {}) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      const error = new Error(`Failed to load image: ${path}`);
      if (required) reject(error);
      else resolve(null);
    };
    image.src = encodeAssetUrl(path);
  });
}

async function loadPlayerAnimation(manifest, action) {
  const animation = manifest.player.animations[action];
  const framesByDirection = {};
  const jobs = [];

  for (const direction of manifest.player.baseDirections) {
    framesByDirection[direction] = [];
    for (let frame = 0; frame < animation.frameCount; frame++) {
      const path = framePath(animation.path, direction, frame);
      jobs.push(
        loadImage(path, { required: animation.required }).then(image => {
          framesByDirection[direction][frame] = image;
        })
      );
    }
  }

  await Promise.all(jobs);
  return framesByDirection;
}

async function loadSlashImages(manifest) {
  const slash = {};
  const config = manifest.effects.attackSlash;
  const jobs = config.frames.map(frame => {
    const path = config.path.replace("{FRAME}", frameName(frame));
    return loadImage(path, { required: config.required }).then(image => {
      if (image) slash[frame] = image;
    });
  });
  await Promise.all(jobs);
  return slash;
}

async function loadSceneImages(scene) {
  const cache = new Map();
  const paths = new Set();

  for (const tileset of scene.tilesets) {
    if (tileset.imagePath) paths.add(tileset.imagePath);
    for (const tile of Object.values(tileset.tiles || {})) {
      if (tile.imagePath) paths.add(tile.imagePath);
    }
  }

  for (const layer of scene.imageLayers) {
    if (layer.imagePath) paths.add(layer.imagePath);
  }

  const jobs = [...paths].map(path =>
    loadImage(path, { required: true }).then(image => {
      cache.set(path, image);
    })
  );
  await Promise.all(jobs);
  return cache;
}

function looseFrame(image, record) {
  return {
    assetId: record.assetId,
    image,
    sourceWidth: image.width,
    sourceHeight: image.height,
    trimX: 0,
    trimY: 0,
    sx: 0,
    sy: 0,
    sw: image.width,
    sh: image.height
  };
}

async function loadBossAtlas(bossManifest) {
  const metadataPath = bossManifest.atlas?.metadata;
  if (!metadataPath) return null;
  const metadata = await loadOptionalJson(metadataPath);
  if (!metadata?.pages?.length) return null;
  try {
    const pages = await Promise.all(
      metadata.pages.map(page => loadImage(page.image, { required: true }))
    );
    const frames = new Map();
    for (const [assetId, frame] of Object.entries(metadata.frames || {})) {
      const pageImage = pages[frame.page];
      if (!pageImage) continue;
      frames.set(assetId, {
        assetId,
        image: pageImage,
        sourceWidth: frame.sourceSize.width,
        sourceHeight: frame.sourceSize.height,
        trimX: frame.spriteSourceSize.x,
        trimY: frame.spriteSourceSize.y,
        sx: frame.frame.x,
        sy: frame.frame.y,
        sw: frame.frame.width,
        sh: frame.frame.height
      });
    }
    return { metadata, pages, frames };
  } catch (error) {
    console.warn(`Atlas fallback: ${error.message}`);
    return null;
  }
}

function bossFrameRecords(bossManifest) {
  const records = [];
  for (const animation of Object.values(bossManifest.animations || {})) {
    records.push(...(animation.frames || []));
    for (const frames of Object.values(animation.framesByDirection || {})) {
      records.push(...frames);
    }
  }
  return records;
}

async function loadBossImages(manifest) {
  const bosses = {};
  for (const [bossId, bossManifest] of Object.entries(manifest.bosses || {})) {
    let atlas = await loadBossAtlas(bossManifest);
    const records = bossFrameRecords(bossManifest);
    if (atlas && records.some(record => !atlas.frames.has(record.assetId))) {
      console.warn(`Atlas ${bossId} is incomplete; using loose frames`);
      atlas = null;
    }

    const loose = new Map();
    if (!atlas) {
      const uniquePaths = new Set(records.map(record => record.path).filter(Boolean));
      await Promise.all(
        [...uniquePaths].map(path =>
          loadImage(path, { required: true }).then(image => loose.set(path, image))
        )
      );
    }

    const resolveFrame = record => {
      if (atlas) return atlas.frames.get(record.assetId);
      const image = loose.get(record.path);
      return image ? looseFrame(image, record) : null;
    };

    const animations = {};
    for (const [animationId, animation] of Object.entries(bossManifest.animations || {})) {
      const defaultFrames = (animation.frames || []).map(resolveFrame).filter(Boolean);
      const framesByDirection = {};
      for (const [direction, directionRecords] of Object.entries(animation.framesByDirection || {})) {
        framesByDirection[direction] = directionRecords.map(resolveFrame).filter(Boolean);
      }
      animations[animationId] = {
        defaultFrames,
        framesByDirection,
        directions: animation.directions || {},
        action: animation.action,
        directionMode: animation.directionMode,
        displayScale: animation.displayScale || 1
      };
    }

    bosses[bossId] = {
      animations,
      atlas: Boolean(atlas),
      displaySize: bossManifest.displaySize
    };
  }
  return bosses;
}

async function loadVfxImages(manifest) {
  const result = {};
  for (const [vfxId, config] of Object.entries(manifest.vfx || {})) {
    const frames = {};
    await Promise.all(
      (config.frames || []).map(record =>
        loadImage(record.path, { required: config.required }).then(image => {
          if (image) frames[record.index] = image;
        })
      )
    );
    result[vfxId] = { frames, config };
  }
  return result;
}

async function loadProjectileImages(manifest) {
  const result = {};
  await Promise.all(
    Object.entries(manifest.projectiles || {}).map(([projectileId, config]) => {
      if (!config.path) return Promise.resolve();
      return loadImage(config.path, { required: config.required }).then(image => {
        if (image) result[projectileId] = image;
      });
    })
  );
  return result;
}

export async function loadGameImages(manifest, scene) {
  const [move, attack, slash, sceneImages, bosses, vfx, projectiles] = await Promise.all([
    loadPlayerAnimation(manifest, "move"),
    loadPlayerAnimation(manifest, "attack"),
    loadSlashImages(manifest),
    loadSceneImages(scene),
    loadBossImages(manifest),
    loadVfxImages(manifest),
    loadProjectileImages(manifest)
  ]);

  return {
    player: { move, attack },
    slash,
    scene: sceneImages,
    bosses,
    vfx,
    projectiles
  };
}
