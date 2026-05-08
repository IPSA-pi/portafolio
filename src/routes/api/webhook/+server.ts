import { stripe } from '$lib/server/stripe';
import { resend } from '$lib/server/resend';
import { env } from '$env/dynamic/private';
import { error, json } from '@sveltejs/kit';

export const POST = async ({ request }) => {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
        throw error(400, 'Missing stripe-signature');
    }

    let event;

    try {
        event = stripe.webhooks.constructEvent(body, signature, env.STRIPE_WEBHOOK_SECRET as string);
    } catch (err: any) {
        console.error('Webhook signature verification failed:', err.message);
        throw error(400, `Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as any;
        const slug = session.metadata?.slug;

        if (slug) {
            try {
                // 1. Mark product as sold in Stripe metadata
                // We need to find the product ID by the slug metadata first
                const products = await stripe.products.list({
                    active: true
                });
                const product = products.data.find(p => p.metadata.slug === slug);

                if (product) {
                    await stripe.products.update(product.id, {
                        metadata: { ...product.metadata, sold: 'true' }
                    });
                    console.log(`Product ${slug} marked as sold.`);
                }

                // 2. Send notification email via Resend
                const customerEmail = session.customer_details?.email;
                
                if (customerEmail) {
                    await resend.emails.send({
                        from: 'Artist <onboarding@resend.dev>', // Update with your verified domain
                        to: customerEmail,
                        subject: 'Thank you for your purchase!',
                        html: `<p>Hi! Thank you for purchasing <strong>${slug}</strong>. I will be shipping it to you shortly.</p>`
                    });
                }

                // Notify the artist
                await resend.emails.send({
                    from: 'Store <onboarding@resend.dev>',
                    to: 'your-email@example.com', // Replace with user's actual email
                    subject: 'New Original Sold!',
                    html: `<p>Drawing <strong>${slug}</strong> has been sold to ${customerEmail}.</p>`
                });

            } catch (err) {
                console.error('Error in post-payment fulfillment:', err);
            }
        }
    }

    return json({ received: true });
};
