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

const FEED_URL = 'https://nodata.tv/feed';
const SOURCE = 'nodata.tv';

// Category tags that describe format rather than genre — dropped from `genre`.
const FORMAT_TAGS = new Set(['EP', 'Album', 'Various Artists', 'Single', 'Compilation']);

/** Strip a CDATA wrapper and decode the handful of XML entities WP emits. */
function clean(raw) {
    if (raw == null) return '';
    let s = String(raw).trim();
    const cdata = s.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
    if (cdata) s = cdata[1];
    return s
        // Numeric entities (WP encodes &, |, dashes, quotes this way): &#124; &#038; …
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
        // Named entities.
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .trim();
}

/** First captured group of `tag` inside `xml`, cleaned; or '' if absent. */
function tag(xml, name) {
    const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
    return m ? clean(m[1]) : '';
}

/** All occurrences of `tag`, cleaned. */
function tagAll(xml, name) {
    const out = [];
    const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'gi');
    let m;
    while ((m = re.exec(xml)) !== null) out.push(clean(m[1]));
    return out;
}

/** Split "Artist / Title [Year]" into { artist, title }. */
function parseTitle(rawTitle) {
    const t = rawTitle.replace(/\s*\[\d{4}\]\s*$/, '').trim(); // drop trailing [YYYY]
    const slash = t.indexOf(' / ');
    if (slash === -1) return { artist: '', title: t };
    return { artist: t.slice(0, slash).trim(), title: t.slice(slash + 3).trim() };
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
        const { artist, title } = parseTitle(rawTitle);
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
