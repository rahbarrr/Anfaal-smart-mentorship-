// Generates the Anfaal PWA icons (PNG) from the in-app brand mark
// (white "A" on the Anfaal primary gradient). Run with: npm run icons
// Output is committed, so this only needs re-running when branding changes.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../public/icons');
await mkdir(outDir, { recursive: true });

// `inset` is the safe padding (fraction of canvas) around the glyph.
// Maskable icons need the glyph inside the central ~60% safe zone.
const svg = ({ size, radius, glyphScale }) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8f3f66"/>
      <stop offset="1" stop-color="#7f315c"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
        font-family="Inter, Helvetica, Arial, sans-serif" font-weight="800"
        font-size="${Math.round(size * glyphScale)}" fill="#ffffff">A</text>
</svg>`;

const targets = [
  // purpose "any": rounded corners baked in
  { file: 'icon-192.png', size: 192, radius: 192 * 0.22, glyphScale: 0.6 },
  { file: 'icon-512.png', size: 512, radius: 512 * 0.22, glyphScale: 0.6 },
  // purpose "maskable": full bleed, glyph inside the safe zone
  { file: 'icon-maskable-512.png', size: 512, radius: 0, glyphScale: 0.42 },
  // iOS applies its own rounding, so use full bleed (no transparency)
  { file: 'apple-touch-icon.png', size: 180, radius: 0, glyphScale: 0.54 },
];

for (const t of targets) {
  await sharp(Buffer.from(svg(t))).png().toFile(resolve(outDir, t.file));
  console.log('wrote', t.file);
}
