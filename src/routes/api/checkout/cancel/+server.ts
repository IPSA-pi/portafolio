import { getStripe } from '$lib/server/stripe';
import { releaseSessionReservations } from '$lib/server/reservations';
import { json } from '@sveltejs/kit';

// Best-effort cleanup for a buyer who hit Back from Stripe Checkout. Expires
// the (still-open) session so the existing expired webhook fires normally,
// then also releases the reservation(s) directly here for immediate effect —
// otherwise the buyer would see their own drawing(s) "Sold" until the webhook
// (or the 35-min stale threshold) catches up.
//
// The slug(s) are derived ONLY from the retrieved Stripe session's metadata,
// never from the request body, so this endpoint can't be abused to release
// an arbitrary drawing's reservation by passing someone else's slug. And
// release only happens through the shared releaseSessionReservations helper,
// which scopes to reservations that actually belong to THIS session — so a
// stale/replayed session id can't release a different buyer's live hold.
export const POST = async ({ request }) => {
    try {
        const { sessionId } = await request.json();
        if (!sessionId || typeof sessionId !== 'string') {
            return json({ ok: false }, { status: 200 });
        }

        const session = await getStripe().checkout.sessions.retrieve(sessionId);

        if (session.status === 'open') {
            await getStripe().checkout.sessions.expire(sessionId);
        }

        // Never release a reservation backing a session that already paid —
        // the webhook (or fulfillOrder racing this call) owns that outcome.
        if (session.payment_status !== 'paid') {
            await releaseSessionReservations(session);
        }

        return json({ ok: true });
    } catch (e) {
        console.error('Checkout cancel error:', e);
        return json({ ok: false }, { status: 200 });
    }
};
