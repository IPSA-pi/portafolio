const YYMMDD = /^(\d{2})(\d{2})(\d{2})$/;

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Display name for a notebook slug.
 *
 * The two naming schemes (see chronologyKey in ./chronology) read very
 * differently raw: `negro_1` is legible enough, but a date-coded notebook
 * showed up in the UI as the literal string "260619".
 *
 *   negro_1 -> 'Negro 1'
 *   260619  -> '19 June 2026'
 */
export function formatNotebook(slug: string): string {
    const match = slug.match(YYMMDD);
    if (match) {
        const [, yy, mm, dd] = match;
        const month = MONTHS[Number(mm) - 1];
        if (month) return `${Number(dd)} ${month} 20${yy}`;
    }
    return slug
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}
