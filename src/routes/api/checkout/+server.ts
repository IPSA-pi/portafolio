import { getStripe } from '$lib/server/stripe';
import { getSupabase } from '$lib/server/supabase';
import { json } from '@sveltejs/kit';

export const POST = async ({ request, url }) => {
    try {
        const { slug, notebookSlug } = await request.json();

        if (!slug || !notebookSlug) {
            return json({ error: 'Missing slug or notebookSlug' }, { status: 400 });
        }

        // Atomic reservation: only succeeds if not already sold, AND
        // it's either not reserved or the reservation is stale (>35 mins old).
        // The UPDATE ... WHERE is race-safe: if two requests arrive at once,
        // Postgres serializes them and re-checks the WHERE on the locked row,
        // so exactly one gets a row back. The 35-min threshold sits above
        // Stripe's 30-min session expiry, so any reservation we take over is
        // guaranteed to have a dead checkout session — never two live ones.
        const staleThreshold = new Date(Date.now() - 35 * 60 * 1000).toISOString();
        const { data, error: dbError } = await getSupabase()
            .from('drawings')
            .update({ reserved: true, reserved_at: new Date().toISOString() })
            .eq('slug', slug)
            .eq('sold', false)
            .or(`reserved.eq.false,reserved_at.lt.${staleThreshold}`)
            .select('stripe_price_id')
            .single();

        if (dbError || !data) {
            return json({ error: 'This drawing is no longer available' }, { status: 409 });
        }

        const priceId = data.stripe_price_id;
        if (!priceId) {
            // Roll back reservation — drawing has no price set
            await getSupabase()
                .from('drawings')
                .update({ reserved: false, reserved_at: null })
                .eq('slug', slug);
            return json({ error: 'Drawing is not for sale' }, { status: 409 });
        }

        const session = await getStripe().checkout.sessions.create({
            line_items: [{ price: priceId, quantity: 1 }],
            mode: 'payment',
            success_url: `${url.origin}/drawing/${notebookSlug}?success=true&drawing=${slug}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url:  `${url.origin}/drawing/${notebookSlug}`,
            metadata:             { slug, notebookSlug },
            client_reference_id:  slug,
            shipping_address_collection: {
                allowed_countries: [
                    'US', 'CA', 'GB', 'FR', 'DE', 'IT', 'ES', 'MX',
                    'JP', 'AR', 'BR', 'CL', 'CO', 'EC', 'PE', 'PY', 'UY', 'BO',
                ],
            },
            expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
        });

        return json({ url: session.url });
    } catch (e: any) {
        console.error('Checkout error:', e);
        return json({ error: e.message }, { status: 500 });
    }
};
