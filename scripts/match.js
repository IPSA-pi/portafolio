/**
 * Shared release-matching helpers for the catalog-search clients.
 *
 * Every provider's search endpoint is a loose, popularity-weighted text match
 * that returns *something* for almost any query, so deciding whether a hit is
 * actually the release we asked for is the same problem for all of them. These
 * rules were worked out against TIDAL's results (see the comments — each one
 * fixes a specific false match seen in the wild) and are reused verbatim by the
 * Apple Music pass, whose search has the same failure modes: querying "Rrose —
 * Please Touch" returns the right album first and Cardi B's "Please Me" second.
 *
 * `spotify-client.js` deliberately does NOT use these yet — it has its own,
 * looser matcher, and switching it over would change existing
 * `spotify_available` values, so that's a separate change.
 */

/**
 * Lowercase and collapse to space-separated word tokens. Keeps any Unicode
 * letter or number (`\p{L}\p{N}`) rather than only ASCII `a-z0-9`: a title
 * made entirely of non-ASCII characters — Polar Inertia's "π" — would
 * otherwise normalize to the empty string and never match anything, even when
 * the album is genuinely on TIDAL.
 *
 * Decomposes to NFD and drops the combining marks first, so the two sides
 * compare regardless of how each spells an accent. TIDAL returns decomposed
 * names ("Carré" as `Carre` + U+0301) while our sources store the composed
 * form; since a combining mark is `\p{M}`, not `\p{L}`, stripping without
 * folding turned one side into "carr e" and the other into "carré" and the
 * artist never matched itself.
 */
export function normalize(s) {
    return String(s ?? '')
        .normalize('NFD')
        .replace(/\p{M}+/gu, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

/**
 * Strip the punctuation that derails TIDAL's search ranking — parentheses,
 * brackets, and slashes — while leaving the words (and any accents) intact.
 * TIDAL ranks "Kid Lib Living In The Zone (Remix)" against generic popular
 * "(Remix)" albums and buries the real release, but the same query without the
 * parens returns that release as the sole hit.
 */
export function searchQuery(artist, title) {
    return `${artist} ${title}`.replace(/[()[\]/]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * `candidateTitle` is allowed to be `expectedTitle` plus extra decoration
 * (e.g. Tidal listing "Quench, Vol. 1 (Air) - EP" for our "Quench Vol. 1
 * (Air)"). The reverse is deliberately NOT accepted: checking whether our
 * title contains the candidate's let a generic short album literally titled
 * "Kind" falsely match our "Kind 013" — any short candidate title is a
 * substring of half the things people release.
 *
 * A nodata release title can also bundle two tracks ("Living In The Zone
 * (Remix) / A New Start") where TIDAL titles the album after just one of them,
 * so accept a match on the whole expected title or on any " / " segment of it.
 *
 * The decoration has to be whole extra *tokens*, not any old trailing
 * characters: a plain substring test matched our "Selected II" against
 * Ottagone's own "Selected III", since "selected iii" does contain
 * "selected ii". Numbered series are common enough — and the neighbouring
 * volume is exactly the wrong answer — that the boundary matters.
 */
export function titlesMatch(candidateTitle, expectedTitle) {
    const candidate = normalize(candidateTitle ?? '');
    if (!candidate) return false;
    for (const part of [expectedTitle, ...String(expectedTitle ?? '').split(/\s*\/\s*/)]) {
        const expected = normalize(part);
        if (expected && containsTokens(candidate, expected)) return true;
    }
    return false;
}

/** Whole-token containment: "michael j blood" is in "michael j blood presents",
 *  but "a" is not in "michael j blood" the way plain `includes` would claim. */
export function containsTokens(haystack, needle) {
    return ` ${haystack} `.includes(` ${needle} `);
}

/**
 * Our `artist` can bundle several names the way the source printed them —
 * "Michael J. Blood / MOODS", "A & B", "X feat. Y" — while TIDAL credits the
 * album to just one of them (or to each separately). So split ours on the
 * usual joiners and accept the album if *any* credited artist lines up with
 * *any* of our segments.
 *
 * Containment (either direction) is deliberate here, unlike for titles: it
 * absorbs "Michael J Blood" vs "Michael J. Blood presents". But it only
 * applies at token boundaries and only to names of MIN_ARTIST_TOKEN_LEN or
 * more — a one- or two-character alias is a substring of half the artists
 * alive, which is the same trap that let a bare title match through in the
 * first place. Short names still match, they just have to match exactly.
 *
 * Compilations credited to "Various Artists" name nobody, so they can't be
 * checked this way and are let through on the title match alone.
 */
export const ARTIST_JOINERS = /\s*(?:\/|&|\+|,|\bx\b|\bvs\.?\b|\band\b|\bfeat\.?\b|\bft\.?\b|\bwith\b)\s*/i;
export const MIN_ARTIST_TOKEN_LEN = 3;

export function artistsMatch(candidateNames, expectedArtist) {
    const segments = String(expectedArtist ?? '')
        .split(ARTIST_JOINERS)
        .map(normalize)
        .filter(Boolean);
    if (!segments.length) return false;

    for (const name of candidateNames) {
        const candidate = normalize(name);
        if (!candidate) continue;
        if (candidate === 'various artists') return true;
        for (const segment of segments) {
            if (candidate === segment) return true;
            if (segment.length >= MIN_ARTIST_TOKEN_LEN && containsTokens(candidate, segment)) return true;
            if (candidate.length >= MIN_ARTIST_TOKEN_LEN && containsTokens(segment, candidate)) return true;
        }
    }
    return false;
}
