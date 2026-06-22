/*
 * Generates the extension icons (16/32/48/128 px) with no external deps.
 * Draws a rounded indigo tile, a white clock, and a rose "no" slash - i.e.
 * "no time". Renders at 4x and box-downscales for smooth edges, then encodes
 * a PNG by hand using Node's built-in zlib.
 *
 *   node tools/make-icons.mjs
 */
import zlib from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "icons");
mkdirSync(OUT, { recursive: true });

// ---------- minimal PNG encoder (RGBA, 8-bit) ----------
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ---------- drawing ----------
function render(size) {
  const SS = 4; // supersample
  const S = size * SS;
  const hi = Buffer.alloc(S * S * 4);

  const blend = (x, y, r, g, b, a) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= S || y >= S || a <= 0) return;
    const i = (y * S + x) * 4;
    const sa = a / 255;
    const da = hi[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    hi[i] = Math.round((r * sa + hi[i] * da * (1 - sa)) / oa);
    hi[i + 1] = Math.round((g * sa + hi[i + 1] * da * (1 - sa)) / oa);
    hi[i + 2] = Math.round((b * sa + hi[i + 2] * da * (1 - sa)) / oa);
    hi[i + 3] = Math.round(oa * 255);
  };

  const R = S * 0.22; // corner radius
  const inRound = (x, y) => {
    if ((x < R || x > S - R) && (y < R || y > S - R)) {
      const cx = x < R ? R : S - R;
      const cy = y < R ? R : S - R;
      return (x - cx) ** 2 + (y - cy) ** 2 <= R * R;
    }
    return true;
  };

  // rounded tile with vertical indigo->violet gradient
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (!inRound(x, y)) continue;
      const t = y / S;
      blend(x, y, Math.round(79 + 45 * t), Math.round(70 - 12 * t), Math.round(229 + 8 * t), 255);
    }
  }

  const cx = S * 0.5;
  const cy = S * 0.47;
  const rad = S * 0.28;
  const ring = S * 0.072;

  // clock face ring
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (Math.abs(d - rad) <= ring) blend(x, y, 246, 247, 255, 255);
    }
  }

  const line = (x0, y0, x1, y1, lw, r, g, b) => {
    const vx = x1 - x0;
    const vy = y1 - y0;
    const len2 = vx * vx + vy * vy || 1;
    const minx = Math.max(0, Math.floor(Math.min(x0, x1) - lw));
    const maxx = Math.min(S - 1, Math.ceil(Math.max(x0, x1) + lw));
    const miny = Math.max(0, Math.floor(Math.min(y0, y1) - lw));
    const maxy = Math.min(S - 1, Math.ceil(Math.max(y0, y1) + lw));
    for (let y = miny; y <= maxy; y++) {
      for (let x = minx; x <= maxx; x++) {
        let t = ((x - x0) * vx + (y - y0) * vy) / len2;
        t = Math.max(0, Math.min(1, t));
        const px = x0 + t * vx;
        const py = y0 + t * vy;
        if (Math.hypot(x - px, y - py) <= lw / 2) blend(x, y, r, g, b, 255);
      }
    }
  };

  // clock hands
  line(cx, cy, cx, cy - rad * 0.55, S * 0.06, 246, 247, 255);
  line(cx, cy, cx + rad * 0.62, cy, S * 0.055, 246, 247, 255);

  // prohibition slash (dark edge then bright rose)
  line(S * 0.2, S * 0.8, S * 0.8, S * 0.2, S * 0.2, 25, 22, 38);
  line(S * 0.2, S * 0.8, S * 0.8, S * 0.2, S * 0.12, 244, 63, 94);

  // box-downscale to target size
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const i = ((y * SS + dy) * S + (x * SS + dx)) * 4;
          const al = hi[i + 3];
          r += hi[i] * al;
          g += hi[i + 1] * al;
          b += hi[i + 2] * al;
          a += al;
        }
      }
      const o = (y * size + x) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
      }
      out[o + 3] = Math.round(a / (SS * SS));
    }
  }
  return out;
}

for (const size of [16, 32, 48, 128]) {
  writeFileSync(resolve(OUT, `icon${size}.png`), encodePNG(size, size, render(size)));
  console.log("wrote icons/icon" + size + ".png");
}
