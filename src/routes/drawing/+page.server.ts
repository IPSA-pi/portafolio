import { seededShuffle } from '$lib/utils/shuffle';
import { NOTEBOOKS } from '$lib/notebooks';
import type { RequestEvent } from '@sveltejs/kit';

export function load({ locals }: RequestEvent) {
    return { notebooks: seededShuffle(NOTEBOOKS, locals.sessionSeed) };
}
