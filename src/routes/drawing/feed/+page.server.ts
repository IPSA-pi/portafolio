import { loadAllDrawings, GALLERY_CACHE_CONTROL } from '$lib/server/loadNotebook';

export async function load({ setHeaders }) {
    // Safe to share-cache: this view is deliberately unshuffled (the seeded
    // shuffle stayed on the per-notebook galleries), so the payload doesn't
    // vary per visitor. /drawing/[slug] is NOT cacheable for that reason —
    // it reads the session_seed cookie and an optional ?session_id.
    setHeaders({ 'cache-control': GALLERY_CACHE_CONTROL });
    return loadAllDrawings();
}
