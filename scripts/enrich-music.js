/**
 * Stage 2 — Tidal availability pre-check.
 *
 * Searches TIDAL's catalog for each release that hasn't been checked yet
 * (`tidal_available IS NULL`) and records whether it's available, plus a
 * direct album link and the top track id (the track id is unused until
 * Stage 3, where it's what gets added to a playlist).
 *
 * Also re-checks releases marked unavailable but released within the last
 * RECHECK_DAYS: sources announce releases around (or before) their street date,
 * so TIDAL often doesn't have them yet at first enrich, and a later addition
 * would otherwise never be picked up. Older "unavailable" rows are left alone —
 * they're genuinely not on streaming — so re-running stays cheap.
 *
 * Usage:
 *   node --env-file=.env.local scripts/enrich-music.js
 *   node --env-file=.env.local scripts/enrich-music.js --dry-run
 *   node --env-file=.env.local scripts/enrich-music.js --limit 20 --debug
 *
 * Required env vars (.env.local):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   TIDAL_CLIENT_ID
 *   TIDAL_CLIENT_SECRET
 */

import { createClient } from '@supabase/supabase-js';
import { searchTidal } from './tidal-client.js';

const DRY_RUN = process.argv.includes('--dry-run');
const DEBUG = process.argv.includes('--debug');
const limitFlag = process.argv.indexOf('--limit');
const LIMIT = limitFlag !== -1 ? Number(process.argv[limitFlag + 1]) : 200;

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TIDAL_CLIENT_ID, TIDAL_CLIENT_SECRET } = process.env;

if (!TIDAL_CLIENT_ID || !TIDAL_CLIENT_SECRET) {
    console.warn('TIDAL_CLIENT_ID/TIDAL_CLIENT_SECRET not set — skipping Tidal enrichment.');
    process.exit(0);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing required env vars. Check .env.local');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Re-check unavailable releases from within this window; see header comment.
const RECHECK_DAYS = 45;
const recheckCutoff = new Date(Date.now() - RECHECK_DAYS * 86_400_000).toISOString().slice(0, 10);

const { data: rows, error } = await supabase
    .from('releases')
    .select('id, artist, title')
    .or(`tidal_available.is.null,and(tidal_available.is.false,released_at.gte.${recheckCutoff})`)
    .limit(LIMIT);

if (error) {
    console.error('Failed to load unenriched releases:', error.message);
    process.exit(1);
}

console.log(`${rows.length} releases to check against Tidal`);

let checked = 0;
let available = 0;
for (const r of rows) {
    const query = `${r.artist} — ${r.title}`;
    let result;
    try {
        result = await searchTidal({
            clientId: TIDAL_CLIENT_ID,
            clientSecret: TIDAL_CLIENT_SECRET,
            artist: r.artist,
            title: r.title,
            debug: DEBUG
        });
    } catch (err) {
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
                tidal_available: result.available,
                tidal_track_id: result.trackId,
                tidal_album_url: result.albumUrl
            })
            .eq('id', r.id);
        if (updateError) console.error(`  update failed for "${query}":`, updateError.message);
    }

    // Be polite — avoid hammering the search endpoint.
    await new Promise((res) => setTimeout(res, 300));
}

console.log(`\nDone. ${available}/${checked} available on Tidal.${DRY_RUN ? ' (dry run — no rows updated)' : ''}`);
