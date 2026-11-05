// Shared between /new-music's page and its server code (src/lib/server/releases.ts).

// Every scraper source (scripts/sources/*.js `SOURCE`). The page's source
// filter is built from this rather than from loaded rows, since with
// pagination most rows aren't loaded. Add a new source here too.
export const RELEASE_SOURCES = ['boomkat.com', 'nodata.tv', 'ra.co'];

// Server-side filters. `status` is the owner's shared releases.status and is
// honoured only for the owner; a visitor's status filter is sent as `ids`.
export type ReleaseFilters = {
    status?: string;
    source?: string;
    tidal?: boolean;
    spotify?: boolean;
    apple?: boolean;
};

// Keyset cursor: the last row of the previous page (order is created_at DESC,
// id DESC — the id breaks ties within a scrape batch, which shares one NOW()).
export type ReleaseCursor = { created_at: string; id: string };

export type ReleasePage<R> = {
    releases: R[];
    nextCursor: ReleaseCursor | null;
    // Rows matching the filters; null on cursor pages (keep the first page's).
    total: number | null;
};
