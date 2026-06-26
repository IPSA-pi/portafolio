/**
 * Scrape new music releases from external sources into the Supabase `releases`
 * table, powering the /new-music worklist.
 *
 * Sources are pluggable: each module in scripts/sources/ exports `fetch()`
 * returning normalized release objects. Add a new site by writing a module and
 * listing it in SOURCES below.
 *
 * Cross-source deduplication: releases that appear on multiple sources share
 * one row. The `sources` TEXT[] column lists every source that found it.
 * The first source to insert a row owns its primary metadata; subsequent runs
 * only update the `sources` array and fill in any missing `release_year`.
 *
 * Safe to re-run: inserts ignore conflicts on `dedupe_key`, so existing rows
 * (and the owner's manually-set `status`) are never clobbered.
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
import ra from './sources/ra.js';

const SOURCES = [nodata, ra];
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

// 2. Group by dedupe_key, merging sources into an array.
//    First occurrence's metadata wins; additional sources are appended.
const byKey = new Map();
for (const r of rows) {
    if (byKey.has(r.dedupe_key)) {
        const ex = byKey.get(r.dedupe_key);
        if (!ex.sources.includes(r.source)) ex.sources.push(r.source);
        // Prefer whichever side has a release year.
        if (!ex.release_year && r.release_year) ex.release_year = r.release_year;
    } else {
        byKey.set(r.dedupe_key, { ...r, sources: [r.source] });
    }
}
const unique = [...byKey.values()];
console.log(
    `\n${unique.length} unique releases (${rows.length - unique.length} in-batch duplicates merged)`
);

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

// Insert new releases. ignoreDuplicates skips rows that already exist,
// preserving the owner's status and other manually-set fields.
for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
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

// Merge sources and release_year into existing rows (handles cross-source
// duplicates that were skipped by ignoreDuplicates above).
const allKeys = unique.map((r) => r.dedupe_key);
const { data: existing, error: fetchErr } = await supabase
    .from('releases')
    .select('id, dedupe_key, sources, release_year')
    .in('dedupe_key', allKeys);

if (fetchErr) {
    console.error('Fetch existing error:', fetchErr.message);
    process.exit(1);
}

let mergeCount = 0;
for (const ex of existing ?? []) {
    const local = byKey.get(ex.dedupe_key);
    if (!local) continue;

    const merged = [...new Set([...(ex.sources ?? []), ...local.sources])];
    const needsYear = ex.release_year == null && local.release_year != null;
    const needsSourceUpdate = merged.length !== (ex.sources ?? []).length;

    if (needsSourceUpdate || needsYear) {
        const patch = { sources: merged };
        if (needsYear) patch.release_year = local.release_year;
        await supabase.from('releases').update(patch).eq('id', ex.id);
        mergeCount++;
    }
}

if (mergeCount > 0) console.log(`\n${mergeCount} existing rows updated (sources/year merged).`);
console.log(`\nDone. New releases inserted, existing rows left untouched (except source merges).`);
