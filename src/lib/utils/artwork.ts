import { formatTitle } from './formatTitle';

/**
 * Gallery metadata for one drawing — the `title / year / medium / width_cm /
 * height_cm` columns, authored in the repo as per-notebook sidecars
 * (scripts/metadata/<notebook>.json) and written by scripts/seed.js.
 *
 * Every field is optional AND nullable: most rows have none, and the display
 * sites must render exactly as they did before this existed when that's the
 * case. Dimensions arrive from a Postgres NUMERIC, so they can surface as
 * either a number or a string.
 */
export interface ArtworkMeta {
    title?: string | null;
    year?: number | null;
    medium?: string | null;
    widthCm?: number | string | null;
    heightCm?: number | string | null;
}

/** An image as the galleries consume it, plus whatever metadata its row has. */
export type ArtworkImage = {
    sm: string;
    md: string;
    lg: string;
    slug: string;
    notebook?: string;
} & ArtworkMeta;

/** Trim trailing zeros a NUMERIC picks up: 29.70 -> '29.7', 21.0 -> '21'. */
function num(value: number | string | null | undefined): string | null {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? String(n) : null;
}

/** The drawing's title, falling back to the slug when it has none. */
export function artworkTitle(meta: ArtworkMeta, slug: string): string {
    return meta.title?.trim() || formatTitle(slug);
}

/** '7.6 × 12.7 cm', or null unless BOTH axes are present. */
export function formatDimensions(meta: ArtworkMeta): string | null {
    const w = num(meta.widthCm);
    const h = num(meta.heightCm);
    return w && h ? `${w} × ${h} cm` : null;
}

/**
 * The gallery-label line under a title: 'year · medium · 7.6 × 12.7 cm'.
 * Only non-null parts appear; '' when there's nothing to show, so callers can
 * skip rendering the line entirely.
 *
 * `medium` is rendered verbatim — the sidecar's capitalisation is what ships.
 */
export function formatTombstone(meta: ArtworkMeta): string {
    return [meta.year ?? null, meta.medium ?? null, formatDimensions(meta)]
        .filter(part => part !== null && part !== '')
        .join(' · ');
}

/**
 * Alt text for the image itself. With no describable metadata this returns
 * exactly `formatTitle(slug)` — byte-identical to what every alt says today.
 *
 * `year` alone doesn't make an alt more descriptive of the picture, so it's
 * left out: a row carrying only a year still gets the plain slug title.
 */
export function artworkAlt(meta: ArtworkMeta, slug: string): string {
    const parts = [meta.title?.trim() || null, meta.medium ?? null, formatDimensions(meta)]
        .filter(part => part !== null && part !== '');

    if (parts.length === 0) return formatTitle(slug);

    // Title is always first, whether it's a real one or the slug fallback.
    if (!meta.title?.trim()) parts.unshift(formatTitle(slug));

    return `${parts.join(', ')} — original drawing by Ian Sebelius`;
}
