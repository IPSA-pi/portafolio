import { getStripe } from '$lib/server/stripe';
import { json } from '@sveltejs/kit';

export const POST = async ({ request, url }) => {
    try {
        const { priceId, slug, notebookSlug } = await request.json();
        
        if (!priceId || !slug) {
            return json({ error: 'Missing priceId or slug' }, { status: 400 });
        }

        const session = await getStripe().checkout.sessions.create({
            line_items: [{ price: priceId, quantity: 1 }],
            mode: 'payment',
            success_url: `${url.origin}/drawing/${notebookSlug}?success=true&drawing=${slug}`,
            cancel_url: `${url.origin}/drawing/${notebookSlug}`,
            metadata: { slug, notebookSlug },
            shipping_address_collection: { allowed_countries: ['US', 'CA', 'GB', 'FR', 'DE', 'IT', 'ES', 'MX'] },
        });

        return json({ url: session.url });
    } catch (e: any) {
        console.error('Checkout Session Error:', e);
        return json({ error: e.message }, { status: 500 });
    }
};
