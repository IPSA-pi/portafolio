import { getSupabase } from '$lib/server/supabase';
import { getResend } from '$lib/server/resend';
import { error, json } from '@sveltejs/kit';

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildShippedEmail(customerName: string, slugs: string[], tracking: string) {
    const multiple = slugs.length > 1;
    const drawingsHtml = multiple
        ? `<ul style="font-size:16px;color:#444;line-height:1.7;margin:0 0 16px;padding-left:20px;">${slugs.map((s) => `<li><strong>${escapeHtml(s)}</strong></li>`).join('')}</ul>`
        : `<strong>${escapeHtml(slugs[0])}</strong>`;
    // The owner pastes either a bare tracking number or a full carrier URL —
    // render a URL as a link, anything else as text.
    const trackingHtml = /^https?:\/\//.test(tracking)
        ? `<a href="${escapeHtml(tracking)}" style="color:#111;">${escapeHtml(tracking)}</a>`
        : `<strong>${escapeHtml(tracking)}</strong>`;

    return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:48px;">
        <tr><td>
          <p style="font-size:13px;letter-spacing:4px;text-transform:uppercase;color:#999;margin:0 0 32px;">iansebelius.com</p>
          <h1 style="font-size:28px;font-weight:400;color:#111;margin:0 0 24px;">Your ${multiple ? 'drawings have' : 'drawing has'} shipped.</h1>
          <p style="font-size:16px;color:#444;line-height:1.7;margin:0 0 16px;">
            Hi ${escapeHtml(customerName)},
          </p>
          <p style="font-size:16px;color:#444;line-height:1.7;margin:0 0 16px;">
            ${multiple ? `Your original drawings are on their way:` : `Your original drawing ${drawingsHtml} is on its way.`}
          </p>
          ${multiple ? drawingsHtml : ''}
          ${tracking
              ? `<p style="font-size:16px;color:#444;line-height:1.7;margin:0 0 16px;">You can follow the package with this tracking ${/^https?:\/\//.test(tracking) ? 'link' : 'number'}: ${trackingHtml}</p>`
              : ''}
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

// Marks every order row of one Stripe session as shipped and sends the buyer
// the tracking email promised in the purchase confirmation. Lives under
// /admin so Cloudflare Access gates it at the edge; layout loads don't run
// for +server.ts endpoints, so isAdmin must be re-checked here.
export const POST = async ({ request, locals }) => {
    if (!locals.isAdmin) {
        throw error(403, 'Forbidden');
    }

    const body = await request.json().catch(() => ({}));
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
    const tracking = typeof body.trackingNumber === 'string' ? body.trackingNumber.trim() : '';
    if (!sessionId) {
        throw error(400, 'Missing sessionId');
    }

    // .is('shipped_at', null) makes this idempotent: a double submit (or a
    // second tab) finds no unshipped rows and skips the email instead of
    // re-stamping and re-notifying the buyer.
    const { data: updated, error: updateError } = await getSupabase()
        .from('orders')
        .update({ shipped_at: new Date().toISOString(), tracking_number: tracking || null })
        .eq('stripe_session_id', sessionId)
        .is('shipped_at', null)
        .select('drawing_slug, customer_name, customer_email');

    if (updateError) {
        console.error(`Error marking session ${sessionId} shipped:`, updateError);
        throw error(500, 'Failed to mark shipped');
    }

    if (!updated || updated.length === 0) {
        return json({ ok: true, alreadyShipped: true, emailSent: false });
    }

    const slugs = updated.map((r) => r.drawing_slug);
    const customerEmail = updated[0].customer_email;
    const customerName = updated[0].customer_name || 'there';

    // The DB stamp above is committed either way — an email failure is
    // reported to the dashboard for manual follow-up, never a 500.
    let emailSent = false;
    if (customerEmail) {
        try {
            await getResend().emails.send({
                from: 'Ian Sebelius <no-reply@iansebelius.com>',
                to: customerEmail,
                subject: slugs.length > 1 ? `Your drawings have shipped (${slugs.length})` : `Your drawing has shipped — ${slugs[0]}`,
                html: buildShippedEmail(customerName, slugs, tracking),
            });
            emailSent = true;
        } catch (err) {
            console.error(`Error sending shipped email for ${slugs.join(', ')}:`, err);
        }
    }

    return json({ ok: true, slugs, emailSent });
};
