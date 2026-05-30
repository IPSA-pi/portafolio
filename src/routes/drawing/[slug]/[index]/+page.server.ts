import { loadNotebook } from '$lib/server/loadNotebook';
import type { RequestEvent } from '@sveltejs/kit';

export async function load({ params, locals }: RequestEvent) {
    if (!params.slug) throw new Error('Missing notebook slug');
    const data = await loadNotebook(params.slug, locals.sessionSeed);
    return { ...data, index: Number(params.index) };
}
