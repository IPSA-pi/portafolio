/**
 * Minimal TIDAL API client for read-only catalog search (Stage 2 — availability
 * pre-check). Uses the client_credentials grant: no user login, just an app
 * identity, which is all catalog search needs.
 *
 * Endpoints (token endpoint confirmed against the official
 * @tidal-music/tidal-sdk-web source; the search path's exact casing —
 * `searchResults`, camelCase — was confirmed by hitting the live API directly:
 * lowercase `searchresults` 404s with no body, while the camelCase form
 * reaches TIDAL's jsonapi backend):
 *   Token:  POST https://auth.tidal.com/v1/oauth2/token
 *   Search: GET  https://openapi.tidal.com/v2/searchResults?filter[query]={q}
 *
 * The query is a *filter*, not a path segment. TIDAL used to accept it as the
 * resource id (`/v2/searchResults/{query}`) and that form now 400s with
 * `INVALID_RESOURCE_ID` for every query, single words included — the id is a
 * server-generated opaque string these days. Don't "restore" the path form.
 * The response body changed shape with it: `data` is an array of one
 * searchResults object, where it used to be that object directly. Everything
 * below it — `relationships.albums.data`, the `included` side-load, album
 * `attributes.externalLinks` — is unchanged.
 */

import { artistsMatch, searchQuery, titlesMatch } from './match.js';

const AUTH_URL = 'https://auth.tidal.com/v1/oauth2/token';
const API_BASE = 'https://openapi.tidal.com';

let cachedToken = null; // { value, expiresAt }

async function getAccessToken(clientId, clientSecret) {
    if (cachedToken && cachedToken.expiresAt - Date.now() > 60_000) {
        return cachedToken.value;
    }

    const res = await fetch(AUTH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret
        })
    });
    if (!res.ok) {
        throw new Error(`Tidal token request failed: ${res.status} ${await res.text()}`);
    }
    const json = await res.json();
    cachedToken = {
        value: json.access_token,
        expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000
    };
    return cachedToken.value;
}

/**
 * The search query is a loose, popularity-weighted text match — for an
 * artist with no matching release on Tidal, it still happily returns that
 * artist's *other* albums ranked by popularity, with no real title overlap.
 * Worse, when TIDAL has nothing by that artist at all it falls back to a bag
 * of globally popular albums, and a common one-word title finds a namesake in
 * there every time: "Michael J. Blood / MOODS — ULTRAMARINE" matched Aleph
 * One's 2019 "Ultramarine". So the top hit can't be trusted blindly, and
 * neither can a title match on its own — a candidate has to match the release
 * title *and* be credited to the artist we're looking for.
 */
function findTitleMatches(json, expectedTitle) {
    // `data` is an array of one searchResults object; read the object form too,
    // which is what the API returned before the filter[query] move.
    const root = Array.isArray(json?.data) ? json.data[0] : json?.data;
    const candidateIds = root?.relationships?.albums?.data?.map((d) => d.id) ?? [];
    const included = json?.included ?? [];
    const albumsById = new Map(included.filter((i) => i.type === 'albums').map((i) => [i.id, i]));
    const artistNamesById = new Map(
        included.filter((i) => i.type === 'artists').map((i) => [i.id, i.attributes?.name])
    );

    const matches = [];
    for (const id of candidateIds) {
        const album = albumsById.get(id);
        if (!album || !titlesMatch(album.attributes?.title, expectedTitle)) continue;
        matches.push({
            album,
            // May be empty: the `included` side-load can come back short, in
            // which case the caller resolves the credits out-of-band rather
            // than either trusting or dropping the candidate blindly.
            names: (album.relationships?.artists?.data ?? [])
                .map((d) => artistNamesById.get(d.id))
                .filter(Boolean)
        });
    }
    return matches;
}

/** Fetch an album's credited artist names directly, for the unverifiable case. */
async function fetchAlbumArtists({ token, albumId, countryCode }) {
    const url = `${API_BASE}/v2/albums/${albumId}?countryCode=${countryCode}&include=artists`;
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.api+json' }
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json?.included ?? [])
        .filter((i) => i.type === 'artists')
        .map((i) => i.attributes?.name)
        .filter(Boolean);
}

/** Run one search query, retrying once on a 429, and return the parsed body. */
async function fetchSearchResults({ token, query, countryCode }) {
    const url = `${API_BASE}/v2/searchResults?filter%5Bquery%5D=${encodeURIComponent(query)}&countryCode=${countryCode}&include=albums.artists`;
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.api+json' }
    });

    if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after')) || 2;
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        return fetchSearchResults({ token, query, countryCode });
    }
    if (!res.ok) {
        throw new Error(`Tidal search failed for "${query}": ${res.status} ${await res.text()}`);
    }
    return res.json();
}

/**
 * Search the TIDAL catalog for a release and decide if it's genuinely there.
 * Returns { available, trackId, albumUrl }. `trackId` is left null here —
 * Stage 3 resolves it directly from the matched album's own tracklist when
 * it's actually needed for a playlist-add, which is more precise than trying
 * to fuzzy-match an individual track out of this search response.
 */
export async function searchTidal({ clientId, clientSecret, artist, title, countryCode = 'US', debug = false }) {
    const token = await getAccessToken(clientId, clientSecret);

    // A compound release title ("Living In The Zone (Remix) / A New Start")
    // makes a noisy query — TIDAL ranks the second track's words in and buries
    // the real album — so if the whole title finds nothing, retry with just
    // the lead segment.
    const segments = String(title).split(/\s*\/\s*/);
    const titleQueries = segments.length > 1 ? [title, segments[0]] : [title];

    let album = null;
    outer: for (const tq of titleQueries) {
        const json = await fetchSearchResults({ token, query: searchQuery(artist, tq), countryCode });
        if (debug) console.log(JSON.stringify(json, null, 2));

        for (const candidate of findTitleMatches(json, title)) {
            const names = candidate.names.length
                ? candidate.names
                : await fetchAlbumArtists({ token, albumId: candidate.album.id, countryCode });
            if (debug) console.log(`  candidate "${candidate.album.attributes?.title}" by ${names.join(', ')}`);
            if (artistsMatch(names, artist)) {
                album = candidate.album;
                break outer;
            }
        }
    }

    const sharingLink = album?.attributes?.externalLinks?.find((l) => l.meta?.type === 'TIDAL_SHARING')?.href;

    return {
        available: Boolean(album),
        trackId: null,
        albumUrl: album ? sharingLink ?? `https://tidal.com/browse/album/${album.id}` : null
    };
}
