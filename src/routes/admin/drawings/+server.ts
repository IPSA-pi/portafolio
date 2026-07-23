import { json, error } from '@sveltejs/kit';
import { getSupabase } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const BUCKET = 'drawings';
const NOTEBOOK_RE = /^[a-zA-Z0-9_]+$/;

/**
 * Seed-equivalent for one notebook: registers drawings `{notebook}_01` ..
 * `{notebook}_NN` in the drawings table. Mirrors scripts/seed.js's
 * upsert-and-preserve semantics (a re-run never resets sold / reserved /
 * display_order / the Stripe link) but skips its filesystem and Stripe
 * scans — the owner still runs standardize-images + upload:prod locally
 * first, and Stripe pricing is a separate step (I2).
 */
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.isAdmin) throw error(403, 'Forbidden');

    const body = await request.json().catch(() => ({}));
    const notebook = typeof body.notebook === 'string' ? body.notebook.trim() : '';
    const count = body.count;

    if (!notebook || !NOTEBOOK_RE.test(notebook)) {
        return json({ error: 'Missing or invalid notebook' }, { status: 400 });
    }
    if (!Number.isInteger(count) || count < 1 || count > 99) {
        return json({ error: 'count must be an integer between 1 and 99' }, { status: 400 });
    }
    if (!env.SUPABASE_URL) {
        return json({ error: 'SUPABASE_URL not configured' }, { status: 500 });
    }

    const slugs: string[] = [];
    const rows = [];
    for (let n = 1; n <= count; n++) {
        const nn = String(n).padStart(2, '0');
        const slug = `${notebook}_${nn}`;
        slugs.push(slug);
        rows.push({
            slug,
            notebook,
            drawing_number: n,
            storage_url: `${env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${notebook}/${slug}.webp`
        });
    }

    const supabase = getSupabase();

    const { data: existing, error: fetchError } = await supabase
        .from('drawings')
        .select('slug, sold, reserved, reserved_at, display_order, stripe_product_id, stripe_price_id, price_cents')
        .in('slug', slugs);
    if (fetchError) {
        return json({ error: fetchError.message }, { status: 500 });
    }
    const existingBySlug = new Map((existing ?? []).map((r) => [r.slug, r]));

    const { data: maxRow } = await supabase
        .from('drawings')
        .select('display_order')
        .order('display_order', { ascending: false })
        .limit(1)
        .maybeSingle();
    let nextOrder = (maxRow?.display_order ?? -1) + 1;

    let created = 0;
    let preserved = 0;
    const upsertRows = rows.map((row) => {
        const ex = existingBySlug.get(row.slug);
        if (ex) {
            preserved++;
            return {
                ...row,
                sold: ex.sold,
                reserved: ex.reserved,
                reserved_at: ex.reserved_at,
                display_order: ex.display_order,
                stripe_product_id: ex.stripe_product_id,
                stripe_price_id: ex.stripe_price_id,
                price_cents: ex.price_cents
            };
        }
        created++;
        return {
            ...row,
            sold: false,
            reserved: false,
            reserved_at: null,
            display_order: nextOrder++,
            stripe_product_id: null,
            stripe_price_id: null,
            price_cents: null
        };
    });

    const { error: upsertError } = await supabase.from('drawings').upsert(upsertRows, { onConflict: 'slug' });
    if (upsertError) {
        return json({ error: upsertError.message }, { status: 500 });
    }

    return json({ ok: true, notebook, created, preserved, slugs });
};
