import { json, error } from '@sveltejs/kit';
import { getSupabase } from '$lib/server/supabase';
import { STALE_RESERVATION_MS } from '$lib/server/reservations';
import type { RequestHandler } from './$types';

type PaymentMethod = 'cash' | 'etransfer';

/**
 * Booth mark-sold/undo for in-person (cash/e-transfer) sales. Deliberately
 * separate from the Stripe checkout/webhook flow, which this never touches.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.isAdmin) throw error(403, 'Forbidden');

    const body = await request.json().catch(() => ({}));
    const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
    const sold = body.sold;

    if (!slug) {
        return json({ error: 'Missing slug' }, { status: 400 });
    }
    if (typeof sold !== 'boolean') {
        return json({ error: 'Missing or invalid sold' }, { status: 400 });
    }

    const supabase = getSupabase();

    if (sold) {
        const method: PaymentMethod = body.method;
        if (method !== 'cash' && method !== 'etransfer') {
            return json({ error: "method must be 'cash' or 'etransfer'" }, { status: 400 });
        }

        // Same reservation guard as checkout's own atomic reserve — only takes
        // the drawing if it's not sold, and either not reserved or the
        // reservation is stale (dead checkout session).
        const staleThreshold = new Date(Date.now() - STALE_RESERVATION_MS).toISOString();
        const { data: updated, error: updateError } = await supabase
            .from('drawings')
            .update({ sold: true, reserved: false, reserved_at: null })
            .eq('slug', slug)
            .eq('sold', false)
            .or(`reserved.eq.false,reserved_at.lt.${staleThreshold}`)
            .select('slug, price_cents');

        if (updateError) {
            console.error('Error marking drawing sold:', updateError);
            return json({ error: updateError.message }, { status: 500 });
        }

        if (!updated || updated.length === 0) {
            const { data: existing } = await supabase
                .from('drawings')
                .select('sold')
                .eq('slug', slug)
                .maybeSingle();

            if (!existing) {
                return json({ error: 'Drawing not found' }, { status: 404 });
            }
            if (existing.sold) {
                return json({ error: 'Already sold' }, { status: 409 });
            }
            // Not sold, not takeable by our WHERE ⇒ it's actively (non-stale) reserved.
            return json(
                { error: "In someone's online checkout — wait a few minutes and retry" },
                { status: 409 }
            );
        }

        const drawing = updated[0];

        // Never-throw style, mirroring the webhook's order insert: the sale is
        // already recorded on the drawing row, so an insert failure here must
        // not turn into a false failure response — just flag it unrecorded
        // for manual follow-up.
        const { error: insertError } = await supabase.from('orders').insert({
            drawing_slug: drawing.slug,
            stripe_session_id: `manual_${crypto.randomUUID()}`,
            payment_intent: null,
            amount_total: drawing.price_cents,
            customer_name: null,
            customer_email: null,
            shipping_address: null,
            payment_method: method,
            shipped_at: new Date().toISOString(),
        });

        if (insertError) {
            console.error(`Error inserting manual order record for ${slug}:`, insertError);
            return json({ ok: true, recorded: false });
        }
        return json({ ok: true, recorded: true });
    }

    // Undo — only in-person sales are reversible. A Stripe sale must never be
    // undone from a booth mis-tap; the owner refunds through Stripe instead.
    const { data: manualOrders, error: selectError } = await supabase
        .from('orders')
        .select('id')
        .eq('drawing_slug', slug)
        .like('stripe_session_id', 'manual_%');

    if (selectError) {
        console.error('Error looking up manual orders:', selectError);
        return json({ error: selectError.message }, { status: 500 });
    }
    if (!manualOrders || manualOrders.length === 0) {
        return json({ error: 'This was a Stripe sale — refund through Stripe instead' }, { status: 409 });
    }

    const { error: deleteError } = await supabase
        .from('orders')
        .delete()
        .eq('drawing_slug', slug)
        .like('stripe_session_id', 'manual_%');

    if (deleteError) {
        console.error('Error deleting manual order record:', deleteError);
        return json({ error: deleteError.message }, { status: 500 });
    }

    const { error: updateError } = await supabase
        .from('drawings')
        .update({ sold: false })
        .eq('slug', slug)
        .eq('sold', true);

    if (updateError) {
        console.error('Error un-marking drawing sold:', updateError);
        return json({ error: updateError.message }, { status: 500 });
    }

    return json({ ok: true });
};
