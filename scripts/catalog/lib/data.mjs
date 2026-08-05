import fs from "node:fs";
import vm from "node:vm";

export function readCatalogData(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: filePath, timeout: 10_000 });
  const items = sandbox.window.KITRADE_PARTS;
  if (!Array.isArray(items)) throw new Error("window.KITRADE_PARTS is missing or is not an array");
  return items.map((item) => structuredClone(item));
}

export function normalizePhoto(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  const match = value.match(/[?&]imageSlug=([^&]+)/);
  if (match) return `https://80.img.avito.st${decodeURIComponent(match[1])}`;
  return value.replace(/^http:\/\//i, "https://");
}
