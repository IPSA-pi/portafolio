/**
 * Create a Stripe product + price for the paid DIGITAL file of one drawing or
 * an entire notebook, then update Supabase.
 *
 * Usage:
 *   node --env-file=.env.local scripts/set-digital-price.js <slug> <price-in-dollars>
 *   node --env-file=.env.local scripts/set-digital-price.js --notebook <notebook> <price-in-dollars>
 *   node --env-file=.env.local scripts/set-digital-price.js --all <price-in-dollars>
 *
 * Examples:
 *   node --env-file=.env.local scripts/set-digital-price.js 260619_01 10
 *   node --env-file=.env.local scripts/set-digital-price.js --notebook 260619 10
 *   node --env-file=.env.local scripts/set-digital-price.js --all --unpriced 10
 *
 * Flags:
 *   --unpriced   only touch drawings with no digital_stripe_price_id. Combine
 *                with --all or --notebook to backfill without minting a
 *                duplicate Stripe price for drawings that already have one.
 *   --dry-run    print what would change; write nothing to Stripe or Supabase.
 *
 * Drawings with no digital_object_path (no master uploaded) are skipped with a
 * warning — there is nothing to sell. Sold drawings are NOT skipped: the
 * digital file is independent of whether the original is still available.
 *
 * Digital products carry metadata.kind = 'digital' and metadata.drawing_slug,
 * never metadata.slug — seed.js matches physical products on that key.
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
    options: {
        notebook:  { type: 'string' },
        all:       { type: 'boolean' },
        unpriced:  { type: 'boolean' },
        'dry-run': { type: 'boolean' },
    },
    allowPositionals: true,
});

const notebook = values.notebook ?? null;
const all      = values.all ?? false;
const UNPRICED = values.unpriced ?? false;
const DRY_RUN  = values['dry-run'] ?? false;
// --all / --notebook take no slug, so the price is the first positional.
const slug     = (notebook || all) ? null : positionals[0];
const rawPrice = (notebook || all) ? positionals[0] : positionals[1];

if (notebook && all) {
    console.error('Pass either --notebook or --all, not both.');
    process.exit(1);
}

if ((!notebook && !all && !slug) || !rawPrice) {
    console.error('Usage:');
    console.error('  node --env-file=.env.local scripts/set-digital-price.js <slug> <price-in-dollars>');
    console.error('  node --env-file=.env.local scripts/set-digital-price.js --notebook <notebook> <price-in-dollars>');
    console.error('  node --env-file=.env.local scripts/set-digital-price.js --all <price-in-dollars>');
    console.error('Flags: --unpriced (skip drawings that already have a digital price), --dry-run');
    process.exit(1);
}

const priceCents = Math.round(parseFloat(rawPrice) * 100);
if (isNaN(priceCents) || priceCents <= 0) {
    console.error(`Invalid price "${rawPrice}". Pass a dollar amount, e.g. 10`);
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
let query = supabase.from('drawings').select(
    'slug, title, sold, digital_object_path, digital_stripe_product_id, digital_stripe_price_id, digital_price_cents'
);

if (notebook) {
    query = query.eq('notebook', notebook).order('display_order', { ascending: true });
} else if (all) {
    query = query.order('notebook').order('display_order', { ascending: true });
} else {
    query = query.eq('slug', slug);
}

const { data: drawings, error: dbError } = await query;

if (dbError || !drawings?.length) {
    console.error(dbError?.message ?? (notebook
        ? `No drawings found for notebook "${notebook}".`
        : all
            ? 'No drawings found in Supabase.'
            : `Drawing "${slug}" not found in Supabase.`)
    );
    process.exit(1);
}

const noMaster = drawings.filter(d => !d.digital_object_path);
const withMaster = drawings.filter(d => d.digital_object_path);
const toPrice = withMaster.filter(d => !UNPRICED || !d.digital_stripe_price_id || d.digital_price_cents == null);
const priced  = UNPRICED ? withMaster.filter(d => d.digital_stripe_price_id && d.digital_price_cents != null) : [];

if (noMaster.length) {
    console.warn(`Skipping ${noMaster.length} drawing(s) with no digital master (run upload-masters): ${noMaster.map(d => d.slug).join(', ')}\n`);
}

if (priced.length) {
    console.log(`--unpriced: skipping ${priced.length} drawing(s) that already have a digital price.\n`);
}

if (!toPrice.length) {
    console.log('Nothing to price.');
    process.exit(0);
}

console.log(`${DRY_RUN ? '[DRY RUN] Would set' : 'Setting'} digital price $${(priceCents / 100).toFixed(2)} on ${toPrice.length} drawing(s):\n`);

// 2. Price each drawing
let success = 0;
for (const drawing of toPrice) {
    try {
        if (DRY_RUN) {
            console.log(`  ${drawing.slug}${drawing.sold ? ' (sold)' : ''}: ${drawing.digital_stripe_product_id
                ? `would reuse product ${drawing.digital_stripe_product_id}`
                : 'would create product'} + new price`);
            success++;
            continue;
        }

        // Create or reuse Stripe product
        let productId = drawing.digital_stripe_product_id;

        if (productId) {
            process.stdout.write(`  ${drawing.slug}: reusing product ${productId} — `);
        } else {
            const product = await stripe.products.create({
                name: `${drawing.title ?? drawing.slug}, digital file`,
                description: 'Lossless PNG for personal use. Licence: iansebelius.com/terms',
                tax_code: 'txcd_10505001',
                metadata: { kind: 'digital', drawing_slug: drawing.slug },
            });
            productId = product.id;
            process.stdout.write(`  ${drawing.slug}: created product ${productId} — `);
        }

        // Create a new price (prices are immutable)
        const price = await stripe.prices.create({
            product:      productId,
            unit_amount:  priceCents,
            currency:     'cad',
            tax_behavior: 'exclusive',
        });

        // Update Supabase before setting the default price on the product.
        // If Supabase fails, deactivate the orphaned Stripe price so it
        // doesn't accumulate stale prices on re-runs.
        const { error: updateError } = await supabase
            .from('drawings')
            .update({
                digital_stripe_product_id: productId,
                digital_stripe_price_id:   price.id,
                digital_price_cents:       priceCents,
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

console.log(`\n${DRY_RUN ? '[DRY RUN] Nothing written. ' : ''}Done. ${success}/${toPrice.length} priced at $${(priceCents / 100).toFixed(2)}.`);
