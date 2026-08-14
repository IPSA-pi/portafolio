import { error } from '@sveltejs/kit';
import { getStripe } from '$lib/server/stripe';
import { getSupabase } from '$lib/server/supabase';
import { getSlugsFromSession } from '$lib/server/checkoutSlugs';
import { displayOrder } from '$lib/utils/shuffle';
import { chronologyKey } from '$lib/utils/chronology';
import type { ArtworkImage } from '$lib/utils/artwork';

function variantUrl(storageUrl: string, variant: 'sm' | 'md' | 'lg'): string {
    return storageUrl.replace(/\.webp$/, `-${variant}.webp`);
}

// Exactly the columns buildImages + buildProducts read, plus display_order for
// the sort — never `*`. These queries run per request at the edge over every
// drawing in the table, so the unread columns (id, drawing_number,
// stripe_product_id, reserved_at, created_at, updated_at) are pure transfer
// cost. Keep this in sync when either builder starts reading a new column.
const GALLERY_COLUMNS =
    'slug, notebook, storage_url, display_order, stripe_price_id, price_cents, sold, reserved, title, year, medium, width_cm, height_cm';

// Public gallery reads are effectively static between sales. `max-age=0` keeps
// the buyer's own browser revalidating — so a drawing they just bought never
// looks available on the way back — while shared caches may serve up to a
// minute old, and up to five more while revalidating. Availability is never
// trusted from this payload anyway: /cart re-checks it live through
// /api/drawings/status, and /api/checkout re-checks it atomically at
// reservation time.
export const GALLERY_CACHE_CONTROL = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300';

// Artwork metadata rides the images array rather than `products`: `products`
// only has entries for Stripe-priced drawings, and Gallery never receives it
// at all. Every field is nullable — most rows carry none.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildImages(drawings: any[]): ArtworkImage[] {
    return drawings.map(d => ({
        slug:     d.slug,
        notebook: d.notebook,
        sm:       variantUrl(d.storage_url, 'sm'),
        md:       variantUrl(d.storage_url, 'md'),
        lg:       variantUrl(d.storage_url, 'lg'),
        title:    d.title,
        year:     d.year,
        medium:   d.medium,
        widthCm:  d.width_cm,
        heightCm: d.height_cm,
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
        .select(GALLERY_COLUMNS)
        .eq('notebook', slug)
        .order('display_order', { ascending: true });

    if (dbError) {
        console.error('Supabase query error:', dbError.message);
        throw error(500, 'Failed to load drawings');
    }

    if (!drawings || drawings.length === 0) {
        throw error(404, 'Notebook not found');
    }

    const images = displayOrder(buildImages(drawings), seed);
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

// Loads every drawing across all notebooks for the "All Drawings" view at
// /drawing/feed. Returns them in `display_order`-ascending order (unshuffled)
// so the page can stable-sort by the chronology key client-side — grouping by
// notebook while preserving each notebook's own page order. The random-feed
// shuffle was dropped here on purpose (Part H): this view is chronological +
// filterable; only the per-notebook galleries stay seeded-shuffled.
export async function loadAllDrawings() {
    const { data: drawings, error: dbError } = await getSupabase()
        .from('drawings')
        .select(GALLERY_COLUMNS)
        .order('display_order', { ascending: true });

    if (dbError) {
        console.error('Supabase query error:', dbError.message);
        throw error(500, 'Failed to load drawings');
    }

    if (!drawings || drawings.length === 0) {
        throw error(404, 'No drawings found');
    }

    return {
        images:   buildImages(drawings),
        products: buildProducts(drawings),
    };
}

export type NotebookCard = { slug: string; title: string; cover: string };

// Derives the /drawing notebook index straight from the DB: one card per
// distinct `notebook`, titled by its dir name, with the cover taken from that
// notebook's first drawing (lowest display_order) via its `-md` variant — no
// static cover file or notebooks.ts entry needed, so new notebooks appear
// automatically. Sorted by the chronology key, newest first, to match the
// All Drawings view. Degrades to an empty list on error rather than 500ing.
export async function loadNotebookCards(): Promise<NotebookCard[]> {
    const { data: drawings, error: dbError } = await getSupabase()
        .from('drawings')
        .select('slug, notebook, storage_url, display_order')
        .order('display_order', { ascending: true });

    if (dbError) {
        console.error('Supabase query error:', dbError.message);
        return [];
    }
    if (!drawings) return [];

    // The query is display_order-ascending, so the first row seen for each
    // notebook is that notebook's first drawing — the one we cover it with.
    const coverByNotebook = new Map<string, string>();
    for (const d of drawings) {
        if (!coverByNotebook.has(d.notebook)) {
            coverByNotebook.set(d.notebook, d.storage_url);
        }
    }

    const cards: NotebookCard[] = [...coverByNotebook.entries()].map(
        ([notebook, storageUrl]) => ({
            slug:  notebook,
            title: notebook,
            cover: variantUrl(storageUrl, 'md'),
        })
    );

    // Newest first; an unknown key (not yymmdd, not one of the six legacy)
    // sorts as oldest so a bad key never destabilises the comparison.
    const key = (n: string) => {
        const k = chronologyKey(n);
        return Number.isFinite(k) ? k : -1;
    };
    cards.sort((a, b) => key(b.slug) - key(a.slug));

    return cards;
}
