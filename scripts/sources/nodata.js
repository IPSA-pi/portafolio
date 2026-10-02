/**
 * Source module: nodata.tv
 *
 * nodata.tv exposes a clean RSS 2.0 feed at /feed, so we parse that rather than
 * scraping HTML — it's stable, polite, and structured. robots.txt only blocks
 * /wp-admin/, so the feed is fair game.
 *
 * Field mapping (verified against the live feed):
 *   <title>       "Artist / Release Title [Year]"  → artist + title
 *   <link>        https://nodata.tv/{id}           → source_url + source_guid
 *   <pubDate>     RFC-2822                          → released_at (YYYY-MM-DD)
 *   <category>*   repeated                          → genre tags
 *   <description> "[Label: X | Cat#: Y] tracklist"  → label + catalog_no
 *
 * Each module exports `fetch()` returning an array of normalized release objects.
 */

import { tag, tagAll } from './rss.js';

const FEED_URL = 'https://nodata.tv/feed';
const SOURCE = 'nodata.tv';

// Category tags that describe format rather than genre — dropped from `genre`.
const FORMAT_TAGS = new Set(['EP', 'Album', 'Various Artists', 'Single', 'Compilation']);

/**
 * Split "Artist / Title [Year]" into { artist, title, release_year }.
 *
 * nodata separates artist from title with " / ", except when the release
 * title itself contains a " / " (a two-track single like "Good Night Baby /
 * Hang (Remixes)") — then the feed switches to an en-dash, "Artist – Title",
 * and the " / " belongs to the title. So when an en-dash is present, prefer it
 * as the separator; otherwise fall back to the first " / ".
 */
function parseTitle(rawTitle) {
    const yearMatch = rawTitle.match(/\[(\d{4})\]\s*$/);
    const release_year = yearMatch ? parseInt(yearMatch[1], 10) : null;
    const t = rawTitle.replace(/\s*\[\d{4}\]\s*$/, '').trim();

    const dash = t.indexOf(' – '); // " – " en-dash: artist/title separator for multi-track titles
    if (dash !== -1) return { artist: t.slice(0, dash).trim(), title: t.slice(dash + 3).trim(), release_year };

    const slash = t.indexOf(' / ');
    if (slash === -1) return { artist: '', title: t, release_year };
    return { artist: t.slice(0, slash).trim(), title: t.slice(slash + 3).trim(), release_year };
}

export async function fetch() {
    const res = await globalThis.fetch(FEED_URL, {
        headers: { 'User-Agent': 'iansebelius.com new-music scraper (+https://iansebelius.com)' }
    });
    if (!res.ok) throw new Error(`${SOURCE}: feed returned ${res.status}`);
    const xml = await res.text();

    const items = xml.split(/<item[\s>]/i).slice(1).map((chunk) => chunk.split(/<\/item>/i)[0]);
    const releases = [];

    for (const item of items) {
        const rawTitle = tag(item, 'title');
        if (!rawTitle) continue;
        const { artist, title, release_year } = parseTitle(rawTitle);
        if (!artist || !title) continue; // skip anything that doesn't fit the format

        const link = tag(item, 'link');
        const guidMatch = link.match(/\/(\d+)\/?$/);
        const description = tag(item, 'description');

        const labelMatch = description.match(/\[Label:\s*(.+?)\s*[|\]]/i);
        const catMatch = description.match(/Cat#:\s*(\S+)/i);

        const pub = tag(item, 'pubDate');
        const date = pub ? new Date(pub) : null;
        const releasedAt = date && !isNaN(date) ? date.toISOString().slice(0, 10) : null;

        const genre = tagAll(item, 'category').filter((g) => !FORMAT_TAGS.has(g));

        releases.push({
            source: SOURCE,
            source_guid: guidMatch ? guidMatch[1] : null,
            artist,
            title,
            release_year,
            label: labelMatch ? labelMatch[1].trim() : null,
            catalog_no: catMatch ? catMatch[1].replace(/[\]]+$/, '') : null,
            genre: genre.length ? genre : null,
            source_url: link || null,
            released_at: releasedAt
        });
    }

    return releases;
}

export default { name: SOURCE, fetch };
