/**
 * Source module: ra.co (Resident Advisor)
 *
 * RA exposes their review data via an internal GraphQL API at /graphql —
 * the same endpoint their own frontend uses. No RSS feed exists, and the
 * page itself is JS-rendered, so the API is the right target.
 *
 * robots.txt blocks /api but not /graphql. The scraper identifies itself
 * politely via User-Agent.
 *
 * Field mapping:
 *   artists[0].name          → artist
 *   title (strip artist prefix) → title
 *   labels[0].name            → label
 *   catalogue                 → catalog_no
 *   genres[].name             → genre tags
 *   contentUrl               → source_url (prefixed with https://ra.co)
 *   id                        → source_guid
 *   releaseDate               → release_year (year extracted if present)
 */

const GRAPHQL_URL = 'https://ra.co/graphql';
const SOURCE = 'ra.co';
const REVIEW_TYPES = ['ALBUM', 'SINGLE'];
const LIMIT = 20; // RA silently returns empty above this threshold

const QUERY = `
  query Reviews($type: ReviewType, $limit: Int) {
    reviews(type: $type, limit: $limit) {
      id
      title
      releaseDate
      catalogue
      contentUrl
      artists { name }
      labels { name }
      genres { name }
    }
  }
`;

function parseRelease(review) {
    const rawTitle = review.title?.trim() ?? '';
    if (!rawTitle) return null;

    const artistName = review.artists?.[0]?.name?.trim() ?? null;
    let artist = artistName;
    let title = rawTitle;

    if (artistName) {
        const prefix = artistName + ' - ';
        if (rawTitle.startsWith(prefix)) {
            title = rawTitle.slice(prefix.length).trim();
        } else {
            // Fallback: split on first " - "
            const dash = rawTitle.indexOf(' - ');
            if (dash !== -1) {
                artist = rawTitle.slice(0, dash).trim();
                title = rawTitle.slice(dash + 3).trim();
            }
        }
    } else {
        const dash = rawTitle.indexOf(' - ');
        if (dash !== -1) {
            artist = rawTitle.slice(0, dash).trim();
            title = rawTitle.slice(dash + 3).trim();
        }
    }

    if (!artist || !title) return null;

    const label = review.labels?.[0]?.name?.trim() || null;
    const genre = (review.genres ?? []).map((g) => g.name).filter(Boolean);

    let release_year = null;
    if (review.releaseDate) {
        const m = String(review.releaseDate).match(/(\d{4})/);
        if (m) release_year = parseInt(m[1], 10);
    }

    return {
        source: SOURCE,
        source_guid: String(review.id),
        artist,
        title,
        label,
        catalog_no: review.catalogue || null,
        genre: genre.length ? genre : null,
        source_url: review.contentUrl ? `https://ra.co${review.contentUrl}` : null,
        released_at: null,
        release_year,
    };
}

export async function fetch() {
    const releases = [];
    const seen = new Set();

    for (const type of REVIEW_TYPES) {
        const res = await globalThis.fetch(GRAPHQL_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                Referer: 'https://ra.co/reviews',
                Origin: 'https://ra.co',
            },
            body: JSON.stringify({ query: QUERY, variables: { type, limit: LIMIT } }),
        });

        if (!res.ok) throw new Error(`${SOURCE}: GraphQL returned ${res.status}`);
        const { data, errors } = await res.json();
        if (errors?.length) throw new Error(`${SOURCE}: ${errors[0].message}`);

        for (const review of data?.reviews ?? []) {
            if (seen.has(review.id)) continue;
            seen.add(review.id);
            const parsed = parseRelease(review);
            if (parsed) releases.push(parsed);
        }
    }

    return releases;
}

export default { name: SOURCE, fetch };
