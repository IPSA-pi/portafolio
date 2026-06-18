// Central SEO / Open Graph configuration.
//
// SITE_URL is the canonical production origin. We use a fixed value (rather than
// the request origin) so links shared from preview deploys still unfurl with the
// canonical domain, and so og:image always points at an absolute URL that social
// crawlers can fetch.
export const SITE_URL = 'https://iansebelius.com';
export const SITE_NAME = 'Ian Sebelius';
export const DEFAULT_DESCRIPTION =
    'Original drawings by Ian Sebelius — hand-drawn notebook pages, available as one-of-a-kind originals.';
export const DEFAULT_OG_IMAGE = '/og/default.jpg';

export type Seo = {
    title?: string;
    description?: string;
    /** Absolute URL or root-relative path; relative paths are resolved against SITE_URL. */
    image?: string;
    /** Root-relative path of the current page, used for the canonical URL. */
    path?: string;
    type?: 'website' | 'article';
};

/** Resolve a root-relative path or absolute URL to an absolute URL. */
export function absoluteUrl(pathOrUrl: string): string {
    if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
    return SITE_URL + (pathOrUrl.startsWith('/') ? pathOrUrl : '/' + pathOrUrl);
}
