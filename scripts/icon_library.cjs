const fs = require("node:fs");
const path = require("node:path");

const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

function isInside(root, filePath) {
  const relative = path.relative(root, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[._/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandQuery(value) {
  const normalized = normalizeText(value);
  const expansions = [
    ["箭头", "arrow"],
    ["线条", "line"],
    ["连接线", "connector line"],
    ["连接", "connector"],
    ["分隔", "separator"],
    ["循环", "loop"],
    ["环形", "ring"],
    ["目标", "target"],
    ["向上", "up"],
    ["向下", "down"],
    ["向左", "left"],
    ["向右", "right"],
    ["左上", "top left"],
    ["右上", "top right"],
    ["左下", "bottom left"],
    ["右下", "bottom right"]
  ];
  let expanded = normalized;
  for (const [source, target] of expansions) {
    if (normalized.includes(source)) expanded += ` ${target}`;
  }
  return normalizeText(expanded);
}

function inferKind(asset) {
  const text = normalizeText([
    asset.name,
    asset.relative_path,
    ...(asset.tags || []),
    ...(asset.aliases || [])
  ].join(" "));
  if (/(arrow|chevron|箭头)/.test(text)) return "arrow";
  if (/(line|connector|separator|divider|线条|连接线|分隔线)/.test(text)) return "line";
  return "icon";
}

function manifestMetadata(root) {
  const manifestPath = path.join(root, "manifest.json");
  if (!fs.existsSync(manifestPath)) return { defaultStyle: "", icons: {} };
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return {
    defaultStyle: manifest.default_style || "",
    icons: manifest.icons && typeof manifest.icons === "object" ? manifest.icons : {}
  };
}

function scanFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(absolute);
    }
  };
  visit(root);
  return files;
}

function normalizeAsset(root, raw, metadata = {}) {
  const candidate = raw.path || raw.relative_path || raw.relativePath || "";
  const absolute = path.isAbsolute(candidate) ? path.resolve(candidate) : path.resolve(root, candidate);
  if (!candidate || !isInside(root, absolute) || !fs.existsSync(absolute)) return null;
  const relativePath = path.relative(root, absolute).split(path.sep).join("/");
  const merged = { ...metadata, ...raw };
  const name = merged.name || path.basename(relativePath, path.extname(relativePath));
  const asset = {
    id: relativePath,
    path: absolute,
    relative_path: relativePath,
    name,
    tags: Array.isArray(merged.tags) ? merged.tags.map(String) : [],
    aliases: Array.isArray(merged.aliases) ? merged.aliases.map(String) : [],
    style: merged.style || "",
    source_type: merged.source_type || "",
    harvest_status: merged.harvest_status || "",
    quality_score: Number.isFinite(Number(merged.quality_score)) ? Number(merged.quality_score) : null
  };
  asset.kind = merged.kind || inferKind(asset);
  asset.description = normalizeText(merged.description || [
    asset.name,
    asset.style,
    asset.source_type,
    asset.harvest_status,
    asset.kind,
    ...asset.tags,
    ...asset.aliases,
    asset.relative_path
  ].join(" "));
  return asset;
}

function loadIconLibrary(inputPath) {
  const resolved = path.resolve(inputPath || "");
  const root = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()
    ? resolved
    : path.dirname(resolved);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`Icon library directory does not exist: ${root}`);
  }

  const explicitIndex = fs.existsSync(resolved) && fs.statSync(resolved).isFile()
    ? resolved
    : path.join(root, "index.json");
  const manifest = manifestMetadata(root);
  const assets = [];
  const seen = new Set();

  if (fs.existsSync(explicitIndex)) {
    const index = JSON.parse(fs.readFileSync(explicitIndex, "utf8"));
    for (const raw of index.icons || []) {
      const relative = raw.relative_path || raw.relativePath || raw.path || "";
      const metadata = manifest.icons[relative] || {};
      const asset = normalizeAsset(root, raw, metadata);
      if (asset && !seen.has(asset.id)) {
        seen.add(asset.id);
        assets.push(asset);
      }
    }
  }

  for (const absolute of scanFiles(root)) {
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    if (seen.has(relative)) continue;
    const metadata = manifest.icons[relative] || {};
    const asset = normalizeAsset(root, { path: absolute, style: manifest.defaultStyle }, metadata);
    if (asset) {
      seen.add(asset.id);
      assets.push(asset);
    }
  }

  return {
    schema_version: 1,
    root,
    count: assets.length,
    default_style: manifest.defaultStyle,
    icons: assets
  };
}

function searchIconLibrary(index, query, options = {}) {
  const expanded = expandQuery(query);
  const tokens = [...new Set(expanded.split(" ").filter(Boolean))];
  const requestedKind = normalizeText(options.kind);
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 20));

  return index.icons
    .map((asset) => {
      const haystack = expandQuery(asset.description);
      const name = expandQuery(asset.name);
      let score = 0;
      if (expanded && name === expanded) score += 120;
      if (expanded && haystack.includes(expanded)) score += 55;
      for (const token of tokens) {
        const words = haystack.split(" ");
        if (words.includes(token)) score += 24;
        else if (haystack.includes(token)) score += 10;
      }
      if (requestedKind) {
        if (asset.kind === requestedKind) score += 24;
        else if (requestedKind === "arrow" && asset.kind === "line") score += 8;
        else if (requestedKind === "line" && asset.kind === "arrow") score += 8;
        else score -= 12;
      }
      if (asset.quality_score !== null) score += Math.max(0, Math.min(10, asset.quality_score * 5));
      return { ...asset, score: Math.round(score * 100) / 100 };
    })
    .filter((asset) => !expanded || asset.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "zh-CN"))
    .slice(0, limit);
}

function publicAsset(asset) {
  return {
    id: asset.id,
    relative_path: asset.relative_path,
    name: asset.name,
    tags: asset.tags,
    aliases: asset.aliases,
    style: asset.style,
    kind: asset.kind,
    quality_score: asset.quality_score,
    score: asset.score
  };
}

function mimeFor(filePath) {
  return ({
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml"
  })[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

module.exports = {
  SUPPORTED_EXTENSIONS,
  isInside,
  loadIconLibrary,
  mimeFor,
  publicAsset,
  searchIconLibrary
};
