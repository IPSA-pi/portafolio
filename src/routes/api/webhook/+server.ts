import { getStripe } from '$lib/server/stripe';
import { getSupabase } from '$lib/server/supabase';
import { getResend } from '$lib/server/resend';
import { getSlugsFromSession } from '$lib/server/checkoutSlugs';
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

function buildCustomerEmail(customerName: string, slugs: string[]) {
    const multiple = slugs.length > 1;
    const drawingsHtml = multiple
        ? `<ul style="font-size:16px;color:#444;line-height:1.7;margin:0 0 16px;padding-left:20px;">${slugs.map((s) => `<li><strong>${s}</strong></li>`).join('')}</ul>`
        : `<strong>${slugs[0]}</strong>`;

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
          ${multiple ? drawingsHtml : ''}
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

function artistNotificationEmail(slugs: string[], customerName: string, customerEmail: string, address: any, amountTotal: number) {
    const formattedAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amountTotal / 100);
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
          <h1 style="font-size:28px;font-weight:400;color:#111;margin:0 0 32px;">You sold ${slugs.length > 1 ? `${slugs.length} drawings` : 'a drawing'}.</h1>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#999;padding-bottom:4px;">Drawing${slugs.length > 1 ? 's' : ''}</td>
              <td style="font-size:16px;color:#111;padding-bottom:16px;">${slugs.join(', ')}</td>
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
        .select('slug');

    if (updateError) {
        console.error('Error marking drawings sold:', updateError);
        throw error(500, 'Failed to record sale');
    }

    if (!updated || updated.length === 0) {
        console.log(`Drawings already sold, skipping: ${slugs.join(', ')}`);
        return;
    }

    const soldSlugs = updated.map((d) => d.slug);
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
    try {
        await getSupabase()
            .from('orders')
            .insert(soldSlugs.map((slug) => ({
                drawing_slug: slug,
                stripe_session_id: session.id,
                payment_intent: session.payment_intent ?? null,
                amount_total: amountTotal ?? null,
                customer_name: customerName,
                customer_email: customerEmail ?? null,
                shipping_address: shippingAddress ?? null,
            })));
    } catch (err) {
        console.error(`Error inserting order records for ${soldSlugs.join(', ')}:`, err);
    }

    // The DB write above is now committed, so these drawings are already
    // sold — a Stripe retry would hit the idempotency guard and skip this
    // block entirely. That means a failed send here can't be fixed by
    // retrying; we log it (for manual follow-up) instead of throwing,
    // so we don't return a false 500 for an already-recorded sale.
    try {
        if (customerEmail) {
            await getResend().emails.send({
                from:    'Ian Sebelius <no-reply@iansebelius.com>',
                to:      customerEmail,
                subject: soldSlugs.length > 1 ? `Your original drawings (${soldSlugs.length})` : `Your original drawing — ${soldSlugs[0]}`,
                html:    buildCustomerEmail(customerName, soldSlugs),
            });
        }

        await getResend().emails.send({
            from:    'Store <no-reply@iansebelius.com>',
            to:      'sebeliusancira@gmail.com',
            subject: soldSlugs.length > 1 ? `Sold: ${soldSlugs.length} drawings` : `Sold: ${soldSlugs[0]}`,
            html:    artistNotificationEmail(soldSlugs, customerName, customerEmail ?? 'unknown', shippingAddress, amountTotal),
        });
    } catch (err) {
        console.error(`Error sending fulfillment emails for ${soldSlugs.join(', ')}:`, err);
    }
}

async function releaseReservation(session: any) {
    const slugs = getSlugsFromSession(session);
    if (slugs.length === 0) return;

    try {
        // Only release reservations that belong to this specific session.
        // If a new buyer reserved a drawing after this session was created,
        // their reserved_at will be newer than session.created — don't touch it.
        // +5s buffer absorbs any clock skew between our server and Stripe.
        const sessionCreatedAt = new Date((session.created + 5) * 1000).toISOString();
        await getSupabase()
            .from('drawings')
            .update({ reserved: false, reserved_at: null })
            .in('slug', slugs)
            .eq('sold', false)
            .lte('reserved_at', sessionCreatedAt);

        console.log(`Reservations released for: ${slugs.join(', ')}`);
    } catch (err) {
        console.error('Error releasing reservations:', err);
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
        event = getStripe().webhooks.constructEvent(body, signature, env.STRIPE_WEBHOOK_SECRET as string);
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
        await releaseReservation(session);
    }

    if (event.type === 'checkout.session.expired') {
        const session = event.data.object as any;
        await releaseReservation(session);
    }

    return json({ received: true });
};
