import { getStripe } from '$lib/server/stripe';
import { getSupabase } from '$lib/server/supabase';
import { getSlugsFromSession } from '$lib/server/checkoutSlugs';
import { json } from '@sveltejs/kit';

// Best-effort cleanup for a buyer who hit Back from Stripe Checkout. Expires
// the (still-open) session so the existing expired webhook fires normally,
// then also releases the reservation(s) directly here for immediate effect —
// otherwise the buyer would see their own drawing(s) "Sold" until the webhook
// (or the 35-min stale threshold) catches up.
//
// The slug(s) are derived ONLY from the retrieved Stripe session's metadata,
// never from the request body, so this endpoint can't be abused to release
// an arbitrary drawing's reservation by passing someone else's slug.
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

        const slugs = getSlugsFromSession(session);
        if (slugs.length > 0) {
            await getSupabase()
                .from('drawings')
                .update({ reserved: false, reserved_at: null })
                .in('slug', slugs)
                .eq('sold', false);
        }

        return json({ ok: true });
    } catch (e) {
        console.error('Checkout cancel error:', e);
        return json({ ok: false }, { status: 200 });
    }
};
