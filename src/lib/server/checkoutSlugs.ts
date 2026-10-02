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

// A digital-file session (see /api/checkout/digital) is keyed off a DISJOINT
// set of metadata keys: `kind: 'digital'` and `digital_slugs`. It never carries
// `slug`/`slugs`, because those mean "physical drawings this session reserved"
// and releaseSessionReservations releases by slug — a digital session carrying
// them could release another buyer's live hold on the same drawing. Keeping
// getSlugsFromSession blind to `digital_slugs` is what makes that impossible.
export function getDigitalSlugsFromSession(session: { metadata?: { digital_slugs?: string } | null }): string[] {
    if (session.metadata?.digital_slugs) {
        try {
            const parsed = JSON.parse(session.metadata.digital_slugs);
            if (Array.isArray(parsed)) return parsed;
        } catch {
            /* unparseable — treat as none */
        }
    }
    return [];
}

export function isDigitalSession(session: { metadata?: { kind?: string } | null }): boolean {
    return session.metadata?.kind === 'digital';
}
