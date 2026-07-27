#!/usr/bin/env node
const path = require("node:path");
const { loadIconLibrary, publicAsset, searchIconLibrary } = require("./icon_library.cjs");
const {
  DEFAULT_STORE_ROOT,
  ensureSharedIconStore
} = require("./shared_icon_store.cjs");

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function main() {
  const libraryArg = arg("library", "");
  const sharedStore = ensureSharedIconStore(arg("shared-root", DEFAULT_STORE_ROOT));
  const libraryPath = libraryArg ? path.resolve(libraryArg) : sharedStore.icons;
  const query = arg("query", "");
  const kind = arg("kind", "");
  const limit = Number(arg("limit", "10"));
  const index = loadIconLibrary(libraryPath);
  const matches = searchIconLibrary(index, query, { kind, limit }).map(publicAsset);
  console.log(JSON.stringify({ query, kind, count: matches.length, matches }, null, 2));
}

main();
