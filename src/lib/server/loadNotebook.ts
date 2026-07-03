import { error } from '@sveltejs/kit';
import { getStripe } from '$lib/server/stripe';
import { getSupabase } from '$lib/server/supabase';
import { getSlugsFromSession } from '$lib/server/checkoutSlugs';
import { seededShuffle } from '$lib/utils/shuffle';

function variantUrl(storageUrl: string, variant: 'sm' | 'md' | 'lg'): string {
    return storageUrl.replace(/\.webp$/, `-${variant}.webp`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildImages(drawings: any[]) {
    return drawings.map(d => ({
        slug:     d.slug,
        notebook: d.notebook,
        original: d.storage_url,
        sm:       variantUrl(d.storage_url, 'sm'),
        md:       variantUrl(d.storage_url, 'md'),
        lg:       variantUrl(d.storage_url, 'lg'),
    }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildProducts(drawings: any[]) {
    const products: Record<string, { priceId: string; price: number; sold: boolean; reserved: boolean }> = {};
    for (const d of drawings) {
        if (d.stripe_price_id && d.price_cents) {
            products[d.slug] = {
                priceId:  d.stripe_price_id,
                price:    d.price_cents,
                sold:     d.sold,
                reserved: d.reserved && !d.sold,
            };
        }
    }
    return products;
}

export async function loadNotebook(
    slug: string,
    seed: number,
    sessionId?: string | null
) {
    const { data: drawings, error: dbError } = await getSupabase()
        .from('drawings')
        .select('*')
        .eq('notebook', slug)
        .order('display_order', { ascending: true });

    if (dbError) {
        console.error('Supabase query error:', dbError.message);
        throw error(500, 'Failed to load drawings');
    }

    if (!drawings || drawings.length === 0) {
        throw error(404, 'Notebook not found');
    }

    const images = seededShuffle(buildImages(drawings), seed);
    const products = buildProducts(drawings);

    if (sessionId) {
        try {
            const session = await getStripe().checkout.sessions.retrieve(sessionId);
            if (session.payment_status === 'paid') {
                // A cart session may cover several drawings, not just this
                // notebook's — only the ones present in `products` apply here.
                for (const soldSlug of getSlugsFromSession(session)) {
                    if (products[soldSlug]) {
                        products[soldSlug] = { ...products[soldSlug], sold: true, reserved: false };
                    }
                }
            }
        } catch (e) {
            console.error('Error verifying session:', e);
        }
    }

    return { images, products, slug };
}

// Loads every drawing across all notebooks, seeded-shuffled, for the
// full-screen random feed at /drawing/feed.
export async function loadAllDrawings(seed: number) {
    const { data: drawings, error: dbError } = await getSupabase()
        .from('drawings')
        .select('*')
        .order('display_order', { ascending: true });

    if (dbError) {
        console.error('Supabase query error:', dbError.message);
        throw error(500, 'Failed to load drawings');
    }

    if (!drawings || drawings.length === 0) {
        throw error(404, 'No drawings found');
    }

    return {
        images:   seededShuffle(buildImages(drawings), seed),
        products: buildProducts(drawings),
    };
}
