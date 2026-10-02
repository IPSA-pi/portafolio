import type { Drawing } from '$lib/server/supabase';

type ListingRow = Pick<Drawing, 'digital_object_path' | 'digital_stripe_price_id' | 'digital_price_cents'>;

/**
 * The Listed rule — the only place it lives. A drawing's paid digital file is
 * for sale iff a master exists, a Stripe price exists, and the price is
 * positive. Derived, never stored; independent of `sold` / `reserved`.
 *
 * Returns only what a checkout needs. `digital_object_path` is read for the
 * rule and deliberately not returned: it names an object in the private
 * masters bucket and never leaves the server.
 */
export function digitalListing(row: ListingRow): { priceId: string; priceCents: number } | null {
    if (!row.digital_object_path) return null;
    if (!row.digital_stripe_price_id) return null;
    if (row.digital_price_cents == null || row.digital_price_cents <= 0) return null;
    return { priceId: row.digital_stripe_price_id, priceCents: row.digital_price_cents };
}
