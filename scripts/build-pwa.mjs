import { readFile, writeFile, mkdir, copyFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const html = await readFile("index.html", "utf8");
const assets = ["index.html", "manifest.webmanifest", "vendor/zxing-0.2.1.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png", "icons/favicon-32.png"];
for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const url = match[1];
  if (!url.includes(":") && /\.(?:js|css)(?:\?|$)/.test(url)) assets.push(url);
}
const shell = await Promise.all([...new Set(assets)].sort().map(async url => ({ url, sha256: hash(await readFile(url.split("?")[0])) })));
const template = await readFile("scripts/sw-template.js", "utf8");
const revision = hash(JSON.stringify(shell) + template).slice(0, 20);
const generated = template.replace('"__REVISION__"', JSON.stringify(revision)).replace("__SHELL__", JSON.stringify(shell, null, 2));
if (process.argv.includes("--check")) {
  if (await readFile("sw.js", "utf8") !== generated) throw new Error("Stale sw.js; run npm run build:pwa");
} else {
  await writeFile("sw.js", generated);
  await rm("public", { recursive: true, force: true });
  // Publish only public app assets; source, tests, dependencies and local files stay out.
  for (const file of [...new Set([...assets.map(url => url.split("?")[0]), "sw.js", "vendor/ZXING-BROWSER-LICENSE", "vendor/ZXING-LIBRARY-LICENSE"])]) {
    await mkdir(dirname(`public/${file}`), { recursive: true });
    await copyFile(file, `public/${file}`);
  }
}
console.log(`PWA shell ${revision}: ${shell.length} verified assets`);
