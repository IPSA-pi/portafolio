import { loadNotebook } from '$lib/server/loadNotebook';
import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

export async function load({ params, locals }: RequestEvent) {
    if (!params.slug) throw new Error('Missing notebook slug');
    const data = await loadNotebook(params.slug, locals.sessionSeed);

    const index = Number(params.index);
    if (!Number.isInteger(index) || index < 1 || index > data.images.length) {
        throw redirect(302, `/drawing/${params.slug}/1`);
    }

    return { ...data, index };
}
