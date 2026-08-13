/**
 * Minimal Spotify API client for read-only catalog search. Uses the
 * client_credentials grant — no user login required for catalog lookups.
 *
 * Endpoints:
 *   Token:  POST https://accounts.spotify.com/api/token  (Basic auth)
 *   Search: GET  https://api.spotify.com/v1/search?q=...&type=album
 *
 * Matching is the shared, conservative ruleset in match.js, the same one the
 * Tidal and Apple Music clients use. This client originally had its own looser
 * matcher that accepted the first candidate whose title matched, with no check
 * on who the album was credited to — which is exactly how a popularity-ranked
 * search returns a namesake album by the wrong artist and gets believed.
 */

import { artistsMatch, searchQuery, titlesMatch } from './match.js';

const AUTH_URL = 'https://accounts.spotify.com/api/token';
const API_BASE = 'https://api.spotify.com';

let cachedToken = null; // { value, expiresAt }

async function getAccessToken(clientId, clientSecret) {
    if (cachedToken && cachedToken.expiresAt - Date.now() > 60_000) {
        return cachedToken.value;
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch(AUTH_URL, {
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${credentials}`
        },
        body: new URLSearchParams({ grant_type: 'client_credentials' })
    });
    if (!res.ok) {
        throw new Error(`Spotify token request failed: ${res.status} ${await res.text()}`);
    }
    const json = await res.json();
    cachedToken = {
        value: json.access_token,
        expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000
    };
    return cachedToken.value;
}

/** Run one search query, retrying on a 429, and return the parsed body. */
async function fetchSearchResults({ token, query }) {
    const url = `${API_BASE}/v1/search?${new URLSearchParams({ q: query, type: 'album', limit: '10' })}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after')) || 2;
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        return fetchSearchResults({ token, query });
    }
    if (!res.ok) {
        throw new Error(`Spotify search failed for "${query}": ${res.status} ${await res.text()}`);
    }
    return res.json();
}

/**
 * Search the Spotify catalog for a release and decide if it's genuinely there.
 * Returns { available, albumUrl }.
 *
 * A candidate has to match the release title *and* be credited to the artist
 * we're looking for. Spotify's search is a loose, popularity-weighted text
 * match like every other catalog search: for an artist with no matching
 * release it returns that artist's other albums, and for an unknown artist it
 * falls back to globally popular records where any common one-word title finds
 * a namesake. See match.js for the individual rules and the false matches that
 * motivated each one.
 */
export async function searchSpotify({ clientId, clientSecret, artist, title, debug = false }) {
    const token = await getAccessToken(clientId, clientSecret);

    // A compound release title ("Living In The Zone (Remix) / A New Start")
    // makes a noisy query and buries the real album, so if the whole title
    // finds nothing, retry with just the lead segment — same as the other two.
    const segments = String(title).split(/\s*\/\s*/);
    const titleQueries = segments.length > 1 ? [title, segments[0]] : [title];

    let album = null;
    outer: for (const tq of titleQueries) {
        const json = await fetchSearchResults({ token, query: searchQuery(artist, tq) });
        if (debug) console.log(JSON.stringify(json, null, 2));

        for (const candidate of json?.albums?.items ?? []) {
            if (!titlesMatch(candidate.name, title)) continue;
            const names = (candidate.artists ?? []).map((a) => a.name).filter(Boolean);
            if (debug) console.log(`  candidate "${candidate.name}" by ${names.join(', ')}`);
            if (artistsMatch(names, artist)) {
                album = candidate;
                break outer;
            }
        }
    }

    return {
        available: Boolean(album),
        albumUrl: album?.external_urls?.spotify ?? null
    };
}
