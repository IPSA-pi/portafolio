import { queryReleases } from '$lib/server/releases';
import type { PageServerLoad } from './$types';

// Dynamic data — never prerender.
export const prerender = false;

// First page only, unfiltered. Later pages and filter changes come from
// POST /api/new-music (same queryReleases, same visibility rule).
export const load: PageServerLoad = async ({ locals }) => {
    try {
        return await queryReleases({ isAdmin: locals.isAdmin, filters: {} });
    } catch (err) {
        // Missing env / table not created yet — render the empty state, not a 500.
        console.error('releases load error:', (err as Error).message);
        return { releases: [], nextCursor: null, total: 0 };
    }
};
