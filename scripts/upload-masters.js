/**
 * Finish and upload the high-resolution PNG masters that back the digital copy.
 *
 * For each master it:
 *   1. flattens the (fully opaque) alpha channel away,
 *   2. converts to a named sRGB profile — scanners tend to embed an unnamed
 *      lcms profile that print shops then have to guess at,
 *   3. re-encodes losslessly at maximum compression (typically 7.7 MB -> 3.2 MB
 *      at identical pixels; the source files are written with weak compression),
 *   4. writes the finished PNG back to disk, next to the source in a `finished/`
 *      subdirectory — a local copy of exactly what was uploaded,
 *   5. uploads it to the PRIVATE `drawings-masters` bucket, and
 *   6. records the object path on drawings.digital_object_path.
 *
 * The density tag is left exactly as scanned (600 DPI on the current masters),
 * so a print dialog defaults to the drawing's real physical size. The buyer can
 * print any size they like; the tag only sets the default.
 *
 * This bucket must be PRIVATE. Nothing here ever writes a public URL — the
 * webhook mints a time-limited signed URL per sale instead.
 *
 * Usage:
 *   npm run upload-masters -- --notebook 260619
 *   npm run upload-masters -- --notebook 260619 --dir /mnt/c/Users/me/scans
 *   npm run upload-masters -- --notebook 260619 --dry-run
 *   npm run upload-masters -- --notebook 260619 --force   # re-upload existing
 *
 * Sources are read from masters/<notebook>/ by default (gitignored). Files may
 * be named either <slug>.png (260619_01.png) or bare <NN>.png (01.png) — the
 * slug is derived from --notebook either way, so scans can be used where they
 * sit without a rename pass.
 *
 * Required env vars (.env.local):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { logDbTarget } from './db-target.js';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUCKET = 'drawings-masters';

const args = process.argv.slice(2);
const flag = (name) => {
    const i = args.indexOf(name);
    return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
};
const DRY_RUN  = args.includes('--dry-run');
const FORCE    = args.includes('--force');
const NOTEBOOK = flag('--notebook');
const DIR      = flag('--dir');

if (!NOTEBOOK) {
    console.error('Missing --notebook. Usage: npm run upload-masters -- --notebook 260619');
    process.exit(1);
}

const sourceDir = DIR
    ? path.resolve(DIR)
    : path.resolve(__dirname, '..', 'masters', NOTEBOOK);

if (!fs.existsSync(sourceDir)) {
    console.error(`Source directory not found: ${sourceDir}`);
    process.exit(1);
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
logDbTarget(SUPABASE_URL);
console.log(`Notebook: ${NOTEBOOK}`);
console.log(`Sources:  ${sourceDir}`);
if (DRY_RUN) console.log('DRY RUN — nothing will be written or uploaded.\n');

// Accept <notebook>_<NN>.png or a bare <NN>.png; the slug comes from --notebook
// either way, so a folder of scans named 01.png works untouched.
const sources = [];
for (const file of fs.readdirSync(sourceDir).sort()) {
    if (!/\.png$/i.test(file)) continue;
    const base = path.basename(file, path.extname(file));
    const match = base.match(new RegExp(`^(?:${NOTEBOOK}_)?(\\d{2})$`));
    if (!match) {
        console.warn(`  skip (unrecognized name): ${file}`);
        continue;
    }
    sources.push({ file, slug: `${NOTEBOOK}_${match[1]}` });
}

if (sources.length === 0) {
    console.error(`\nNo usable masters in ${sourceDir}.`);
    process.exit(1);
}

console.log(`\nFound ${sources.length} masters\n`);

// Only touch rows that exist — a master with no drawing row is a naming
// mistake, and silently uploading it would leave an orphan in the bucket.
const { data: rows, error: rowsError } = await supabase
    .from('drawings')
    .select('slug')
    .eq('notebook', NOTEBOOK);

if (rowsError) {
    console.error('Could not read drawings:', rowsError.message);
    process.exit(1);
}
const known = new Set((rows ?? []).map((r) => r.slug));

const finishedDir = path.join(sourceDir, 'finished');
if (!DRY_RUN) fs.mkdirSync(finishedDir, { recursive: true });

let done = 0, skipped = 0, failed = 0;

for (const { file, slug } of sources) {
    if (!known.has(slug)) {
        console.warn(`  skip (no drawings row): ${slug}`);
        skipped++;
        continue;
    }

    const srcPath = path.join(sourceDir, file);
    const objectPath = `${NOTEBOOK}/${slug}.png`;

    try {
        const finished = await sharp(srcPath)
            .removeAlpha()            // the scans are opaque; the channel is dead weight
            .withIccProfile('srgb')   // name the profile instead of the scanner's unnamed one
            .withMetadata()           // keep the density tag exactly as scanned
            .png({ compressionLevel: 9, effort: 10 })
            .toBuffer();

        const before = fs.statSync(srcPath).size;
        const mb = (n) => (n / 1048576).toFixed(2);

        if (DRY_RUN) {
            console.log(`  would upload ${objectPath}  ${mb(before)}MB -> ${mb(finished.length)}MB`);
            done++;
            continue;
        }

        fs.writeFileSync(path.join(finishedDir, `${slug}.png`), finished);

        const { error: uploadError } = await supabase.storage
            .from(BUCKET)
            .upload(objectPath, finished, { contentType: 'image/png', upsert: FORCE });

        if (uploadError) {
            if (uploadError.message?.includes('already exists') && !FORCE) {
                console.log(`  skip (exists): ${objectPath} — use --force to replace`);
                skipped++;
                continue;
            }
            throw new Error(uploadError.message);
        }

        const { error: updateError } = await supabase
            .from('drawings')
            .update({ digital_object_path: objectPath })
            .eq('slug', slug);

        if (updateError) throw new Error(`row update: ${updateError.message}`);

        console.log(`  OK: ${objectPath}  ${mb(before)}MB -> ${mb(finished.length)}MB`);
        done++;
    } catch (e) {
        console.error(`  FAIL: ${slug} — ${e.message}`);
        failed++;
    }
}

console.log(`\n${DRY_RUN ? 'Would process' : 'Uploaded'}: ${done}  Skipped: ${skipped}  Failed: ${failed}`);
if (!DRY_RUN && done > 0) {
    console.log(`Finished PNGs written to ${finishedDir}`);
}
if (failed > 0) process.exit(1);
