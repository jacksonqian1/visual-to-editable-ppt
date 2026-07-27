function clustered(values, tolerance) {
  const sorted = [...values].sort((a, b) => a - b);
  const result = [];
  for (const value of sorted) {
    if (!result.length || Math.abs(value - result[result.length - 1]) > tolerance) result.push(value);
    else result[result.length - 1] = (result[result.length - 1] + value) / 2;
  }
  return result;
}

function contains(rect, x, y) {
  return x > rect.x && x < rect.x + rect.w && y > rect.y && y < rect.y + rect.h;
}

function pointKey(point) {
  return `${point.x},${point.y}`;
}

function direction(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 0 : 2;
  return dy >= 0 ? 1 : 3;
}

function simplifyLoop(points) {
  if (points.length < 3) return points;
  const simplified = [];
  for (let index = 0; index < points.length; index++) {
    const previous = points[(index - 1 + points.length) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const collinear = (previous.x === current.x && current.x === next.x)
      || (previous.y === current.y && current.y === next.y);
    if (!collinear) simplified.push(current);
  }
  return simplified;
}

function traceLoops(edges) {
  const byStart = new Map();
  edges.forEach((edge, index) => {
    const key = pointKey(edge.from);
    if (!byStart.has(key)) byStart.set(key, []);
    byStart.get(key).push(index);
  });
  const used = new Set();
  const loops = [];
  const turnPreference = [1, 0, 3, 2];

  for (let startIndex = 0; startIndex < edges.length; startIndex++) {
    if (used.has(startIndex)) continue;
    const startEdge = edges[startIndex];
    const startKey = pointKey(startEdge.from);
    const points = [startEdge.from];
    let currentIndex = startIndex;
    let guard = 0;

    while (guard++ < edges.length + 4) {
      const edge = edges[currentIndex];
      used.add(currentIndex);
      points.push(edge.to);
      const nextKey = pointKey(edge.to);
      if (nextKey === startKey) break;
      const candidates = (byStart.get(nextKey) || []).filter((index) => !used.has(index));
      if (!candidates.length) break;
      const currentDirection = direction(edge.from, edge.to);
      candidates.sort((left, right) => {
        const leftTurn = (direction(edges[left].from, edges[left].to) - currentDirection + 4) % 4;
        const rightTurn = (direction(edges[right].from, edges[right].to) - currentDirection + 4) % 4;
        return turnPreference.indexOf(leftTurn) - turnPreference.indexOf(rightTurn);
      });
      currentIndex = candidates[0];
    }

    if (pointKey(points[points.length - 1]) === startKey) points.pop();
    const simplified = simplifyLoop(points);
    if (simplified.length >= 3) loops.push(simplified);
  }
  return loops;
}

function booleanRectangles(rectangles, operation = "union", tolerance = 0.5) {
  if (!rectangles.length) return { loops: [], bounds: null };
  const rects = rectangles.map((rect) => ({
    x: Number(rect.x),
    y: Number(rect.y),
    w: Math.max(0, Number(rect.w)),
    h: Math.max(0, Number(rect.h))
  }));
  const xs = clustered(rects.flatMap((rect) => [rect.x, rect.x + rect.w]), tolerance);
  const ys = clustered(rects.flatMap((rect) => [rect.y, rect.y + rect.h]), tolerance);
  const cells = Array.from({ length: Math.max(0, ys.length - 1) }, () =>
    Array(Math.max(0, xs.length - 1)).fill(false)
  );

  for (let row = 0; row < ys.length - 1; row++) {
    for (let column = 0; column < xs.length - 1; column++) {
      const centerX = (xs[column] + xs[column + 1]) / 2;
      const centerY = (ys[row] + ys[row + 1]) / 2;
      const hits = rects.map((rect) => contains(rect, centerX, centerY));
      if (operation === "intersect") cells[row][column] = hits.every(Boolean);
      else if (operation === "subtract") cells[row][column] = hits[0] && !hits.slice(1).some(Boolean);
      else cells[row][column] = hits.some(Boolean);
    }
  }

  const edges = [];
  const filled = (row, column) =>
    row >= 0 && row < cells.length && column >= 0 && column < (cells[0]?.length || 0) && cells[row][column];
  for (let row = 0; row < cells.length; row++) {
    for (let column = 0; column < cells[row].length; column++) {
      if (!cells[row][column]) continue;
      const x0 = xs[column];
      const x1 = xs[column + 1];
      const y0 = ys[row];
      const y1 = ys[row + 1];
      if (!filled(row - 1, column)) edges.push({ from: { x: x0, y: y0 }, to: { x: x1, y: y0 } });
      if (!filled(row, column + 1)) edges.push({ from: { x: x1, y: y0 }, to: { x: x1, y: y1 } });
      if (!filled(row + 1, column)) edges.push({ from: { x: x1, y: y1 }, to: { x: x0, y: y1 } });
      if (!filled(row, column - 1)) edges.push({ from: { x: x0, y: y1 }, to: { x: x0, y: y0 } });
    }
  }

  const loops = traceLoops(edges);
  const allPoints = loops.flat();
  if (!allPoints.length) return { loops: [], bounds: null };
  const minX = Math.min(...allPoints.map((point) => point.x));
  const minY = Math.min(...allPoints.map((point) => point.y));
  const maxX = Math.max(...allPoints.map((point) => point.x));
  const maxY = Math.max(...allPoints.map((point) => point.y));
  return {
    loops,
    bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  };
}

function sharesAreaOrEdge(left, right, tolerance = 0.5) {
  const overlapX = Math.min(left.x + left.w, right.x + right.w) - Math.max(left.x, right.x);
  const overlapY = Math.min(left.y + left.h, right.y + right.h) - Math.max(left.y, right.y);
  if (overlapX > tolerance && overlapY > tolerance) return true;
  if (Math.abs(overlapX) <= tolerance && overlapY > tolerance) return true;
  if (Math.abs(overlapY) <= tolerance && overlapX > tolerance) return true;
  return false;
}

function roundRectPolygon(rect, segments = 6) {
  const x = Number(rect.x);
  const y = Number(rect.y);
  const w = Math.max(0, Number(rect.w));
  const h = Math.max(0, Number(rect.h));
  const clampRadius = (value) => Math.max(0, Math.min(Number(value) || 0, w / 2, h / 2));
  const radii = {
    tl: clampRadius(rect.radiusTopLeft),
    tr: clampRadius(rect.radiusTopRight),
    br: clampRadius(rect.radiusBottomRight),
    bl: clampRadius(rect.radiusBottomLeft)
  };
  const points = [];
  const appendArc = (cx, cy, radius, start, end) => {
    if (!radius) {
      points.push({ x: cx, y: cy });
      return;
    }
    for (let step = 0; step <= segments; step++) {
      const angle = start + (end - start) * step / segments;
      points.push({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius
      });
    }
  };
  appendArc(x + w - radii.tr, y + radii.tr, radii.tr, -Math.PI / 2, 0);
  appendArc(x + w - radii.br, y + h - radii.br, radii.br, 0, Math.PI / 2);
  appendArc(x + radii.bl, y + h - radii.bl, radii.bl, Math.PI / 2, Math.PI);
  appendArc(x + radii.tl, y + radii.tl, radii.tl, Math.PI, Math.PI * 1.5);
  return points;
}

function clipPolygon(polygon, inside, intersect) {
  if (!polygon.length) return [];
  const output = [];
  let previous = polygon[polygon.length - 1];
  let previousInside = inside(previous);
  for (const current of polygon) {
    const currentInside = inside(current);
    if (currentInside !== previousInside) output.push(intersect(previous, current));
    if (currentInside) output.push(current);
    previous = current;
    previousInside = currentInside;
  }
  return output;
}

function clipPolygonToRect(polygon, rect) {
  const left = Number(rect.x);
  const top = Number(rect.y);
  const right = left + Math.max(0, Number(rect.w));
  const bottom = top + Math.max(0, Number(rect.h));
  const verticalIntersection = (x) => (from, to) => {
    const scale = (x - from.x) / (to.x - from.x);
    return { x, y: from.y + (to.y - from.y) * scale };
  };
  const horizontalIntersection = (y) => (from, to) => {
    const scale = (y - from.y) / (to.y - from.y);
    return { x: from.x + (to.x - from.x) * scale, y };
  };
  let result = polygon;
  result = clipPolygon(result, (point) => point.x >= left, verticalIntersection(left));
  result = clipPolygon(result, (point) => point.x <= right, verticalIntersection(right));
  result = clipPolygon(result, (point) => point.y >= top, horizontalIntersection(top));
  result = clipPolygon(result, (point) => point.y <= bottom, horizontalIntersection(bottom));
  return result;
}

function intersectRoundRectWithRects(roundRect, rectangles, segments = 6) {
  let polygon = roundRectPolygon(roundRect, segments);
  for (const rectangle of rectangles) polygon = clipPolygonToRect(polygon, rectangle);
  if (polygon.length < 3) return { loops: [], bounds: null };
  const minX = Math.min(...polygon.map((point) => point.x));
  const minY = Math.min(...polygon.map((point) => point.y));
  const maxX = Math.max(...polygon.map((point) => point.x));
  const maxY = Math.max(...polygon.map((point) => point.y));
  return {
    loops: [polygon],
    bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  };
}

module.exports = {
  booleanRectangles,
  intersectRoundRectWithRects,
  roundRectPolygon,
  sharesAreaOrEdge
};
