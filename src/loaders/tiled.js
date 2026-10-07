const FLIPPED_HORIZONTALLY = 0x80000000;
const FLIPPED_VERTICALLY = 0x40000000;
const FLIPPED_DIAGONALLY = 0x20000000;
const ROTATED_HEXAGONAL_120 = 0x10000000;
const GID_MASK = ~(FLIPPED_HORIZONTALLY | FLIPPED_VERTICALLY | FLIPPED_DIAGONALLY | ROTATED_HEXAGONAL_120) >>> 0;

function parser() {
  return new DOMParser();
}

function resolveUrl(path, relativeTo = window.location.href) {
  return new URL(path, relativeTo).href;
}

function directoryUrl(path) {
  return new URL(".", resolveUrl(path)).href;
}

function nodeChildren(node, selector) {
  return Array.from(node.querySelectorAll(`:scope > ${selector}`));
}

function classNameOf(node) {
  return node.getAttribute("class") || node.getAttribute("type") || "";
}

function numberAttr(node, name, fallback = 0) {
  const value = node.getAttribute(name);
  return value == null ? fallback : Number(value);
}

function propertiesFrom(node) {
  const properties = {};
  const parent = node.querySelector(":scope > properties");
  if (!parent) return properties;

  for (const property of nodeChildren(parent, "property")) {
    const name = property.getAttribute("name");
    const type = property.getAttribute("type");
    const raw = property.getAttribute("value") ?? property.textContent ?? "";
    if (type === "int" || type === "float") properties[name] = Number(raw);
    else if (type === "bool") properties[name] = raw === "true";
    else properties[name] = raw;
  }

  return properties;
}

function parseCsv(text) {
  return text
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(value => Number(value));
}

function decodeGid(rawValue) {
  const raw = Number(rawValue) >>> 0;
  return {
    gid: (raw & GID_MASK) >>> 0,
    flipH: Boolean(raw & FLIPPED_HORIZONTALLY),
    flipV: Boolean(raw & FLIPPED_VERTICALLY),
    flipD: Boolean(raw & FLIPPED_DIAGONALLY)
  };
}

async function fetchXml(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load TMX/TSX: ${path}`);
  const text = await response.text();
  return parser().parseFromString(text, "application/xml");
}

function parseTileObjectColliders(tileNode) {
  const colliders = [];
  const objectGroup = tileNode.querySelector(":scope > objectgroup");
  if (!objectGroup) return colliders;

  for (const object of nodeChildren(objectGroup, "object")) {
    colliders.push({
      className: classNameOf(object),
      shape: object.querySelector(":scope > ellipse") ? "ellipse" : "rect",
      x: numberAttr(object, "x"),
      y: numberAttr(object, "y"),
      width: numberAttr(object, "width"),
      height: numberAttr(object, "height")
    });
  }
  return colliders;
}

async function parseTileset(firstgid, source, mapUrl) {
  const tilesetUrl = resolveUrl(source, directoryUrl(mapUrl));
  const document = await fetchXml(tilesetUrl);
  const tileset = document.querySelector("tileset");
  const baseUrl = directoryUrl(tilesetUrl);
  const image = tileset.querySelector(":scope > image");
  const result = {
    firstgid,
    name: tileset.getAttribute("name"),
    tileWidth: numberAttr(tileset, "tilewidth", 0),
    tileHeight: numberAttr(tileset, "tileheight", 0),
    tileCount: numberAttr(tileset, "tilecount", 0),
    columns: numberAttr(tileset, "columns", 0),
    properties: propertiesFrom(tileset),
    imagePath: null,
    imageWidth: 0,
    imageHeight: 0,
    tiles: {}
  };

  if (image) {
    result.imagePath = resolveUrl(image.getAttribute("source"), baseUrl);
    result.imageWidth = numberAttr(image, "width");
    result.imageHeight = numberAttr(image, "height");
  }

  for (const tileNode of nodeChildren(tileset, "tile")) {
    const tileImage = tileNode.querySelector(":scope > image");
    const id = numberAttr(tileNode, "id");
    result.tiles[id] = {
      id,
      className: classNameOf(tileNode),
      properties: propertiesFrom(tileNode),
      imagePath: tileImage ? resolveUrl(tileImage.getAttribute("source"), baseUrl) : result.imagePath,
      width: tileImage ? numberAttr(tileImage, "width") : result.tileWidth,
      height: tileImage ? numberAttr(tileImage, "height") : result.tileHeight,
      colliders: parseTileObjectColliders(tileNode)
    };
  }

  return result;
}

function findTilesetForGid(tilesets, gid) {
  let match = null;
  for (const tileset of tilesets) {
    if (gid >= tileset.firstgid) match = tileset;
  }
  return match;
}

function tileForGid(tilesets, gid) {
  const tileset = findTilesetForGid(tilesets, gid);
  if (!tileset) return null;
  const localId = gid - tileset.firstgid;
  return {
    tileset,
    localId,
    tile: tileset.tiles[localId] || null
  };
}

function sortYForObject(y, height, tile, flipV = false) {
  const sourceHeight = tile?.height || height || 0;
  const displayHeight = height || sourceHeight;
  const scaleY = sourceHeight && displayHeight ? displayHeight / sourceHeight : 1;
  const sortOffsetY = tile?.properties?.sortOffsetY;
  if (Number.isFinite(sortOffsetY)) return y + sortOffsetY * scaleY;

  const colliders = tile?.colliders || [];
  if (!colliders.length) return y;

  if (!sourceHeight || !displayHeight) return y;

  const topY = y - displayHeight;
  if (flipV) {
    const colliderTop = Math.min(...colliders.map(collider => collider.y));
    return topY + (sourceHeight - colliderTop) * scaleY;
  }

  const colliderBottom = Math.max(...colliders.map(collider => collider.y + collider.height));
  return topY + colliderBottom * scaleY;
}

function parseTileLayer(layerNode) {
  const data = layerNode.querySelector(":scope > data");
  return {
    id: numberAttr(layerNode, "id"),
    name: layerNode.getAttribute("name"),
    width: numberAttr(layerNode, "width"),
    height: numberAttr(layerNode, "height"),
    properties: propertiesFrom(layerNode),
    data: parseCsv(data?.textContent || "")
  };
}

function parseImageLayer(layerNode, mapUrl) {
  const image = layerNode.querySelector(":scope > image");
  return {
    id: numberAttr(layerNode, "id"),
    name: layerNode.getAttribute("name"),
    opacity: numberAttr(layerNode, "opacity", 1),
    blendMode: layerNode.getAttribute("blendmode") || "source-over",
    offsetX: numberAttr(layerNode, "offsetx"),
    offsetY: numberAttr(layerNode, "offsety"),
    properties: propertiesFrom(layerNode),
    imagePath: image ? resolveUrl(image.getAttribute("source"), directoryUrl(mapUrl)) : null,
    width: image ? numberAttr(image, "width") : 0,
    height: image ? numberAttr(image, "height") : 0
  };
}

function parseObjectLayer(layerNode, tilesets) {
  const objects = [];
  for (const objectNode of nodeChildren(layerNode, "object")) {
    const rawGid = objectNode.getAttribute("gid");
    const decoded = rawGid ? decodeGid(rawGid) : null;
    const tileRef = decoded ? tileForGid(tilesets, decoded.gid) : null;
    const y = numberAttr(objectNode, "y");
    const height = numberAttr(objectNode, "height");
    objects.push({
      id: numberAttr(objectNode, "id"),
      name: objectNode.getAttribute("name") || "",
      className: classNameOf(objectNode),
      x: numberAttr(objectNode, "x"),
      y,
      width: numberAttr(objectNode, "width"),
      height,
      rotation: numberAttr(objectNode, "rotation"),
      shape: objectNode.querySelector(":scope > ellipse") ? "ellipse" : objectNode.querySelector(":scope > point") ? "point" : "rect",
      properties: propertiesFrom(objectNode),
      gid: decoded?.gid || 0,
      flipH: decoded?.flipH || false,
      flipV: decoded?.flipV || false,
      flipD: decoded?.flipD || false,
      tileset: tileRef?.tileset || null,
      tile: tileRef?.tile || null,
      localId: tileRef?.localId ?? null,
      imagePath: tileRef?.tile?.imagePath || null,
      sortY: sortYForObject(y, height, tileRef?.tile, decoded?.flipV || false),
      layerName: layerNode.getAttribute("name")
    });
  }

  return {
    id: numberAttr(layerNode, "id"),
    name: layerNode.getAttribute("name"),
    className: classNameOf(layerNode),
    properties: propertiesFrom(layerNode),
    objects
  };
}

function buildScene(mapNode, mapUrl, tilesets, layers) {
  const properties = propertiesFrom(mapNode);
  const scene = {
    width: properties.designWidth || numberAttr(mapNode, "width") * numberAttr(mapNode, "tilewidth"),
    height: properties.designHeight || numberAttr(mapNode, "height") * numberAttr(mapNode, "tileheight"),
    tileWidth: numberAttr(mapNode, "tilewidth"),
    tileHeight: numberAttr(mapNode, "tileheight"),
    properties,
    tilesets,
    groundLayers: [],
    decalObjects: [],
    propObjects: [],
    colliders: [],
    imageLayers: [],
    playerSpawn: null,
    enemySpawns: [],
    actorSpawns: [],
    cameraBounds: null,
    sourceUrl: resolveUrl(mapUrl)
  };

  for (const layer of layers) {
    if (layer.kind === "tilelayer") {
      scene.groundLayers.push(layer.data);
      continue;
    }

    if (layer.kind === "imagelayer") {
      scene.imageLayers.push(layer.data);
      continue;
    }

    const name = layer.data.name;
    for (const object of layer.data.objects) {
      const explicitActorId = object.properties.actorId || object.properties.configId;
      const actorSpawn =
        object.className === "ActorSpawn" ||
        object.className === "Initial position" ||
        name === "Initial position" ||
        layer.data.className === "Initial position";
      if (actorSpawn && (explicitActorId || object.name)) {
        scene.actorSpawns.push({
          actorId: explicitActorId || object.name,
          x: object.x,
          y: object.y,
          properties: object.properties
        });
      }
    }
    if (name === "Ground decals") scene.decalObjects.push(...layer.data.objects);
    else if (name === "Reusable props") scene.propObjects.push(...layer.data.objects);
    else if (name === "Collision") {
      scene.colliders.push(
        ...layer.data.objects.map(object => ({
          x: object.x,
          y: object.y,
          width: object.width,
          height: object.height,
          shape: object.shape,
          className: object.className,
          name: object.name
        }))
      );
    } else if (name === "Gameplay points") {
      for (const object of layer.data.objects) {
        if (object.className === "PlayerSpawn") scene.playerSpawn = { x: object.x, y: object.y };
        if (object.className === "EnemySpawn") scene.enemySpawns.push({ x: object.x, y: object.y });
        if (object.className === "CameraBounds") {
          scene.cameraBounds = {
            x: object.x,
            y: object.y,
            width: object.width,
            height: object.height
          };
        }
      }
    }
  }

  scene.cameraBounds ||= { x: 0, y: 0, width: scene.width, height: scene.height };
  return scene;
}

export async function loadTiledScene(mapPath) {
  const document = await fetchXml(mapPath);
  const mapNode = document.querySelector("map");
  const tilesetNodes = nodeChildren(mapNode, "tileset");
  const tilesets = await Promise.all(
    tilesetNodes.map(node =>
      parseTileset(numberAttr(node, "firstgid"), node.getAttribute("source"), mapPath)
    )
  );

  const layers = [];
  for (const child of Array.from(mapNode.children)) {
    if (child.tagName === "layer") layers.push({ kind: "tilelayer", data: parseTileLayer(child) });
    if (child.tagName === "objectgroup") layers.push({ kind: "objectgroup", data: parseObjectLayer(child, tilesets) });
    if (child.tagName === "imagelayer") layers.push({ kind: "imagelayer", data: parseImageLayer(child, mapPath) });
  }

  return buildScene(mapNode, mapPath, tilesets, layers);
}
