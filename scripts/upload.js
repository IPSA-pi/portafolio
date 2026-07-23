/**
 * Step 2 — Upload renamed drawings to Supabase Storage.
 *
 * Reads all webp files from src/lib/assets/drawings/ (after rename.js
 * has run) and uploads them to the "drawings" bucket under:
 *   {notebook}/{filename}
 *
 * Skips files that already exist in Storage (use --force to overwrite).
 *
 * Usage:
 *   node --env-file=.env.local scripts/upload.js
 *   node --env-file=.env.local scripts/upload.js --force
 *
 * Required env vars (.env.local):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { logDbTarget } from './db-target.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRAWINGS_DIR = path.resolve(__dirname, '../src/lib/assets/drawings');
const BUCKET = 'drawings';
const FORCE = process.argv.includes('--force');

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
logDbTarget(SUPABASE_URL);

// Collect all webp files matching the new naming convention
const files = [];
for (const folder of fs.readdirSync(DRAWINGS_DIR)) {
    const folderPath = path.join(DRAWINGS_DIR, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;
    for (const file of fs.readdirSync(folderPath)) {
        if (!file.endsWith('.webp')) continue;
        // Only accept new format: {notebook}_{dd}[-variant].webp
        const match = file.match(/^(.+)_(\d{2})(?:-(?:sm|md|lg))?\.webp$/);
        if (!match) {
            console.warn(`  skip (old format?): ${file}`);
            continue;
        }
        const notebook = match[1];
        files.push({
            localPath:   path.join(folderPath, file),
            storagePath: `${notebook}/${file}`,
        });
    }
}

console.log(`Found ${files.length} files to upload to bucket "${BUCKET}"\n`);

let uploaded = 0, skipped = 0, failed = 0;

for (const f of files) {
    const data = fs.readFileSync(f.localPath);
    const { error } = await supabase.storage
        .from(BUCKET)
        .upload(f.storagePath, data, {
            contentType: 'image/webp',
            upsert: FORCE,
        });

    if (error) {
        if (error.message?.includes('already exists') && !FORCE) {
            process.stdout.write(`  skip (exists): ${f.storagePath}\n`);
            skipped++;
        } else {
            console.error(`  FAIL: ${f.storagePath} — ${error.message}`);
            failed++;
        }
    } else {
        process.stdout.write(`  OK: ${f.storagePath}\n`);
        uploaded++;
    }
}

console.log(`\nUploaded: ${uploaded}  Skipped: ${skipped}  Failed: ${failed}`);
if (failed > 0) process.exit(1);
