import { getSupabase } from '$lib/server/supabase';
import type { PageServerLoad } from './$types';

// Dynamic data — never prerender.
export const prerender = false;

export const load: PageServerLoad = async () => {
    try {
        const { data, error } = await getSupabase()
            .from('releases')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(500);

        if (error) {
            console.error('Failed to load releases:', error.message);
            return { releases: [] };
        }

        // Surface unworked items first: `new` on top, then by recency (already sorted).
        const releases = (data ?? []).sort(
            (a, b) => (a.status === 'new' ? 0 : 1) - (b.status === 'new' ? 0 : 1)
        );

        return { releases };
    } catch (err) {
        // Missing env / table not created yet — render the empty state, not a 500.
        console.error('releases load error:', (err as Error).message);
        return { releases: [] };
    }
};
