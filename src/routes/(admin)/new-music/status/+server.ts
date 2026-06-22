import { json, error } from '@sveltejs/kit';
import { getSupabase } from '$lib/server/supabase';
import type { ReleaseStatus } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

const VALID: ReleaseStatus[] = ['new', 'liked', 'queued', 'unavailable', 'dismissed'];

/**
 * Update a release's worklist status. Owner-only: the (admin) group sits behind
 * Cloudflare Access, and `locals.isAdmin` is re-checked here as a backstop.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.isAdmin) throw error(403, 'Forbidden');

    const { id, status } = await request.json();
    if (!id || !VALID.includes(status)) {
        return json({ error: 'Missing id or invalid status' }, { status: 400 });
    }

    const { error: dbError } = await getSupabase()
        .from('releases')
        .update({ status })
        .eq('id', id);

    if (dbError) {
        return json({ error: dbError.message }, { status: 500 });
    }
    return json({ ok: true });
};
