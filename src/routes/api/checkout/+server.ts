import { getStripe } from '$lib/server/stripe';
import { getSupabase } from '$lib/server/supabase';
import { STALE_RESERVATION_MS } from '$lib/server/reservations';
import { json } from '@sveltejs/kit';

const MAX_ITEMS = 20;

export const POST = async ({ request, url }) => {
    try {
        const body = await request.json();

        // Accept the new { slugs: string[] } cart contract while staying
        // backward-compatible with the old single-item { slug } body.
        let slugs: unknown[];
        if (Array.isArray(body.slugs)) {
            slugs = body.slugs;
        } else if (typeof body.slug === 'string') {
            slugs = [body.slug];
        } else {
            return json({ error: 'Missing slug or slugs' }, { status: 400 });
        }

        if (slugs.length === 0 || !slugs.every((s) => typeof s === 'string')) {
            return json({ error: `Provide between 1 and ${MAX_ITEMS} drawing slugs` }, { status: 400 });
        }

        // Dedup before the item-count check — a crafted { slugs: ['x', 'x'] }
        // body would otherwise self-conflict (the second reservation attempt
        // matches nothing because the first just reserved it), producing a
        // spurious 409 for what is really just one item.
        const drawingSlugs = [...new Set(slugs as string[])];
        if (drawingSlugs.length > MAX_ITEMS) {
            return json({ error: `Provide between 1 and ${MAX_ITEMS} drawing slugs` }, { status: 400 });
        }
        const notebookSlug: string | undefined = body.notebookSlug;

        // A single drawing bought with its notebook context keeps the existing
        // per-notebook success/cancel URLs; everything else (multi-item carts,
        // or a single item with no notebook context) routes through /drawing and /cart.
        const isSingleItemFlow = drawingSlugs.length === 1 && !!notebookSlug;

        // Atomic reservation: only succeeds if not already sold, AND it's either
        // not reserved or the reservation is stale. One set-based UPDATE ...
        // WHERE covers every requested slug at once — Postgres locks and
        // re-checks the WHERE on each matched row within the single statement,
        // so a slug that fails the WHERE (already sold, or freshly reserved by
        // someone else) simply isn't in the returned rows; the same per-row
        // atomicity as doing it one slug at a time. STALE_RESERVATION_MS sits
        // above Stripe's 30-min session expiry, so any reservation we take
        // over is guaranteed to have a dead checkout session — never two live
        // ones.
        const staleThreshold = new Date(Date.now() - STALE_RESERVATION_MS).toISOString();

        const { data: reservedRows, error: reserveError } = await getSupabase()
            .from('drawings')
            .update({ reserved: true, reserved_at: new Date().toISOString() })
            .in('slug', drawingSlugs)
            .eq('sold', false)
            .or(`reserved.eq.false,reserved_at.lt.${staleThreshold}`)
            .select('slug, stripe_price_id');

        if (reserveError) {
            console.error('Error reserving drawings:', reserveError);
            return json({ error: 'Checkout is temporarily unavailable. Please try again.' }, { status: 500 });
        }

        const priceBySlug = new Map((reservedRows ?? []).map((r) => [r.slug, r.stripe_price_id]));
        const reservedSlugs: string[] = []; // successfully reserved in this request — rolled back together on any failure
        const unavailable: string[] = [];
        const lineItems: { price: string; quantity: number }[] = [];

        for (const slug of drawingSlugs) {
            if (!priceBySlug.has(slug)) {
                unavailable.push(slug); // WHERE excluded it: already sold, or reserved (fresh) by someone else
                continue;
            }
            const priceId = priceBySlug.get(slug);
            reservedSlugs.push(slug); // the UPDATE reserved it regardless of price — needs rollback either way
            if (!priceId) {
                unavailable.push(slug);
                continue;
            }
            lineItems.push({ price: priceId, quantity: 1 });
        }

        if (unavailable.length > 0) {
            // All-or-nothing: roll back every reservation this request took.
            if (reservedSlugs.length > 0) {
                const { error: rollbackError } = await getSupabase()
                    .from('drawings')
                    .update({ reserved: false, reserved_at: null })
                    .in('slug', reservedSlugs);
                // supabase-js does not throw on a DB error — check explicitly
                // so a failed rollback doesn't silently strand a reservation.
                if (rollbackError) {
                    console.error('Error rolling back reservations after unavailable slugs:', rollbackError);
                }
            }
            return json({ error: 'Some drawings are no longer available', unavailable }, { status: 409 });
        }

        const successUrl = isSingleItemFlow
            ? `${url.origin}/drawing/${notebookSlug}?success=true&drawing=${drawingSlugs[0]}&session_id={CHECKOUT_SESSION_ID}`
            : `${url.origin}/drawing?success=true&session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = isSingleItemFlow
            ? `${url.origin}/drawing/${notebookSlug}?canceled=true&session_id={CHECKOUT_SESSION_ID}`
            : `${url.origin}/cart?canceled=true&session_id={CHECKOUT_SESSION_ID}`;

        let session;
        try {
            session = await getStripe().checkout.sessions.create({
                line_items: lineItems,
                mode: 'payment',
                success_url: successUrl,
                cancel_url:  cancelUrl,
                // Stripe metadata values cap at 500 chars — the MAX_ITEMS limit
                // above keeps the JSON-encoded slug list well under that.
                metadata: {
                    slug: drawingSlugs[0],
                    slugs: JSON.stringify(drawingSlugs),
                    ...(notebookSlug ? { notebookSlug } : {}),
                },
                client_reference_id:  drawingSlugs[0],
                shipping_address_collection: {
                    allowed_countries: [
                        'US', 'CA', 'GB', 'FR', 'DE', 'IT', 'ES', 'MX',
                        'JP', 'AR', 'BR', 'CL', 'CO', 'EC', 'PE', 'PY', 'UY', 'BO',
                    ],
                },
                expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
            });
        } catch (stripeErr) {
            // Roll back every reservation — Stripe session creation failed, don't
            // leave the drawings stuck as reserved with nobody in checkout.
            const { error: rollbackError } = await getSupabase()
                .from('drawings')
                .update({ reserved: false, reserved_at: null })
                .in('slug', drawingSlugs);
            if (rollbackError) {
                console.error('Error rolling back reservations after Stripe failure:', rollbackError);
            }
            throw stripeErr;
        }

        return json({ url: session.url, sessionId: session.id });
    } catch (e: any) {
        console.error('Checkout error:', e);
        return json({ error: 'Checkout is temporarily unavailable. Please try again.' }, { status: 500 });
    }
};
