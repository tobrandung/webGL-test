/** Colour-space and tone-curve maths for the HDRI pipeline. Pure. */

import type { LinearImageF32 } from './types.ts';

/** Rec. 709 relative luminance of a linear RGB triple. */
export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** sRGB EOTF as a 256-entry table: display-encoded byte -> linear [0,1]. */
export const SRGB_TO_LINEAR: Float32Array = (() => {
  const table = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    table[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }
  return table;
})();

/** sRGB OETF: linear [0,1] -> display-encoded [0,1]. */
export function linearToSrgb(x: number): number {
  if (!(x > 0)) return 0;
  if (x >= 1) return 1;
  return x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055;
}

/** Lower and upper bound for a usable white point, in linear light. */
export const MIN_WHITE_POINT = 1;
export const MAX_WHITE_POINT = 64;

/**
 * Extended Reinhard with an explicit white point: maps [0, w] into [0, 1] while
 * leaving mid-tones nearly untouched (0.18 stays 0.178 at w = 16).
 *
 * This is the transfer used for the SDR/WebP output. A hard clip at 1.0 would
 * turn a 75000:1 sun disc into a matte white blob and the reflections it drives
 * go dead; the knee keeps the relative highlight structure instead, at the cost
 * of absolute radiometry. Deliberately *not* ACES: an ACES-baked file that is
 * then used as `scene.environment` gets tone mapped a second time at render
 * time, which crushes and desaturates every reflection.
 */
export function softKnee(x: number, whitePoint: number): number {
  const w2 = whitePoint * whitePoint;
  return (x * (1 + x / w2)) / (1 + x);
}

/** Clamps an estimated peak into the range `softKnee` behaves well over. */
export function clampWhitePoint(value: number): number {
  if (!Number.isFinite(value)) return MAX_WHITE_POINT;
  return Math.min(MAX_WHITE_POINT, Math.max(MIN_WHITE_POINT, value));
}

/**
 * White point for `softKnee`, taken as the 99.9th percentile of the per-pixel
 * peak component.
 *
 * A log2 histogram rather than a sort: 2M pixels sort in hundreds of
 * milliseconds and we only need one quantile. Using the plain maximum instead
 * would let a single sun pixel (75000 on one of the sample HDRIs) set the knee
 * and crush the whole image into the bottom of the range.
 */
export function estimateWhitePoint(image: LinearImageF32): number {
  const BUCKETS = 1024;
  const MIN_LOG = -8;
  const MAX_LOG = 24;
  const { data, width, height } = image;
  const pixels = width * height;
  const histogram = new Int32Array(BUCKETS);

  for (let p = 0, o = 0; p < pixels; p++, o += 3) {
    const peak = Math.max(data[o], data[o + 1], data[o + 2]);
    if (!(peak > 0)) {
      histogram[0]++;
      continue;
    }
    const bucket = Math.round(((Math.log2(peak) - MIN_LOG) / (MAX_LOG - MIN_LOG)) * (BUCKETS - 1));
    histogram[Math.min(BUCKETS - 1, Math.max(0, bucket))]++;
  }

  const target = pixels * 0.999;
  let cumulative = 0;
  for (let bucket = 0; bucket < BUCKETS; bucket++) {
    cumulative += histogram[bucket];
    if (cumulative >= target) {
      return clampWhitePoint(2 ** (MIN_LOG + (bucket / (BUCKETS - 1)) * (MAX_LOG - MIN_LOG)));
    }
  }
  return clampWhitePoint(image.maxComponent);
}
