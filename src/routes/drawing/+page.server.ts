import { seededShuffle } from '$lib/utils/shuffle';
import type { RequestEvent } from '@sveltejs/kit';

const NOTEBOOKS = [
    { slug: 'negro_1', title: 'Notebook 01 (Black)', description: 'Early explorations.' },
    { slug: 'negro_2', title: 'Notebook 02 (Black)', description: 'Continued studies in black.' },
    { slug: 'verde_3', title: 'Notebook 03 (Green)', description: 'Introduction of organic forms.' },
    { slug: 'verde_4', title: 'Notebook 04 (Green)', description: 'Complex green compositions.' },
    { slug: 'azul_5',  title: 'Notebook 05 (Blue)',  description: 'Blue series studies.' },
    { slug: 'rojo_6',  title: 'Notebook 06 (Red)',   description: 'Vibrant red experiments.' },
];

export function load({ locals }: RequestEvent) {
    return { notebooks: seededShuffle(NOTEBOOKS, locals.sessionSeed) };
}
