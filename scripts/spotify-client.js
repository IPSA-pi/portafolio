/**
 * Minimal Spotify API client for read-only catalog search. Uses the
 * client_credentials grant — no user login required for catalog lookups.
 *
 * Endpoints:
 *   Token:  POST https://accounts.spotify.com/api/token  (Basic auth)
 *   Search: GET  https://api.spotify.com/v1/search?q=...&type=album
 */

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

/**
 * Lowercase and collapse to space-separated word tokens. Keeps any Unicode
 * letter or number (`\p{L}\p{N}`) rather than only ASCII `a-z0-9`: a title
 * made entirely of non-ASCII characters — Polar Inertia's "π" — would
 * otherwise normalize to the empty string and never match anything, even when
 * the album is genuinely on Spotify. Mirrors the Tidal client's normalizer.
 */
function normalize(s) {
    return s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

/**
 * Same asymmetric matching as the Tidal client: the candidate title is allowed
 * to contain extra decoration beyond our expected title, but not the reverse —
 * a short candidate like "Kind" must not match our "Kind 013".
 */
function titlesMatch(candidateTitle, expectedTitle) {
    const candidate = normalize(candidateTitle ?? '');
    const expected = normalize(expectedTitle ?? '');
    if (!candidate || !expected) return false;
    return candidate === expected || candidate.includes(expected);
}

/**
 * Search the Spotify catalog for a release. Returns { available, albumUrl }.
 */
export async function searchSpotify({ clientId, clientSecret, artist, title, debug = false }) {
    const token = await getAccessToken(clientId, clientSecret);
    const query = `${artist} ${title}`;

    const url = `${API_BASE}/v1/search?${new URLSearchParams({ q: query, type: 'album', limit: '10' })}`;
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
    });

    if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after')) || 2;
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        return searchSpotify({ clientId, clientSecret, artist, title, debug });
    }
    if (!res.ok) {
        throw new Error(`Spotify search failed for "${query}": ${res.status} ${await res.text()}`);
    }

    const json = await res.json();
    if (debug) console.log(JSON.stringify(json, null, 2));

    const items = json?.albums?.items ?? [];
    const album = items.find((a) => titlesMatch(a.name, title)) ?? null;

    return {
        available: Boolean(album),
        albumUrl: album?.external_urls?.spotify ?? null
    };
}
