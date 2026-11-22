import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? ".public-site");
const port = Number(process.argv[3] ?? 4310);
const contentTypes = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".json": "application/json", ".xml": "application/xml", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpeg": "image/jpeg", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".ico": "image/x-icon", ".pdf": "application/pdf", ".zip": "application/zip",
};
if (!(await stat(path.join(root, "shop.html"))).isFile()) throw new Error("Stage the preview before starting.");

const server = createServer(async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405).end("Local preview only. No form or checkout requests are sent.");
    return;
  }
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    let name = decodeURIComponent(url.pathname).replace(/^\//, "").replace(/\/$/, "") || "index.html";
    if (!/^[\w./-]+$/.test(name) || name.split("/").some(segment => !segment || segment.startsWith("."))) {
      res.writeHead(404).end();
      return;
    }
    if (!path.extname(name)) name += ".html";
    const file = path.join(root, name);
    const info = await stat(file);
    if (!info.isFile()) throw new Error("Not a file.");
    res.writeHead(200, { "Content-Type": contentTypes[path.extname(file).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": info.size, "Cache-Control": "no-store" });
    if (req.method === "HEAD") res.end();
    else createReadStream(file).on("error", () => res.destroy()).pipe(res);
  } catch {
    res.writeHead(404).end("Page not found in the local preview.");
  }
});
server.listen(port, "127.0.0.1", () => console.log("Phase 10 preview: http://127.0.0.1:" + server.address().port + "/"));
