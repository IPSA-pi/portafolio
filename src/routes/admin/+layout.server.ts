import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

/**
 * Guards every page under /admin. The real gate is Cloudflare Access in front of
 * `/admin*`; this is a fail-closed backstop so a path accidentally left outside
 * the Access application still can't be reached. `locals.isAdmin` is set in
 * hooks.server.ts. (Note: layout loads don't run for +server endpoints — those
 * re-check `locals.isAdmin` themselves.)
 */
export const load: LayoutServerLoad = ({ locals }) => {
    if (!locals.isAdmin) {
        throw error(404, 'Not found');
    }
    return { isAdmin: true };
};
