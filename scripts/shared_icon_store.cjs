const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { loadIconLibrary } = require("./icon_library.cjs");

const STORE_SCHEMA_VERSION = 1;
const DEFAULT_STORE_ROOT = path.join(
  os.homedir(),
  ".codex",
  "assets",
  "visual-to-editable-ppt"
);
const ICON_CATEGORIES = ["semantic", "connectors", "decorative", "generated"];

function expandHome(inputPath) {
  const value = String(inputPath || "").trim();
  if (!value) return DEFAULT_STORE_ROOT;
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return path.resolve(value);
}

function storePaths(inputRoot) {
  const root = expandHome(inputRoot);
  const icons = path.join(root, "icons");
  return {
    root,
    icons,
    thumbnails: path.join(root, "thumbnails"),
    config: path.join(root, "icon-store.json"),
    index: path.join(icons, "index.json"),
    manifest: path.join(icons, "manifest.json"),
    categories: Object.fromEntries(
      ICON_CATEGORIES.map((category) => [category, path.join(icons, category)])
    )
  };
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function ensureSharedIconStore(inputRoot) {
  const paths = storePaths(inputRoot);
  fs.mkdirSync(paths.icons, { recursive: true });
  fs.mkdirSync(paths.thumbnails, { recursive: true });
  for (const directory of Object.values(paths.categories)) {
    fs.mkdirSync(directory, { recursive: true });
  }
  if (!fs.existsSync(paths.manifest)) {
    writeJson(paths.manifest, {
      schema_version: STORE_SCHEMA_VERSION,
      default_style: "",
      icons: {}
    });
  }
  if (!fs.existsSync(paths.index)) {
    writeJson(paths.index, {
      schema_version: STORE_SCHEMA_VERSION,
      root: paths.icons,
      count: 0,
      icons: []
    });
  }
  if (!fs.existsSync(paths.config)) {
    writeJson(paths.config, {
      schema_version: STORE_SCHEMA_VERSION,
      root: paths.root,
      icon_root: paths.icons,
      thumbnail_root: paths.thumbnails,
      categories: ICON_CATEGORIES,
      count: 0
    });
  }
  return paths;
}

function indexAsset(asset) {
  return {
    relative_path: asset.relative_path,
    name: asset.name,
    tags: asset.tags,
    aliases: asset.aliases,
    style: asset.style,
    kind: asset.kind,
    source_type: asset.source_type,
    harvest_status: asset.harvest_status,
    quality_score: asset.quality_score,
    description: asset.description
  };
}

function rebuildSharedIconIndex(inputRoot) {
  const paths = ensureSharedIconStore(inputRoot);
  const loaded = loadIconLibrary(paths.icons);
  const index = {
    schema_version: STORE_SCHEMA_VERSION,
    root: paths.icons,
    count: loaded.count,
    icons: loaded.icons.map(indexAsset)
  };
  writeJson(paths.index, index);
  const config = {
    ...readJson(paths.config, {}),
    schema_version: STORE_SCHEMA_VERSION,
    root: paths.root,
    icon_root: paths.icons,
    thumbnail_root: paths.thumbnails,
    categories: ICON_CATEGORIES,
    count: loaded.count,
    updated_at: new Date().toISOString()
  };
  writeJson(paths.config, config);
  return { paths, index, config };
}

module.exports = {
  DEFAULT_STORE_ROOT,
  ICON_CATEGORIES,
  ensureSharedIconStore,
  expandHome,
  readJson,
  rebuildSharedIconIndex,
  storePaths,
  writeJson
};
