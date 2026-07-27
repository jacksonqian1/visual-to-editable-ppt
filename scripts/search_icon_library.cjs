#!/usr/bin/env node
const path = require("node:path");
const { loadIconLibrary, publicAsset, searchIconLibrary } = require("./icon_library.cjs");

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function main() {
  const libraryArg = arg("library", "");
  const libraryPath = libraryArg ? path.resolve(libraryArg) : "";
  const query = arg("query", "");
  const kind = arg("kind", "");
  const limit = Number(arg("limit", "10"));
  if (!libraryPath) {
    console.error("Usage: node search_icon_library.cjs --library /path/to/icons --query \"target arrow\"");
    process.exit(2);
  }
  const index = loadIconLibrary(libraryPath);
  const matches = searchIconLibrary(index, query, { kind, limit }).map(publicAsset);
  console.log(JSON.stringify({ query, kind, count: matches.length, matches }, null, 2));
}

main();
