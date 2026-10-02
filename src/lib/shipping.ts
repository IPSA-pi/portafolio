// Online checkout ships to Canadian addresses only (checkout/+server.ts
// `allowed_countries`). Buyers elsewhere email instead — this is the one
// place that address lives.
export const INTERNATIONAL_SALES_EMAIL = 'iansebelius@gmail.com';

export function internationalMailto(slug?: string): string {
    const subject = slug ? `International purchase: ${slug}` : 'International purchase';
    return `mailto:${INTERNATIONAL_SALES_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
