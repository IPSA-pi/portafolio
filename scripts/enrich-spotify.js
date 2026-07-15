/**
 * Spotify availability pre-check.
 *
 * Searches Spotify's catalog for each release that hasn't been checked yet
 * (`spotify_available IS NULL`) and records whether it's available plus a
 * direct album link.
 *
 * Safe to re-run: only touches rows where spotify_available is still null.
 *
 * Usage:
 *   node --env-file=.env.local scripts/enrich-spotify.js
 *   node --env-file=.env.local scripts/enrich-spotify.js --dry-run
 *   node --env-file=.env.local scripts/enrich-spotify.js --limit 20 --debug
 *
 * Required env vars (.env.local):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SPOTIFY_CLIENT_ID
 *   SPOTIFY_CLIENT_SECRET
 */

import { createClient } from '@supabase/supabase-js';
import { logDbTarget } from './db-target.js';
import { searchSpotify } from './spotify-client.js';

const DRY_RUN = process.argv.includes('--dry-run');
const DEBUG = process.argv.includes('--debug');
const limitFlag = process.argv.indexOf('--limit');
const LIMIT = limitFlag !== -1 ? Number(process.argv[limitFlag + 1]) : 200;

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = process.env;

if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    console.warn('SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET not set — skipping Spotify enrichment.');
    process.exit(0);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing required env vars. Check .env.local');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
logDbTarget(SUPABASE_URL);

const { data: rows, error } = await supabase
    .from('releases')
    .select('id, artist, title')
    .is('spotify_available', null)
    .limit(LIMIT);

if (error) {
    console.error('Failed to load unenriched releases:', error.message);
    process.exit(1);
}

console.log(`${rows.length} releases to check against Spotify`);

let checked = 0;
let available = 0;
for (const r of rows) {
    const query = `${r.artist} — ${r.title}`;
    let result;
    try {
        result = await searchSpotify({
            clientId: SPOTIFY_CLIENT_ID,
            clientSecret: SPOTIFY_CLIENT_SECRET,
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
                spotify_available: result.available,
                spotify_album_url: result.albumUrl
            })
            .eq('id', r.id);
        if (updateError) console.error(`  update failed for "${query}":`, updateError.message);
    }

    // Be polite — avoid hammering the search endpoint.
    await new Promise((res) => setTimeout(res, 300));
}

console.log(`\nDone. ${available}/${checked} available on Spotify.${DRY_RUN ? ' (dry run — no rows updated)' : ''}`);
