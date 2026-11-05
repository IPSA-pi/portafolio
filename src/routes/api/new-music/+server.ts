import { json } from '@sveltejs/kit';
import { parseCursor, parseFilters, parseIds, queryReleases } from '$lib/server/releases';

// Public read for /new-music: filter changes, "Load more", and a visitor's
// status filter (their ids from localStorage — POST because that list can be
// long). Same visibility rule as the page load: queryReleases hides
// dismissed/unavailable unless locals.isAdmin.
export const POST = async ({ request, locals }) => {
    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Invalid JSON' }, { status: 400 });
    }
    if (!body || typeof body !== 'object') return json({ error: 'Invalid body' }, { status: 400 });

    const filters = parseFilters(body.filters);
    if (!filters) return json({ error: 'Invalid filters' }, { status: 400 });

    const cursor = body.cursor == null ? null : parseCursor(body.cursor);
    if (body.cursor != null && !cursor) return json({ error: 'Invalid cursor' }, { status: 400 });

    const ids = body.ids === undefined ? undefined : parseIds(body.ids);
    if (ids === null) return json({ error: 'Invalid ids' }, { status: 400 });

    try {
        const page = await queryReleases({ isAdmin: locals.isAdmin, filters, cursor, ids });
        return json(page, { headers: { 'cache-control': 'no-store' } });
    } catch (err) {
        console.error('releases page error:', (err as Error).message);
        return json({ error: 'Failed to load releases' }, { status: 500 });
    }
};
