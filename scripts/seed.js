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
 *   3. scripts/metadata/<notebook>.json — repo-authored artwork metadata
 *      (title / year / medium / dimensions). See that folder's README.
 *
 * Run after upload.js so the storage URLs are live.
 * Safe to re-run: upserts on slug, and rows that already exist keep their
 * DB-side sold / reserved / display_order (webhook and owner writes), plus
 * their Stripe link when the Stripe scan finds no product for the slug.
 * Artwork metadata is the exception — the repo owns it, so a re-seed
 * overwrites whatever is in the DB.
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
import { logDbTarget, logStripeTarget } from './db-target.js';
import Stripe from 'stripe';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRAWINGS_DIR = path.resolve(__dirname, '../src/lib/assets/drawings');
const MAP_FILE = path.resolve(__dirname, 'rename-map.json');
const METADATA_DIR = path.resolve(__dirname, 'metadata');
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
logStripeTarget(STRIPE_SECRET_KEY);

// Load the old→new slug map produced by rename.js --apply
let renameMap = {};
if (fs.existsSync(MAP_FILE)) {
    renameMap = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
    console.log(`Loaded ${Object.keys(renameMap).length} slug mappings from rename-map.json`);
} else {
    console.warn('rename-map.json not found — Stripe products will not be linked.');
}
const oldToNew = new Map(Object.entries(renameMap));

// Artwork metadata sidecars: scripts/metadata/<notebook>.json, loaded once per
// notebook. A missing file is fine (no metadata); malformed JSON is fatal, so a
// typo can never silently blank a whole notebook's metadata.
const sidecarCache = new Map();
function loadSidecar(notebook) {
    if (sidecarCache.has(notebook)) return sidecarCache.get(notebook);

    const file = path.join(METADATA_DIR, `${notebook}.json`);
    let sidecar = {};
    if (fs.existsSync(file)) {
        try {
            sidecar = JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch (err) {
            console.error(`Malformed metadata sidecar: ${file}\n  ${err.message}`);
            process.exit(1);
        }
    }
    sidecarCache.set(notebook, sidecar);
    return sidecar;
}

// defaults apply to the whole notebook; per-drawing entries override them.
// `title` is per-drawing only — one title shared by a notebook is never right.
function artworkMetadata(notebook, slug) {
    const sidecar = loadSidecar(notebook);
    const { title: _sharedTitle, ...defaults } = sidecar.defaults ?? {};
    return { ...defaults, ...(sidecar.drawings?.[slug] ?? {}) };
}

// 1. Build rows from filesystem (sources only — no variant suffix).
//    A source is {notebook}_{dd}.png (the lossless master, preferred) or
//    .webp (legacy); see README → "Scanning and exporting". storage_url always
//    names the .webp base whichever it was, because loadNotebook derives the
//    -sm/-md/-lg variants from it by replacing a trailing `.webp` — a .png
//    value there would resolve every variant to the full-size master.
const rows = [];
for (const folder of fs.readdirSync(DRAWINGS_DIR)) {
    const folderPath = path.join(DRAWINGS_DIR, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;

    // One source per slug. During a re-export a PNG master and its legacy
    // .webp sit side by side; take the PNG so the count doesn't double-report.
    const sources = new Map();
    for (const file of fs.readdirSync(folderPath)) {
        const match = file.match(/^(.+)_(\d{2})\.(png|webp)$/);
        if (!match) continue;

        const slug = `${match[1]}_${match[2]}`;
        if (sources.get(slug)?.ext === 'png') continue;
        sources.set(slug, { notebook: match[1], number: match[2], ext: match[3] });
    }

    for (const [slug, src] of sources) {
        const notebook      = src.notebook;
        const drawingNumber = parseInt(src.number);
        const storageUrl    = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${notebook}/${slug}.webp`;
        const meta          = artworkMetadata(notebook, slug);

        rows.push({
            slug,
            notebook,
            drawing_number: drawingNumber,
            display_order:  rows.length,  // initial order = filesystem order
            storage_url:    storageUrl,
            stripe_product_id: null,
            stripe_price_id:   null,
            price_cents:       null,
            title:             meta.title     ?? null,
            year:              meta.year      ?? null,
            medium:            meta.medium    ?? null,
            width_cm:          meta.width_cm  ?? null,
            height_cm:         meta.height_cm ?? null,
            sold:              false,
            reserved:          false,
        });
    }
}

rows.sort((a, b) => a.slug.localeCompare(b.slug));
console.log(`\nFound ${rows.length} drawings on disk`);

// 1b. Metadata summary + typo guard. A sidecar entry pointing at a slug (or a
//     whole notebook) that isn't on disk writes nothing, so warn rather than
//     fail — only malformed JSON, handled in loadSidecar, is fatal.
const METADATA_FIELDS = ['title', 'year', 'medium', 'width_cm', 'height_cm'];
const sidecarFiles = fs.existsSync(METADATA_DIR)
    ? fs.readdirSync(METADATA_DIR).filter(f => f.endsWith('.json'))
    : [];
const slugsOnDisk = new Set(rows.map(r => r.slug));
for (const file of sidecarFiles) {
    const notebook = path.basename(file, '.json');
    if (!rows.some(r => r.notebook === notebook)) {
        console.warn(`  metadata/${file}: no drawings on disk for notebook "${notebook}"`);
    }
    for (const slug of Object.keys(loadSidecar(notebook).drawings ?? {})) {
        if (!slugsOnDisk.has(slug)) {
            console.warn(`  metadata/${file}: no drawing on disk for slug "${slug}"`);
        }
    }
}
const withMetadata = rows.filter(r => METADATA_FIELDS.some(f => r[f] !== null)).length;
console.log(`Metadata: ${sidecarFiles.length} sidecars, ${withMetadata}/${rows.length} drawings with metadata`);

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

// 3. Preserve DB-side state on rows that already exist. The webhook marks
//    sales in Supabase only (it never writes Stripe metadata), and reserved /
//    display_order are owned by checkout and the owner respectively — a
//    re-seed must not reset any of them. Stripe metadata.sold can still ADD
//    a sold flag (migration-era products), never clear one.
//
//    Artwork metadata (title / year / medium / width_cm / height_cm) is
//    deliberately NOT preserved here: the repo owns those columns via
//    scripts/metadata/<notebook>.json, so a re-seed overwrites the DB and
//    deleting a sidecar key writes NULL. Edit the sidecar, not the row.
const existingBySlug = new Map();
const allSlugs = rows.map(r => r.slug);
const IN_CHUNK = 200;
for (let i = 0; i < allSlugs.length; i += IN_CHUNK) {
    const { data: existing, error } = await supabase
        .from('drawings')
        .select('slug, sold, reserved, display_order, stripe_product_id, stripe_price_id, price_cents')
        .in('slug', allSlugs.slice(i, i + IN_CHUNK));
    if (error) {
        console.error('Failed to load existing rows:', error.message);
        process.exit(1);
    }
    for (const row of existing ?? []) existingBySlug.set(row.slug, row);
}

let preserved = 0;
for (const row of rows) {
    const ex = existingBySlug.get(row.slug);
    if (!ex) continue;

    row.sold          = ex.sold || row.sold;
    row.reserved      = ex.reserved;
    row.display_order = ex.display_order;

    // Stripe scan found nothing for this slug (e.g. rename-map.json missing):
    // keep the existing link rather than de-listing the drawing.
    if (!row.stripe_product_id && ex.stripe_product_id) {
        row.stripe_product_id = ex.stripe_product_id;
        row.stripe_price_id   = ex.stripe_price_id;
        row.price_cents       = ex.price_cents;
    }
    preserved++;
}
console.log(`${preserved} existing rows (DB state preserved), ${rows.length - preserved} new`);

// 4. Preview or upsert
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
