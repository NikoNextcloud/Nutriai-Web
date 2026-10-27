// The existing NutriAI apple and scanner mark, kept as an editable vector source.
import sharp from "sharp";
import { readFile } from "node:fs/promises";
const svg = await readFile("icons/icon.svg");
for (const [filename, size] of [["icon-192",192],["icon-512",512],["maskable-512",512],["apple-touch-icon",180],["favicon-32",32]]) {
  await sharp(svg).resize(size, size).removeAlpha().png().toFile(`icons/${filename}.png`);
}
