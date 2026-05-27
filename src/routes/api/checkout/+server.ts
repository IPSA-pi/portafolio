import { getStripe } from '$lib/server/stripe';
import { getSupabase } from '$lib/server/supabase';
import { json } from '@sveltejs/kit';

export const POST = async ({ request, url }) => {
    try {
        const { slug, notebookSlug } = await request.json();

        if (!slug || !notebookSlug) {
            return json({ error: 'Missing slug or notebookSlug' }, { status: 400 });
        }

        // Atomic reservation: only succeeds if not already sold or reserved.
        // Uses UPDATE ... WHERE to avoid race conditions — if two requests
        // arrive simultaneously, exactly one will get rowCount=1.
        const { data, error: dbError } = await getSupabase()
            .from('drawings')
            .update({ reserved: true, reserved_at: new Date().toISOString() })
            .eq('slug', slug)
            .eq('sold', false)
            .eq('reserved', false)
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
            metadata:    { slug, notebookSlug },
            shipping_address_collection: {
                allowed_countries: ['US', 'CA', 'GB', 'FR', 'DE', 'IT', 'ES', 'MX'],
            },
            expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
        });

        return json({ url: session.url });
    } catch (e: any) {
        console.error('Checkout error:', e);
        return json({ error: e.message }, { status: 500 });
    }
};
