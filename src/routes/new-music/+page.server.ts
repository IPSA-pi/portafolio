import { getSupabase } from '$lib/server/supabase';
import type { PageServerLoad } from './$types';

// Dynamic data — never prerender.
export const prerender = false;

export const load: PageServerLoad = async ({ locals }) => {
    try {
        let query = getSupabase()
            .from('releases')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(500);

        // Public visitors see the curated list only — the owner's internal
        // "not interested / not on streaming" states stay private. The owner
        // (locals.isAdmin) still sees everything for editing.
        if (!locals.isAdmin) {
            query = query.not('status', 'in', '(dismissed,unavailable)');
        }

        const { data, error } = await query;

        if (error) {
            console.error('Failed to load releases:', error.message);
            return { releases: [] };
        }

        return { releases: data ?? [] };
    } catch (err) {
        // Missing env / table not created yet — render the empty state, not a 500.
        console.error('releases load error:', (err as Error).message);
        return { releases: [] };
    }
};
