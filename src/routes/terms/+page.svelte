<script lang="ts">
    // The licence text is shared with the purchase-confirmation email so the
    // page a buyer can read and the terms they were actually sent cannot drift.
    import { DIGITAL_LICENSE, DIGITAL_FILE_DESCRIPTION, DIGITAL_SELLER_NOTE } from '$lib/digitalLicense';
</script>

<svelte:head>
    <title>Terms of Service | Ian Sebelius</title>
    <meta name="description" content="Terms of service for iansebelius.com — purchase terms, intellectual property, refund policy, and limitations of liability." />
</svelte:head>

<div class="shell pb-20">
    <div class="max-w-2xl pt-10">

        <a href="/" class="font-mono text-label uppercase text-content-dim transition-colors hover:text-signal">← Back</a>

        <h1 class="mt-6 text-display text-content">Terms of Service</h1>
        <p class="mt-3 font-mono text-label uppercase text-content-dim">Effective date: July 1, 2026</p>

        <p class="mt-6 font-body text-body text-content">
            These Terms of Service govern your use of <em>iansebelius.com</em> and any purchase made through the store. By accessing the site or completing a purchase, you agree to these terms. The site is operated by Ian Sebelius.
        </p>

        <hr class="my-8 border-line/12" />

        <section class="space-y-6">

            <div>
                <h2 class="text-title text-content">1. Intellectual Property</h2>
                <p class="mt-3 font-body text-body text-content">
                    All artwork, images, visual compositions, design elements, and written content on this site are the exclusive intellectual property of Ian Sebelius and are protected by copyright law.
                </p>
                <p class="mt-3 font-body text-body text-content">
                    Purchasing a physical work grants you ownership of that physical object and a <strong>personal, non-commercial, non-transferable license</strong> to display it privately. Purchase does not transfer copyright or any reproduction rights. Except as expressly permitted by the digital-copy licence in section 5, the following are strictly prohibited without prior written consent:
                </p>
                <ul class="mt-3 list-inside list-disc space-y-2 font-body text-body text-content marker:text-content-dim">
                    <li>Reproducing, printing, or duplicating any artwork in any medium.</li>
                    <li>Using artwork commercially — including in products, advertising, or merchandise.</li>
                    <li>Distributing, reselling, or publicly exhibiting artwork for profit.</li>
                    <li>Creating derivative works based on any artwork sold through this store.</li>
                </ul>
                <p class="mt-3 font-body text-body text-content">
                    Section 5 grants a narrow exception to the first item for the digital copy included with a purchase: you may print it for personal use and share the image on personal social media with credit. The remaining prohibitions apply to the digital copy exactly as they do to the original.
                </p>
            </div>

            <div>
                <h2 class="text-title text-content">2. Pricing and Availability</h2>
                <p class="mt-3 font-body text-body text-content">
                    Prices are displayed in Canadian dollars (CAD) and may be updated at any time without prior notice. Each original work is one of a kind and listed as available until sold. In the event of a technical error resulting in a purchase at an incorrect price, the seller reserves the right to cancel the order and issue a full refund.
                </p>
                <p class="mt-3 font-body text-body text-content">
                    Every purchase of an original work also includes, at no additional cost, a high-resolution digital copy of that work. See section 5.
                </p>
                <p class="mt-3 font-body text-body text-content">
                    Digital files can also be bought on their own, priced in CAD, by buyers in any country supported by Stripe's Managed Payments. Tax is added at checkout based on the buyer's location, and checkout may display the price in the buyer's local currency. Original works remain available to Canadian addresses only (section 3).
                </p>
            </div>

            <div>
                <h2 class="text-title text-content">3. Order Fulfillment and Shipping</h2>
                <p class="mt-3 font-body text-body text-content">
                    Orders are packed and shipped within <strong>3–5 business days</strong> of payment confirmation. A shipping confirmation email with tracking information will be sent to the email address provided at checkout once the order has been dispatched.
                </p>
                <p class="mt-3 font-body text-body text-content">
                    Online orders ship to Canadian addresses only. International purchases are arranged by email at <a href="mailto:iansebelius@gmail.com" class="text-signal underline transition-colors hover:text-signal-strong">iansebelius@gmail.com</a>.
                </p>
                <p class="mt-3 font-body text-body text-content">
                    Delivery timeframes vary by destination and carrier. The seller is not liable for delays caused by postal carriers, customs processing, or circumstances outside its control. Risk of loss passes to the buyer upon handoff to the carrier.
                </p>
                <p class="mt-3 font-body text-body text-content">
                    It is the buyer's responsibility to provide an accurate and complete shipping address. The seller is not responsible for orders undeliverable due to incorrect address information.
                </p>
            </div>

            <div>
                <h2 class="text-title text-content">4. Refund and Return Policy</h2>
                <p class="mt-3 font-body text-body text-content">
                    <strong>All sales of original works are final.</strong> Because each work is an original, one-of-a-kind piece, returns and exchanges are not accepted.
                </p>
                <p class="mt-3 font-body text-body text-content">
                    The free digital copy that comes with an original is non-refundable for a different reason: it is delivered immediately on purchase and cannot be returned once downloaded.
                </p>
                <p class="mt-3 font-body text-body text-content">
                    Digital files bought on their own are delivered immediately and are non-refundable, except where required by law or where Stripe, which sells digital files as merchant of record (shown as "Sold through Link, LLC" on your receipt), issues a refund under its own policies.
                </p>
                <p class="mt-3 font-body text-body text-content">
                    The damage policy below applies to physical works only. If your order arrives visibly damaged due to shipping mishandling, please contact <a href="mailto:sebeliusancira@gmail.com" class="text-signal underline transition-colors hover:text-signal-strong">sebeliusancira@gmail.com</a> within <strong>48 hours of delivery</strong> with photographic documentation of the damage and original packaging. Damage claims submitted outside this window cannot be processed. Verified shipping damage will be resolved at the seller's discretion, which may include a partial refund or replacement arrangement.
                </p>
            </div>

            <div>
                <h2 class="text-title text-content">5. Digital Copies</h2>
                <p class="mt-3 font-body text-body text-content">
                    Every purchase of an original work includes a free digital copy of that work: {DIGITAL_FILE_DESCRIPTION}. It is delivered as a download link in the purchase-confirmation email, and that link remains valid for one year. If it expires before you have saved the file, contact <a href="mailto:sebeliusancira@gmail.com" class="text-signal underline transition-colors hover:text-signal-strong">sebeliusancira@gmail.com</a> and a new one will be issued.
                </p>
                <p class="mt-3 font-body text-body text-content">
                    A small number of works have no digital copy available. Where that is the case, no download link is included and the purchase price is unaffected.
                </p>
                <p class="mt-3 font-body text-body text-content">
                    A digital file of a work can also be bought on its own, whether or not the original has sold. It is the same file, delivered immediately through a download page linked from the confirmation email. Personal printing is allowed.
                </p>
                <p class="mt-3 font-body text-body text-content">
                    Digital copies are licensed, not sold, on these terms: {DIGITAL_LICENSE}
                </p>
                <p class="mt-3 font-body text-body text-content">
                    For commercial licensing, email <a href="mailto:sebeliusancira@gmail.com" class="text-signal underline transition-colors hover:text-signal-strong">sebeliusancira@gmail.com</a>.
                </p>
            </div>

            <div>
                <h2 class="text-title text-content">6. Payment Processing</h2>
                <p class="mt-3 font-body text-body text-content">
                    Payments are processed by Stripe, Inc. By completing a purchase, you also agree to <a href="https://stripe.com/legal" class="text-signal underline transition-colors hover:text-signal-strong" target="_blank" rel="noopener">Stripe's Terms of Service</a>. Payment card data never passes through or is stored on this site's servers.
                </p>
                <p class="mt-3 font-body text-body text-content">
                    {DIGITAL_SELLER_NOTE} Those purchases are also subject to <a href="https://stripe.com/legal/managed-payments" class="text-signal underline transition-colors hover:text-signal-strong" target="_blank" rel="noopener">Stripe's Managed Payments terms</a>.
                </p>
            </div>

            <div>
                <h2 class="text-title text-content">7. Limitation of Liability</h2>
                <p class="mt-3 font-body text-body text-content">
                    To the fullest extent permitted by applicable law, Ian Sebelius shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of this site or any purchase made through it. This includes, without limitation, damages resulting from:
                </p>
                <ul class="mt-3 list-inside list-disc space-y-2 font-body text-body text-content marker:text-content-dim">
                    <li>Temporary site downtime, server errors, or service interruptions.</li>
                    <li>Delays in order confirmation or transactional email delivery.</li>
                    <li>Loss or damage to shipments after handoff to a carrier.</li>
                    <li>Unauthorized access to order data resulting from circumstances beyond the seller's reasonable control.</li>
                </ul>
                <p class="mt-3 font-body text-body text-content">
                    The seller's total liability for any claim arising from a transaction shall not exceed the amount paid for that specific order.
                </p>
            </div>

            <div>
                <h2 class="text-title text-content">8. Governing Law</h2>
                <p class="mt-3 font-body text-body text-content">
                    These terms are governed by the laws of the <strong>Province of British Columbia, Canada</strong>, without regard to conflict of law principles. Any disputes arising from these terms or a purchase shall be resolved in the courts of that jurisdiction.
                </p>
            </div>

            <div>
                <h2 class="text-title text-content">9. Changes to These Terms</h2>
                <p class="mt-3 font-body text-body text-content">
                    These terms may be revised at any time. The effective date at the top of this page reflects the most recent update. Continued use of the site after any revision constitutes acceptance of the updated terms.
                </p>
            </div>

        </section>

        <hr class="my-8 border-line/12" />

        <p class="font-body text-meta text-content-dim">
            Questions? Email <a href="mailto:sebeliusancira@gmail.com" class="text-signal underline transition-colors hover:text-signal-strong">sebeliusancira@gmail.com</a>.
        </p>

    </div>
</div>
