import { getStripe } from '$lib/server/stripe';
import { getSupabase } from '$lib/server/supabase';
import { digitalListing } from '$lib/server/digital';
import { json } from '@sveltejs/kit';

const MAX_ITEMS = 20;

// Checkout for the paid digital file, sold through Stripe Managed Payments
// (Stripe/Link is the merchant of record and owns the tax). Deliberately a
// sibling of /api/checkout rather than a flag on it: that endpoint's body is
// the reservation transaction, and a file has nothing to reserve. This one
// makes NO Supabase writes — a file sells whether or not the original is
// sold or on hold, to any number of buyers.
export const POST = async ({ request, url }) => {
    try {
        const body = await request.json();

        if (!Array.isArray(body.slugs)) {
            return json({ error: 'Missing slugs' }, { status: 400 });
        }
        const slugs: unknown[] = body.slugs;

        if (slugs.length === 0 || !slugs.every((s) => typeof s === 'string')) {
            return json({ error: `Provide between 1 and ${MAX_ITEMS} drawing slugs` }, { status: 400 });
        }

        // Dedup before the item-count check, as the physical endpoint does —
        // here a duplicate would otherwise become two line items for one file.
        const drawingSlugs = [...new Set(slugs as string[])];
        if (drawingSlugs.length > MAX_ITEMS) {
            return json({ error: `Provide between 1 and ${MAX_ITEMS} drawing slugs` }, { status: 400 });
        }

        // digital_object_path is read for the Listed rule only (digitalListing)
        // and never emitted: not in the response, not in the session.
        const { data: rows, error: readError } = await getSupabase()
            .from('drawings')
            .select('slug, notebook, digital_stripe_price_id, digital_price_cents, digital_object_path')
            .in('slug', drawingSlugs);

        if (readError) {
            console.error('Error reading digital listings:', readError);
            return json({ error: 'Checkout is temporarily unavailable. Please try again.' }, { status: 500 });
        }

        const rowBySlug = new Map((rows ?? []).map((r) => [r.slug, r]));
        const unavailable: string[] = [];
        const lineItems: { price: string; quantity: number }[] = [];

        for (const slug of drawingSlugs) {
            const row = rowBySlug.get(slug);
            const listing = row ? digitalListing(row) : null;
            if (!listing) {
                unavailable.push(slug); // unknown slug, no master, or no price
                continue;
            }
            lineItems.push({ price: listing.priceId, quantity: 1 });
        }

        if (unavailable.length > 0) {
            return json({ error: 'Some digital files are not available', unavailable }, { status: 409 });
        }

        // The client-supplied notebook only chooses where "back" lands, and it
        // goes into a URL — so it is honoured only when it is the notebook one
        // of the requested drawings actually belongs to.
        const notebookSlug =
            typeof body.notebookSlug === 'string' && (rows ?? []).some((r) => r.notebook === body.notebookSlug)
                ? body.notebookSlug
                : undefined;

        const session = await getStripe().checkout.sessions.create({
            mode: 'payment',
            // Per session, never account-wide: the Dashboard's "enable by
            // default" stays off so the physical checkout is never an MP session.
            managed_payments: { enabled: true },
            line_items: lineItems,
            // The digital metadata contract: `kind` + `digital_slugs`, and
            // NEVER `slug`/`slugs`. Those mean "physical drawings reserved by
            // this session", and releaseSessionReservations releases by slug —
            // a digital session carrying them could release another buyer's
            // live hold on the same drawing when it expires or is cancelled.
            // (Metadata values cap at 500 chars; MAX_ITEMS keeps this under.)
            metadata: {
                kind: 'digital',
                digital_slugs: JSON.stringify(drawingSlugs),
            },
            client_reference_id: `digital:${drawingSlugs[0]}`,
            success_url: `${url.origin}/drawing/digital?session_id={CHECKOUT_SESSION_ID}`,
            // No query params: nothing was held, so there is nothing to release
            // and nothing to tell the buyer.
            cancel_url: `${url.origin}/drawing/${notebookSlug ?? 'feed'}`,
            // Managed Payments REJECTS these — do not add any of them here:
            //   automatic_tax, tax_id_collection, shipping_address_collection,
            //   shipping_options, payment_method_types,
            //   payment_method_configuration, excluded_payment_method_types,
            //   adaptive_pricing, invoice_creation, customer_update.name/address,
            //   payment_intent_data.{receipt_email, statement_descriptor(_suffix),
            //   shipping, transfer_*, application_fee_amount, on_behalf_of}.
            // Stripe collects name + billing address itself and computes tax.
            // Also no expires_at: nothing is reserved, so the default is fine.
        });

        return json({ url: session.url, sessionId: session.id });
    } catch (e: any) {
        console.error('Digital checkout error:', e);
        return json({ error: 'Checkout is temporarily unavailable. Please try again.' }, { status: 500 });
    }
};
