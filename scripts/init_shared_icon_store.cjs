#!/usr/bin/env node
const {
  DEFAULT_STORE_ROOT,
  rebuildSharedIconIndex
} = require("./shared_icon_store.cjs");

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function main() {
  const root = arg("root", DEFAULT_STORE_ROOT);
  const result = rebuildSharedIconIndex(root);
  console.log(JSON.stringify({
    root: result.paths.root,
    icons: result.paths.icons,
    thumbnails: result.paths.thumbnails,
    index: result.paths.index,
    manifest: result.paths.manifest,
    count: result.index.count
  }, null, 2));
}

main();
