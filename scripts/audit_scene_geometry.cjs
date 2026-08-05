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

function near(left, right, tolerance) {
  return Math.abs(Number(left) - Number(right)) <= tolerance;
}

function bounds(element) {
  if (element.type === "line") {
    return {
      x: Math.min(Number(element.x1), Number(element.x2)),
      y: Math.min(Number(element.y1), Number(element.y2)),
      w: Math.abs(Number(element.x2) - Number(element.x1)),
      h: Math.abs(Number(element.y2) - Number(element.y1))
    };
  }
  return {
    x: Number(element.x),
    y: Number(element.y),
    w: Number(element.width),
    h: Number(element.height)
  };
}

function contains(outer, inner, tolerance) {
  return inner.x >= outer.x - tolerance
    && inner.y >= outer.y - tolerance
    && inner.x + inner.w <= outer.x + outer.w + tolerance
    && inner.y + inner.h <= outer.y + outer.h + tolerance;
}

function normalizedStroke(element) {
  return String(element.stroke || "").trim().toLowerCase();
}

function hasVisibleStroke(element) {
  const stroke = normalizedStroke(element);
  return Number(element.strokeWidth) > 0
    && !["", "none", "transparent"].includes(stroke)
    && !/^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/i.test(stroke);
}

function sameBounds(left, right, tolerance) {
  const a = bounds(left);
  const b = bounds(right);
  return near(a.x, b.x, tolerance)
    && near(a.y, b.y, tolerance)
    && near(a.w, b.w, tolerance)
    && near(a.h, b.h, tolerance);
}

function main() {
  const args = parseArgs(process.argv);
  const input = path.resolve(args.input || "");
  const output = args.output ? path.resolve(args.output) : "";
  const tolerance = Math.max(0.1, Number(args.tolerance) || 1);
  if (!input || !fs.existsSync(input)) {
    throw new Error("Usage: audit_scene_geometry.cjs --input scene.json [--output report.json]");
  }

  const scene = JSON.parse(fs.readFileSync(input, "utf8"));
  const visible = scene.elements.filter((element) => element.visible !== false);
  const canvas = scene.canvas;
  const outOfBounds = visible
    .map((element) => ({ element, box: bounds(element) }))
    .filter(({ box }) =>
      box.x < -tolerance
      || box.y < -tolerance
      || box.x + box.w > Number(canvas.width) + tolerance
      || box.y + box.h > Number(canvas.height) + tolerance
    )
    .map(({ element, box }) => ({ id: element.id, type: element.type, ...box }));

  const rounded = visible.filter((element) =>
    element.type === "roundRect"
    && !element.mergeGroup
    && !String(element.id || "").includes("mask")
    && !String(element.id || "").includes("border-overlay")
  );
  const edgeBands = [];
  for (const band of rounded) {
    const bandBox = bounds(band);
    const candidates = rounded
      .filter((panel) => panel.id !== band.id)
      .map((panel) => ({ panel, panelBox: bounds(panel) }))
      .filter(({ panelBox }) => contains(panelBox, bandBox, tolerance))
      .sort((left, right) => left.panelBox.w * left.panelBox.h - right.panelBox.w * right.panelBox.h);
    for (const { panel, panelBox } of candidates) {
      if ((panel.fill || "") === (band.fill || "")) continue;
      let edge = "";
      if (near(bandBox.y, panelBox.y, tolerance) && near(bandBox.h, panelBox.h, tolerance)) {
        if (near(bandBox.x, panelBox.x, tolerance) && bandBox.w < panelBox.w * 0.55) edge = "left";
        else if (near(bandBox.x + bandBox.w, panelBox.x + panelBox.w, tolerance) && bandBox.w < panelBox.w * 0.55) edge = "right";
      } else if (near(bandBox.x, panelBox.x, tolerance) && near(bandBox.w, panelBox.w, tolerance)) {
        if (near(bandBox.y, panelBox.y, tolerance) && bandBox.h < panelBox.h * 0.55) edge = "top";
        else if (near(bandBox.y + bandBox.h, panelBox.y + panelBox.h, tolerance) && bandBox.h < panelBox.h * 0.55) edge = "bottom";
      }
      if (!edge) continue;
      edgeBands.push({
        panelId: panel.id,
        bandId: band.id,
        edge,
        confidence: "high",
        reason: "Different-fill rounded band shares a full outer edge with a larger rounded panel"
      });
      break;
    }
  }

  const exactRoundRectCandidates = rounded
    .filter((element) => !element.forceCustomGeometry)
    .map((element) => ({
      id: element.id,
      radii: [
        element.radiusTopLeft,
        element.radiusTopRight,
        element.radiusBottomRight,
        element.radiusBottomLeft
      ].map((value) => Number(value) || 0)
    }));

  const strokedShapes = visible.filter((element) =>
    ["rect", "roundRect", "ellipse"].includes(element.type)
    && hasVisibleStroke(element)
    && !String(element.id || "").includes("mask")
  );
  const duplicateBorders = [];
  for (let leftIndex = 0; leftIndex < strokedShapes.length; leftIndex += 1) {
    const left = strokedShapes[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < strokedShapes.length; rightIndex += 1) {
      const right = strokedShapes[rightIndex];
      if (!sameBounds(left, right, tolerance)) continue;
      if (normalizedStroke(left) !== normalizedStroke(right)) continue;
      if (!near(left.strokeWidth, right.strokeWidth, tolerance)) continue;
      duplicateBorders.push({
        firstId: left.id,
        secondId: right.id,
        stroke: left.stroke,
        strokeWidth: Number(left.strokeWidth),
        confidence: "high",
        reason: "Same-bounds shapes own the same visible stroke"
      });
    }
  }

  const report = {
    file: input,
    canvas,
    visibleElements: visible.length,
    outOfBounds,
    edgeBands,
    duplicateBorders,
    exactRoundRectCandidates,
    summary: {
      outOfBounds: outOfBounds.length,
      edgeBands: edgeBands.length,
      duplicateBorders: duplicateBorders.length,
      exactRoundRectCandidates: exactRoundRectCandidates.length
    }
  };
  if (output) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify(report, null, 2));
}

main();
