/**
 * Minimal Apple Music client for read-only catalog search (availability
 * pre-check), built on the public iTunes Search API:
 *
 *   GET https://itunes.apple.com/search?term={q}&entity=album&country={cc}
 *
 * No credentials. Apple's *official* Music API (api.music.apple.com) would be
 * the more precise source — it queries the Apple Music catalog directly and
 * reports true per-storefront availability — but it requires an Apple Developer
 * Program membership and a developer token signed with a MusicKit private key.
 * The Search API needs neither and still returns canonical
 * `music.apple.com/{cc}/album/{slug}/{id}` links, which is all the pill on
 * /new-music needs.
 *
 * The tradeoff, worth remembering before trusting a `false`: this searches the
 * iTunes Store catalog, which overlaps Apple Music heavily but not exactly. A
 * streaming-only release can be on Apple Music and absent here, so
 * `apple_available = false` means "not found in the store catalog", a weaker
 * claim than the Tidal and Spotify columns make.
 *
 * If the developer membership ever happens, this file is the only one that
 * changes — the column names, the enrich script, and the UI stay as they are.
 */

import { artistsMatch, searchQuery, titlesMatch } from './match.js';

const SEARCH_URL = 'https://itunes.apple.com/search';

// Apple documents the Search API at roughly 20 calls/minute and answers a
// throttle with 403 (not 429), with no Retry-After. Observed behaviour is
// looser than that, but a burst still has to back off rather than spin: a
// sustained 403 means we're genuinely over quota and the run should surface it,
// so the retries are bounded where the Spotify client's 429 recursion isn't.
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = 5_000;

/** Run one search, backing off on a throttle, and return the parsed body. */
async function fetchSearchResults({ term, country, attempt = 1 }) {
    const url = `${SEARCH_URL}?${new URLSearchParams({
        term,
        entity: 'album',
        limit: '10',
        country
    })}`;
    const res = await fetch(url);

    if (res.status === 403 || res.status === 429) {
        if (attempt >= MAX_ATTEMPTS) {
            throw new Error(
                `Apple search throttled for "${term}": ${res.status} after ${attempt} attempts — slow the enrich pass down`
            );
        }
        const retryAfter = Number(res.headers.get('retry-after')) * 1000 || BACKOFF_MS * attempt;
        await new Promise((r) => setTimeout(r, retryAfter));
        return fetchSearchResults({ term, country, attempt: attempt + 1 });
    }
    if (!res.ok) {
        throw new Error(`Apple search failed for "${term}": ${res.status} ${await res.text()}`);
    }

    // The endpoint serves `content-type: text/javascript`, so parse the body
    // ourselves rather than relying on res.json() to accept that type.
    const body = await res.text();
    try {
        return JSON.parse(body);
    } catch {
        throw new Error(`Apple search returned unparseable body for "${term}": ${body.slice(0, 200)}`);
    }
}

/** Drop Apple's `uo=4` affiliate-tracking parameter from a store URL. */
function cleanUrl(url) {
    if (!url) return null;
    try {
        const parsed = new URL(url);
        parsed.searchParams.delete('uo');
        parsed.search = parsed.searchParams.toString();
        return parsed.toString();
    } catch {
        return url;
    }
}

/**
 * Search the Apple catalog for a release and decide if it's genuinely there.
 * Returns { available, albumUrl }.
 *
 * Results are relevance-ranked and Apple always returns *something*, so — as
 * with TIDAL — the top hit can't be trusted and neither can a title match on
 * its own. Searching "Rrose Please Touch" returns the correct album first and
 * Cardi B & Bruno Mars' "Please Me - Single" second; only requiring the title
 * *and* the credited artist to line up rejects the second one. Apple's own
 * " - Single" / " - EP" suffixes are absorbed by titlesMatch, which allows the
 * candidate to carry extra whole tokens.
 */
export async function searchAppleMusic({ artist, title, country = 'CA', debug = false }) {
    // A compound release title ("Living In The Zone (Remix) / A New Start")
    // makes a noisy query and buries the real album, so if the whole title
    // finds nothing, retry with just the lead segment — same as the Tidal pass.
    const segments = String(title).split(/\s*\/\s*/);
    const titleQueries = segments.length > 1 ? [title, segments[0]] : [title];

    let match = null;
    outer: for (const tq of titleQueries) {
        const json = await fetchSearchResults({ term: searchQuery(artist, tq), country });
        if (debug) console.log(JSON.stringify(json, null, 2));

        for (const candidate of json?.results ?? []) {
            if (!titlesMatch(candidate.collectionName, title)) continue;
            if (debug) console.log(`  candidate "${candidate.collectionName}" by ${candidate.artistName}`);
            if (artistsMatch([candidate.artistName], artist)) {
                match = candidate;
                break outer;
            }
        }
    }

    return {
        available: Boolean(match),
        albumUrl: match ? cleanUrl(match.collectionViewUrl) : null
    };
}
