import { getSupabase } from '$lib/server/supabase';
import { getStripe } from '$lib/server/stripe';
import { getDigitalSlugsFromSession, isDigitalSession } from '$lib/server/checkoutSlugs';
import { signDownloads } from '$lib/server/digitalDelivery';
import { artworkTitle, formatTombstone } from '$lib/utils/artwork';
import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

// An hour, not the free copy's year: this page mints a fresh set on every
// visit, so the page URL is the durable link and the file URLs can be short.
const PAGE_URL_TTL_SECONDS = 60 * 60;

// Matches the checkout endpoint's own cap; a session can't carry more.
const MAX_ITEMS = 20;

/**
 * Which files a session id is good for — [] when it is good for none.
 *
 * The orders rows are the record (written by the webhook, see
 * fulfillDigitalOrder). The Stripe fallback only covers the seconds between
 * the redirect back from Checkout and the webhook landing, and it accepts
 * exactly one thing: a digital session that is paid. A physical session id is
 * a valid Stripe object and must still get nothing here.
 */
async function paidDigitalSlugs(sessionId: string): Promise<string[]> {
    const { data: orders, error: ordersError } = await getSupabase()
        .from('orders')
        .select('drawing_slug')
        .eq('stripe_session_id', sessionId)
        .eq('kind', 'digital')
        .order('drawing_slug');

    if (ordersError) {
        console.error(`Error reading digital orders for ${sessionId}:`, ordersError);
        throw error(500, 'Could not load your files. Please try again.');
    }
    if (orders && orders.length > 0) return orders.map((o) => o.drawing_slug);

    let session;
    try {
        session = await getStripe().checkout.sessions.retrieve(sessionId);
    } catch (e) {
        // Stripe rejecting the id (unknown, malformed, wrong mode) is a 404.
        // Anything else is Stripe being unreachable: say so rather than tell
        // a buyer who has just paid that their purchase doesn't exist.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((e as any)?.type === 'StripeInvalidRequestError') return [];
        console.error(`Error retrieving checkout session ${sessionId}:`, e);
        throw error(500, 'Could not load your files. Please try again.');
    }

    if (!isDigitalSession(session) || session.payment_status !== 'paid') return [];
    return [...new Set(getDigitalSlugsFromSession(session).filter((s) => typeof s === 'string'))];
}

export async function load({ url, setHeaders }: RequestEvent) {
    // The session id in the URL is the buyer's bearer token and the payload
    // carries signed URLs: neither belongs in any cache, shared or private.
    setHeaders({ 'cache-control': 'no-store' });

    const sessionId = url.searchParams.get('session_id');
    if (!sessionId) throw error(404, 'Not found');

    const slugs = (await paidDigitalSlugs(sessionId)).slice(0, MAX_ITEMS);
    if (slugs.length === 0) throw error(404, 'Not found');

    // digital_object_path is read only to be handed to signDownloads; it is
    // never put in the returned data. Nothing below spreads a row.
    const { data: drawings, error: readError } = await getSupabase()
        .from('drawings')
        .select('slug, title, year, medium, width_cm, height_cm, digital_object_path')
        .in('slug', slugs);

    if (readError) {
        console.error(`Error reading drawings for digital session ${sessionId}:`, readError);
        throw error(500, 'Could not load your files. Please try again.');
    }

    const urls = await signDownloads(drawings ?? [], PAGE_URL_TTL_SECONDS);
    const bySlug = new Map((drawings ?? []).map((d) => [d.slug, d]));

    // Built from the paid slug list, not from the rows that came back: a
    // drawing that has since vanished (or a link that failed to sign) still
    // shows up, with no button, so the buyer knows to get in touch. `url` is
    // null in that case — signing is non-fatal, as everywhere else.
    const files = slugs.map((slug) => {
        const d = bySlug.get(slug);
        const signed = urls.get(slug);
        return {
            title: artworkTitle({ title: d?.title }, slug),
            tombstone: d
                ? formatTombstone({ year: d.year, medium: d.medium, widthCm: d.width_cm, heightCm: d.height_cm })
                : '',
            // `download` makes storage answer with Content-Disposition:
            // attachment (under the object's own filename), so the button
            // saves the PNG instead of opening it in the tab.
            url: signed ? `${signed}&download=` : null,
        };
    });

    return { files };
}
