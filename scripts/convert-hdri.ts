/**
 * Turns source `.exr` / `.hdr` files into web-ready Radiance presets under
 * `public/hdri/`, plus the generated manifest the picker reads.
 *
 * Runs on plain `node` — no build step and no new dependency: Node strips the
 * types itself, three is already installed, and every module below
 * `src/lib/hdri/` that this touches is DOM-free on purpose, so the browser and
 * the CLI produce byte-identical output.
 *
 *   node scripts/convert-hdri.ts
 *   node scripts/convert-hdri.ts assets/example-hdris/satara_night_4k.exr --size 2048x1024
 */

import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertToRadiance, equirectHeightFor } from '../src/lib/hdri/pipeline.ts';
import { slugifyName } from '../src/lib/hdri/format.ts';
import { sampleSwatch } from '../src/lib/hdri/swatch.ts';
import type { HdriPreset } from '../src/lib/hdri/types.ts';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const DEFAULT_SOURCE_DIR = join(ROOT, 'assets/example-hdris');
const DEFAULT_OUT_DIR = join(ROOT, 'public/hdri');
const DEFAULT_MANIFEST = join(ROOT, 'src/lib/hdri/presets.generated.ts');
const SOURCE_EXTENSIONS = new Set(['.exr', '.hdr']);

type Options = {
  files: string[];
  sizes: Array<{ width: number; height: number }>;
  outDir: string;
  manifest: string;
  preferFloat32: boolean;
  force: boolean;
  dryRun: boolean;
};

function parseArgs(argv: string[]): Options {
  const files: string[] = [];
  const sizes: Array<{ width: number; height: number }> = [];
  let outDir = DEFAULT_OUT_DIR;
  let manifest = DEFAULT_MANIFEST;
  let preferFloat32 = true;
  let force = false;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--size': {
        const value = argv[++i] ?? '';
        const match = /^(\d+)(?:[x×](\d+))?$/i.exec(value);
        if (!match) throw new Error(`--size expects WxH or W, got "${value}"`);
        const width = Number(match[1]);
        sizes.push({ width, height: match[2] ? Number(match[2]) : equirectHeightFor(width) });
        break;
      }
      case '--out':
        outDir = resolve(argv[++i] ?? '');
        break;
      case '--manifest':
        manifest = resolve(argv[++i] ?? '');
        break;
      case '--half':
        preferFloat32 = false;
        break;
      case '--force':
        force = true;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--help':
      case '-h':
        console.log(
          [
            'node scripts/convert-hdri.ts [files...] [options]',
            '',
            '  files          .exr/.hdr sources. Default: assets/example-hdris/*',
            '  --size WxH     target resolution, repeatable. Default 1024x512',
            '  --out DIR      output directory. Default public/hdri',
            '  --manifest P   generated module. Default src/lib/hdri/presets.generated.ts',
            '  --half         decode at half precision (less memory, clips above 65504)',
            '  --force        overwrite existing outputs',
            '  --dry-run      report what would be written',
          ].join('\n'),
        );
        process.exit(0);
      default:
        if (arg.startsWith('-')) throw new Error(`unknown option ${arg}`);
        files.push(resolve(arg));
    }
  }

  if (!sizes.length) sizes.push({ width: 1024, height: 512 });
  return { files, sizes, outDir, manifest, preferFloat32, force, dryRun };
}

async function collectSources(files: string[]): Promise<string[]> {
  if (files.length) return files;
  const entries = await readdir(DEFAULT_SOURCE_DIR).catch(() => {
    throw new Error(`no sources given and ${relative(ROOT, DEFAULT_SOURCE_DIR)} is not readable`);
  });
  return entries
    .filter((name) => SOURCE_EXTENSIONS.has(extname(name).toLowerCase()))
    .sort()
    .map((name) => join(DEFAULT_SOURCE_DIR, name));
}

/** `studio_small_08_4k.exr` -> `studio-small-08`; the source tier is dropped. */
function slugFor(fileName: string): string {
  const stem = basename(fileName, extname(fileName)).replace(/[_-]\d+k$/i, '');
  return slugifyName(stem);
}

function labelFor(slug: string): string {
  return slug
    .split('-')
    .map((word) => (/^\d+$/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

/**
 * Character tag guessed from the file name. Poly Haven and most HDRI libraries
 * encode it there; anything unrecognised simply gets no badge rather than a
 * wrong one.
 */
const TAG_KEYWORDS: Array<[RegExp, string]> = [
  [/studio|photostudio/i, 'Studio'],
  [/sunset|sunrise|dusk|dawn|golden/i, 'Sonnenuntergang'],
  [/night|moon/i, 'Nacht'],
  [/puresky|sky|field|forest|park|street|city|urban|beach/i, 'Außen'],
  [/room|interior|hall|office|workshop|garage|indoor/i, 'Innenraum'],
];

function tagFor(fileName: string): string | undefined {
  for (const [pattern, tag] of TAG_KEYWORDS) {
    if (pattern.test(fileName)) return tag;
  }
  return undefined;
}

/** 512 -> `0.5k`, 1024 -> `1k`, 2048 -> `2k`. */
function tierFor(width: number): string {
  const k = width / 1024;
  if (!Number.isInteger(k * 2)) return `${width}px`;
  return `${k % 1 === 0 ? k : k.toFixed(1)}k`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function renderManifest(presets: HdriPreset[], sources: string[]): string {
  const body = presets
    .map((preset) => {
      const tag = preset.tag ? `\n    tag: ${JSON.stringify(preset.tag)},` : '';
      return `  {
    id: ${JSON.stringify(preset.id)},
    label: ${JSON.stringify(preset.label)},
    file: ${JSON.stringify(preset.file)},
    format: ${JSON.stringify(preset.format)},
    width: ${preset.width},
    height: ${preset.height},
    byteSize: ${preset.byteSize},
    swatch: ${JSON.stringify(preset.swatch)},${tag}
    source: {
      fileName: ${JSON.stringify(preset.source.fileName)},
      width: ${preset.source.width},
      height: ${preset.source.height},
    },
  },`;
    })
    .join('\n');

  return `// AUTO-GENERATED by scripts/convert-hdri.ts — do not edit by hand.
// Sources: ${sources.map((file) => basename(file)).join(', ') || 'none'}
// Regenerate with: npm run presets:hdri

import type { HdriPreset } from './types.ts';

export const HDRI_PRESETS: readonly HdriPreset[] = [
${body}
];
`;
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const sources = await collectSources(options.files);
  if (!sources.length) throw new Error('no source files found');

  console.log(
    `${sources.length} source(s) -> ${options.sizes.map((s) => `${s.width}x${s.height}`).join(', ')}` +
      ` in ${relative(ROOT, options.outDir)}${options.dryRun ? ' (dry run)' : ''}`,
  );
  if (!options.dryRun) await mkdir(options.outDir, { recursive: true });

  const presets: HdriPreset[] = [];

  for (const source of sources) {
    const fileName = basename(source);
    const slug = slugFor(fileName);
    const raw = await readFile(source);
    // A Node Buffer is a view into a shared pool — handing `raw.buffer` to the
    // loader passes the whole pool at the wrong offset, which shows up as
    // "no header found" or as garbage pixels.
    const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;

    for (const size of options.sizes) {
      const outName = `${slug}-${tierFor(size.width)}.hdr`;
      const outPath = join(options.outDir, outName);
      if (!options.force && !options.dryRun && (await exists(outPath))) {
        console.log(`  skip  ${outName} (exists, use --force)`);
        continue;
      }

      const started = Date.now();
      const { bytes, image, source: info } = await convertToRadiance(buffer, fileName, size, {
        preferFloat32: options.preferFloat32,
        comments: [`converted from ${fileName} by scripts/convert-hdri.ts`],
      });

      if (!options.dryRun) await writeFile(outPath, bytes);

      presets.push({
        id: `${slug}-${tierFor(size.width)}`,
        label: labelFor(slug),
        file: outName,
        format: 'hdr',
        width: image.width,
        height: image.height,
        byteSize: bytes.byteLength,
        swatch: sampleSwatch(image),
        tag: tagFor(fileName),
        source: { fileName, width: info.width, height: info.height },
      });

      console.log(
        `  ok    ${outName}  ${info.width}x${info.height} -> ${image.width}x${image.height}` +
          `  ${formatBytes(raw.byteLength)} -> ${formatBytes(bytes.byteLength)}` +
          `  peak ${info.maxComponent.toFixed(1)}  ${Date.now() - started} ms`,
      );
    }
  }

  presets.sort((a, b) => a.label.localeCompare(b.label, 'de') || a.width - b.width);
  if (!options.dryRun) await writeFile(options.manifest, renderManifest(presets, sources));

  const total = presets.reduce((sum, preset) => sum + preset.byteSize, 0);
  console.log(`\n${presets.length} preset(s), ${formatBytes(total)} total`);
  console.log(options.dryRun ? 'dry run — nothing written' : `manifest: ${relative(ROOT, options.manifest)}`);
}

main().catch((error: unknown) => {
  console.error(`convert-hdri: ${(error as Error).message}`);
  process.exitCode = 1;
});
