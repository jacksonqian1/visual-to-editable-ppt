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

function main() {
  const args = parseArgs(process.argv);
  const input = path.resolve(args.input || "");
  const output = path.resolve(args.output || input);
  const panelId = args["panel-id"];
  const bandId = args["band-id"];
  const edge = String(args.edge || "").toLowerCase();
  if (!input || !fs.existsSync(input) || !panelId || !bandId || !["left", "right", "top", "bottom"].includes(edge)) {
    throw new Error(
      "Usage: configure_panel_band_intersection.cjs --input scene.json " +
      "--panel-id panel --band-id band --edge left|right|top|bottom [--output scene.json]"
    );
  }

  const scene = JSON.parse(fs.readFileSync(input, "utf8"));
  const panel = scene.elements.find((element) => element.id === panelId);
  const band = scene.elements.find((element) => element.id === bandId);
  if (!panel || panel.type !== "roundRect") throw new Error(`Panel "${panelId}" must be a roundRect`);
  if (!band || !["rect", "roundRect"].includes(band.type)) {
    throw new Error(`Band "${bandId}" must be a rect or roundRect`);
  }

  const group = `${panelId}-${edge}-band-clip`;
  const maskId = `${bandId}-rounded-mask`;
  const borderId = `${panelId}-border-overlay`;
  const existingBorder = scene.elements.find((element) => element.id === borderId);
  const visibleStroke = (element) => {
    if (!element) return false;
    const stroke = String(element.stroke || "").trim().toLowerCase();
    return Number(element.strokeWidth) > 0
      && !["", "none", "transparent"].includes(stroke);
  };
  const strokeOwner = visibleStroke(existingBorder)
    ? existingBorder
    : visibleStroke(panel)
      ? panel
      : null;
  const panelStroke = strokeOwner?.stroke || "transparent";
  const panelStrokeWidth = strokeOwner ? Number(strokeOwner.strokeWidth) || 0 : 0;
  scene.elements = scene.elements.filter((element) => ![maskId, borderId].includes(element.id));

  if (edge === "left" || edge === "right") {
    band.y = panel.y;
    band.height = panel.height;
    band.x = edge === "left" ? panel.x : panel.x + panel.width - band.width;
  } else {
    band.x = panel.x;
    band.width = panel.width;
    band.y = edge === "top" ? panel.y : panel.y + panel.height - band.height;
  }

  band.type = "rect";
  const bandBaseName = band.bandIntersectionOriginalName
    || String(band.name || band.id).replace(/(?: \((?:left|right|top|bottom) clipped band\))+$/i, "");
  band.bandIntersectionOriginalName = bandBaseName;
  band.name = `${bandBaseName} (${edge} clipped band)`;
  band.mergeGroup = group;
  band.mergeOperation = "intersect";
  band.autoMerge = false;
  band.stroke = "transparent";
  band.strokeWidth = 0;
  delete band.radius;
  delete band.radiusTopLeft;
  delete band.radiusTopRight;
  delete band.radiusBottomRight;
  delete band.radiusBottomLeft;

  const bandZ = Number(band.z) || Number(panel.z) + 1;
  panel.forceCustomGeometry = true;
  panel.stroke = "transparent";
  panel.strokeWidth = 0;
  scene.elements.push({
    id: maskId,
    name: `${panel.name || panel.id} rounded clipping mask`,
    type: "roundRect",
    visible: true,
    locked: false,
    z: bandZ + 0.01,
    x: panel.x,
    y: panel.y,
    width: panel.width,
    height: panel.height,
    rotation: Number(panel.rotation) || 0,
    fill: band.fill || "#ffffff",
    stroke: "transparent",
    strokeWidth: 0,
    radiusTopLeft: panel.radiusTopLeft,
    radiusTopRight: panel.radiusTopRight,
    radiusBottomRight: panel.radiusBottomRight,
    radiusBottomLeft: panel.radiusBottomLeft,
    forceCustomGeometry: true,
    mergeGroup: group,
    mergeOperation: "intersect",
    autoMerge: false
  });
  if (panelStrokeWidth > 0) {
    scene.elements.push({
      id: borderId,
      name: `${panel.name || panel.id} ${edge} border overlay`,
      type: "roundRect",
      visible: true,
      locked: false,
      z: bandZ + 0.02,
      x: panel.x,
      y: panel.y,
      width: panel.width,
      height: panel.height,
      rotation: Number(panel.rotation) || 0,
      fill: "transparent",
      stroke: panelStroke,
      strokeWidth: panelStrokeWidth,
      radiusTopLeft: panel.radiusTopLeft,
      radiusTopRight: panel.radiusTopRight,
      radiusBottomRight: panel.radiusBottomRight,
      radiusBottomLeft: panel.radiusBottomLeft,
      forceCustomGeometry: true,
      overlapGroup: group,
      overlapKind: "overlap",
      overlapRole: "foreground"
    });
  }

  scene.metadata = scene.metadata || {};
  const configurations = Array.isArray(scene.metadata.panelBandIntersections)
    ? scene.metadata.panelBandIntersections.filter((item) => item.bandId !== bandId)
    : [];
  configurations.push({
    panelId,
    bandId,
    edge,
    group,
    maskId,
    borderId: panelStrokeWidth > 0 ? borderId : null
  });
  scene.metadata.panelBandIntersections = configurations;

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(scene, null, 2)}\n`);
  console.log(`Configured ${edge} band "${bandId}" against rounded panel "${panelId}"`);
  console.log(output);
}

main();
