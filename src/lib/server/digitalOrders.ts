import { getSupabase } from '$lib/server/supabase';
import { getResend } from '$lib/server/resend';
import { getDigitalSlugsFromSession } from '$lib/server/checkoutSlugs';
import { escapeHtml } from '$lib/server/digitalDelivery';
import { formatTombstone } from '$lib/utils/artwork';
import { formatPrice } from '$lib/utils/formatPrice';
import { DIGITAL_LICENSE, DIGITAL_FILE_DESCRIPTION, DIGITAL_SELLER_NOTE } from '$lib/digitalLicense';
import { SITE_URL } from '$lib/seo';
import { error } from '@sveltejs/kit';

// One purchased file as the emails present it. `priceCents` is the drawing's
// own digital price (what the orders row records) and only the artist email
// prints it; null when the drawing row has since lost its price or vanished.
type DigitalItem = { slug: string; title: string; tombstone: string; priceCents: number | null };

const mutedLine = (text: string) =>
    `<div style="font-size:13px;color:#999;">${escapeHtml(text)}</div>`;

// The download page mints fresh signed URLs on every visit, so the email links
// the page rather than the files: a link that never expires, and no object
// path or signed URL sitting in an inbox. Same origin the buyer checked out
// on, so a dev purchase links back to dev.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function downloadPageUrl(session: any): string {
    let origin = SITE_URL;
    try {
        origin = new URL(session.success_url).origin;
    } catch {
        /* no usable success_url on the session — fall back to the live site */
    }
    return `${origin}/drawing/digital?session_id=${encodeURIComponent(session.id)}`;
}

// Deliberately not a receipt and carries no amounts: under Managed Payments
// Stripe/Link is the merchant of record and sends the receipt (with the tax
// it charged, in the buyer's currency). Any figure printed here could only
// disagree with it.
function buildDigitalCustomerEmail(customerName: string, items: DigitalItem[], downloadUrl: string) {
    const multiple = items.length > 1;
    const filesHtml = items
        .map((i) => `<li><strong>${escapeHtml(i.title)}</strong>${i.tombstone ? mutedLine(i.tombstone) : ''}</li>`)
        .join('');

    return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:48px;">
        <tr><td>
          <p style="font-size:13px;letter-spacing:4px;text-transform:uppercase;color:#999;margin:0 0 32px;">iansebelius.com</p>
          <h1 style="font-size:28px;font-weight:400;color:#111;margin:0 0 24px;">Your digital ${multiple ? 'files are' : 'file is'} ready.</h1>
          <p style="font-size:16px;color:#444;line-height:1.7;margin:0 0 16px;">
            Hi ${escapeHtml(customerName)},
          </p>
          <p style="font-size:16px;color:#444;line-height:1.7;margin:0 0 16px;">
            Thank you for your purchase. ${multiple ? 'Each file is' : 'The file is'} ${escapeHtml(DIGITAL_FILE_DESCRIPTION)}:
          </p>
          <ul style="font-size:16px;color:#444;line-height:1.7;margin:0 0 24px;padding-left:20px;">${filesHtml}</ul>
          <p style="margin:0 0 16px;">
            <a href="${escapeHtml(downloadUrl)}" style="font-size:16px;color:#111;">Download your ${multiple ? 'files' : 'file'}</a>
          </p>
          <p style="font-size:13px;color:#999;line-height:1.6;margin:0 0 32px;">
            This link keeps working — come back to it whenever you need ${multiple ? 'the files' : 'the file'} again.
          </p>
          <p style="font-size:13px;color:#999;line-height:1.6;margin:0 0 10px;">
            ${escapeHtml(DIGITAL_LICENSE)}
          </p>
          <p style="font-size:13px;color:#999;line-height:1.6;margin:0 0 32px;">
            ${escapeHtml(DIGITAL_SELLER_NOTE)} This email isn't a receipt; your receipt is sent separately by Link (Stripe).
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

// Prices are per file, straight from digital_price_cents — NOT
// session.amount_total, which under Managed Payments includes the tax Stripe
// withholds and remits, and so overstates what the sale earned.
function buildDigitalArtistEmail(items: DigitalItem[], customerName: string, customerEmail: string) {
    const multiple = items.length > 1;
    const filesHtml = items
        .map(
            (i) =>
                `${escapeHtml(i.title)} — ${i.priceCents != null ? escapeHtml(formatPrice(i.priceCents)) : 'price unknown'}${i.tombstone ? mutedLine(i.tombstone) : ''}`
        )
        .join('<br/>');

    return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:48px;">
        <tr><td>
          <p style="font-size:13px;letter-spacing:4px;text-transform:uppercase;color:#999;margin:0 0 32px;">Sale Notification</p>
          <h1 style="font-size:28px;font-weight:400;color:#111;margin:0 0 32px;">You sold ${multiple ? `${items.length} digital files` : 'a digital file'}.</h1>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#999;padding-bottom:4px;vertical-align:top;">File${multiple ? 's' : ''}</td>
              <td style="font-size:16px;color:#111;padding-bottom:16px;">${filesHtml}</td>
            </tr>
            <tr>
              <td style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#999;padding-bottom:4px;">Buyer</td>
              <td style="font-size:16px;color:#111;padding-bottom:16px;">${escapeHtml(customerName)} &lt;${escapeHtml(customerEmail)}&gt;</td>
            </tr>
          </table>
          <p style="font-size:13px;color:#999;line-height:1.6;margin:16px 0 0;">
            Prices are before tax. Stripe collects and remits the tax as merchant of record. Nothing to ship.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Fulfil a paid digital-file session: one `kind = 'digital'` orders row per
 * file, then the two emails. Touches nothing on `drawings` — a file has no
 * `sold` flag to flip and no reservation to clear.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fulfillDigitalOrder(session: any) {
    const slugs = [...new Set(getDigitalSlugsFromSession(session).filter((s) => typeof s === 'string'))];
    if (slugs.length === 0) return;

    const { data: drawings, error: readError } = await getSupabase()
        .from('drawings')
        .select('slug, title, year, medium, width_cm, height_cm, digital_price_cents')
        .in('slug', slugs);

    if (readError) {
        console.error(`Error reading drawings for digital session ${session.id}:`, readError);
        throw error(500, 'Failed to record digital sale');
    }

    // Built from the session's slug list, not from the rows that came back: the
    // buyer has paid, so a drawing row that has since vanished still gets its
    // order recorded (price unknown) and its file named in the emails.
    const bySlug = new Map((drawings ?? []).map((d) => [d.slug, d]));
    const items: DigitalItem[] = slugs.map((slug) => {
        const d = bySlug.get(slug);
        return {
            slug,
            title: d?.title?.trim() || slug,
            tombstone: d
                ? formatTombstone({ year: d.year, medium: d.medium, widthCm: d.width_cm, heightCm: d.height_cm })
                : '',
            priceCents: d?.digital_price_cents ?? null,
        };
    });

    const customerEmail = session.customer_details?.email;
    const customerName  = session.customer_details?.name || 'there';

    // Idempotency guard = the orders unique constraint. There is no sold flag
    // to flip atomically here (the same file sells to any number of buyers), so
    // (stripe_session_id, drawing_slug) is the only thing that can tell a first
    // delivery from a replay: ON CONFLICT DO NOTHING, and only the rows this
    // call actually inserted come back.
    //
    // amount_total is that file's own digital_price_cents, pre-tax — never the
    // session total (see buildDigitalArtistEmail).
    const { data: inserted, error: insertError } = await getSupabase()
        .from('orders')
        .upsert(
            items.map((i) => ({
                drawing_slug: i.slug,
                stripe_session_id: session.id,
                payment_intent: session.payment_intent ?? null,
                amount_total: i.priceCents,
                customer_name: customerName,
                customer_email: customerEmail ?? null,
                shipping_address: null,
                shipped_at: null,
                kind: 'digital' as const,
            })),
            { onConflict: 'stripe_session_id,drawing_slug', ignoreDuplicates: true }
        )
        .select('drawing_slug');

    // Fatal — the OPPOSITE of the physical path, where an orders-insert failure
    // is only logged. There, the sold-flip has already committed and is the
    // record of the sale; a retry would no-op on it, so throwing gains nothing.
    // Here the orders row IS the record (and what the download page reads), and
    // nothing else has happened yet: no email has gone out. A 500 makes Stripe
    // retry, and the retry starts from a clean slate.
    //
    // Known gap: if the insert committed but its response was lost (a timeout
    // comes back here as `insertError`), the retry finds the rows already
    // there and returns below without mailing. Telling that apart from a real
    // replay needs a delivery marker on the row; until one exists the buyer
    // still has the success redirect and Link's receipt, and the order shows
    // in /admin/sales.
    if (insertError) {
        console.error(`Error inserting digital order records for ${slugs.join(', ')}:`, insertError);
        throw error(500, 'Failed to record digital sale');
    }

    // Nothing inserted: this session was already fulfilled (a Stripe retry or a
    // manual resend). Stay quiet — no second email.
    const insertedSlugs = new Set((inserted ?? []).map((o) => o.drawing_slug));
    const fulfilled = items.filter((i) => insertedSlugs.has(i.slug));
    if (fulfilled.length === 0) {
        console.log(`Digital files already fulfilled by this session, skipping: ${slugs.join(', ')}`);
        return;
    }
    const fulfilledSlugs = fulfilled.map((i) => i.slug);
    console.log(`Digital files sold: ${fulfilledSlugs.join(', ')}`);

    // From here on the sale is committed and a retry would be a silent replay,
    // so — as in the physical path — a failed send is logged for manual
    // follow-up, never thrown. Labelled so the log names which email was lost.
    //
    // getResend() itself throws when RESEND_API_KEY is unset. Called inside an
    // async function so that becomes a rejected send — logged below with its
    // label — rather than a 500 after the insert, which Stripe would retry
    // into the "already fulfilled" branch above: no email and no log line.
    type EmailPayload = Parameters<ReturnType<typeof getResend>['emails']['send']>[0];
    const sendEmail = async (payload: EmailPayload) => getResend().emails.send(payload);

    const emailSends: { label: string; send: Promise<{ error: unknown }> }[] = [];
    if (customerEmail) {
        emailSends.push({ label: 'digital customer confirmation', send: sendEmail({
            from:    'Ian Sebelius <no-reply@iansebelius.com>',
            to:      customerEmail,
            subject: fulfilled.length > 1 ? `Your digital files (${fulfilled.length})` : `Your digital file — ${fulfilled[0].title}`,
            html:    buildDigitalCustomerEmail(customerName, fulfilled, downloadPageUrl(session)),
        }) });
    }
    emailSends.push({ label: 'digital artist notification', send: sendEmail({
        from:    'Store <no-reply@iansebelius.com>',
        to:      'sebeliusancira@gmail.com',
        subject: fulfilled.length > 1 ? `Sold: ${fulfilled.length} digital files` : `Sold: digital file ${fulfilledSlugs[0]}`,
        html:    buildDigitalArtistEmail(fulfilled, customerName, customerEmail ?? 'unknown'),
    }) });

    const results = await Promise.allSettled(emailSends.map((e) => e.send));
    results.forEach((result, i) => {
        const { label } = emailSends[i];
        // Resend resolves with an `error` field rather than rejecting; check both.
        if (result.status === 'rejected') {
            console.error(`Error sending ${label} for ${fulfilledSlugs.join(', ')}:`, result.reason);
        } else if (result.value?.error) {
            console.error(`Error sending ${label} for ${fulfilledSlugs.join(', ')}:`, result.value.error);
        }
    });
}
