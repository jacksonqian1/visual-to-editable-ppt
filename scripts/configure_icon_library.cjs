#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { loadIconLibrary, publicAsset } = require("./icon_library.cjs");
const {
  DEFAULT_STORE_ROOT,
  ensureSharedIconStore
} = require("./shared_icon_store.cjs");

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function main() {
  const projectArg = arg("project", "");
  const libraryArg = arg("library", "");
  const projectPath = projectArg ? path.resolve(projectArg) : "";
  const sharedStore = ensureSharedIconStore(arg("shared-root", DEFAULT_STORE_ROOT));
  const libraryPath = libraryArg ? path.resolve(libraryArg) : sharedStore.icons;
  const policy = arg("policy", "semantic-first-with-generated-raster-fallback");
  const threshold = Number(arg("threshold", "72"));
  if (!projectPath || !fs.existsSync(projectPath)) {
    console.error("Usage: node configure_icon_library.cjs --project scene.json [--library /path/to/icons] [--shared-root /path/to/store]");
    process.exit(2);
  }

  const project = JSON.parse(fs.readFileSync(projectPath, "utf8"));
  const index = loadIconLibrary(libraryPath);
  const cachePath = path.join(path.dirname(projectPath), "icon-library-index.json");
  const cached = {
    schema_version: 1,
    root: index.root,
    count: index.count,
    icons: index.icons.map(publicAsset)
  };
  fs.writeFileSync(cachePath, `${JSON.stringify(cached, null, 2)}\n`, "utf8");

  project.iconLibrary = {
    root: index.root,
    index: `./${path.basename(cachePath)}`,
    policy,
    autoSelect: true,
    threshold: Number.isFinite(threshold) ? threshold : 72
  };
  project.sharedIconStore = {
    enabled: true,
    root: sharedStore.root,
    icons: sharedStore.icons,
    index: sharedStore.index
  };
  project.status = "draft";
  fs.writeFileSync(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    project: projectPath,
    library: index.root,
    assets: index.count,
    sharedStore: sharedStore.root,
    policy,
    threshold: project.iconLibrary.threshold,
    cache: cachePath
  }, null, 2));
}

main();
