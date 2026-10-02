/**
 * Shared RSS/XML helpers for the source modules in this folder.
 *
 * Regex-based on purpose: the feeds are small, well-formed and fixed-shape, so
 * a full XML parser isn't worth a dependency. Used by `nodata.js` and
 * `boomkat.js`.
 */

/** Strip a CDATA wrapper and decode the handful of XML entities WP emits. */
export function clean(raw) {
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
export function tag(xml, name) {
    const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
    return m ? clean(m[1]) : '';
}

/** All occurrences of `tag`, cleaned. */
export function tagAll(xml, name) {
    const out = [];
    const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'gi');
    let m;
    while ((m = re.exec(xml)) !== null) out.push(clean(m[1]));
    return out;
}
