const SECTORS = ["R", "DR", "D", "DL", "L", "UL", "U", "UR"];

function cloneSlashFrames(frames) {
  return Object.fromEntries(
    Object.entries(frames || {}).map(([frame, value]) => [
      frame,
      {
        pivot: [...value.pivot],
        offset: [...value.offset],
        rotation: value.rotation,
        localFlipX: Boolean(value.localFlipX),
        alpha: value.alpha
      }
    ])
  );
}

function cloneBaseConfig(name, config) {
  return {
    name,
    source: config.source,
    mirror: Boolean(config.mirror),
    vector: { x: config.vector[0], y: config.vector[1] },
    moveAnchor: { x: config.moveAnchor[0], y: config.moveAnchor[1] },
    attackAnchor: { x: config.attackAnchor[0], y: config.attackAnchor[1] },
    attackDisplayScale: config.attackDisplayScale,
    hitOriginOffset: {
      x: config.hitOriginOffset[0],
      y: config.hitOriginOffset[1]
    },
    slashFrames: cloneSlashFrames(config.slashFrames)
  };
}

export function expandDirectionConfigs(rawDirections) {
  const expanded = {};

  for (const [name, config] of Object.entries(rawDirections)) {
    if (!config.mirrorOf) expanded[name] = cloneBaseConfig(name, config);
  }

  for (const [name, config] of Object.entries(rawDirections)) {
    if (!config.mirrorOf) continue;
    const base = expanded[config.mirrorOf];
    if (!base) throw new Error(`Missing mirror base direction: ${config.mirrorOf}`);
    expanded[name] = {
      ...base,
      name,
      source: base.source,
      mirror: true,
      vector: { x: config.vector[0], y: config.vector[1] },
      hitOriginOffset: {
        x: -base.hitOriginOffset.x,
        y: base.hitOriginOffset.y
      },
      slashFrames: cloneSlashFrames(base.slashFrames)
    };
  }

  return expanded;
}

export function resolveDirectionFromVector(x, y, fallback = "D") {
  if (Math.hypot(x, y) < 0.0001) return fallback;
  const index = (Math.round(Math.atan2(y, x) / (Math.PI / 4)) + 8) % 8;
  return SECTORS[index];
}

export function vectorForDirection(directionConfigs, direction) {
  return directionConfigs[direction]?.vector || directionConfigs.D.vector;
}
