import { error } from '@sveltejs/kit';
import { ABOUT, ABOUT_PUBLISHED } from '$lib/about';
import type { PageServerLoad } from './$types';

// Not prerenderable: while the page is unpublished the response depends on
// `locals.isAdmin`, which is per-request.
export const prerender = false;

/**
 * Draft gate. Until ABOUT_PUBLISHED is flipped in src/lib/about.ts, only the
 * owner can see this page — 404 rather than 403 so an unfinished page doesn't
 * advertise that it exists (same fail-closed style as admin/+layout.server.ts).
 *
 * `locals.isAdmin` is safe to gate on: hooks.server.ts verifies the Cloudflare
 * Access JWT's signature, so a forged CF_Authorization cookie won't get in.
 */
export const load: PageServerLoad = ({ locals }) => {
    if (!ABOUT_PUBLISHED && !locals.isAdmin) {
        throw error(404, 'Not found');
    }
    return { about: ABOUT, published: ABOUT_PUBLISHED };
};
