import { loadNotebook } from '$lib/server/loadNotebook';
import type { RequestEvent } from '@sveltejs/kit';

export async function load({ params, url, locals }: RequestEvent) {
    if (!params.slug) {
        throw new Error('Missing notebook slug');
    }
    return loadNotebook(params.slug, locals.sessionSeed, url.searchParams.get('session_id'));
}
