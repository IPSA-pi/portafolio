/**
 * Create a Stripe product + price for one drawing or an entire notebook,
 * then update Supabase.
 *
 * Usage:
 *   node --env-file=.env.local scripts/set-price.js <slug> <price-in-dollars>
 *   node --env-file=.env.local scripts/set-price.js --notebook <notebook> <price-in-dollars>
 *
 * Examples:
 *   node --env-file=.env.local scripts/set-price.js negro_2_09 150
 *   node --env-file=.env.local scripts/set-price.js --notebook negro_2 150
 *
 * If a drawing already has a Stripe product, a new price is created and set
 * as the default (Stripe prices are immutable — you can't edit an amount).
 * Already-sold drawings are skipped.
 *
 * Required env vars (.env.local):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   STRIPE_SECRET_KEY
 */

import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { logDbTarget, logStripeTarget } from './db-target.js';
import Stripe from 'stripe';

const { values, positionals } = parseArgs({
    options: { notebook: { type: 'string' } },
    allowPositionals: true,
});

const notebook = values.notebook ?? null;
const slug     = notebook ? null : positionals[0];
const rawPrice = notebook ? positionals[0] : positionals[1];

if ((!notebook && !slug) || !rawPrice) {
    console.error('Usage:');
    console.error('  node --env-file=.env.local scripts/set-price.js <slug> <price-in-dollars>');
    console.error('  node --env-file=.env.local scripts/set-price.js --notebook <notebook> <price-in-dollars>');
    process.exit(1);
}

const priceCents = Math.round(parseFloat(rawPrice) * 100);
if (isNaN(priceCents) || priceCents <= 0) {
    console.error(`Invalid price "${rawPrice}". Pass a dollar amount, e.g. 150`);
    process.exit(1);
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY) {
    console.error('Missing required env vars. Check .env.local');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const stripe   = new Stripe(STRIPE_SECRET_KEY);
logDbTarget(SUPABASE_URL);
logStripeTarget(STRIPE_SECRET_KEY);

// 1. Fetch drawings from Supabase
let query = supabase.from('drawings').select('slug, stripe_product_id, sold');

if (notebook) {
    query = query.eq('notebook', notebook).order('display_order', { ascending: true });
} else {
    query = query.eq('slug', slug);
}

const { data: drawings, error: dbError } = await query;

if (dbError || !drawings?.length) {
    console.error(notebook
        ? `No drawings found for notebook "${notebook}".`
        : `Drawing "${slug}" not found in Supabase.`
    );
    process.exit(1);
}

const toPrice = drawings.filter(d => !d.sold);
const skipped = drawings.filter(d => d.sold);

if (skipped.length) {
    console.log(`Skipping ${skipped.length} already-sold drawing(s): ${skipped.map(d => d.slug).join(', ')}\n`);
}

console.log(`Setting price $${(priceCents / 100).toFixed(2)} on ${toPrice.length} drawing(s):\n`);

// 2. Price each drawing
let success = 0;
for (const drawing of toPrice) {
    try {
        // Create or reuse Stripe product
        let productId = drawing.stripe_product_id;

        if (productId) {
            process.stdout.write(`  ${drawing.slug}: reusing product ${productId} — `);
        } else {
            const product = await stripe.products.create({
                name: drawing.slug,
                metadata: { slug: drawing.slug },
            });
            productId = product.id;
            process.stdout.write(`  ${drawing.slug}: created product ${productId} — `);
        }

        // Create a new price (prices are immutable)
        const price = await stripe.prices.create({
            product:     productId,
            unit_amount: priceCents,
            currency:    'cad',
        });

        // Update Supabase before setting the default price on the product.
        // If Supabase fails, we deactivate the orphaned Stripe price so it
        // doesn't accumulate stale prices on re-runs.
        const { error: updateError } = await supabase
            .from('drawings')
            .update({
                stripe_product_id: productId,
                stripe_price_id:   price.id,
                price_cents:       priceCents,
            })
            .eq('slug', drawing.slug);

        if (updateError) {
            await stripe.prices.update(price.id, { active: false });
            throw new Error(`Supabase update failed: ${updateError.message} (Stripe price ${price.id} deactivated)`);
        }

        await stripe.products.update(productId, { default_price: price.id });

        process.stdout.write(`price ${price.id} OK\n`);
        success++;
    } catch (e) {
        process.stdout.write(`FAILED — ${e.message}\n`);
    }
}

console.log(`\nDone. ${success}/${toPrice.length} priced at $${(priceCents / 100).toFixed(2)}.`);
