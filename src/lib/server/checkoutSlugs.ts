// A cart checkout puts the full slug list in metadata.slugs (JSON-encoded,
// see /api/checkout); a legacy/single-item session only has metadata.slug.
// Shared between the webhook and the checkout-cancel endpoint.
export function getSlugsFromSession(session: { metadata?: { slug?: string; slugs?: string } | null }): string[] {
    if (session.metadata?.slugs) {
        try {
            const parsed = JSON.parse(session.metadata.slugs);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch {
            /* fall through to the legacy single-slug field */
        }
    }
    return session.metadata?.slug ? [session.metadata.slug] : [];
}
