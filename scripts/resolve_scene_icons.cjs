#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { loadIconLibrary, mimeFor, publicAsset, searchIconLibrary } = require("./icon_library.cjs");

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function directionForLine(element) {
  const dx = Number(element.x2) - Number(element.x1);
  const dy = Number(element.y2) - Number(element.y1);
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  if (horizontal) return dx >= 0 ? "right 向右" : "left 向左";
  return dy >= 0 ? "down 向下" : "up 向上";
}

function queryFor(element) {
  if (element.libraryQuery) return String(element.libraryQuery);
  const parts = [element.name || element.id || ""];
  if (element.type === "line") {
    parts.push(element.endArrow && element.endArrow !== "none" ? "arrow 箭头" : "line 线条");
    parts.push(directionForLine(element));
  }
  return parts.join(" ").trim();
}

function kindFor(element) {
  if (element.type === "line") {
    return element.endArrow && element.endArrow !== "none" ? "arrow" : "line";
  }
  return "icon";
}

function dataUrl(filePath) {
  return `data:${mimeFor(filePath)};base64,${fs.readFileSync(filePath).toString("base64")}`;
}

function applyAsset(element, asset) {
  if (element.type === "line") {
    const x1 = Number(element.x1) || 0;
    const y1 = Number(element.y1) || 0;
    const x2 = Number(element.x2) || 0;
    const y2 = Number(element.y2) || 0;
    const dx = x2 - x1;
    const dy = y2 - y1;
    element.originalLine = {
      x1, y1, x2, y2,
      stroke: element.stroke,
      strokeWidth: element.strokeWidth,
      dash: element.dash,
      startArrow: element.startArrow,
      endArrow: element.endArrow
    };
    element.x = Math.min(x1, x2);
    element.y = Math.min(y1, y2);
    element.width = Math.max(24, Math.abs(dx));
    element.height = Math.max(24, Math.abs(dy));
    element.rotation = 0;
    delete element.x1;
    delete element.y1;
    delete element.x2;
    delete element.y2;
    delete element.stroke;
    delete element.strokeWidth;
    delete element.dash;
    delete element.startArrow;
    delete element.endArrow;
  }
  element.type = "image";
  element.src = dataUrl(asset.path);
  element.fit = "contain";
  element.placeholder = false;
  element.libraryAsset = publicAsset(asset);
  element.libraryQuery = element.libraryQuery || element.name || element.id;
}

function main() {
  const projectArg = arg("project", "");
  const projectPath = projectArg ? path.resolve(projectArg) : "";
  const explicitLibrary = arg("library", "");
  const apply = hasFlag("apply");
  if (!projectPath || !fs.existsSync(projectPath)) {
    console.error("Usage: node resolve_scene_icons.cjs --project scene.json [--library /path/to/icons] [--apply]");
    process.exit(2);
  }

  const project = JSON.parse(fs.readFileSync(projectPath, "utf8"));
  const libraryPath = explicitLibrary || project.iconLibrary?.root;
  if (!libraryPath) throw new Error("No icon library configured");
  const index = loadIconLibrary(libraryPath);
  const threshold = Number(arg("threshold", project.iconLibrary?.threshold ?? 35));
  const report = [];

  for (const element of project.elements || []) {
    if (!["icon", "line"].includes(element.type) && !(element.type === "image" && element.placeholder)) continue;
    const query = queryFor(element);
    const kind = kindFor(element);
    const matches = searchIconLibrary(index, query, { kind, limit: 3 });
    const best = matches[0] || null;
    const accepted = Boolean(best && best.score >= threshold);
    report.push({
      id: element.id,
      name: element.name,
      type: element.type,
      query,
      kind,
      accepted,
      best: best ? publicAsset(best) : null
    });
    if (apply && accepted) applyAsset(element, best);
    else if (apply && !accepted) {
      element.placeholder = true;
      element.libraryQuery = query;
      element.libraryUnmatched = true;
    }
  }

  const reportPath = path.resolve(arg("report", path.join(path.dirname(projectPath), "icon-match-report.json")));
  fs.writeFileSync(reportPath, `${JSON.stringify({
    project: projectPath,
    library: index.root,
    threshold,
    total: report.length,
    accepted: report.filter((item) => item.accepted).length,
    unmatched: report.filter((item) => !item.accepted).length,
    matches: report
  }, null, 2)}\n`, "utf8");

  if (apply) {
    project.status = "draft";
    fs.writeFileSync(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
  }
  console.log(reportPath);
}

main();
