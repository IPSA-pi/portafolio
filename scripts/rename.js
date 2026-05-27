/**
 * Step 1 — Rename drawings to new convention.
 *
 * Old: negro_1_a-1.webp  (notebook_letter-position)
 * New: negro_1_01.webp   (notebook_drawingNumber)
 *
 * Drawing numbers are assigned sequentially across all scans within
 * a notebook, sorted by letter then position.
 *
 * Also writes scripts/rename-map.json so the seed script can link
 * existing Stripe products (which use old slugs) to new slugs.
 *
 * Usage:
 *   node scripts/rename.js            # dry run — preview only
 *   node scripts/rename.js --apply    # execute renames + write map
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRAWINGS_DIR = path.resolve(__dirname, '../src/lib/assets/drawings');
const MAP_FILE = path.resolve(__dirname, 'rename-map.json');
const DRY_RUN = !process.argv.includes('--apply');

function parseFilename(filename) {
    // Matches: {color}_{volume}_{letter}-{position}[-sm|-md|-lg].webp
    const match = filename.match(/^([a-z]+_\d+)_([a-z]+)-(\d+)(?:-(sm|md|lg))?\.webp$/);
    if (!match) return null;
    return {
        notebook: match[1],
        letter:   match[2],
        position: parseInt(match[3]),
        variant:  match[4] ?? null,
    };
}

// Collect every webp file under DRAWINGS_DIR
const allFiles = [];
for (const folder of fs.readdirSync(DRAWINGS_DIR)) {
    const folderPath = path.join(DRAWINGS_DIR, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;
    for (const file of fs.readdirSync(folderPath)) {
        const parsed = parseFilename(file);
        if (!parsed) continue;
        allFiles.push({ ...parsed, folder, file, fullPath: path.join(folderPath, file) });
    }
}

// Build sequential drawing numbers per notebook using originals only
// old key → new drawing number
const drawingNumbers = new Map(); // "negro_1_a-1" → 1

const byNotebook = {};
for (const f of allFiles) {
    if (f.variant !== null) continue;
    (byNotebook[f.notebook] ??= []).push(f);
}

for (const [, originals] of Object.entries(byNotebook)) {
    originals.sort((a, b) =>
        a.letter !== b.letter
            ? a.letter.localeCompare(b.letter)
            : a.position - b.position
    );
    originals.forEach((f, i) => {
        drawingNumbers.set(`${f.notebook}_${f.letter}-${f.position}`, i + 1);
    });
}

// Build rename operations for all files (originals + variants)
const renames = [];
const renameMap = {}; // old slug → new slug (originals only, no variant suffix)

for (const f of allFiles) {
    const key = `${f.notebook}_${f.letter}-${f.position}`;
    const num = drawingNumbers.get(key);
    if (num === undefined) continue;

    const padded = String(num).padStart(2, '0');
    const newFile = f.variant
        ? `${f.notebook}_${padded}-${f.variant}.webp`
        : `${f.notebook}_${padded}.webp`;

    const newPath = path.join(DRAWINGS_DIR, f.folder, newFile);

    if (f.fullPath !== newPath) {
        renames.push({ from: f.fullPath, to: newPath, fromFile: f.file, toFile: newFile });
    }

    if (!f.variant) {
        const oldSlug = `${f.notebook}_${f.letter}-${f.position}`;
        const newSlug = `${f.notebook}_${padded}`;
        renameMap[oldSlug] = newSlug;
    }
}

renames.sort((a, b) => a.fromFile.localeCompare(b.fromFile));

if (DRY_RUN) {
    console.log(`DRY RUN — ${renames.length} renames (run with --apply to execute)\n`);
    for (const r of renames) {
        console.log(`  ${r.fromFile.padEnd(36)}→  ${r.toFile}`);
    }
    console.log(`\n${Object.keys(renameMap).length} unique drawings across ${Object.keys(byNotebook).length} notebooks`);
} else {
    // Two-pass rename to avoid collisions: rename to .tmp first, then to final name
    const tmps = [];
    for (const r of renames) {
        const tmp = r.from + '.tmp';
        fs.renameSync(r.from, tmp);
        tmps.push({ tmp, to: r.to, toFile: r.toFile });
    }
    for (const r of tmps) {
        fs.renameSync(r.tmp, r.to);
        console.log(`  renamed → ${r.toFile}`);
    }

    fs.writeFileSync(MAP_FILE, JSON.stringify(renameMap, null, 2));
    console.log(`\nDone. ${renames.length} files renamed.`);
    console.log(`Rename map written to scripts/rename-map.json`);
}
