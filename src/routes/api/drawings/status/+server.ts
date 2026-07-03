import { getSupabase } from '$lib/server/supabase';
import { STALE_RESERVATION_MS } from '$lib/server/reservations';
import { json } from '@sveltejs/kit';

// Public read of the same public gallery data (sold/reserved/price), scoped
// to a slug list — lets the cart page re-check availability without exposing
// anything beyond what's already visible in the gallery. Capped to keep the
// IN(...) query bounded (also matches the 20-item checkout cart limit).
const MAX_SLUGS = 50;

export const GET = async ({ url }) => {
    const slugsParam = url.searchParams.get('slugs');
    if (!slugsParam) {
        return json({ error: 'Missing slugs' }, { status: 400 });
    }

    const slugs = slugsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, MAX_SLUGS);
    if (slugs.length === 0) {
        return json({});
    }

    const { data, error: dbError } = await getSupabase()
        .from('drawings')
        .select('slug, sold, reserved, reserved_at, price_cents')
        .in('slug', slugs);

    if (dbError) {
        console.error('Error reading drawing status:', dbError);
        return json({ error: 'Failed to read drawing status' }, { status: 500 });
    }

    // A reservation older than STALE_RESERVATION_MS is takeable by /api/checkout
    // (see reservations.ts) — report it as effectively available here too, or a
    // missed expired-webhook makes the cart page flag the item unavailable
    // forever even though checkout would happily reserve it.
    const staleThreshold = Date.now() - STALE_RESERVATION_MS;
    const result: Record<string, { sold: boolean; reserved: boolean; price_cents: number | null }> = {};
    for (const d of data ?? []) {
        const effectiveReserved = d.reserved && !!d.reserved_at && new Date(d.reserved_at).getTime() >= staleThreshold;
        result[d.slug] = { sold: d.sold, reserved: effectiveReserved, price_cents: d.price_cents };
    }

    return json(result);
};
