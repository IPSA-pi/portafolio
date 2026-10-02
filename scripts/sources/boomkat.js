/**
 * Source module: boomkat.com
 *
 * RSS only — Boomkat's HTML pages sit behind a bot challenge, but the
 * /new-releases.rss feed is open (robots.txt allows it) and paginates with
 * ?page=N, 50 items per page, newest first.
 *
 * Field mapping (verified against the live feed):
 *   <title>       "Artist - Title"                 → artist + title (first " - ")
 *   <guid>        boomkat:release:<id>             → source_guid
 *   <link>        release page                     → source_url
 *   <pubDate>     RFC-2822 (listing date)          → released_at (YYYY-MM-DD)
 *   <description> entity-encoded HTML: <a><img></a>, then <p>genre</p>
 *                 <p>label</p><p>formats</p>, then <div class="trix-content">
 *                 (the review, ignored). ~1.6% of items have no genre <p>.
 *
 * `release_year` and `catalog_no` are always null: pubDate is a listing date
 * and reissues are common, so a guessed year is worse than none.
 *
 * Boomkat's genre is one coarse tag per item, and the feed is broad, so only
 * the genres in GENRE_ALLOWLIST are kept; the rest are dropped and tallied in
 * one log line so a new genre shows up in the CI log instead of vanishing.
 */

import { clean, tag } from './rss.js';

const FEED_URL = 'https://boomkat.com/new-releases.rss';
const SOURCE = 'boomkat.com';
const PAGES = 6; // 300 items — covers the busiest day seen between daily runs
const PAGE_DELAY_MS = 1000;

// Owner decision 2026-10-02: only these Boomkat genres are wanted on the
// worklist. Exact feed strings; an item with any other genre, or none, is dropped.
const GENRE_ALLOWLIST = new Set([
    'Electronic',
    'Club',
    'Techno / House',
    'Deep House',
    'Detroit',
    'Dub Techno',
    'Electro',
    'Drum & Bass',
    'Bass Music',
    'Dubstep',
    'Breaks',
    'Footwork',
    'Bassline',
    'Downtempo',
    'Ambient'
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Fetch one feed page; returns its raw <item> chunks. Throws when not OK. */
async function fetchPage(n) {
    const res = await globalThis.fetch(`${FEED_URL}?page=${n}`, {
        headers: { 'User-Agent': 'iansebelius.com new-music scraper (+https://iansebelius.com)' }
    });
    if (!res.ok) throw new Error(`${SOURCE}: page ${n} returned ${res.status}`);
    const xml = await res.text();
    return xml.split(/<item[\s>]/i).slice(1).map((chunk) => chunk.split(/<\/item>/i)[0]);
}

/** { genre, label } from the description's <p>s: [genre?, label, formats]. */
function parseDescription(rawDescription) {
    const html = clean(rawDescription).split('<div')[0];
    const ps = [...html.matchAll(/<p>([\s\S]*?)<\/p>/gi)].map((m) => clean(m[1]));
    return {
        genre: ps.length === 3 ? ps[0] : '',
        label: ps.length >= 2 ? ps[ps.length - 2] : ''
    };
}

export async function fetch() {
    const items = [];
    for (let n = 1; n <= PAGES; n++) {
        if (n > 1) await sleep(PAGE_DELAY_MS);
        try {
            const page = await fetchPage(n);
            if (page.length === 0) break;
            items.push(...page);
        } catch (err) {
            if (n === 1) throw err;
            break; // keep what we have
        }
    }

    const releases = [];
    const seen = new Set();
    const dropped = new Map();

    for (const item of items) {
        const rawTitle = tag(item, 'title');
        const sep = rawTitle.indexOf(' - ');
        if (sep === -1) continue;
        const artist = rawTitle.slice(0, sep).trim();
        const title = rawTitle.slice(sep + 3).trim();
        if (!artist || !title) continue;

        const guid = tag(item, 'guid').replace(/^boomkat:release:/, '');
        if (guid) {
            if (seen.has(guid)) continue; // items shift between pages mid-fetch
            seen.add(guid);
        }

        const { genre, label } = parseDescription(tag(item, 'description'));
        if (!GENRE_ALLOWLIST.has(genre)) {
            const key = genre || '(none)';
            dropped.set(key, (dropped.get(key) ?? 0) + 1);
            continue;
        }

        const link = tag(item, 'link');
        const pub = tag(item, 'pubDate');
        const date = pub ? new Date(pub) : null;

        releases.push({
            source: SOURCE,
            source_guid: guid || null,
            artist,
            title,
            release_year: null,
            label: label || null,
            catalog_no: null,
            genre: [genre],
            source_url: link || null,
            released_at: date && !isNaN(date) ? date.toISOString().slice(0, 10) : null
        });
    }

    if (dropped.size) {
        const total = [...dropped.values()].reduce((a, b) => a + b, 0);
        const tally = [...dropped].sort((a, b) => b[1] - a[1]).map(([g, c]) => `${g} ${c}`);
        console.log(`${SOURCE}: dropped ${total} — ${tally.join(', ')}`);
    }

    return releases;
}

export default { name: SOURCE, fetch };
