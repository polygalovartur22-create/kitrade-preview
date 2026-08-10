import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceDir = path.join(projectDir, "dist");
const outputDir = path.join(projectDir, "dist-github-pages");
const basePath = String(process.env.GITHUB_PAGES_BASE_PATH || "/kitrade-preview").replace(/\/$/, "");

if (!/^\/[a-z0-9._-]+$/i.test(basePath)) throw new Error(`Unsafe GitHub Pages base path: ${basePath}`);
if (!fs.existsSync(path.join(sourceDir, "index.html"))) throw new Error("Run the site build before the GitHub Pages post-processing step.");
if (path.dirname(outputDir) !== projectDir) throw new Error("Unsafe GitHub Pages output directory.");

fs.rmSync(outputDir, { recursive: true, force: true });

function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath);
    } else {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

copyDirectory(sourceDir, outputDir);

const robotsMeta = '<meta name="robots" content="noindex,nofollow,noarchive" />';

function transformHtml(content) {
  let html = content.replace(
    /\b(href|src|action|poster)=(['"])\/(?!\/)/g,
    (_, attribute, quote) => `${attribute}=${quote}${basePath}/`,
  );
  if (/<meta\s+name=["']robots["'][^>]*>/i.test(html)) {
    html = html.replace(/<meta\s+name=["']robots["'][^>]*>/i, robotsMeta);
  } else {
    html = html.replace(/(<meta\s+name=["']viewport["'][^>]*>)/i, `$1\n  ${robotsMeta}`);
  }
  return html;
}

function transformCss(content) {
  return content.replace(/url\((['"]?)\/(?!\/)/g, (_, quote) => `url(${quote}${basePath}/`);
}

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(target);
      continue;
    }
    if (entry.name.endsWith(".html")) {
      fs.writeFileSync(target, transformHtml(fs.readFileSync(target, "utf8")));
    } else if (entry.name.endsWith(".css")) {
      fs.writeFileSync(target, transformCss(fs.readFileSync(target, "utf8")));
    }
  }
}

walk(outputDir);
fs.writeFileSync(path.join(outputDir, ".nojekyll"), "");

const registry = JSON.parse(fs.readFileSync(path.join(projectDir, "catalog-url-map.json"), "utf8"));
for (const product of registry.entities.products) {
  for (const legacyPath of product.legacy_paths || []) {
    if (!legacyPath.startsWith("/catalog/product/") || legacyPath === product.canonical_path) continue;
    const relativePath = legacyPath.replace(/^\/+|\/+$/g, "");
    const redirectDir = path.join(outputDir, ...relativePath.split("/"));
    const redirectUrl = `${basePath}${product.canonical_path}`;
    fs.mkdirSync(redirectDir, { recursive: true });
    fs.writeFileSync(path.join(redirectDir, "index.html"), `<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${robotsMeta}
  <link rel="icon" type="image/png" href="${basePath}/assets/kitrade-logo.png" />
  <meta http-equiv="refresh" content="0;url=${redirectUrl}" />
  <link rel="canonical" href="${new URL(product.canonical_path, "https://китрейд.рф/").href}" />
  <title>Переход к товару — KITRADE</title>
</head>
<body><p><a href="${redirectUrl}">Открыть страницу товара</a></p></body>
</html>`);
  }
}

const githubHtmlFiles = [];
function collectHtmlFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) collectHtmlFiles(target);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) githubHtmlFiles.push(target);
  }
}
collectHtmlFiles(outputDir);
for (const file of githubHtmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  const faviconLinks = html.match(/<link\b(?=[^>]*\brel=["'][^"']*\bicon\b[^"']*["'])[^>]*>/gi) || [];
  if (faviconLinks.length !== 1) throw new Error(`Expected one favicon link in ${file}, found ${faviconLinks.length}.`);
  if (!faviconLinks[0].includes(`href="${basePath}/assets/kitrade-logo.png"`)) {
    throw new Error(`GitHub Pages favicon path is invalid in ${file}.`);
  }
}

const runtimeConfig = fs.readFileSync(path.join(outputDir, "site-runtime-config.js"), "utf8");
if (!runtimeConfig.includes(`"deploymentMode":"github-pages"`) || !runtimeConfig.includes(`"basePath":"${basePath}"`)) {
  throw new Error("GitHub Pages runtime configuration is missing.");
}

for (const filename of ["index.html", "404.html", path.join("catalog", "index.html")]) {
  const html = fs.readFileSync(path.join(outputDir, filename), "utf8");
  if (!html.includes(robotsMeta)) throw new Error(`Noindex meta is missing in ${filename}`);
  for (const match of html.matchAll(/\b(?:href|src|action|poster)=(['"])(\/[^'"]*)\1/g)) {
    const url = match[2];
    if (!url.startsWith("//") && url !== basePath && !url.startsWith(`${basePath}/`)) {
      throw new Error(`Unprefixed root URL remains in ${filename}: ${url}`);
    }
  }
}

console.log(`GitHub Pages site built in ${outputDir} with base path ${basePath}.`);
