// serve.mjs — minimal static file server for local dev/verification.
// Usage: node serve.mjs [root] [port]
import http from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(process.argv[2] || fileURLToPath(new URL(".", import.meta.url)));
const port = parseInt(process.argv[3] || "4173", 10);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (urlPath === "/") urlPath = "/index.html";
    const file = join(root, urlPath);
    const rel = relative(root, file);
    if (rel.startsWith("..") || isAbsolute(rel)) { res.writeHead(403); return res.end("Forbidden"); }
    let st;
    try { st = statSync(file); }
    catch { res.writeHead(404); return res.end("Not found"); }
    const type = MIME[extname(file)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    createReadStream(file).pipe(res);
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
});

server.listen(port, () => {
  console.log(`WebFacer serving ${root} at http://127.0.0.1:${port}`);
});
