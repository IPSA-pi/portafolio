import { loadAllDrawings } from '$lib/server/loadNotebook';
import type { RequestEvent } from '@sveltejs/kit';

export async function load({ locals }: RequestEvent) {
    return loadAllDrawings(locals.sessionSeed);
}
