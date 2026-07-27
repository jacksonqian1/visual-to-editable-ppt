#!/usr/bin/env node
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");
const {
  loadIconLibrary,
  loadIconLibraries,
  mimeFor,
  publicAsset,
  searchIconLibrary
} = require("./icon_library.cjs");
const {
  DEFAULT_STORE_ROOT,
  ensureSharedIconStore,
  expandHome
} = require("./shared_icon_store.cjs");

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const projectPath = path.resolve(arg("project", ""));
const port = Number(arg("port", "4173"));
const host = arg("host", "127.0.0.1");
const editorRoot = path.resolve(__dirname, "../assets/editor");
const projectRoot = path.dirname(projectPath);
const iconLibraryOverride = arg("icon-library", "");
let iconLibraryCache = null;
let iconLibraryCacheKey = "";

if (!projectPath || !fs.existsSync(projectPath)) {
  console.error("Usage: node serve_editor.cjs --project scene.json [--icon-library /path/to/icons] [--port 4173]");
  process.exit(2);
}

function send(response, status, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  response.end(body);
}

function safeJoin(root, requestPath) {
  const clean = decodeURIComponent(requestPath).replace(/^\/+/, "");
  const resolved = path.resolve(root, clean);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

function mime(filePath) {
  return ({
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".webp": "image/webp"
  })[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 25 * 1024 * 1024) {
        reject(new Error("Request body exceeds 25 MB"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function validateProject(project) {
  if (!project || typeof project !== "object") throw new Error("Project must be a JSON object");
  if (!project.canvas || !Number(project.canvas.width) || !Number(project.canvas.height)) {
    throw new Error("Project canvas width and height are required");
  }
  if (!Array.isArray(project.elements)) throw new Error("Project elements must be an array");
  const ids = new Set();
  for (const element of project.elements) {
    if (!element.id) throw new Error("Every element requires an id");
    if (ids.has(element.id)) throw new Error(`Duplicate element id: ${element.id}`);
    ids.add(element.id);
  }
}

async function saveProject(project) {
  validateProject(project);
  const tempPath = `${projectPath}.tmp`;
  await fs.promises.writeFile(tempPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
  await fs.promises.rename(tempPath, projectPath);
}

async function projectIconLibraryRoots() {
  const project = JSON.parse(await fs.promises.readFile(projectPath, "utf8"));
  const roots = [];
  if (iconLibraryOverride) roots.push(path.resolve(iconLibraryOverride));
  else if (project.iconLibrary?.root) roots.push(expandHome(project.iconLibrary.root));
  if (project.sharedIconStore?.enabled !== false) {
    roots.push(expandHome(project.sharedIconStore?.icons || ensureSharedIconStore(DEFAULT_STORE_ROOT).icons));
  }
  return [...new Set(roots.filter(Boolean))];
}

async function getIconLibrary() {
  const roots = await projectIconLibraryRoots();
  if (roots.length === 0) return null;
  const key = roots.join("\u0000");
  if (!iconLibraryCache || iconLibraryCacheKey !== key) {
    iconLibraryCache = loadIconLibraries(roots);
    iconLibraryCacheKey = key;
  }
  return iconLibraryCache;
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`);
    if (url.pathname === "/api/project" && request.method === "GET") {
      return send(response, 200, await fs.promises.readFile(projectPath), "application/json; charset=utf-8");
    }
    if (url.pathname === "/api/project" && request.method === "PUT") {
      const body = await readBody(request);
      const project = JSON.parse(body.toString("utf8"));
      await saveProject(project);
      return send(response, 200, JSON.stringify({ ok: true }), "application/json; charset=utf-8");
    }
    if (url.pathname === "/api/icon-library" && request.method === "GET") {
      const library = await getIconLibrary();
      if (!library) {
        return send(response, 200, JSON.stringify({ configured: false, count: 0, matches: [] }), "application/json; charset=utf-8");
      }
      const query = url.searchParams.get("query") || "";
      const kind = url.searchParams.get("kind") || "";
      const limit = Number(url.searchParams.get("limit") || "24");
      const matches = searchIconLibrary(library, query, { kind, limit }).map((asset) => ({
        ...publicAsset(asset),
        thumbnail: `/api/icon-library/asset?id=${encodeURIComponent(asset.id)}`
      }));
      return send(response, 200, JSON.stringify({
        configured: true,
        root: library.root,
        roots: library.roots,
        count: library.count,
        query,
        kind,
        matches
      }), "application/json; charset=utf-8");
    }
    if (url.pathname === "/api/icon-library/asset" && request.method === "GET") {
      const library = await getIconLibrary();
      if (!library) return send(response, 404, "Icon library is not configured");
      const id = url.searchParams.get("id") || "";
      const asset = library.icons.find((item) => item.id === id);
      if (!asset) return send(response, 404, "Icon asset not found");
      return send(response, 200, await fs.promises.readFile(asset.path), mimeFor(asset.path));
    }
    if (url.pathname === "/api/health") {
      const library = await getIconLibrary();
      return send(response, 200, JSON.stringify({
        ok: true,
        project: projectPath,
        iconLibrary: library ? { root: library.root, count: library.count } : null
      }), "application/json; charset=utf-8");
    }

    const editorPath = url.pathname === "/"
      ? path.join(editorRoot, "index.html")
      : safeJoin(editorRoot, url.pathname);
    if (editorPath && fs.existsSync(editorPath) && fs.statSync(editorPath).isFile()) {
      return send(response, 200, await fs.promises.readFile(editorPath), mime(editorPath));
    }

    const assetPath = safeJoin(projectRoot, url.pathname);
    if (assetPath && fs.existsSync(assetPath) && fs.statSync(assetPath).isFile()) {
      return send(response, 200, await fs.promises.readFile(assetPath), mime(assetPath));
    }
    return send(response, 404, "Not found");
  } catch (error) {
    return send(response, 500, error.stack || error.message);
  }
});

server.listen(port, host, () => {
  console.log(`Editor: http://${host}:${port}`);
  console.log(`Project: ${projectPath}`);
  if (iconLibraryOverride) console.log(`Icon library: ${path.resolve(iconLibraryOverride)}`);
});
