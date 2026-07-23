import { loadAllDrawings } from '$lib/server/loadNotebook';

export async function load() {
    return loadAllDrawings();
}
