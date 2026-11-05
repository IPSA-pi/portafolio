import { getSupabase, type Release, type ReleaseStatus } from '$lib/server/supabase';
import {
    RELEASE_SOURCES,
    type ReleaseCursor,
    type ReleaseFilters,
    type ReleasePage
} from '$lib/newMusic';

// Paged reads of `releases` for /new-music: the page load (first page) and
// POST /api/new-music (filter changes, "Load more", visitor id lookups) both
// go through queryReleases, so the public visibility rule lives only here.

export const PAGE_SIZE = 200;
// Visitor status filters send their ids from localStorage. PostgREST puts an
// IN list in the URL, so look them up in chunks.
export const MAX_IDS = 2000;
const ID_CHUNK = 150;

const STATUSES: ReleaseStatus[] = ['new', 'liked', 'queued', 'unavailable', 'dismissed'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate untrusted filter input. Returns null if anything is malformed. */
export function parseFilters(raw: unknown): ReleaseFilters | null {
    if (raw === undefined || raw === null) return {};
    if (typeof raw !== 'object' || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    const out: ReleaseFilters = {};
    if (r.status !== undefined) {
        if (!STATUSES.includes(r.status as ReleaseStatus)) return null;
        out.status = r.status as string;
    }
    if (r.source !== undefined) {
        if (!RELEASE_SOURCES.includes(r.source as string)) return null;
        out.source = r.source as string;
    }
    for (const k of ['tidal', 'spotify', 'apple'] as const) {
        if (r[k] !== undefined) {
            if (typeof r[k] !== 'boolean') return null;
            out[k] = r[k] as boolean;
        }
    }
    return out;
}

export function parseCursor(raw: unknown): ReleaseCursor | null {
    if (!raw || typeof raw !== 'object') return null;
    const { created_at, id } = raw as Record<string, unknown>;
    if (typeof id !== 'string' || !UUID.test(id)) return null;
    if (typeof created_at !== 'string' || Number.isNaN(Date.parse(created_at))) return null;
    return { created_at, id };
}

export function parseIds(raw: unknown): string[] | null {
    if (!Array.isArray(raw) || raw.length > MAX_IDS) return null;
    if (!raw.every((id) => typeof id === 'string' && UUID.test(id))) return null;
    return [...new Set(raw as string[])];
}

type Options = {
    isAdmin: boolean;
    filters: ReleaseFilters;
    cursor?: ReleaseCursor | null;
    ids?: string[];
};

function baseQuery({ isAdmin, filters }: Options, count: boolean) {
    let query = getSupabase()
        .from('releases')
        .select('*', count ? { count: 'exact' } : undefined)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });

    // Public visitors see the curated list only — the owner's internal
    // "not interested / not on streaming" states stay private. The owner
    // (locals.isAdmin) still sees everything for editing.
    if (!isAdmin) {
        query = query.not('status', 'in', '(dismissed,unavailable)');
    } else if (filters.status) {
        query = query.eq('status', filters.status as ReleaseStatus);
    }
    if (filters.tidal) query = query.eq('tidal_available', true);
    if (filters.spotify) query = query.eq('spotify_available', true);
    if (filters.apple) query = query.eq('apple_available', true);
    return query;
}

// Source and cursor are both OR conditions. A query can carry only one `or`
// param, so they're combined into a single and(...) when both apply.
function orGroups(filters: ReleaseFilters, cursor: ReleaseCursor | null | undefined): string | null {
    const groups: string[] = [];
    if (filters.source) {
        // `source` too: rows from before the `sources` column have it empty.
        groups.push(`source.eq."${filters.source}",sources.cs.{"${filters.source}"}`);
    }
    if (cursor) {
        const t = `"${cursor.created_at}"`;
        groups.push(`created_at.lt.${t},and(created_at.eq.${t},id.lt.${cursor.id})`);
    }
    if (groups.length === 0) return null;
    if (groups.length === 1) return groups[0];
    return `and(${groups.map((g) => `or(${g})`).join(',')})`;
}

export async function queryReleases(opts: Options): Promise<ReleasePage<Release>> {
    if (opts.ids) return queryByIds(opts, opts.ids);

    // Count only the first page: with a cursor it would count the rows after it.
    let query = baseQuery(opts, !opts.cursor).limit(PAGE_SIZE);
    const or = orGroups(opts.filters, opts.cursor);
    if (or) query = query.or(or);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    const releases = (data ?? []) as Release[];
    const last = releases[releases.length - 1];
    return {
        releases,
        nextCursor: releases.length === PAGE_SIZE ? { created_at: last.created_at, id: last.id } : null,
        total: opts.cursor ? null : (count ?? releases.length)
    };
}

// A visitor's own status set: every matching row at once, no cursor.
async function queryByIds(opts: Options, ids: string[]): Promise<ReleasePage<Release>> {
    const rows: Release[] = [];
    for (let i = 0; i < ids.length; i += ID_CHUNK) {
        let query = baseQuery(opts, false).in('id', ids.slice(i, i + ID_CHUNK));
        const or = orGroups(opts.filters, null);
        if (or) query = query.or(or);
        const { data, error } = await query;
        if (error) throw new Error(error.message);
        rows.push(...((data ?? []) as Release[]));
    }
    const desc = (x: string, y: string) => (x === y ? 0 : x < y ? 1 : -1);
    rows.sort((a, b) => desc(a.created_at, b.created_at) || desc(a.id, b.id));
    return { releases: rows, nextCursor: null, total: rows.length };
}
