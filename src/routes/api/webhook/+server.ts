import { getStripe } from '$lib/server/stripe';
import { getResend } from '$lib/server/resend';
import { env } from '$env/dynamic/private';
import { error, json } from '@sveltejs/kit';

function buildCustomerEmail(customerName: string, slug: string) {
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
            Hi ${customerName},
          </p>
          <p style="font-size:16px;color:#444;line-height:1.7;margin:0 0 16px;">
            Your original drawing <strong>${slug}</strong> is on its way to you soon.
            I'll pack it carefully and ship it within 3–5 business days.
            You'll receive a follow-up email with tracking information once it ships.
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

function artistNotificationEmail(slug: string, customerName: string, customerEmail: string, address: any, amountTotal: number) {
    const formattedAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amountTotal / 100);
    const formattedAddress = address
        ? [address.line1, address.line2, address.city, address.state, address.postal_code, address.country].filter(Boolean).join(', ')
        : 'No address provided';

    return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:48px;">
        <tr><td>
          <p style="font-size:13px;letter-spacing:4px;text-transform:uppercase;color:#999;margin:0 0 32px;">Sale Notification</p>
          <h1 style="font-size:28px;font-weight:400;color:#111;margin:0 0 32px;">You sold a drawing.</h1>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#999;padding-bottom:4px;">Drawing</td>
              <td style="font-size:16px;color:#111;padding-bottom:16px;">${slug}</td>
            </tr>
            <tr>
              <td style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#999;padding-bottom:4px;">Amount</td>
              <td style="font-size:16px;color:#111;padding-bottom:16px;">${formattedAmount}</td>
            </tr>
            <tr>
              <td style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#999;padding-bottom:4px;">Buyer</td>
              <td style="font-size:16px;color:#111;padding-bottom:16px;">${customerName} &lt;${customerEmail}&gt;</td>
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
        const slug = session.metadata?.slug;
        const productId = session.metadata?.productId;

        if (slug && productId) {
            try {
                const product = await getStripe().products.retrieve(productId);

                // Idempotency guard: skip if already marked sold
                if (product.metadata.sold === 'true') {
                    console.log(`Product ${slug} already marked sold, skipping.`);
                    return json({ received: true });
                }

                await getStripe().products.update(productId, {
                    metadata: { ...product.metadata, sold: 'true', reserved: 'false' }
                });
                console.log(`Product ${slug} marked as sold.`);

                const customerEmail = session.customer_details?.email;
                const customerName = session.customer_details?.name || 'there';
                const shippingAddress = session.shipping_details?.address;
                const amountTotal = session.amount_total;

                if (customerEmail) {
                    await getResend().emails.send({
                        from: 'Ian Sebelius <no-reply@iansebelius.com>',
                        to: customerEmail,
                        subject: `Your original drawing — ${slug}`,
                        html: buildCustomerEmail(customerName, slug)
                    });
                }

                await getResend().emails.send({
                    from: 'Store <no-reply@iansebelius.com>',
                    to: 'sebeliusancira@gmail.com',
                    subject: `Sold: ${slug}`,
                    html: artistNotificationEmail(slug, customerName, customerEmail, shippingAddress, amountTotal)
                });

            } catch (err) {
                console.error('Error in post-payment fulfillment:', err);
            }
        }
    }

    // Release reservation if checkout session expires without payment
    if (event.type === 'checkout.session.expired') {
        const session = event.data.object as any;
        const productId = session.metadata?.productId;

        if (productId) {
            try {
                const product = await getStripe().products.retrieve(productId);
                if (product.metadata.sold !== 'true') {
                    await getStripe().products.update(productId, {
                        metadata: { ...product.metadata, reserved: 'false' }
                    });
                    console.log(`Reservation released for product ${session.metadata?.slug}.`);
                }
            } catch (err) {
                console.error('Error releasing reservation:', err);
            }
        }
    }

    return json({ received: true });
};
