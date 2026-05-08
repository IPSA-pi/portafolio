import { getStripe } from '$lib/server/stripe';
import { json } from '@sveltejs/kit';

export const POST = async ({ request, url }) => {
    try {
        const { priceId, slug, notebookSlug } = await request.json();

        if (!priceId || !slug) {
            return json({ error: 'Missing priceId or slug' }, { status: 400 });
        }

        // Prevent duplicate purchases: check if already sold or reserved
        const products = await getStripe().products.list({ active: true });
        const product = products.data.find(p => p.metadata.slug === slug);

        if (!product) {
            return json({ error: 'Product not found' }, { status: 404 });
        }

        if (product.metadata.sold === 'true' || product.metadata.reserved === 'true') {
            return json({ error: 'This drawing is no longer available' }, { status: 409 });
        }

        // Reserve immediately to block concurrent checkouts
        await getStripe().products.update(product.id, {
            metadata: { ...product.metadata, reserved: 'true' }
        });

        const session = await getStripe().checkout.sessions.create({
            line_items: [{ price: priceId, quantity: 1 }],
            mode: 'payment',
            success_url: `${url.origin}/drawing/${notebookSlug}?success=true&drawing=${slug}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${url.origin}/drawing/${notebookSlug}`,
            metadata: { slug, notebookSlug, productId: product.id },
            shipping_address_collection: { allowed_countries: ['US', 'CA', 'GB', 'FR', 'DE', 'IT', 'ES', 'MX'] },
            expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 min (Stripe minimum)
        });

        return json({ url: session.url });
    } catch (e: any) {
        console.error('Checkout Session Error:', e);
        return json({ error: e.message }, { status: 500 });
    }
};
