import { getStripe } from '$lib/server/stripe';
import { getSupabase } from '$lib/server/supabase';
import { getResend } from '$lib/server/resend';
import { getSlugsFromSession } from '$lib/server/checkoutSlugs';
import { releaseSessionReservations } from '$lib/server/reservations';
import { formatTombstone } from '$lib/utils/artwork';
import { env } from '$env/dynamic/private';
import { error, json } from '@sveltejs/kit';

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// One purchased drawing as the emails present it: the slug (for subjects), the
// display title — the drawing's own title, or the bare slug exactly as these
// emails printed before metadata existed — and its tombstone, '' when the row
// has no metadata.
type EmailItem = { slug: string; title: string; tombstone: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toEmailItems(rows: any[]): EmailItem[] {
    return rows.map((d) => ({
        slug:  d.slug,
        title: d.title?.trim() || d.slug,
        tombstone: formatTombstone({
            year:     d.year,
            medium:   d.medium,
            widthCm:  d.width_cm,
            heightCm: d.height_cm,
        }),
    }));
}

const mutedLine = (text: string) =>
    `<div style="font-size:13px;color:#999;">${escapeHtml(text)}</div>`;

function buildCustomerEmail(customerName: string, items: EmailItem[]) {
    const multiple = items.length > 1;
    const drawingsHtml = multiple
        ? `<ul style="font-size:16px;color:#444;line-height:1.7;margin:0 0 16px;padding-left:20px;">${items
              .map((i) => `<li><strong>${escapeHtml(i.title)}</strong>${i.tombstone ? mutedLine(i.tombstone) : ''}</li>`)
              .join('')}</ul>`
        : `<strong>${escapeHtml(items[0].title)}</strong>`;

    return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:48px;">
        <tr><td>
          <p style="font-size:13px;letter-spacing:4px;text-transform:uppercase;color:#999;margin:0 0 32px;">iansebelius.com</p>
          <h1 style="font-size:28px;font-weight:400;color:#111;margin:0 0 24px;">Thank you for your purchase.</h1>
          <p style="font-size:16px;color:#444;line-height:1.7;margin:0 0 16px;">
            Hi ${escapeHtml(customerName)},
          </p>
          <p style="font-size:16px;color:#444;line-height:1.7;margin:0 0 16px;">
            ${multiple
                ? `Your original drawings are on their way to you soon:`
                : `Your original drawing ${drawingsHtml} is on its way to you soon.`}
          </p>
          ${multiple
              ? drawingsHtml
              : items[0].tombstone
                  ? `<p style="font-size:13px;color:#999;line-height:1.7;margin:0 0 16px;">${escapeHtml(items[0].tombstone)}</p>`
                  : ''}
          <p style="font-size:16px;color:#444;line-height:1.7;margin:0 0 16px;">
            I'll pack ${multiple ? 'them' : 'it'} carefully and ship ${multiple ? 'them' : 'it'} within 3–5 business days.
            You'll receive a follow-up email with tracking information once ${multiple ? 'they ship' : 'it ships'}.
          </p>
          <p style="font-size:16px;color:#444;line-height:1.7;margin:0 0 32px;">
            If you have any questions, reply to this email or reach me at
            <a href="mailto:sebeliusancira@gmail.com" style="color:#111;">sebeliusancira@gmail.com</a>.
          </p>
          <p style="font-size:16px;color:#444;line-height:1.7;margin:0;">
            Thank you for supporting my work.<br/>
            — Ian
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function artistNotificationEmail(items: EmailItem[], customerName: string, customerEmail: string, address: any, amountTotal: number) {
    const formattedAmount = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(amountTotal / 100);
    const formattedAddress = escapeHtml(
        address
            ? [address.line1, address.line2, address.city, address.state, address.postal_code, address.country].filter(Boolean).join(', ')
            : 'No address provided',
    );

    return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:48px;">
        <tr><td>
          <p style="font-size:13px;letter-spacing:4px;text-transform:uppercase;color:#999;margin:0 0 32px;">Sale Notification</p>
          <h1 style="font-size:28px;font-weight:400;color:#111;margin:0 0 32px;">You sold ${items.length > 1 ? `${items.length} drawings` : 'a drawing'}.</h1>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#999;padding-bottom:4px;">Drawing${items.length > 1 ? 's' : ''}</td>
              <td style="font-size:16px;color:#111;padding-bottom:16px;">${items
                  .map((i) => `${escapeHtml(i.title)}${i.tombstone ? mutedLine(i.tombstone) : ''}`)
                  .join('<br/>')}</td>
            </tr>
            <tr>
              <td style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#999;padding-bottom:4px;">Amount</td>
              <td style="font-size:16px;color:#111;padding-bottom:16px;">${formattedAmount}</td>
            </tr>
            <tr>
              <td style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#999;padding-bottom:4px;">Buyer</td>
              <td style="font-size:16px;color:#111;padding-bottom:16px;">${escapeHtml(customerName)} &lt;${escapeHtml(customerEmail)}&gt;</td>
            </tr>
            <tr>
              <td style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#999;padding-bottom:4px;vertical-align:top;">Ship to</td>
              <td style="font-size:16px;color:#111;padding-bottom:16px;">${formattedAddress}</td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function fulfillOrder(session: any) {
    const slugs = getSlugsFromSession(session);
    if (slugs.length === 0) return;

    // Atomic idempotency guard: only proceed for slugs that actually flip
    // sold false -> true. If two deliveries of the same (or related) event
    // race, or a retry arrives after a partial success, only the
    // still-unsold slugs come back — already-fulfilled ones are silently
    // skipped instead of being fulfilled (and emailed) twice.
    const { data: updated, error: updateError } = await getSupabase()
        .from('drawings')
        .update({ sold: true, reserved: false, reserved_at: null })
        .in('slug', slugs)
        .eq('sold', false)
        // Artwork metadata comes back on the same query the sold-flip already
        // runs — the emails below need it; the orders insert still uses only
        // slug + price_cents.
        .select('slug, price_cents, title, year, medium, width_cm, height_cm');

    if (updateError) {
        console.error('Error marking drawings sold:', updateError);
        throw error(500, 'Failed to record sale');
    }

    if (!updated || updated.length === 0) {
        console.log(`Drawings already sold, skipping: ${slugs.join(', ')}`);
        return;
    }

    const soldSlugs = updated.map((d) => d.slug);
    const emailItems = toEmailItems(updated);
    console.log(`Drawings marked as sold: ${soldSlugs.join(', ')}`);

    const customerEmail = session.customer_details?.email;
    const customerName  = session.customer_details?.name || 'there';
    // Stripe moved this field to collected_information in the API versions
    // this webhook is pinned to; fall back to the legacy location just in case.
    const shippingAddress = session.collected_information?.shipping_details?.address
        ?? session.shipping_details?.address;
    const amountTotal   = session.amount_total;

    // Durable sale record, one row per drawing. Independent of the emails
    // below (which can fail to send) — an insert failure here must never
    // throw, since the sale is already recorded on the drawings and a
    // Stripe retry after sold=true would just re-enter fulfillOrder and
    // no-op on the idempotency guard above.
    //
    // amount_total is per-drawing (that row's price_cents), not the whole
    // session's total — writing the session total on every row would
    // overcount revenue N times for an N-item cart. Free shipping and no
    // discounts today, so per-item price is the honest allocation.
    const { error: insertError } = await getSupabase()
        .from('orders')
        .insert(updated.map(({ slug, price_cents }) => ({
            drawing_slug: slug,
            stripe_session_id: session.id,
            payment_intent: session.payment_intent ?? null,
            amount_total: price_cents ?? null,
            customer_name: customerName,
            customer_email: customerEmail ?? null,
            shipping_address: shippingAddress ?? null,
        })));

    // supabase-js does not throw on a DB/PostgREST error — it comes back on
    // the result object — so this must be checked explicitly or a failure
    // here is silently swallowed (which is exactly what was happening: the
    // live DB doesn't have the orders table yet, so every insert has been
    // failing with zero log output).
    if (insertError) {
        console.error(`Error inserting order records for ${soldSlugs.join(', ')}:`, insertError);
    }

    // The DB write above is now committed, so these drawings are already
    // sold — a Stripe retry would hit the idempotency guard and skip this
    // block entirely. That means a failed send here can't be fixed by
    // retrying; we log each failure (for manual follow-up) instead of
    // throwing, so we don't return a false 500 for an already-recorded sale.
    // Promise.allSettled (rather than sequential awaits) so a slow/failed
    // customer email doesn't delay or block the artist notification.
    const emailSends: Promise<unknown>[] = [];
    if (customerEmail) {
        emailSends.push(getResend().emails.send({
            from:    'Ian Sebelius <no-reply@iansebelius.com>',
            to:      customerEmail,
            subject: soldSlugs.length > 1 ? `Your original drawings (${soldSlugs.length})` : `Your original drawing — ${soldSlugs[0]}`,
            html:    buildCustomerEmail(customerName, emailItems),
        }));
    }
    emailSends.push(getResend().emails.send({
        from:    'Store <no-reply@iansebelius.com>',
        to:      'sebeliusancira@gmail.com',
        subject: soldSlugs.length > 1 ? `Sold: ${soldSlugs.length} drawings` : `Sold: ${soldSlugs[0]}`,
        html:    artistNotificationEmail(emailItems, customerName, customerEmail ?? 'unknown', shippingAddress, amountTotal),
    }));

    const results = await Promise.allSettled(emailSends);
    for (const result of results) {
        if (result.status === 'rejected') {
            console.error(`Error sending fulfillment email for ${soldSlugs.join(', ')}:`, result.reason);
        }
    }
}

export const POST = async ({ request }) => {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
        throw error(400, 'Missing stripe-signature');
    }

    let event;
    try {
        // constructEventAsync, not constructEvent: on Cloudflare Workers the
        // only crypto is SubtleCrypto, which is async-only — the sync variant
        // works in local dev (Node) but throws on every real delivery.
        event = await getStripe().webhooks.constructEventAsync(body, signature, env.STRIPE_WEBHOOK_SECRET as string);
    } catch (err: any) {
        console.error('Webhook signature verification failed:', err.message);
        throw error(400, `Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as any;
        // checkout.session.completed also fires for delayed payment methods
        // (e.g. OXXO/bank transfers in MX) with payment_status 'unpaid' — the
        // async_payment_succeeded/failed events below are what actually settle
        // those. Only fulfill here once payment has actually cleared.
        if (session.payment_status === 'paid') {
            await fulfillOrder(session);
        }
    }

    if (event.type === 'checkout.session.async_payment_succeeded') {
        const session = event.data.object as any;
        await fulfillOrder(session);
    }

    if (event.type === 'checkout.session.async_payment_failed') {
        const session = event.data.object as any;
        await releaseSessionReservations(session);
    }

    if (event.type === 'checkout.session.expired') {
        const session = event.data.object as any;
        await releaseSessionReservations(session);
    }

    return json({ received: true });
};
