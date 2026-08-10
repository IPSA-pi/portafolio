import { loadNotebookCards, GALLERY_CACHE_CONTROL } from '$lib/server/loadNotebook';

export async function load({ setHeaders }) {
    // Safe to share-cache: the notebook index is identical for every visitor —
    // no seed shuffle, no session_id, nothing owner-conditional.
    setHeaders({ 'cache-control': GALLERY_CACHE_CONTROL });
    return { notebooks: await loadNotebookCards() };
}
