import { SITE_URL } from '$lib/seo';
import { loadNotebookCards } from '$lib/server/loadNotebook';
import { chapters } from '$lib/learn/chapters';
import { ABOUT_PUBLISHED } from '$lib/about';

// Static, publicly-indexable pages. Deliberately excludes:
// - /admin/* (owner-only, gated by Cloudflare Access)
// - /drawing/[slug]/[index] (per-session shuffled per-drawing views, not
//   stable canonical URLs worth indexing)
// /drawing/feed (the "All Drawings" view) IS listed: since H1 it's a stable
// chronological page, not a shuffled feed.
const STATIC_PATHS = [
    '/',
    '/drawing',
    '/drawing/feed',
    '/video',
    '/video/cinema',
    '/video/tv',
    '/video/efectotv',
    '/learn',
    '/new-music',
    '/text2binary',
    '/privacy',
    '/terms',
];

export const GET = async () => {
    const notebooks = await loadNotebookCards();
    const paths = [
        ...STATIC_PATHS,
        // Only advertise /about once it's published — while it's a draft it
        // 404s for everyone but the owner.
        ...(ABOUT_PUBLISHED ? ['/about'] : []),
        ...chapters.map((c) => `/learn/${c.slug}`),
        ...notebooks.map((n) => `/drawing/${n.slug}`),
    ];

    const urls = paths
        .map((path) => `  <url><loc>${SITE_URL}${path}</loc></url>`)
        .join('\n');

    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;

    return new Response(body, {
        headers: { 'Content-Type': 'application/xml' },
    });
};
