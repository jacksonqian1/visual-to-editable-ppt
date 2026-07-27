#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    args[argv[index].slice(2)] = argv[index + 1];
    index += 1;
  }
  return args;
}

function cross(ax, ay, bx, by) {
  return ax * by - ay * bx;
}

function lineRelation(a, b, epsilon) {
  const rx = a.x2 - a.x1;
  const ry = a.y2 - a.y1;
  const sx = b.x2 - b.x1;
  const sy = b.y2 - b.y1;
  const qpx = b.x1 - a.x1;
  const qpy = b.y1 - a.y1;
  const denominator = cross(rx, ry, sx, sy);
  const scale = Math.max(1, Math.hypot(rx, ry), Math.hypot(sx, sy));
  const tolerance = epsilon * scale;

  if (Math.abs(denominator) <= tolerance) {
    if (Math.abs(cross(qpx, qpy, rx, ry)) > tolerance) return null;
    const rr = rx * rx + ry * ry;
    if (rr <= epsilon * epsilon) return null;
    const t0 = (qpx * rx + qpy * ry) / rr;
    const t1 = t0 + (sx * rx + sy * ry) / rr;
    const overlap = Math.min(1, Math.max(t0, t1)) - Math.max(0, Math.min(t0, t1));
    return overlap > epsilon ? "overlap" : null;
  }

  const t = cross(qpx, qpy, sx, sy) / denominator;
  const u = cross(qpx, qpy, rx, ry) / denominator;
  const endpointMargin = Math.max(epsilon / scale, 0.015);
  return t > endpointMargin && t < 1 - endpointMargin &&
    u > endpointMargin && u < 1 - endpointMargin
    ? "crossing"
    : null;
}

function main() {
  const args = parseArgs(process.argv);
  const input = path.resolve(args.input || "");
  const output = path.resolve(args.output || input);
  const epsilon = Math.max(0.0001, Number(args.epsilon) || 0.5);
  const excludedPrefixes = String(args["exclude-prefix"] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!input || !fs.existsSync(input)) {
    throw new Error("Usage: mark_scene_overlaps.cjs --input /path/scene.json [--output /path/scene.json]");
  }

  const scene = JSON.parse(fs.readFileSync(input, "utf8"));
  scene.elements
    .filter((element) => element.type === "line")
    .forEach((element) => {
      delete element.overlapGroup;
      delete element.overlapKind;
      delete element.overlapRole;
    });
  const lines = scene.elements
    .filter((element) =>
      element.type === "line" &&
      element.visible !== false &&
      element.overlapScan !== false &&
      !excludedPrefixes.some((prefix) => String(element.id || "").startsWith(prefix))
    )
    .map((element, index) => ({ element, index }));
  const parent = lines.map((_, index) => index);
  const kinds = new Map();
  const find = (index) => parent[index] === index ? index : (parent[index] = find(parent[index]));
  const unite = (left, right, kind) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent[b] = a;
    const key = `${Math.min(left, right)}:${Math.max(left, right)}`;
    kinds.set(key, kind);
  };

  for (let left = 0; left < lines.length; left += 1) {
    for (let right = left + 1; right < lines.length; right += 1) {
      const relation = lineRelation(lines[left].element, lines[right].element, epsilon);
      if (relation) unite(left, right, relation);
    }
  }

  const groups = new Map();
  lines.forEach((line, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push({ ...line, lineIndex: index });
  });
  const markedGroups = [...groups.values()]
    .filter((members) => members.length > 1)
    .sort((a, b) => Math.min(...a.map((item) => item.element.y1)) - Math.min(...b.map((item) => item.element.y1)));

  const report = [];
  markedGroups.forEach((members, groupIndex) => {
    const group = `line-cross-${String(groupIndex + 1).padStart(2, "0")}`;
    const memberIndexes = new Set(members.map((item) => item.lineIndex));
    const groupKinds = [...kinds.entries()]
      .filter(([key]) => key.split(":").every((value) => memberIndexes.has(Number(value))))
      .map(([, kind]) => kind);
    const kind = groupKinds.includes("crossing") ? "crossing" : "overlap";
    const sortedByZ = [...members].sort((a, b) => Number(a.element.z || 0) - Number(b.element.z || 0));
    sortedByZ.forEach((member, index) => {
      member.element.overlapGroup = group;
      member.element.overlapKind = kind;
      member.element.overlapRole = index === 0
        ? "background"
        : index === sortedByZ.length - 1
          ? "foreground"
          : "member";
    });
    report.push({
      group,
      kind,
      members: members.map((member) => member.element.id)
    });
  });

  scene.overlapReport = {
    generatedAt: new Date().toISOString(),
    method: "line-interior-crossing-and-collinear-overlap",
    groups: report
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(scene, null, 2)}\n`);
  console.log(`Overlap markers: ${report.length} group(s), ${report.reduce((sum, item) => sum + item.members.length, 0)} line object(s) marked`);
  console.log(output);
}

main();
