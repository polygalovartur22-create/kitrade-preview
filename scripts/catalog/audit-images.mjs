import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePhoto, readCatalogData } from "./lib/data.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outputPath = path.join(projectDir, "seo", "image-observations.json");
const items = readCatalogData(path.join(projectDir, "kitrade-parts-data.js"));
const urls = [...new Set(items.flatMap((item) => item.photos || []).map((url) => String(url || "").trim()).filter(Boolean))];

function imageDimensions(buffer, contentType) {
  if (buffer.length >= 24 && buffer.toString("ascii", 1, 4) === "PNG") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length >= 10 && /^image\/gif/i.test(contentType)) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (buffer.length >= 30 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    const kind = buffer.toString("ascii", 12, 16);
    if (kind === "VP8X") return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
    if (kind === "VP8 " && buffer.length >= 30) return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    if (kind === "VP8L" && buffer.length >= 25) {
      const bits = buffer.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      if (offset + 4 >= buffer.length) break;
      offset += 2 + buffer.readUInt16BE(offset + 2);
    }
  }
  return { width: null, height: null };
}

async function observe(rawUrl) {
  const normalizedUrl = normalizePhoto(rawUrl);
  const observedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(normalizedUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: { Range: "bytes=0-262143", "User-Agent": "KITRADE-image-audit/1.0" },
    });
    const contentType = String(response.headers.get("content-type") || "").split(";")[0].trim().toLocaleLowerCase("en");
    const body = Buffer.from(await response.arrayBuffer());
    const dimensions = /^image\//i.test(contentType) ? imageDimensions(body, contentType) : { width: null, height: null };
    return {
      normalized_url: normalizedUrl,
      http_status: response.status,
      content_type: contentType || null,
      observed_at: observedAt,
      width: dimensions.width,
      height: dimensions.height,
      final_url: response.url,
      error: null,
    };
  } catch (error) {
    return {
      normalized_url: normalizedUrl,
      http_status: null,
      content_type: null,
      observed_at: observedAt,
      width: null,
      height: null,
      final_url: null,
      error: error?.name === "AbortError" ? "timeout" : String(error?.message || error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

const observations = {};
const concurrency = 32;
let cursor = 0;
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (cursor < urls.length) {
    const index = cursor;
    cursor += 1;
    const rawUrl = urls[index];
    observations[rawUrl] = await observe(rawUrl);
  }
}));

fs.writeFileSync(outputPath, `${JSON.stringify({
  generated_at: new Date().toISOString(),
  source_unique_links: urls.length,
  observations,
}, null, 2)}\n`);
console.log(`Observed ${Object.keys(observations).length} of ${urls.length} unique image links.`);
