import sharp from "sharp";
import toIco from "to-ico";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const publicDir = new URL("../public", import.meta.url).pathname;
const iconsDir = join(publicDir, "icons");
mkdirSync(iconsDir, { recursive: true });

const CROSS_PATH = "m202,2V562M2,202H402";
const STROKE_WIDTH = 80;
const ZINC_950 = { r: 9, g: 9, b: 11, alpha: 1 };

function makeSvg({ bg, stroke, width = 404, height = 564 }) {
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
${bg ? `<rect width="${width}" height="${height}" fill="${bg}"/>` : ""}
<path stroke="${stroke}" stroke-width="${STROKE_WIDTH}" d="${CROSS_PATH}"/>
</svg>`
  );
}

// SVG source variants
const darkSvg = makeSvg({ bg: "#09090b", stroke: "#ffffff" }); // white cross on zinc-950
const lightSvg = makeSvg({ bg: "#ffffff", stroke: "#000000" }); // black cross on white
const transparentSvg = makeSvg({ stroke: "#000000" }); // black cross, transparent bg

async function resizePng(svgBuf, size, opts = {}) {
  const { padding = false } = opts;

  if (padding) {
    // Maskable: safe zone is inner 80%, so we render at 80% then extend
    const innerSize = Math.round(size * 0.8);
    const pad = Math.round(size * 0.1);
    return sharp(svgBuf)
      .resize(innerSize, innerSize, { fit: "contain", background: ZINC_950 })
      .extend({ top: pad, bottom: pad, left: pad, right: pad, background: ZINC_950 })
      .png()
      .toBuffer();
  }

  return sharp(svgBuf)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function main() {
  const jobs = [
    // Standard favicons (transparent bg, black cross)
    { out: "favicon-16x16.png", svg: transparentSvg, size: 16 },
    { out: "favicon-32x32.png", svg: transparentSvg, size: 32 },
    { out: "favicon-48x48.png", svg: transparentSvg, size: 48 },

    // Apple Touch Icons
    { out: "apple-touch-icon.png", svg: darkSvg, size: 180 },           // default (dark)
    { out: "icons/apple-touch-icon-light.png", svg: lightSvg, size: 180 },
    { out: "icons/apple-touch-icon-dark.png", svg: darkSvg, size: 180 },

    // PWA manifest icons
    { out: "icons/icon-192.png", svg: darkSvg, size: 192 },
    { out: "icons/icon-512.png", svg: darkSvg, size: 512 },
    { out: "icons/icon-512-maskable.png", svg: darkSvg, size: 512, padding: true },

    // OG / social (1200x630 with dark bg, cross centered)
    // (generated separately below)
  ];

  const bufs = {};

  for (const job of jobs) {
    const buf = await resizePng(job.svg, job.size, { padding: job.padding });
    const dest = join(publicDir, job.out);
    writeFileSync(dest, buf);
    console.log(`  ✓ ${job.out}`);
    bufs[job.out] = buf;
  }

  // favicon.ico — bundles 16, 32, 48
  const icoBufs = await Promise.all([
    resizePng(transparentSvg, 16),
    resizePng(transparentSvg, 32),
    resizePng(transparentSvg, 48),
  ]);
  const ico = await toIco(icoBufs);
  writeFileSync(join(publicDir, "favicon.ico"), ico);
  console.log("  ✓ favicon.ico (16/32/48)");

  console.log("\nDone. All icons written to public/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
