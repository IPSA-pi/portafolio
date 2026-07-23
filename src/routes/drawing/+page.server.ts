import { loadNotebookCards } from '$lib/server/loadNotebook';

export async function load() {
    return { notebooks: await loadNotebookCards() };
}
