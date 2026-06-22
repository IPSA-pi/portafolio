/**
 * Minimal TIDAL API client for read-only catalog search (Stage 2 — availability
 * pre-check). Uses the client_credentials grant: no user login, just an app
 * identity, which is all catalog search needs.
 *
 * Endpoints (token endpoint confirmed against the official
 * @tidal-music/tidal-sdk-web source; the search path's exact casing —
 * `/v2/searchResults/{query}`, camelCase — was confirmed by hitting the live
 * API directly: lowercase `searchresults` 404s with no body, while the
 * camelCase form reaches TIDAL's jsonapi backend and returns real results):
 *   Token:  POST https://auth.tidal.com/v1/oauth2/token
 *   Search: GET  https://openapi.tidal.com/v2/searchResults/{query}
 */

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

function normalize(s) {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

/**
 * `candidateTitle` is allowed to be `expectedTitle` plus extra decoration
 * (e.g. Tidal listing "Quench, Vol. 1 (Air) - EP" for our "Quench Vol. 1
 * (Air)"). The reverse is deliberately NOT accepted: checking whether our
 * title contains the candidate's let a generic short album literally titled
 * "Kind" falsely match our "Kind 013" — any short candidate title is a
 * substring of half the things people release.
 */
function titlesMatch(candidateTitle, expectedTitle) {
    const candidate = normalize(candidateTitle ?? '');
    const expected = normalize(expectedTitle ?? '');
    if (!candidate || !expected) return false;
    return candidate === expected || candidate.includes(expected);
}

/**
 * The search query is a loose, popularity-weighted text match — for an
 * artist with no matching release on Tidal, it still happily returns that
 * artist's *other* albums ranked by popularity, with no real title overlap.
 * So the top hit can't be trusted blindly: we only accept a candidate album
 * whose own title actually matches the release title we're looking for.
 */
function findMatchingAlbum(json, expectedTitle) {
    const candidateIds = json?.data?.relationships?.albums?.data?.map((d) => d.id) ?? [];
    const included = json?.included ?? [];
    const albumsById = new Map(included.filter((i) => i.type === 'albums').map((i) => [i.id, i]));

    for (const id of candidateIds) {
        const album = albumsById.get(id);
        if (album && titlesMatch(album.attributes?.title, expectedTitle)) return album;
    }
    return null;
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
    const query = `${artist} ${title}`;

    const url = `${API_BASE}/v2/searchResults/${encodeURIComponent(query)}?countryCode=${countryCode}&include=albums`;
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.api+json' }
    });

    if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after')) || 2;
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        return searchTidal({ clientId, clientSecret, artist, title, countryCode, debug });
    }
    if (!res.ok) {
        throw new Error(`Tidal search failed for "${query}": ${res.status} ${await res.text()}`);
    }

    const json = await res.json();
    if (debug) console.log(JSON.stringify(json, null, 2));

    const album = findMatchingAlbum(json, title);
    const sharingLink = album?.attributes?.externalLinks?.find((l) => l.meta?.type === 'TIDAL_SHARING')?.href;

    return {
        available: Boolean(album),
        trackId: null,
        albumUrl: album ? sharingLink ?? `https://tidal.com/browse/album/${album.id}` : null
    };
}
