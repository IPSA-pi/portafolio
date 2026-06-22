/**
 * Scrape new music releases from external sources into the Supabase `releases`
 * table, powering the /new-music worklist.
 *
 * Sources are pluggable: each module in scripts/sources/ exports `fetch()`
 * returning normalized release objects. Add a new site by writing a module and
 * listing it in SOURCES below.
 *
 * Safe to re-run: upserts on `dedupe_key` with ignoreDuplicates, so existing
 * rows (and the owner's manually-set `status`) are never clobbered — only new
 * releases get inserted.
 *
 * Usage:
 *   node --env-file=.env.local scripts/scrape-music.js
 *   node --env-file=.env.local scripts/scrape-music.js --dry-run
 *
 * Required env vars (.env.local):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import nodata from './sources/nodata.js';

const SOURCES = [nodata];
const DRY_RUN = process.argv.includes('--dry-run');

/** Global dedupe key, normalized across all sources. */
function dedupeKey(artist, title) {
    return `${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
}

// 1. Fetch from every source.
const rows = [];
for (const source of SOURCES) {
    try {
        const releases = await source.fetch();
        console.log(`${source.name}: ${releases.length} releases`);
        for (const r of releases) rows.push({ ...r, dedupe_key: dedupeKey(r.artist, r.title) });
    } catch (err) {
        console.error(`${source.name}: failed —`, err.message);
    }
}

// 2. Dedupe within this batch (first occurrence wins).
const seen = new Set();
const unique = [];
for (const r of rows) {
    if (seen.has(r.dedupe_key)) continue;
    seen.add(r.dedupe_key);
    unique.push(r);
}
console.log(`\n${unique.length} unique releases (${rows.length - unique.length} in-batch duplicates dropped)`);

// 3. Preview or upsert.
if (DRY_RUN) {
    console.log('\nDRY RUN — first 10 rows:\n');
    for (const r of unique.slice(0, 10)) console.log(JSON.stringify(r, null, 2));
    console.log(`\n${unique.length} rows would be upserted.`);
    process.exit(0);
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing required env vars. Check .env.local');
    process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CHUNK = 50;
let upserted = 0;
for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    // ignoreDuplicates: don't overwrite existing rows — preserves owner status.
    const { error } = await supabase
        .from('releases')
        .upsert(chunk, { onConflict: 'dedupe_key', ignoreDuplicates: true });
    if (error) {
        console.error(`Upsert error at chunk ${i}:`, error.message);
        process.exit(1);
    }
    upserted += chunk.length;
    console.log(`  processed ${upserted}/${unique.length}`);
}
console.log(`\nDone. New releases inserted (existing rows left untouched).`);
