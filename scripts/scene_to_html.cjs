#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function css(value) {
  return escapeHtml(value);
}

function absoluteSource(src, projectRoot, outputRoot) {
  if (!src || /^data:|^https?:|^file:/.test(src)) return src || "";
  const absolute = path.resolve(projectRoot, src);
  let relative = path.relative(outputRoot, absolute);
  if (!relative.startsWith(".")) relative = `./${relative}`;
  return relative.split(path.sep).join("/");
}

function common(element) {
  const attributes = [
    `data-ppt="${element.type === "image" ? "image" : element.type === "text" || element.type === "icon" ? "text" : "shape"}"`,
    `data-id="${escapeHtml(element.id)}"`,
    `data-name="${escapeHtml(element.name || element.id)}"`
  ];
  if (element.mergeGroup) attributes.push(`data-merge-group="${escapeHtml(element.mergeGroup)}"`);
  if (element.mergeOperation && element.mergeOperation !== "none") {
    attributes.push(`data-merge-operation="${escapeHtml(element.mergeOperation)}"`);
  }
  if (element.autoMerge) attributes.push('data-auto-merge="true"');
  if (element.forceCustomGeometry) attributes.push('data-force-custom-geometry="true"');
  if (element.overlapGroup) {
    attributes.push(`data-overlap-group="${escapeHtml(element.overlapGroup)}"`);
  }
  if (element.overlapKind) {
    attributes.push(`data-overlap-kind="${escapeHtml(element.overlapKind)}"`);
  }
  if (element.overlapRole) {
    attributes.push(`data-overlap-role="${escapeHtml(element.overlapRole)}"`);
  }
  return attributes.join(" ");
}

function boxStyle(element) {
  return [
    `left:${Number(element.x) || 0}px`,
    `top:${Number(element.y) || 0}px`,
    `width:${Math.max(1, Number(element.width) || 1)}px`,
    `height:${Math.max(1, Number(element.height) || 1)}px`,
    `z-index:${Number(element.z) || 0}`,
    `transform:rotate(${Number(element.rotation) || 0}deg)`
  ].join(";");
}

function roundRectRadiusValues(element) {
  const legacy = Number(element.radius);
  const fallback = Math.max(0, Number.isFinite(legacy) ? legacy : 8);
  return [
    element.radiusTopLeft,
    element.radiusTopRight,
    element.radiusBottomRight,
    element.radiusBottomLeft
  ].map((value) => {
    const resolved = Number.isFinite(Number(value)) ? Number(value) : fallback;
    return Math.max(0, resolved);
  });
}

function roundRectRadius(element) {
  return roundRectRadiusValues(element).map((value) => `${value}px`).join(" ");
}

function renderElement(element, projectRoot, outputRoot) {
  if (element.visible === false) return "";
  if (element.type === "text" || element.type === "icon") {
    const content = element.type === "text" ? element.text || "" : element.glyph || "◎";
    const style = [
      boxStyle(element),
      `font-family:${css(element.fontFamily || "PingFang SC")}`,
      `font-size:${Number(element.fontSize) || 16}px`,
      `font-weight:${Number(element.fontWeight) || 400}`,
      `color:${css(element.color || "#111111")}`,
      `text-align:${css(element.align || "left")}`,
      `line-height:${Number(element.lineHeight) || 1.2}`,
      "white-space:pre-wrap",
      "overflow:hidden"
    ].join(";");
    return `<div ${common(element)} data-rotation="${Number(element.rotation) || 0}" style="${style}">${escapeHtml(content)}</div>`;
  }
  if (element.type === "image") {
    const src = absoluteSource(element.src, projectRoot, outputRoot);
    const style = `${boxStyle(element)};object-fit:${css(element.fit || "contain")}`;
    return `<img ${common(element)} data-rotation="${Number(element.rotation) || 0}" src="${escapeHtml(src)}" style="${style}" alt="">`;
  }
  if (element.type === "line") {
    const x1 = Number(element.x1) || 0;
    const y1 = Number(element.y1) || 0;
    const x2 = Number(element.x2) || 0;
    const y2 = Number(element.y2) || 0;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const lineClass = element.endArrow && element.endArrow !== "none" ? "ppt-line has-end-arrow" : "ppt-line";
    return `<div ${common(element)} data-shape="line" data-x1="${x1}" data-y1="${y1}" data-x2="${x2}" data-y2="${y2}" data-start-arrow="${escapeHtml(element.startArrow || "none")}" data-end-arrow="${escapeHtml(element.endArrow || "none")}" class="${lineClass}" style="left:${x1}px;top:${y1}px;width:${length}px;height:0;z-index:${Number(element.z) || 0};color:${css(element.stroke || "#111111")};border-top:${Number(element.strokeWidth) || 1}px ${element.dash === "dash" ? "dashed" : "solid"} ${css(element.stroke || "#111111")};transform:rotate(${angle}deg)"></div>`;
  }
  const shapeMap = { rect: "rect", roundRect: "roundRect", ellipse: "ellipse" };
  const radius = element.type === "ellipse" ? "50%" : element.type === "roundRect" ? roundRectRadius(element) : "0";
  const style = [
    boxStyle(element),
    `background:${css(element.fill || "transparent")}`,
    `border:${Number(element.strokeWidth) || 0}px solid ${css(element.stroke || "transparent")}`,
    `border-radius:${radius}`
  ].join(";");
  const radiusValues = element.type === "roundRect" ? roundRectRadiusValues(element) : [];
  const radiusData = radiusValues.length
    ? ` data-radius-top-left="${radiusValues[0]}" data-radius-top-right="${radiusValues[1]}" data-radius-bottom-right="${radiusValues[2]}" data-radius-bottom-left="${radiusValues[3]}"`
    : "";
  return `<div ${common(element)} data-shape="${shapeMap[element.type] || "rect"}"${radiusData} data-rotation="${Number(element.rotation) || 0}" style="${style}"></div>`;
}

function buildHtml(project, inputPath, outputPath) {
  const ids = new Set();
  for (const element of project.elements || []) {
    if (!element.id) throw new Error("Every element requires an id");
    if (ids.has(element.id)) throw new Error(`Duplicate element id: ${element.id}`);
    ids.add(element.id);
  }
  const riskySourceImages = (project.elements || []).filter((element) => {
    if (element.visible === false || element.type !== "image" || element.sourceAssetIntegrityApproved === true) {
      return false;
    }
    return element.recognitionRejected === true
      || element.sourceAsset?.metrics?.mayBeClipped === true
      || Object.values(element.sourceAsset?.metrics?.edgeRisk || {}).some(Boolean);
  });
  if (riskySourceImages.length) {
    throw new Error(
      `Source-extracted images failed edge-integrity validation: ${riskySourceImages.map((element) => element.id).join(", ")}`
    );
  }
  const width = Number(project.canvas?.width);
  const height = Number(project.canvas?.height);
  if (!width || !height) throw new Error("canvas.width and canvas.height are required");
  const projectRoot = path.dirname(inputPath);
  const outputRoot = path.dirname(outputPath);
  const elements = [...(project.elements || [])]
    .sort((a, b) => (Number(a.z) || 0) - (Number(b.z) || 0))
    .map((element) => renderElement(element, projectRoot, outputRoot))
    .join("\n");
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(project.title || "Confirmed slide")}</title>
<style>
*{box-sizing:border-box}
html,body{margin:0;background:#e8eaed}
body{padding:24px;font-family:"PingFang SC","Microsoft YaHei",Arial,sans-serif}
.slide{position:relative;width:${width}px;height:${height}px;margin:0 auto;overflow:hidden;background:${css(project.canvas.background || "#ffffff")};box-shadow:0 10px 34px rgba(0,0,0,.16)}
[data-ppt]{position:absolute;transform-origin:center}
.ppt-line{transform-origin:0 50%}
.ppt-line.has-end-arrow::after{content:"";position:absolute;right:-1px;top:50%;width:8px;height:8px;border-right:2px solid currentColor;border-top:2px solid currentColor;transform:translateY(-50%) rotate(45deg)}
</style>
</head>
<body>
<div class="slide" data-slide-width="${width}" data-slide-height="${height}" data-project-status="${escapeHtml(project.status || "draft")}">
${elements}
</div>
</body>
</html>
`;
}

function main() {
  const input = path.resolve(arg("input", ""));
  const output = path.resolve(arg("output", ""));
  if (!input || !output) {
    console.error("Usage: node scene_to_html.cjs --input scene.json --output confirmed.html");
    process.exit(2);
  }
  const project = JSON.parse(fs.readFileSync(input, "utf8"));
  if (project.status !== "confirmed") {
    console.warn("Warning: scene status is not confirmed");
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, buildHtml(project, input, output), "utf8");
  console.log(output);
}

if (require.main === module) main();
module.exports = { buildHtml };
