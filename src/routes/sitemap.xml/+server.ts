import { SITE_URL } from '$lib/seo';
import { NOTEBOOKS } from '$lib/notebooks';

// Static, publicly-indexable pages. Deliberately excludes:
// - /admin/* (owner-only, gated by Cloudflare Access)
// - /drawing/feed and /drawing/[slug]/[index] (per-session shuffled feed
//   views, not stable canonical URLs worth indexing)
const STATIC_PATHS = [
    '/',
    '/drawing',
    '/video',
    '/video/cinema',
    '/video/tv',
    '/video/efectotv',
    '/learn',
    '/new-music',
    '/privacy',
    '/terms',
];

export const GET = async () => {
    const paths = [...STATIC_PATHS, ...NOTEBOOKS.map((n) => `/drawing/${n.slug}`)];

    const urls = paths
        .map((path) => `  <url><loc>${SITE_URL}${path}</loc></url>`)
        .join('\n');

    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;

    return new Response(body, {
        headers: { 'Content-Type': 'application/xml' },
    });
};
