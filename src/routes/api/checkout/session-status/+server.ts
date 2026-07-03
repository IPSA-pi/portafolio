import { getStripe } from '$lib/server/stripe';
import { getSlugsFromSession } from '$lib/server/checkoutSlugs';
import { json } from '@sveltejs/kit';

// Public read of just enough Stripe session state to drive the success
// banner honestly. Deliberately narrow: only { paid, slugs } ever leaves the
// server — no customer/shipping/amount details, and an unknown or invalid
// session_id degrades to "not paid" rather than erroring, since a
// hand-crafted or stale id is not actionable by the caller either way.
export const GET = async ({ url }) => {
    const sessionId = url.searchParams.get('session_id');
    if (!sessionId) {
        return json({ paid: false, slugs: [] });
    }

    try {
        const session = await getStripe().checkout.sessions.retrieve(sessionId);
        return json({
            paid: session.payment_status === 'paid',
            slugs: getSlugsFromSession(session),
        });
    } catch (e) {
        console.error('Error retrieving checkout session status:', e);
        return json({ paid: false, slugs: [] });
    }
};
