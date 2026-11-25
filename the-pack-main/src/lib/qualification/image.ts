/**
 * Pixel-level helpers for the image capability tests: decoding, the exact
 * edit operations the editing test asks for, and the statistics that tell a
 * generated raster image from one drawn with code.
 *
 * Everything works on plain 8-bit RGB buffers so the expected result of an
 * edit is computed by this file alone and does not depend on how any image
 * library interprets "flip" or "grayscale".
 */
import sharp from "sharp";

export interface RGBImage {
  width: number;
  height: number;
  /** width * height * 3 bytes, row-major, R G B */
  data: Uint8Array;
}

export type EditOp =
  | { op: "crop"; x: number; y: number; w: number; h: number }
  | { op: "flipH" }
  | { op: "flipV" }
  | { op: "rotate90cw" }
  | { op: "rotate180" }
  | { op: "invert" }
  | { op: "grayscale" }
  | { op: "border"; width: number; color: string };

/** Decodes any format sharp reads into RGB. Transparency is flattened onto white. */
export async function decodeRGB(buf: Buffer): Promise<RGBImage> {
  const { data, info } = await sharp(buf, { failOn: "error" })
    .rotate() // honour EXIF orientation, as an image viewer would
    .flatten({ background: "#ffffff" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels === 3) return { width, height, data: new Uint8Array(data) };
  const out = new Uint8Array(width * height * 3);
  for (let i = 0, p = 0; i < width * height; i++, p += channels) {
    const r = data[p];
    const g = channels >= 3 ? data[p + 1] : r;
    const b = channels >= 3 ? data[p + 2] : r;
    out[i * 3] = r;
    out[i * 3 + 1] = g;
    out[i * 3 + 2] = b;
  }
  return { width, height, data: out };
}

export async function encodePNG(img: RGBImage): Promise<Buffer> {
  return sharp(Buffer.from(img.data), {
    raw: { width: img.width, height: img.height, channels: 3 },
  })
    .png()
    .toBuffer();
}

function hexToRGB(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Bad colour ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function applyOp(img: RGBImage, op: EditOp): RGBImage {
  const { width: W, height: H, data: src } = img;
  switch (op.op) {
    case "crop": {
      const out = new Uint8Array(op.w * op.h * 3);
      for (let y = 0; y < op.h; y++) {
        const from = ((op.y + y) * W + op.x) * 3;
        out.set(src.subarray(from, from + op.w * 3), y * op.w * 3);
      }
      return { width: op.w, height: op.h, data: out };
    }
    case "flipH": {
      const out = new Uint8Array(src.length);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const s = (y * W + x) * 3, d = (y * W + (W - 1 - x)) * 3;
          out[d] = src[s]; out[d + 1] = src[s + 1]; out[d + 2] = src[s + 2];
        }
      return { width: W, height: H, data: out };
    }
    case "flipV": {
      const out = new Uint8Array(src.length);
      for (let y = 0; y < H; y++)
        out.set(src.subarray(y * W * 3, (y + 1) * W * 3), (H - 1 - y) * W * 3);
      return { width: W, height: H, data: out };
    }
    case "rotate90cw": {
      // Source (x, y) lands at (H - 1 - y, x) in a W-tall, H-wide image.
      const out = new Uint8Array(src.length);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const s = (y * W + x) * 3, d = (x * H + (H - 1 - y)) * 3;
          out[d] = src[s]; out[d + 1] = src[s + 1]; out[d + 2] = src[s + 2];
        }
      return { width: H, height: W, data: out };
    }
    case "rotate180": {
      const out = new Uint8Array(src.length);
      const n = W * H;
      for (let i = 0; i < n; i++) {
        const s = i * 3, d = (n - 1 - i) * 3;
        out[d] = src[s]; out[d + 1] = src[s + 1]; out[d + 2] = src[s + 2];
      }
      return { width: W, height: H, data: out };
    }
    case "invert": {
      const out = new Uint8Array(src.length);
      for (let i = 0; i < src.length; i++) out[i] = 255 - src[i];
      return { width: W, height: H, data: out };
    }
    case "grayscale": {
      // The instruction states this exact formula (ITU-R BT.601 luma).
      const out = new Uint8Array(src.length);
      for (let i = 0; i < src.length; i += 3) {
        const l = Math.round(0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]);
        out[i] = out[i + 1] = out[i + 2] = l;
      }
      return { width: W, height: H, data: out };
    }
    case "border": {
      const b = op.width;
      const [r, g, bl] = hexToRGB(op.color);
      const OW = W + 2 * b, OH = H + 2 * b;
      const out = new Uint8Array(OW * OH * 3);
      for (let i = 0; i < OW * OH; i++) {
        out[i * 3] = r; out[i * 3 + 1] = g; out[i * 3 + 2] = bl;
      }
      for (let y = 0; y < H; y++)
        out.set(src.subarray(y * W * 3, (y + 1) * W * 3), ((y + b) * OW + b) * 3);
      return { width: OW, height: OH, data: out };
    }
  }
}

export function applyOps(img: RGBImage, ops: EditOp[]): RGBImage {
  return ops.reduce(applyOp, img);
}

/** Per-pixel comparison of two same-size images. */
export function compareImages(a: RGBImage, b: RGBImage) {
  let sum = 0, within = 0;
  const n = a.width * a.height;
  for (let i = 0; i < n; i++) {
    const p = i * 3;
    const d0 = Math.abs(a.data[p] - b.data[p]);
    const d1 = Math.abs(a.data[p + 1] - b.data[p + 1]);
    const d2 = Math.abs(a.data[p + 2] - b.data[p + 2]);
    sum += d0 + d1 + d2;
    if (Math.max(d0, d1, d2) <= 12) within++;
  }
  return { meanAbsDiff: sum / (n * 3), withinTolerance: within / n };
}

/**
 * Statistics that separate a generated (photographic or painterly) raster
 * image from one drawn with code (flat fills, clean gradients, shapes, text).
 *  - uniqueColors: drawn art has tens to a few thousand; generated images
 *    have tens of thousands or more.
 *  - meanGradient: average luminance change to the right/lower neighbour.
 *    Flat fills and smooth gradients sit near 0; real texture is several.
 *  - flatRatio: share of pixels identical to their right-hand neighbour.
 */
export function imageStats(img: RGBImage) {
  const { width: W, height: H, data } = img;
  const seen = new Uint8Array(1 << 21); // 2^24 bits
  let unique = 0, grad = 0, gradN = 0, flat = 0;
  const lum = (p: number) => 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 3;
      const c = (data[p] << 16) | (data[p + 1] << 8) | data[p + 2];
      const byte = c >> 3, bit = 1 << (c & 7);
      if (!(seen[byte] & bit)) { seen[byte] |= bit; unique++; }
      if (x + 1 < W && y + 1 < H) {
        const l = lum(p);
        grad += (Math.abs(l - lum(p + 3)) + Math.abs(l - lum(p + W * 3))) / 2;
        gradN++;
      }
      if (x + 1 < W && data[p] === data[p + 3] && data[p + 1] === data[p + 4] && data[p + 2] === data[p + 5]) flat++;
    }
  }
  return {
    uniqueColors: unique,
    meanGradient: gradN ? grad / gradN : 0,
    flatRatio: flat / Math.max(1, (W - 1) * H),
  };
}

/**
 * A fresh source image for the editing test: an angled two-colour gradient
 * under a mosaic of random 16 px blocks, a handful of random shapes and light
 * noise. The mosaic matters: without it a crop that misses every shape is
 * just a smooth gradient, and a wrong flip of that can match the right one.
 * With it every part of the image is unique, so no wrong transform can.
 */
export function makeSourceImage(width = 640, height = 480): RGBImage {
  const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
  const c1 = [rnd(20, 235), rnd(20, 235), rnd(20, 235)];
  const c2 = [rnd(20, 235), rnd(20, 235), rnd(20, 235)];
  const angle = Math.random() * Math.PI * 2;
  const ux = Math.cos(angle), uy = Math.sin(angle);
  const data = new Uint8Array(width * height * 3);
  const span = Math.abs(ux) * width + Math.abs(uy) * height;
  const ox = ux < 0 ? width : 0, oy = uy < 0 ? height : 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const t = ((x - ox) * ux + (y - oy) * uy) / span;
      const p = (y * width + x) * 3;
      for (let k = 0; k < 3; k++) data[p + k] = Math.round(c1[k] + (c2[k] - c1[k]) * t);
    }
  const BLOCK = 16;
  for (let by = 0; by < height; by += BLOCK)
    for (let bx = 0; bx < width; bx += BLOCK) {
      const off = [rnd(-45, 45), rnd(-45, 45), rnd(-45, 45)];
      for (let y = by; y < Math.min(height, by + BLOCK); y++)
        for (let x = bx; x < Math.min(width, bx + BLOCK); x++) {
          const p = (y * width + x) * 3;
          for (let k = 0; k < 3; k++) data[p + k] = Math.max(0, Math.min(255, data[p + k] + off[k]));
        }
    }
  const shapes = rnd(6, 10);
  for (let s = 0; s < shapes; s++) {
    const col = [rnd(0, 255), rnd(0, 255), rnd(0, 255)];
    const cx = rnd(0, width), cy = rnd(0, height), r = rnd(25, 110);
    const circle = Math.random() < 0.5;
    const rw = rnd(30, 200), rh = rnd(30, 160);
    for (let y = Math.max(0, cy - r - rh); y < Math.min(height, cy + r + rh); y++)
      for (let x = Math.max(0, cx - r - rw); x < Math.min(width, cx + r + rw); x++) {
        const inside = circle
          ? (x - cx) ** 2 + (y - cy) ** 2 <= r * r
          : x >= cx && x < cx + rw && y >= cy && y < cy + rh;
        if (inside) {
          const p = (y * width + x) * 3;
          data[p] = col[0]; data[p + 1] = col[1]; data[p + 2] = col[2];
        }
      }
  }
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.max(0, Math.min(255, data[i] + rnd(-6, 6)));
  }
  return { width, height, data };
}
