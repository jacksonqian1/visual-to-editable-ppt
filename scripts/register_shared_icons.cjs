#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const {
  DEFAULT_STORE_ROOT,
  ICON_CATEGORIES,
  ensureSharedIconStore,
  readJson,
  rebuildSharedIconIndex,
  writeJson
} = require("./shared_icon_store.cjs");

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function slug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "") || "default";
}

function kebab(value) {
  return String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function filesFrom(source) {
  const stats = fs.statSync(source);
  if (stats.isFile()) return [source];
  return fs.readdirSync(source, { withFileTypes: true })
    .filter((entry) => entry.isFile() && [".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(source, entry.name));
}

function semanticMap(reportPath) {
  if (!reportPath) return new Map();
  const report = readJson(reportPath, {});
  const map = new Map();
  const items = report.decisions || report.matches || [];
  for (const decision of items) {
    const selected = decision.selected
      || decision.output
      || decision.best?.relative_path
      || decision.best?.name
      || decision.id;
    const key = kebab(selected);
    const current = map.get(key) || {
      semantics: new Set(),
      roles: new Set(),
      scores: []
    };
    const semantic = decision.semantic || decision.query;
    if (semantic) current.semantics.add(String(semantic));
    if (decision.role) current.roles.add(String(decision.role));
    const score = decision.score ?? decision.best?.score;
    if (Number.isFinite(Number(score))) current.scores.push(Number(score));
    map.set(key, current);
  }
  return map;
}

function inferKind(fileName, roles) {
  const value = `${fileName} ${[...roles].join(" ")}`.toLowerCase();
  if (roles.has("semantic-icon")) return "icon";
  if (roles.has("connector-asset")) return "arrow";
  if (/(arrow|chevron|connector)/.test(value)) return "arrow";
  if (/(line|divider|separator)/.test(value)) return "line";
  return "icon";
}

function mergeMetadata(existing, next) {
  const unique = (values) => [...new Set(values.filter(Boolean).map(String))];
  return {
    ...existing,
    ...next,
    tags: unique([...(existing.tags || []), ...(next.tags || [])]),
    aliases: unique([...(existing.aliases || []), ...(next.aliases || [])])
  };
}

function main() {
  const sourceArg = arg("source", "");
  const source = sourceArg ? path.resolve(sourceArg) : "";
  const root = arg("root", DEFAULT_STORE_ROOT);
  const category = arg("category", "generated");
  const collection = slug(arg("collection", "default"));
  const reportArg = arg("report", "");
  const report = reportArg ? path.resolve(reportArg) : "";
  const style = arg("style", "green monochrome outline");
  const sourceType = arg("source-type", "");
  const generator = arg("generator", "");
  const includeUnreferenced = hasFlag("include-unreferenced");
  if (!source || !fs.existsSync(source) || !ICON_CATEGORIES.includes(category)) {
    console.error("Usage: node register_shared_icons.cjs --source /path/to/icons --category generated --collection name [--report semantic-icon-report.json]");
    process.exit(2);
  }

  const paths = ensureSharedIconStore(root);
  const destination = path.join(paths.categories[category], collection);
  fs.mkdirSync(destination, { recursive: true });
  const manifest = readJson(paths.manifest, {
    schema_version: 1,
    default_style: "",
    icons: {}
  });
  const semantics = semanticMap(report);
  const semanticMatch = (stem) => {
    if (semantics.has(stem)) return semantics.get(stem);
    for (const [key, value] of semantics.entries()) {
      if (stem.includes(key) || key.includes(stem)) return value;
    }
    return null;
  };
  const registered = [];

  for (const sourceFile of filesFrom(source)) {
    const stem = path.basename(sourceFile, path.extname(sourceFile));
    const matched = semanticMatch(stem);
    if (report && !matched && !includeUnreferenced) continue;
    const match = matched || { semantics: new Set(), roles: new Set(), scores: [] };
    const destinationFile = path.join(destination, path.basename(sourceFile));
    fs.copyFileSync(sourceFile, destinationFile);
    const relative = path.relative(paths.icons, destinationFile).split(path.sep).join("/");
    const aliases = [...match.semantics];
    const roles = [...match.roles];
    const quality = match.scores.length
      ? Math.min(1, Math.max(...match.scores) / 100)
      : 0.9;
    const format = path.extname(sourceFile).slice(1).toLowerCase();
    const formatClass = format === "svg" ? "vector" : "raster";
    const metadata = {
      name: stem.replaceAll("-", " "),
      tags: [
        category,
        collection,
        formatClass,
        format,
        ...roles,
        ...aliases
      ],
      aliases,
      style,
      kind: inferKind(stem, match.roles),
      source_type: sourceType || (formatClass === "vector"
        ? "semantic-vector-curated"
        : "semantic-raster-generated"),
      asset_format: format,
      ...(generator ? { generator } : {}),
      harvest_status: "registered",
      quality_score: quality,
      collection,
      registered_at: new Date().toISOString()
    };
    manifest.icons[relative] = mergeMetadata(manifest.icons[relative] || {}, metadata);
    registered.push({ source: sourceFile, destination: destinationFile, relative_path: relative, ...metadata });
  }

  writeJson(paths.manifest, manifest);
  const rebuilt = rebuildSharedIconIndex(paths.root);
  console.log(JSON.stringify({
    root: paths.root,
    category,
    collection,
    registered: registered.length,
    total: rebuilt.index.count,
    index: paths.index,
    assets: registered
  }, null, 2));
}

main();
