#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    const key = argv[index].slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boxOf(element) {
  if (!element) return null;
  if (element.type === "line") {
    const x1 = number(element.x1);
    const x2 = number(element.x2);
    const y1 = number(element.y1);
    const y2 = number(element.y2);
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1)
    };
  }
  return {
    x: number(element.x),
    y: number(element.y),
    width: number(element.width),
    height: number(element.height)
  };
}

function unionBoxes(boxes) {
  const valid = boxes.filter(Boolean);
  if (!valid.length) return null;
  const left = Math.min(...valid.map((box) => box.x));
  const top = Math.min(...valid.map((box) => box.y));
  const right = Math.max(...valid.map((box) => box.x + box.width));
  const bottom = Math.max(...valid.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function centerX(box) {
  return box.x + box.width / 2;
}

function centerY(box) {
  return box.y + box.height / 2;
}

function moveElement(element, dx, dy) {
  if (element.type === "line") {
    element.x1 = number(element.x1) + dx;
    element.x2 = number(element.x2) + dx;
    element.y1 = number(element.y1) + dy;
    element.y2 = number(element.y2) + dy;
    return;
  }
  element.x = number(element.x) + dx;
  element.y = number(element.y) + dy;
}

function scaleElement(element, originX, originY, scaleX, scaleY, fontScale) {
  if (element.type === "line") {
    element.x1 = originX + (number(element.x1) - originX) * scaleX;
    element.x2 = originX + (number(element.x2) - originX) * scaleX;
    element.y1 = originY + (number(element.y1) - originY) * scaleY;
    element.y2 = originY + (number(element.y2) - originY) * scaleY;
    element.strokeWidth = number(element.strokeWidth, 1) * Math.min(scaleX, scaleY);
    return;
  }
  element.x = originX + (number(element.x) - originX) * scaleX;
  element.y = originY + (number(element.y) - originY) * scaleY;
  element.width = number(element.width) * scaleX;
  element.height = number(element.height) * scaleY;
  if (element.type === "text" && element.fontSize) {
    element.fontSize = number(element.fontSize) * fontScale;
  }
}

function resolveIds(spec, byId) {
  const ids = [];
  for (const id of spec.ids || []) {
    if (byId.has(id)) ids.push(id);
  }
  for (const prefix of spec.prefixes || []) {
    for (const id of byId.keys()) {
      if (id.startsWith(prefix) && !ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

function scaleSignature(constraint) {
  return JSON.stringify({
    scale: number(constraint.scale, 1),
    scaleByType: constraint.scaleByType || {}
  });
}

function applyEqualColumns(constraint, byId, apply, state) {
  const parent = byId.get(constraint.parentId);
  if (!parent) return { id: constraint.id, type: constraint.type, status: "skipped", reason: "missing parent" };
  const columns = (constraint.columns || [])
    .map((column) => resolveIds(column, byId))
    .filter((ids) => ids.length);
  if (columns.length < 2) {
    return { id: constraint.id, type: constraint.type, status: "skipped", reason: "fewer than two columns" };
  }

  const parentBox = boxOf(parent);
  const padding = constraint.padding || {};
  const innerLeft = parentBox.x + number(padding.left, 0);
  const innerRight = parentBox.x + parentBox.width - number(padding.right, 0);
  const innerWidth = innerRight - innerLeft;
  const cellWidth = innerWidth / columns.length;
  const beforeBoxes = columns.map((ids) => unionBoxes(ids.map((id) => boxOf(byId.get(id)))));
  const beforeGroup = unionBoxes(beforeBoxes);
  const beforeOffset = centerX(beforeGroup) - centerX(parentBox);
  const scaleByType = constraint.scaleByType || {};
  const signature = scaleSignature(constraint);
  const applyScale = apply && state.scaleSignature !== signature;

  if (apply) {
    columns.forEach((ids, index) => {
      const elements = ids.map((id) => byId.get(id));
      const columnBox = unionBoxes(elements.map(boxOf));
      const anchorX = centerX(columnBox);
      const anchorY = centerY(columnBox);
      for (const element of elements) {
        const typeScale = applyScale
          ? number(scaleByType[element.type], number(constraint.scale, 1))
          : 1;
        const fontScale = element.type === "text"
          ? typeScale
          : 1;
        scaleElement(element, anchorX, anchorY, typeScale, typeScale, fontScale);
      }
      const scaledBox = unionBoxes(elements.map(boxOf));
      const targetCenter = innerLeft + cellWidth * (index + 0.5);
      const verticalMode = constraint.alignY || "preserve";
      const targetY = verticalMode === "center"
        ? parentBox.y + number(padding.top, 0)
          + (parentBox.height - number(padding.top, 0) - number(padding.bottom, 0)) / 2
        : centerY(scaledBox);
      for (const element of elements) {
        moveElement(element, targetCenter - centerX(scaledBox), targetY - centerY(scaledBox));
      }
    });
    state.scaleSignature = signature;
  }

  const afterBoxes = columns.map((ids) => unionBoxes(ids.map((id) => boxOf(byId.get(id)))));
  const afterGroup = unionBoxes(afterBoxes);
  const afterOffset = centerX(afterGroup) - centerX(parentBox);
  const centers = afterBoxes.map(centerX);
  const gaps = centers.slice(1).map((value, index) => value - centers[index]);
  return {
    id: constraint.id,
    type: constraint.type,
    status: apply ? "applied" : "reported",
    parentId: constraint.parentId,
    columns: columns.length,
    beforeCenterOffset: beforeOffset,
    afterCenterOffset: afterOffset,
    beforeOccupancy: beforeGroup.width / parentBox.width,
    afterOccupancy: afterGroup.width / parentBox.width,
    centerGaps: gaps,
    scaleApplied: applyScale
  };
}

function changeParentHeight(parent, linked, delta) {
  parent.height = number(parent.height) + delta;
  for (const element of linked) {
    element.height = number(element.height) + delta;
  }
}

function compressVertical(elements, top, factor) {
  for (const element of elements) {
    if (element.type === "line") {
      element.y1 = top + (number(element.y1) - top) * factor;
      element.y2 = top + (number(element.y2) - top) * factor;
    } else {
      element.y = top + (number(element.y) - top) * factor;
    }
  }
}

function applyContainment(constraint, scene, byId, apply) {
  const parent = byId.get(constraint.parentId);
  if (!parent) return { id: constraint.id, type: constraint.type, status: "skipped", reason: "missing parent" };
  const childIds = resolveIds(constraint.children || {}, byId);
  const children = childIds.map((id) => byId.get(id));
  if (!children.length) {
    return { id: constraint.id, type: constraint.type, status: "skipped", reason: "missing children" };
  }

  const linked = (constraint.linkedParentIds || [])
    .map((id) => byId.get(id))
    .filter(Boolean);
  const padding = constraint.padding || {};
  const bottomPadding = number(padding.bottom, 0);
  const maxParentExpansion = Math.max(0, number(constraint.maxParentExpansion, 0));
  const maxBottom = Math.min(
    number(constraint.maxBottom, number(scene.canvas.height)),
    number(scene.canvas.height) - number(constraint.canvasBottomPadding, 0)
  );
  const beforeParent = boxOf(parent);
  const beforeChildren = unionBoxes(children.map(boxOf));
  const beforeOverflow = Math.max(
    0,
    beforeChildren.y + beforeChildren.height + bottomPadding
      - (beforeParent.y + beforeParent.height)
  );

  let expandedBy = 0;
  let compressedBy = 1;
  let scaledBy = 1;
  if (apply && beforeOverflow > 0) {
    const availableExpansion = Math.max(0, maxBottom - (beforeParent.y + beforeParent.height));
    expandedBy = Math.min(beforeOverflow, maxParentExpansion, availableExpansion);
    if (expandedBy > 0) changeParentHeight(parent, linked, expandedBy);

    let currentParent = boxOf(parent);
    let currentChildren = unionBoxes(children.map(boxOf));
    let remaining = Math.max(
      0,
      currentChildren.y + currentChildren.height + bottomPadding
        - (currentParent.y + currentParent.height)
    );

    if (remaining > 0 && constraint.reduceSpacing !== false) {
      const contentTop = number(constraint.contentTop, currentChildren.y);
      const movableSpan = Math.max(1, currentChildren.y + currentChildren.height - contentTop);
      compressedBy = Math.max(
        number(constraint.minimumSpacingScale, 0.85),
        (movableSpan - remaining) / movableSpan
      );
      compressVertical(children, contentTop, compressedBy);
      currentChildren = unionBoxes(children.map(boxOf));
      remaining = Math.max(
        0,
        currentChildren.y + currentChildren.height + bottomPadding
          - (currentParent.y + currentParent.height)
      );
    }

    if (remaining > 0 && constraint.scaleContent !== false) {
      currentChildren = unionBoxes(children.map(boxOf));
      const availableHeight = currentParent.y + currentParent.height - bottomPadding - currentChildren.y;
      scaledBy = Math.max(
        number(constraint.minimumContentScale, 0.92),
        Math.min(1, availableHeight / Math.max(1, currentChildren.height))
      );
      scaleElementGroup(children, currentChildren.x, currentChildren.y, scaledBy);
    }
  }

  const afterParent = boxOf(parent);
  const afterChildren = unionBoxes(children.map(boxOf));
  const afterOverflow = Math.max(
    0,
    afterChildren.y + afterChildren.height + bottomPadding
      - (afterParent.y + afterParent.height)
  );
  return {
    id: constraint.id,
    type: constraint.type,
    status: apply ? "applied" : "reported",
    parentId: constraint.parentId,
    childCount: children.length,
    beforeOverflow,
    afterOverflow,
    expandedBy,
    spacingScale: compressedBy,
    contentScale: scaledBy,
    bottomPadding
  };
}

function scaleElementGroup(elements, originX, originY, scale) {
  for (const element of elements) {
    scaleElement(element, originX, originY, scale, scale, scale);
  }
}

function main() {
  const args = parseArgs(process.argv);
  const input = path.resolve(args.input || "");
  const output = path.resolve(args.output || input);
  const reportPath = args.report ? path.resolve(args.report) : "";
  const apply = args.apply === true || ["true", "yes", "on", "1"].includes(String(args.apply).toLowerCase());
  if (!input || !fs.existsSync(input)) {
    throw new Error(
      "Usage: solve_layout_constraints.cjs --input scene.json [--output scene.json] [--report report.json] [--apply true]"
    );
  }

  const scene = JSON.parse(fs.readFileSync(input, "utf8"));
  const constraints = scene.layoutConstraints || scene.metadata?.layoutConstraints || [];
  const byId = new Map(scene.elements.map((element) => [element.id, element]));
  scene.metadata = scene.metadata || {};
  const constraintState = scene.metadata.layoutConstraintState || {};
  for (const previous of scene.metadata.layoutConstraintRun?.report || []) {
    const matching = constraints.find((constraint) => constraint.id === previous.id);
    if (
      matching
      && matching.type === "equalColumns"
      && previous.status === "applied"
      && !constraintState[matching.id]
    ) {
      constraintState[matching.id] = { scaleSignature: scaleSignature(matching) };
    }
  }
  const results = [];
  for (const constraint of constraints) {
    if (constraint.enabled === false) continue;
    constraintState[constraint.id] = constraintState[constraint.id] || {};
    if (constraint.type === "equalColumns") {
      results.push(applyEqualColumns(constraint, byId, apply, constraintState[constraint.id]));
    } else if (constraint.type === "containment") {
      results.push(applyContainment(constraint, scene, byId, apply));
    } else {
      results.push({
        id: constraint.id,
        type: constraint.type,
        status: "skipped",
        reason: "unsupported constraint type"
      });
    }
  }

  const report = {
    file: input,
    applied: apply,
    constraints: results,
    summary: {
      total: results.length,
      applied: results.filter((result) => result.status === "applied").length,
      skipped: results.filter((result) => result.status === "skipped").length,
      unresolvedOverflow: results.filter((result) => number(result.afterOverflow) > 0.1).length
    }
  };

  if (apply) {
    scene.metadata.layoutConstraintState = constraintState;
    scene.metadata.layoutConstraintRun = {
      appliedAt: new Date().toISOString(),
      report: results
    };
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(scene, null, 2)}\n`);
  }
  if (reportPath) {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify(report, null, 2));
}

main();
