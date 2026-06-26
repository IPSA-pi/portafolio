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

        return { releases: data ?? [] };
    } catch (err) {
        // Missing env / table not created yet — render the empty state, not a 500.
        console.error('releases load error:', (err as Error).message);
        return { releases: [] };
    }
};
