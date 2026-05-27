import { error } from '@sveltejs/kit';
import { getStripe } from '$lib/server/stripe';
import { getSupabase } from '$lib/server/supabase';
import type { RequestEvent } from '@sveltejs/kit';

function variantUrl(storageUrl: string, variant: 'sm' | 'md' | 'lg'): string {
    return storageUrl.replace(/\.webp$/, `-${variant}.webp`);
}

export async function load({ params, url }: RequestEvent) {
    const notebook = params.slug;
    if (!notebook) throw error(400, 'Missing notebook slug');

    const { data: drawings, error: dbError } = await getSupabase()
        .from('drawings')
        .select('*')
        .eq('notebook', notebook)
        .order('display_order', { ascending: true });

    if (dbError) {
        console.error('Supabase query error:', dbError.message);
        throw error(500, 'Failed to load drawings');
    }

    if (!drawings || drawings.length === 0) {
        throw error(404, 'Notebook not found');
    }

    const images = drawings.map(d => ({
        slug:     d.slug,
        original: d.storage_url,
        sm:       variantUrl(d.storage_url, 'sm'),
        md:       variantUrl(d.storage_url, 'md'),
        lg:       variantUrl(d.storage_url, 'lg'),
    }));

    const products: Record<string, { priceId: string; price: number; sold: boolean }> = {};
    for (const d of drawings) {
        if (d.stripe_price_id && d.price_cents) {
            products[d.slug] = {
                priceId: d.stripe_price_id,
                price:   d.price_cents,
                sold:    d.sold || d.reserved,
            };
        }
    }

    // If returning from a completed checkout, optimistically mark as sold
    // so the UI reflects it before the webhook fires.
    const sessionId = url.searchParams.get('session_id');
    if (sessionId) {
        try {
            const session = await getStripe().checkout.sessions.retrieve(sessionId);
            if (session.payment_status === 'paid') {
                const soldSlug = session.metadata?.slug;
                if (soldSlug && products[soldSlug]) {
                    products[soldSlug] = { ...products[soldSlug], sold: true };
                }
            }
        } catch (e) {
            console.error('Error verifying session:', e);
        }
    }

    return { images, products };
}
