import { getSupabase } from '$lib/server/supabase';
import { getSlugsFromSession } from '$lib/server/checkoutSlugs';

// The 35-min threshold sits above Stripe's 30-min session expiry, so any
// reservation older than this is guaranteed to belong to a dead checkout
// session — never a live one. Shared by /api/checkout (what counts as
// takeable) and the status endpoint (what counts as effectively reserved).
export const STALE_RESERVATION_MS = 35 * 60 * 1000;

// Releases the reservations a specific Stripe session holds, scoped so it
// can only ever affect reservations that actually belong to that session:
// - .eq('sold', false) — never touch a drawing that already sold
// - .lte('reserved_at', session.created + 5s) — never release a reservation
//   taken out AFTER this session was created (a newer buyer's live hold).
//   The +5s buffer absorbs clock skew between our server and Stripe.
// Shared by the webhook's expired/async_payment_failed handling and the
// checkout-cancel endpoint, so there is exactly one release implementation.
export async function releaseSessionReservations(session: { created: number; metadata?: { slug?: string; slugs?: string } | null }) {
    const slugs = getSlugsFromSession(session);
    if (slugs.length === 0) return;

    const sessionCreatedAt = new Date((session.created + 5) * 1000).toISOString();
    const { data, error } = await getSupabase()
        .from('drawings')
        .update({ reserved: false, reserved_at: null })
        .in('slug', slugs)
        .eq('sold', false)
        .lte('reserved_at', sessionCreatedAt)
        .select('slug');

    // supabase-js does not throw on a DB/PostgREST error — it comes back on
    // the result object — so this must be checked explicitly or a failure
    // here is silently swallowed.
    if (error) {
        console.error('Error releasing reservations:', error);
        return;
    }

    if (data && data.length > 0) {
        console.log(`Reservations released for: ${data.map((d) => d.slug).join(', ')}`);
    }
}
