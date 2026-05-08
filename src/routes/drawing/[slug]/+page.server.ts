import { error } from '@sveltejs/kit';
import { getStripe } from '$lib/server/stripe';
import type { RequestEvent } from '@sveltejs/kit';

export async function load({ params, url }: RequestEvent) {
    const slug = params.slug;

    // Glob ALL images (original + webp variants)
    const modules = import.meta.glob('$lib/assets/drawings/*/*', {
        eager: true
    });

    const groupedImages: Record<string, { original: string, sm: string, md: string, lg: string, slug: string }> = {};

    for (const path in modules) {
        if (!path.includes(`/${slug}/`)) continue;

        const url = (modules[path] as any).default;

        const filename = path.split('/').pop() || "";
        let basename = filename;
        let type: 'original' | 'sm' | 'md' | 'lg' = 'original';

        const match = filename.match(/^(.*)-(sm|md|lg)\.webp$/);
        if (match) {
            basename = match[1];
            type = match[2] as any;
        } else {
            basename = filename.replace(/\.(png|jpg|jpeg|webp)$/i, "");
        }

        if (!groupedImages[basename]) {
            groupedImages[basename] = { original: "", sm: "", md: "", lg: "", slug: basename };
        }

        groupedImages[basename][type] = url;
    }

    const sortedKeys = Object.keys(groupedImages).sort();
    const sortedImages = sortedKeys.map(k => groupedImages[k]);

    if (sortedImages.length === 0) {
        throw error(404, 'Notebook not found');
    }

    let productsMap: Record<string, { priceId: string, price: number, sold: boolean }> = {};

    try {
        const products = await getStripe().products.list({
            active: true,
            expand: ['data.default_price']
        });

        productsMap = products.data.reduce((acc, p) => {
            if (p.metadata.slug) {
                acc[p.metadata.slug] = {
                    priceId: (p.default_price as any)?.id,
                    price: (p.default_price as any)?.unit_amount,
                    sold: p.metadata.sold === 'true' || p.metadata.reserved === 'true'
                };
            }
            return acc;
        }, {} as Record<string, { priceId: string, price: number, sold: boolean }>);

        // If returning from a completed checkout, verify the session and mark as sold
        // immediately so the UI reflects it before the webhook fires.
        const sessionId = url.searchParams.get('session_id');
        if (sessionId) {
            const session = await getStripe().checkout.sessions.retrieve(sessionId);
            if (session.payment_status === 'paid') {
                const soldSlug = session.metadata?.slug;
                if (soldSlug && productsMap[soldSlug]) {
                    productsMap[soldSlug] = { ...productsMap[soldSlug], sold: true };
                }
            }
        }
    } catch (e) {
        console.error('Error fetching Stripe products:', e);
        // Fallback or handle gracefully if Stripe is not configured
    }

    return {
        images: sortedImages,
        products: productsMap
    };
}
