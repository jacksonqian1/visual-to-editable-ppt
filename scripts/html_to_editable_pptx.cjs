#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const pptxgen = require("pptxgenjs");
const { chromium } = require("playwright");
const {
  booleanRectangles,
  intersectRoundRectWithRects,
  roundRectPolygon,
  sharesAreaOrEdge
} = require("./rect_boolean.cjs");

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function booleanRectNode(node) {
  return node.kind === "shape"
    && node.shape === "rect"
    && !node.rotation
    && node.w > 0
    && node.h > 0;
}

function booleanRoundRectNode(node) {
  return node.kind === "shape"
    && node.shape === "roundRect"
    && !node.rotation
    && node.w > 0
    && node.h > 0;
}

function styleKey(node) {
  return [
    node.fill || "none",
    node.borderColor || "none",
    Number(node.borderWidth) || 0,
    node.borderStyle || "none"
  ].join("|");
}

function hasVisibleBorder(node) {
  return Boolean(
    node.borderColor
    && Number(node.borderWidth) > 0
    && !["none", "hidden"].includes(String(node.borderStyle || "").toLowerCase())
  );
}

function shapeLine(node) {
  return hasVisibleBorder(node)
    ? { color: node.borderColor, width: Math.max(0.25, node.borderWidth * 0.5) }
    : { color: "FFFFFF", transparency: 100 };
}

function customNode(members, operation, tolerance, source) {
  const geometry = booleanRectangles(members, operation, tolerance);
  if (!geometry.bounds || !geometry.loops.length) return null;
  const base = members[0];
  return {
    ...base,
    kind: "customShape",
    shape: "custGeom",
    name: `${base.name} [${operation}]`,
    booleanSource: source,
    booleanOperation: operation,
    booleanMembers: members.map((node) => node.id),
    bounds: geometry.bounds,
    loops: geometry.loops,
    x: geometry.bounds.x,
    y: geometry.bounds.y,
    w: geometry.bounds.w,
    h: geometry.bounds.h,
    rotation: 0
  };
}

function roundRectIntersectionNode(members, source) {
  const roundRect = members.find(booleanRoundRectNode);
  const rectangles = members.filter(booleanRectNode);
  if (!roundRect || !rectangles.length || rectangles.length !== members.length - 1) return null;
  const geometry = intersectRoundRectWithRects(roundRect, rectangles);
  if (!geometry.bounds || !geometry.loops.length) return null;
  const base = members[0];
  return {
    ...base,
    kind: "customShape",
    shape: "custGeom",
    name: `${base.name} [intersect-rounded]`,
    booleanSource: source,
    booleanOperation: "intersect",
    booleanMembers: members.map((node) => node.id),
    bounds: geometry.bounds,
    loops: geometry.loops,
    x: geometry.bounds.x,
    y: geometry.bounds.y,
    w: geometry.bounds.w,
    h: geometry.bounds.h,
    rotation: 0
  };
}

function prepareBooleanPlan(nodes, mode, tolerance) {
  const replacements = new Map();
  const consumed = new Set();
  const warnings = [];
  const explicitGroups = new Map();

  for (const node of nodes) {
    if (!node.mergeGroup || node.kind !== "shape" || node.shape === "line") continue;
    if (!explicitGroups.has(node.mergeGroup)) explicitGroups.set(node.mergeGroup, []);
    explicitGroups.get(node.mergeGroup).push(node);
  }

  for (const [groupName, members] of explicitGroups) {
    const operation = members.find((node) => node.mergeOperation && node.mergeOperation !== "none")?.mergeOperation || "union";
    if (members.length < 2) {
      warnings.push(`Merge group "${groupName}" requires at least two shapes`);
      continue;
    }
    const roundedIntersection = operation === "intersect"
      && members.filter(booleanRoundRectNode).length === 1
      && members.filter(booleanRectNode).length === members.length - 1;
    if (!members.every(booleanRectNode) && !roundedIntersection) {
      warnings.push(`Merge group "${groupName}" skipped: use unrotated rects, or one roundRect plus rects for intersection`);
      continue;
    }
    const merged = roundedIntersection
      ? roundRectIntersectionNode(members, `group:${groupName}`)
      : customNode(members, operation, tolerance, `group:${groupName}`);
    if (!merged) {
      warnings.push(`Merge group "${groupName}" produced no visible geometry`);
      members.forEach((node) => consumed.add(node.index));
      continue;
    }
    const insertionIndex = Math.min(...members.map((node) => node.index));
    replacements.set(insertionIndex, merged);
    members.forEach((node) => consumed.add(node.index));
  }

  const autoEnabled = !["off", "false", "none", "explicit"].includes(String(mode).toLowerCase());
  const candidates = nodes.filter((node) =>
    !consumed.has(node.index)
    && booleanRectNode(node)
    && node.fill
    && (autoEnabled || node.autoMerge)
  );
  const parent = new Map(candidates.map((node) => [node.index, node.index]));
  const find = (value) => {
    let current = value;
    while (parent.get(current) !== current) current = parent.get(current);
    let next = value;
    while (parent.get(next) !== next) {
      const previous = parent.get(next);
      parent.set(next, current);
      next = previous;
    }
    return current;
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };

  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex++) {
    const left = candidates[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex++) {
      const right = candidates[rightIndex];
      if (styleKey(left) !== styleKey(right)) continue;
      if (!sharesAreaOrEdge(left, right, tolerance)) continue;
      union(left.index, right.index);
    }
  }

  const components = new Map();
  for (const node of candidates) {
    const root = find(node.index);
    if (!components.has(root)) components.set(root, []);
    components.get(root).push(node);
  }
  for (const members of components.values()) {
    if (members.length < 2) continue;
    const merged = customNode(members, "union", tolerance, "auto");
    if (!merged) continue;
    const insertionIndex = Math.min(...members.map((node) => node.index));
    replacements.set(insertionIndex, merged);
    members.forEach((node) => consumed.add(node.index));
  }

  const renderNodes = [];
  for (const node of nodes) {
    if (replacements.has(node.index)) renderNodes.push(replacements.get(node.index));
    if (!consumed.has(node.index)) renderNodes.push(node);
  }
  return {
    nodes: renderNodes,
    mergedObjects: replacements.size,
    consumedShapes: consumed.size,
    warnings
  };
}

async function main() {
  const input = path.resolve(arg("input", ""));
  const output = path.resolve(arg("output", ""));
  const widthIn = Number(arg("width-in", "13.333333"));
  const fontScale = Number(arg("font-scale", "0.52"));
  const mergeMode = arg("merge-overlaps", "conservative");
  const mergeTolerance = Number(arg("merge-tolerance", "1"));
  const exactRoundRects = ["true", "on", "yes", "all"].includes(
    String(arg("exact-roundrects", "false")).toLowerCase()
  );
  const chromePath = arg("chrome-path", process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
  if (!input || !output) {
    console.error("Usage: node html_to_editable_pptx.cjs --input confirmed.html --output final.pptx");
    process.exit(2);
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath: fs.existsSync(chromePath) ? chromePath : undefined
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(input).href, { waitUntil: "load" });
  await page.evaluate(async () => document.fonts?.ready);

  const model = await page.evaluate(() => {
    const slide = document.querySelector("[data-slide-width][data-slide-height]") || document.querySelector(".slide");
    if (!slide) throw new Error("No slide canvas found");
    const slideRect = slide.getBoundingClientRect();
    const clean = (value) => Number.parseFloat(value) || 0;
    const color = (value) => {
      const match = String(value || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      const alpha = match?.[4] == null ? 1 : Number(match[4]);
      if (!match || !Number.isFinite(alpha) || alpha <= 0.01) return null;
      return [match[1], match[2], match[3]]
        .map((number) => Number(number).toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
    };
    const nodes = [...slide.querySelectorAll("[data-ppt]")].map((element, index) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const rotation = clean(element.dataset.rotation);
      return {
        index,
        id: element.dataset.id || `object-${index}`,
        name: element.dataset.name || element.dataset.id || `object-${index}`,
        kind: element.dataset.ppt,
        shape: element.dataset.shape || null,
        groupId: element.dataset.groupId || "",
        layerZ: clean(style.zIndex),
        groupName: element.dataset.groupName || "",
        pathPoints: element.dataset.pathPoints ? JSON.parse(element.dataset.pathPoints) : null,
        pathWidth: clean(element.dataset.pathWidth),
        pathHeight: clean(element.dataset.pathHeight),
        pathStrokeWidth: clean(element.dataset.strokeWidth),
        pathDash: element.dataset.dash || "solid",
        mergeGroup: element.dataset.mergeGroup || "",
        mergeOperation: element.dataset.mergeOperation || "none",
        autoMerge: element.dataset.autoMerge === "true",
        forceCustomGeometry: element.dataset.forceCustomGeometry === "true",
        overlapGroup: element.dataset.overlapGroup || "",
        overlapKind: element.dataset.overlapKind || "",
        overlapRole: element.dataset.overlapRole || "",
        text: element.innerText || element.textContent || "",
        src: element.currentSrc || element.src || null,
        naturalWidth: element instanceof HTMLImageElement ? element.naturalWidth : 0,
        naturalHeight: element instanceof HTMLImageElement ? element.naturalHeight : 0,
        rotation,
        x: rotation ? element.offsetLeft : rect.left - slideRect.left,
        y: rotation ? element.offsetTop : rect.top - slideRect.top,
        w: rotation ? element.offsetWidth : rect.width,
        h: rotation ? element.offsetHeight : rect.height,
        x1: clean(element.dataset.x1),
        y1: clean(element.dataset.y1),
        x2: clean(element.dataset.x2),
        y2: clean(element.dataset.y2),
        startArrow: element.dataset.startArrow || "none",
        endArrow: element.dataset.endArrow || "none",
        fill: color(style.backgroundColor),
        color: color(style.color),
        borderColor: color(style.borderTopColor),
        borderWidth: clean(style.borderTopWidth),
        borderStyle: style.borderTopStyle,
        radiusTopLeft: clean(style.borderTopLeftRadius),
        radiusTopRight: clean(style.borderTopRightRadius),
        radiusBottomRight: clean(style.borderBottomRightRadius),
        radiusBottomLeft: clean(style.borderBottomLeftRadius),
        fontSize: clean(style.fontSize),
        fontFamily: style.fontFamily.split(",")[0].replaceAll('"', "").trim(),
        bold: Number(style.fontWeight) >= 600 || style.fontWeight === "bold",
        align: style.textAlign,
        fit: style.objectFit
      };
    });
    return {
      width: Number(slide.dataset.slideWidth) || slideRect.width,
      height: Number(slide.dataset.slideHeight) || slideRect.height,
      status: slide.dataset.projectStatus || "draft",
      background: color(getComputedStyle(slide).backgroundColor) || "FFFFFF",
      nodes
    };
  });
  await browser.close();

  if (model.status !== "confirmed") console.warn("Warning: exporting HTML that is not marked confirmed");
  const heightIn = widthIn * model.height / model.width;
  const pptx = new pptxgen();
  pptx.defineLayout({ name: "SCENE", width: widthIn, height: heightIn });
  pptx.layout = "SCENE";
  pptx.author = "Codex";
  pptx.subject = "Native editable presentation converted from confirmed HTML";
  pptx.lang = "zh-CN";
  pptx.theme = { headFontFace: "PingFang SC", bodyFontFace: "PingFang SC", lang: "zh-CN" };
  const slide = pptx.addSlide();
  slide.background = { color: model.background };
  const unloadedImages = model.nodes.filter((node) => node.kind === "image" && (!(node.naturalWidth > 0) || !(node.naturalHeight > 0)));
  if (unloadedImages.length) {
    throw new Error(`Cannot export unloaded image assets: ${unloadedImages.map((node) => node.id).join(", ")}`);
  }
  const remoteImages = model.nodes.filter((node) => node.kind === "image" && /^https?:/i.test(node.src || ""));
  if (remoteImages.length) {
    throw new Error(`Remote image assets must be copied into the project before export: ${remoteImages.map((node) => node.id).join(", ")}`);
  }
  const invalidImageLayouts = model.nodes.filter((node) => {
    if (node.kind !== "image") return false;
    const values = [node.x, node.y, node.w, node.h];
    if (!values.every(Number.isFinite) || node.w < 0.5 || node.h < 0.5) return true;
    return node.x + node.w <= 0 || node.y + node.h <= 0 || node.x >= model.width || node.y >= model.height;
  });
  if (invalidImageLayouts.length) {
    throw new Error(`Image assets have empty or off-slide layout boxes: ${invalidImageLayouts.map((node) => node.id).join(", ")}`);
  }
  const unsupportedImageFits = model.nodes.filter((node) => node.kind === "image" && !["contain", "cover", "fill"].includes(node.fit));
  if (unsupportedImageFits.length) {
    throw new Error(`Unsupported image object-fit values: ${unsupportedImageFits.map((node) => `${node.id}=${node.fit}`).join(", ")}`);
  }
  const X = (value) => value * widthIn / model.width;
  const Y = (value) => value * heightIn / model.height;
  const nativeGroups = new Map();
  for (const node of model.nodes.filter(n => n.groupId)) {
    if (node.kind !== 'shape' || !['line','path'].includes(node.shape) || node.mergeGroup) throw new Error(`Native branch grouping requires separate line/path objects: ${node.id}`);
    const depth = nativeGroups.get(node.groupId);
    if (depth !== undefined && depth !== node.layerZ) throw new Error(`Group ${node.groupId} crosses layer depths`);
    nativeGroups.set(node.groupId, node.layerZ);
  }
  const booleanPlan = prepareBooleanPlan(model.nodes, mergeMode, mergeTolerance);
  booleanPlan.warnings.forEach((warning) => console.warn(`Boolean geometry: ${warning}`));
  const metadata = (node) => {
    const marker = [node.overlapGroup, node.overlapKind, node.overlapRole].filter(Boolean).join("|");
    return {
      objectName: node.groupId ? `[ppt-group:${node.groupId}:${node.id}] ${node.name}` : marker ? `[${marker}] ${node.name}` : node.name,
      ...(marker ? { altText: `PPT overlap marker: ${marker}; source object: ${node.name}` } : {})
    };
  };
  const containImagePosition = (node, position) => {
    const scale = Math.min(position.w / node.naturalWidth, position.h / node.naturalHeight);
    const width = node.naturalWidth * scale;
    const height = node.naturalHeight * scale;
    return {
      x: position.x + (position.w - width) / 2,
      y: position.y + (position.h - height) / 2,
      w: width,
      h: height
    };
  };
  const coverImagePosition = (node, position) => {
    const scale = Math.max(position.w / node.naturalWidth, position.h / node.naturalHeight);
    const virtualWidth = node.naturalWidth * scale;
    const virtualHeight = node.naturalHeight * scale;
    return {
      x: position.x,
      y: position.y,
      w: virtualWidth,
      h: virtualHeight,
      sizing: {
        type: "crop",
        x: (virtualWidth - position.w) / 2,
        y: (virtualHeight - position.h) / 2,
        w: position.w,
        h: position.h
      }
    };
  };

  for (const node of booleanPlan.nodes) {
    const position = { x: X(node.x), y: Y(node.y), w: X(node.w), h: Y(node.h) };
    if (node.kind === "customShape") {
      const points = [];
      for (const loop of node.loops) {
        loop.forEach((point, index) => {
          points.push({
            x: X(point.x - node.bounds.x),
            y: Y(point.y - node.bounds.y),
            ...(index === 0 ? { moveTo: true } : {})
          });
        });
        points.push({ close: true });
      }
      slide.addShape(pptx.ShapeType.custGeom, {
        ...position,
        points,
        ...metadata(node),
        fill: node.fill ? { color: node.fill } : { color: "FFFFFF", transparency: 100 },
        line: shapeLine(node)
      });
      continue;
    }
    if (node.kind === "text") {
      slide.addText(node.text, {
        ...position,
        ...metadata(node),
        rotate: node.rotation || 0,
        fontFace: node.fontFamily || "PingFang SC",
        fontSize: Math.max(4, node.fontSize * fontScale),
        bold: node.bold,
        color: node.color || "1F2430",
        margin: 0,
        fit: "shrink",
        align: node.align === "center" ? "center" : node.align === "right" ? "right" : "left",
        valign: "top",
        breakLine: false,
        fill: { color: "FFFFFF", transparency: 100 },
        line: { color: "FFFFFF", transparency: 100 }
      });
      continue;
    }
    if (node.kind === "image" && node.src) {
      const image = node.src.startsWith("data:")
        ? { data: node.src }
        : { path: decodeURIComponent(new URL(node.src).pathname) };
      if (node.fit === "cover") {
        slide.addImage({
          ...image,
          ...coverImagePosition(node, position),
          ...metadata(node),
          rotate: node.rotation || 0
        });
      } else {
        const imagePosition = node.fit === "contain" ? containImagePosition(node, position) : position;
        slide.addImage({ ...image, ...imagePosition, ...metadata(node), rotate: node.rotation || 0 });
      }
      continue;
    }
    if (node.kind !== "shape") continue;

    if (node.shape === "path") {
      if (!node.pathPoints || node.pathPoints.length < 2 || node.pathWidth <= 0 || node.pathHeight <= 0) throw new Error(`Invalid path ${node.id}`);
      const px = value => X(value * node.w / node.pathWidth);
      const py = value => Y(value * node.h / node.pathHeight);
      const points = node.pathPoints.map((p, i) => ({x: px(p.x), y: py(p.y), ...(i === 0 ? {moveTo: true} : {}), ...(p.curve ? {curve: {type: 'cubic', x1: px(p.curve.x1), y1: py(p.curve.y1), x2: px(p.curve.x2), y2: py(p.curve.y2)}} : {})}));
      slide.addShape(pptx.ShapeType.custGeom, {...position, ...metadata(node), points, rotate: node.rotation || 0,
        fill: {color:'FFFFFF', transparency:100},
        line: {color: node.color || '111111', width: Math.max(0.5, node.pathStrokeWidth * 0.75), dash: node.pathDash === 'dash' ? 'dash' : 'solid', beginArrowType: node.startArrow === 'none' ? 'none' : 'triangle', endArrowType: node.endArrow === 'none' ? 'none' : 'triangle'}});
      continue;
    }
    if (node.shape === "line") {
      const x1 = X(node.x1);
      const y1 = Y(node.y1);
      const x2 = X(node.x2);
      const y2 = Y(node.y2);
      slide.addShape(pptx.ShapeType.line, {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        w: Math.abs(x2 - x1),
        h: Math.abs(y2 - y1),
        flipH: x2 < x1,
        flipV: y2 < y1,
        ...metadata(node),
        line: {
          color: node.borderColor || node.color || "111111",
          width: Math.max(0.5, node.borderWidth * 0.75),
          dash: node.borderStyle === "dashed" ? "dash" : "solid",
          beginArrowType: node.startArrow === "none" ? "none" : "triangle",
          endArrowType: node.endArrow === "none" ? "none" : "triangle"
        }
      });
      continue;
    }

    const roundRectRadii = [
      node.radiusTopLeft,
      node.radiusTopRight,
      node.radiusBottomRight,
      node.radiusBottomLeft
    ].map((value) => Number(value) || 0);
    const hasIndependentCorners = Math.max(...roundRectRadii) - Math.min(...roundRectRadii) > 0.01;
    if (node.shape === "roundRect" && (exactRoundRects || node.forceCustomGeometry || hasIndependentCorners)) {
      const points = roundRectPolygon(node, 6).map((point, index) => ({
        x: X(point.x - node.x),
        y: Y(point.y - node.y),
        ...(index === 0 ? { moveTo: true } : {})
      }));
      points.push({ close: true });
      slide.addShape(pptx.ShapeType.custGeom, {
        ...position,
        points,
        ...metadata(node),
        rotate: node.rotation || 0,
        fill: node.fill ? { color: node.fill } : { color: "FFFFFF", transparency: 100 },
        line: shapeLine(node)
      });
      continue;
    }

    const typeMap = {
      rect: pptx.ShapeType.rect,
      roundRect: pptx.ShapeType.roundRect,
      ellipse: pptx.ShapeType.ellipse,
      triangle: pptx.ShapeType.triangle
    };
    const shape = node.shape || (node.radiusTopLeft > 0 || node.radiusTopRight > 0 || node.radiusBottomRight > 0 || node.radiusBottomLeft > 0 ? "roundRect" : "rect");
    slide.addShape(typeMap[shape] || pptx.ShapeType.rect, {
      ...position,
      ...metadata(node),
      rotate: node.rotation || 0,
      fill: node.fill ? { color: node.fill } : { color: "FFFFFF", transparency: 100 },
      line: shapeLine(node)
    });
  }

  fs.mkdirSync(path.dirname(output), { recursive: true });
  await pptx.writeFile({ fileName: output });
  if (model.nodes.some(node => node.groupId)) {
    const specPath = `${output}.groups.json`;
    fs.writeFileSync(specPath, JSON.stringify(model.nodes.filter(n => n.groupId).map(n => ({name: metadata(n).objectName, groupId: n.groupId, groupName: n.groupName || n.groupId}))));
    try { require('node:child_process').execFileSync(process.env.PYTHON || 'python3', [path.join(__dirname, 'group_pptx_objects.py'), output, '--spec', specPath], {stdio:'inherit'}); }
    finally { fs.unlinkSync(specPath); }
  }
  console.log(`Boolean geometry: ${booleanPlan.mergedObjects} merged object(s), ${booleanPlan.consumedShapes} source shape(s) consumed`);
  console.log(output);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
