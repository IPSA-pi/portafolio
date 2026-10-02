/**
 * Row selection shared by the three enrich passes (Tidal, Spotify, Apple).
 *
 * Never-checked rows (`column IS NULL`) come first, newest first, so a fresh
 * scrape is always looked up before anything is re-checked. Only the room left
 * under `limit` goes to the re-check pool: rows marked unavailable (`column =
 * false`) within the re-check window (by `released_at`, falling back to
 * `created_at` when that is null). Those are ordered by `updated_at` ascending
 * so re-checks rotate through the pool — the `releases_updated_at` trigger
 * bumps `updated_at` on every write an enrich pass makes, so it approximates
 * "least recently checked" without a migration.
 *
 * Returns `{ data, error }` like a Supabase query; `data` is `id, artist, title` rows.
 */
export async function loadRowsToCheck(supabase, column, limit, recheckCutoff) {
    const fresh = await supabase
        .from('releases')
        .select('id, artist, title')
        .is(column, null)
        .order('created_at', { ascending: false })
        .limit(limit);
    if (fresh.error) return fresh;

    const room = limit - fresh.data.length;
    if (room <= 0) return fresh;

    const recheck = await supabase
        .from('releases')
        .select('id, artist, title')
        .eq(column, false)
        .or(
            `released_at.gte.${recheckCutoff},` +
                `and(released_at.is.null,created_at.gte.${recheckCutoff})`
        )
        .order('updated_at', { ascending: true })
        .limit(room);
    if (recheck.error) return recheck;

    return { data: [...fresh.data, ...recheck.data], error: null };
}
