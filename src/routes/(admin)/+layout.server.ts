import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

/**
 * Guards every route in the (admin) group. The real gate is Cloudflare Access in
 * front of these paths; this is a fail-closed backstop so a path accidentally
 * left outside the CF Access application still can't be reached. `locals.isAdmin`
 * is set in hooks.server.ts.
 */
export const load: LayoutServerLoad = ({ locals }) => {
    if (!locals.isAdmin) {
        throw error(404, 'Not found');
    }
    return { isAdmin: true };
};
