/**
 * Apple Music availability pre-check.
 *
 * Searches Apple's catalog for each release that hasn't been checked yet
 * (`apple_available IS NULL`) and records whether it's available plus a direct
 * album link.
 *
 * Also re-checks releases marked unavailable but released within the last
 * RECHECK_DAYS, same as the Tidal and Spotify passes: sources announce releases
 * around (or before) their street date, so the catalog often doesn't have them
 * yet at first enrich. Rows without a released_at fall back to created_at (when
 * the scraper first saw them). Older "unavailable" rows are left alone.
 *
 * Unlike the other two passes this one needs no API credentials — see the
 * header of apple-client.js for why, and for the catalog caveat that comes
 * with it.
 *
 * Usage:
 *   node --env-file=.env.local scripts/enrich-apple.js
 *   node --env-file=.env.local scripts/enrich-apple.js --dry-run
 *   node --env-file=.env.local scripts/enrich-apple.js --limit 20 --debug
 *
 * Required env vars (.env.local):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { logDbTarget } from './db-target.js';
import { searchAppleMusic } from './apple-client.js';

const DRY_RUN = process.argv.includes('--dry-run');
const DEBUG = process.argv.includes('--debug');
const limitFlag = process.argv.indexOf('--limit');
// Lower than the other passes' 200: the Search API is unauthenticated and
// rate-limited, so this pass walks the backlog over a few nightly runs rather
// than trying to clear it in one.
const LIMIT = limitFlag !== -1 ? Number(process.argv[limitFlag + 1]) : 100;

// Apple's storefront to search. CA matches the site's CAD pricing; the stored
// links land on /ca/ and Apple redirects visitors to their own region anyway.
const COUNTRY = 'CA';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing required env vars. Check .env.local');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
logDbTarget(SUPABASE_URL);

// Re-check unavailable releases from within this window; see header comment.
const RECHECK_DAYS = 45;
const recheckCutoff = new Date(Date.now() - RECHECK_DAYS * 86_400_000).toISOString().slice(0, 10);

const { data: rows, error } = await supabase
    .from('releases')
    .select('id, artist, title')
    .or(
        `apple_available.is.null,` +
            `and(apple_available.is.false,released_at.gte.${recheckCutoff}),` +
            `and(apple_available.is.false,released_at.is.null,created_at.gte.${recheckCutoff})`
    )
    .limit(LIMIT);

if (error) {
    console.error('Failed to load unenriched releases:', error.message);
    process.exit(1);
}

console.log(`${rows.length} releases to check against Apple Music`);

let checked = 0;
let available = 0;
let failed = 0;
for (const r of rows) {
    const query = `${r.artist} — ${r.title}`;
    let result;
    try {
        result = await searchAppleMusic({
            artist: r.artist,
            title: r.title,
            country: COUNTRY,
            debug: DEBUG
        });
    } catch (err) {
        failed++;
        console.error(`  "${query}" — search failed: ${err.message}`);
        continue;
    }

    checked++;
    if (result.available) available++;
    console.log(`  ${result.available ? '✓' : '✗'} ${query}`);

    if (!DRY_RUN) {
        const { error: updateError } = await supabase
            .from('releases')
            .update({
                apple_available: result.available,
                apple_album_url: result.albumUrl
            })
            .eq('id', r.id);
        if (updateError) console.error(`  update failed for "${query}":`, updateError.message);
    }

    // Be polite — the Search API is unauthenticated and documented at roughly
    // 20 calls/minute, so keep a wider gap here than the other passes use.
    await new Promise((res) => setTimeout(res, 1000));
}

console.log(
    `\nDone. ${available}/${checked} available on Apple Music, ${failed} failed.${DRY_RUN ? ' (dry run — no rows updated)' : ''}`
);

// Same reasoning as the Tidal and Spotify passes: every-row failure is a broken
// integration, and a silently-green run is how the Tidal endpoint change went
// unnoticed.
if (checked === 0 && failed > 0) {
    console.error(`All ${failed} Apple Music searches failed — check the API contract in apple-client.js.`);
    process.exit(1);
}
