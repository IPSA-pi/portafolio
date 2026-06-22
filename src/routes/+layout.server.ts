import type { LayoutServerLoad } from './$types';

// Expose owner state so the nav can show private links (e.g. New Music) only to
// the authenticated owner. `locals.isAdmin` is set in hooks.server.ts.
export const load: LayoutServerLoad = ({ locals }) => {
    return { isAdmin: locals.isAdmin ?? false };
};
