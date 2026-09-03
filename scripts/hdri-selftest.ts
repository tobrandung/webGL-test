/**
 * Self-test for the pure HDRI core. Run with `npm run hdri:selftest`.
 *
 * Verifies the Radiance writer against both its own reader and three's
 * `HDRLoader`, since three is the actual consumer of everything we emit, and
 * checks the half-float table against `THREE.DataUtils`.
 */

import { existsSync, writeSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { FloatType, DataUtils } from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { encodeRGBE, decodeRGBE } from '../src/lib/hdri/rgbe.ts';
import { fromHalf, halfToFloatTable } from '../src/lib/hdri/half.ts';
import { decodeHDR } from '../src/lib/hdri/decode-hdr.ts';
import { resample } from '../src/lib/hdri/resample.ts';
import { luminance } from '../src/lib/hdri/colorspace.ts';
import type { LinearImageF32 } from '../src/lib/hdri/types.ts';

let failures = 0;

const TRACE = process.env.HDRI_TRACE === '1';

function trace(message: string): void {
  // writeSync so progress stays visible even when stdout is a pipe.
  if (TRACE) writeSync(1, `      · ${message}\n`);
}

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Deterministic per-pixel value in [0,1) — same for all three components. */
function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function image(width: number, height: number, fill: (x: number, y: number, c: number) => number): LinearImageF32 {
  const data = new Float32Array(width * height * 3);
  let maxComponent = 0;
  for (let y = 0, i = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++, i++) {
        const v = Math.max(0, fill(x, y, c));
        data[i] = v;
        if (v > maxComponent) maxComponent = v;
      }
    }
  }
  return { data, dataType: 'float32', components: 3, width, height, isHDR: true, maxComponent };
}

/** Mean relative error over pixels bright enough for RGBE to represent well. */
function meanRelativeError(a: Float32Array, b: Float32Array): { mean: number; worst: number } {
  let sum = 0;
  let count = 0;
  let worst = 0;
  for (let i = 0; i < a.length; i++) {
    const ref = a[i];
    if (ref < 1e-4) continue;
    const err = Math.abs(b[i] - ref) / ref;
    sum += err;
    count++;
    if (err > worst) worst = err;
  }
  return { mean: count ? sum / count : 0, worst };
}

/** Detaches a Node Buffer (a view into a shared pool) into its own ArrayBuffer. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function parseWithThree(bytes: Uint8Array): { width: number; height: number; data: Float32Array } {
  const copy = toArrayBuffer(bytes);
  const loader = new HDRLoader();
  loader.setDataType(FloatType);
  const texData = loader.parse(copy) as { width: number; height: number; data: Float32Array };
  return texData;
}

/** three hands back RGBA; drop alpha so it lines up with our 3-component data. */
function rgbaToRgb(data: Float32Array): Float32Array {
  const out = new Float32Array((data.length / 4) * 3);
  for (let i = 0, o = 0; i < data.length; i += 4, o += 3) {
    out[o] = data[i];
    out[o + 1] = data[i + 1];
    out[o + 2] = data[i + 2];
  }
  return out;
}

console.log('half.ts');
{
  const table = halfToFloatTable();
  let mismatches = 0;
  for (let bits = 0; bits < 65536; bits++) {
    const mine = table[bits];
    const theirs = DataUtils.fromHalfFloat(bits);
    if (Number.isNaN(mine) && Number.isNaN(theirs)) continue;
    if (mine !== theirs) mismatches++;
  }
  check('LUT matches THREE.DataUtils.fromHalfFloat over all 65536 patterns', mismatches === 0, `${mismatches} mismatches`);
  check('fromHalf agrees with the LUT', fromHalf(0x3c00) === 1 && fromHalf(0x0001) === 2 ** -24);
}

console.log('rgbe.ts — round trip through three');
/**
 * `maxMeanError` defaults to 0.5 %. RGBE stores one shared exponent per pixel,
 * so a channel that is orders of magnitude darker than its neighbours in the
 * same pixel quantises to a byte or two — inherent to the format, not a writer
 * bug. Real imagery has correlated channels and stays well under 0.5 %; the
 * uncorrelated-noise case exists to stress the RLE paths and gets its own bound.
 */
const cases: Array<{ name: string; image: LinearImageF32; maxMeanError?: number }> = [
  { name: '2048x1024 gradient + sun disc', image: image(2048, 1024, (x, y, c) => {
      const sun = Math.hypot(x - 600, y - 200) < 6 ? 7.5e4 : 0;
      return sun + (0.02 + (1 - y / 1024) * 2.5) * (c === 2 ? 1.4 : 1);
    }) },
  { name: '1024x512 gradient', image: image(1024, 512, (x, y, c) => 0.05 + (x / 1024) * (c + 1)) },
  { name: '512x256 flat grey (all-run)', image: image(512, 256, () => 0.18) },
  { name: '1500x750 non-power-of-two, correlated', image: image(1500, 750, (x, y, c) => {
      const base = 0.1 + hash2(x, y) * 3;
      return base * (1 + c * 0.15);
    }) },
  { name: '1500x750 uncorrelated noise (RLE stress)', image: image(1500, 750, () => Math.random() * 4), maxMeanError: 0.02 },
  { name: '128x2 run-boundary pattern', image: image(128, 2, (x) => (x % 130 < 129 ? 1 : 2)) },
  { name: '8x4 minimum RLE width', image: image(8, 4, (x, y, c) => (x + y + c) * 0.1) },
  { name: '7x4 below RLE width (flat layout)', image: image(7, 4, (x, y, c) => (x + y + c) * 0.1) },
  { name: '1x1 single pixel', image: image(1, 1, (_x, _y, c) => 0.5 + c) },
  { name: '64x8 zeros', image: image(64, 8, () => 0) },
];

trace(`${cases.length} cases built`);
for (const testCase of cases) {
  trace(`${testCase.name}: encode`);
  const bytes = encodeRGBE(testCase.image, { comments: [testCase.name] });
  let detail = `${(bytes.length / 1024).toFixed(0)} KiB`;
  try {
    trace('three parse');
    const viaThree = parseWithThree(bytes);
    trace('self decode');
    const viaSelf = decodeRGBE(bytes);
    trace('compare');
    const dimsOk =
      viaThree.width === testCase.image.width &&
      viaThree.height === testCase.image.height &&
      viaSelf.width === testCase.image.width &&
      viaSelf.height === testCase.image.height;
    const three = meanRelativeError(testCase.image.data, rgbaToRgb(viaThree.data));
    const self = meanRelativeError(testCase.image.data, viaSelf.data);
    const flat = testCase.image.width < 8;
    const ratio = bytes.length / (4 * testCase.image.width * testCase.image.height);
    detail = `${detail}, ${flat ? 'flat' : `rle ${ratio.toFixed(2)}`}, three mean ${(three.mean * 100).toFixed(2)}% worst ${(three.worst * 100).toFixed(1)}%, self mean ${(self.mean * 100).toFixed(2)}%`;
    const limit = testCase.maxMeanError ?? 0.005;
    check(testCase.name, dimsOk && three.mean < limit && self.mean < limit, detail);
  } catch (error) {
    check(testCase.name, false, `${detail}, ${(error as Error).message}`);
  }
}

console.log('row order — source EXR vs generated preset');
{
  // Verifies the normalisation in decode-hdr.ts against a real sky HDRI, where
  // an upside-down result is unmistakable. EXRLoader emits bottom-up rows and
  // HDRLoader top-down ones, so a mirrored conversion is the failure mode this
  // catches — it looks plausible in a studio HDRI and obviously wrong here.
  const sourcePath = 'assets/example-hdris/kloofendal_48d_partly_cloudy_puresky_4k.exr';
  const presetPath = 'public/hdri/kloofendal-48d-partly-cloudy-puresky-1k.hdr';

  if (!existsSync(sourcePath) || !existsSync(presetPath)) {
    console.log(`  skip  sources not present (${sourcePath})`);
  } else {
    const bandMean = (data: Float32Array, width: number, height: number, stride: number, from: number, to: number) => {
      let sum = 0;
      let count = 0;
      for (let y = Math.floor(height * from); y < Math.floor(height * to); y++) {
        let o = y * width * stride;
        for (let x = 0; x < width; x++, o += stride) {
          sum += luminance(data[o], data[o + 1], data[o + 2]);
          count++;
        }
      }
      return sum / count;
    };

    const decoded = await decodeHDR(toArrayBuffer(await readFile(sourcePath)), 'exr', { preferFloat32: true });
    const reference = resample(decoded, 1024, 512);
    const preset = parseWithThree(await readFile(presetPath));

    const refTop = bandMean(reference.data, 1024, 512, 3, 0, 0.15);
    const refBottom = bandMean(reference.data, 1024, 512, 3, 0.85, 1);
    const outTop = bandMean(preset.data, preset.width, preset.height, 4, 0, 0.15);
    const outBottom = bandMean(preset.data, preset.width, preset.height, 4, 0.85, 1);

    check(
      'sky band is brighter than ground band (not mirrored)',
      refTop > refBottom * 1.5,
      `top ${refTop.toFixed(3)} vs bottom ${refBottom.toFixed(3)}`,
    );
    check(
      'preset matches the resampled source, band for band',
      Math.abs(outTop - refTop) / refTop < 0.02 && Math.abs(outBottom - refBottom) / refBottom < 0.02,
      `top ${(((outTop - refTop) / refTop) * 100).toFixed(2)}%, bottom ${(((outBottom - refBottom) / refBottom) * 100).toFixed(2)}%`,
    );
  }
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
