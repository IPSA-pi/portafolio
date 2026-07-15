/**
 * Step 3 — Seed the Supabase drawings table.
 *
 * Sources:
 *   1. Filesystem — every original (non-variant) webp after rename.js
 *      gives us one row per drawing with its storage URL.
 *   2. Stripe — existing products carry price, priceId, and sold status.
 *      scripts/rename-map.json maps old Stripe slugs → new slugs so we
 *      can link them.
 *
 * Run after upload.js so the storage URLs are live.
 * Safe to re-run: uses upsert on slug.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed.js
 *   node --env-file=.env.local scripts/seed.js --dry-run
 *
 * Required env vars (.env.local):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   STRIPE_SECRET_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { logDbTarget } from './db-target.js';
import Stripe from 'stripe';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRAWINGS_DIR = path.resolve(__dirname, '../src/lib/assets/drawings');
const MAP_FILE = path.resolve(__dirname, 'rename-map.json');
const BUCKET = 'drawings';
const DRY_RUN = process.argv.includes('--dry-run');

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY) {
    console.error('Missing required env vars. Check .env.local');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const stripe   = new Stripe(STRIPE_SECRET_KEY);
logDbTarget(SUPABASE_URL);

// Load the old→new slug map produced by rename.js --apply
let renameMap = {};
if (fs.existsSync(MAP_FILE)) {
    renameMap = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
    console.log(`Loaded ${Object.keys(renameMap).length} slug mappings from rename-map.json`);
} else {
    console.warn('rename-map.json not found — Stripe products will not be linked.');
}
const oldToNew = new Map(Object.entries(renameMap));

// 1. Build rows from filesystem (originals only)
const rows = [];
for (const folder of fs.readdirSync(DRAWINGS_DIR)) {
    const folderPath = path.join(DRAWINGS_DIR, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;

    for (const file of fs.readdirSync(folderPath)) {
        // Originals only: {notebook}_{dd}.webp — no variant suffix
        const match = file.match(/^([a-z]+_(\d+))_(\d{2})\.webp$/);
        if (!match) continue;

        const notebook      = match[1];
        const drawingNumber = parseInt(match[3]);
        const slug          = `${notebook}_${match[3]}`;
        const storageUrl    = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${notebook}/${file}`;

        rows.push({
            slug,
            notebook,
            drawing_number: drawingNumber,
            display_order:  rows.length,  // initial order = filesystem order
            storage_url:    storageUrl,
            stripe_product_id: null,
            stripe_price_id:   null,
            price_cents:       null,
            sold:              false,
            reserved:          false,
        });
    }
}

rows.sort((a, b) => a.slug.localeCompare(b.slug));
console.log(`\nFound ${rows.length} drawings on disk`);

// 2. Fetch Stripe products and match to rows
const byNewSlug = new Map(rows.map(r => [r.slug, r]));

console.log('Fetching Stripe products...');
let stripeLinked = 0;

let page = await stripe.products.list({ limit: 100, active: true, expand: ['data.default_price'] });
while (true) {
    for (const product of page.data) {
        const oldSlug = product.metadata?.slug;
        if (!oldSlug) continue;

        const newSlug = oldToNew.get(oldSlug) ?? oldSlug;
        const row = byNewSlug.get(newSlug);
        if (!row) {
            console.warn(`  no match for Stripe slug "${oldSlug}" → "${newSlug}"`);
            continue;
        }

        const price = product.default_price;
        row.stripe_product_id = product.id;
        row.stripe_price_id   = typeof price === 'object' ? price?.id : price ?? null;
        row.price_cents        = typeof price === 'object' ? price?.unit_amount ?? null : null;
        row.sold               = product.metadata?.sold === 'true';
        stripeLinked++;
    }
    if (!page.has_more) break;
    page = await stripe.products.list({ limit: 100, starting_after: page.data.at(-1).id, expand: ['data.default_price'] });
}

console.log(`Linked ${stripeLinked} Stripe products`);

// 3. Preview or upsert
if (DRY_RUN) {
    console.log('\nDRY RUN — first 5 rows:\n');
    for (const r of rows.slice(0, 5)) {
        console.log(JSON.stringify(r, null, 2));
    }
    console.log(`\n${rows.length} rows would be upserted.`);
} else {
    // Batch upsert in chunks of 50
    const CHUNK = 50;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const { error } = await supabase
            .from('drawings')
            .upsert(chunk, { onConflict: 'slug' });
        if (error) {
            console.error(`Upsert error at chunk ${i}:`, error.message);
            process.exit(1);
        }
        inserted += chunk.length;
        console.log(`  upserted ${inserted}/${rows.length}`);
    }
    console.log(`\nDone. ${rows.length} rows in Supabase.`);
}
