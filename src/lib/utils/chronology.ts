const FIXED_ORDER: Record<string, number> = {
    negro_1: 0,
    negro_2: 1,
    verde_3: 2,
    verde_4: 3,
    azul_5: 4,
    rojo_6: 5,
};

const YYMMDD = /^(\d{2})(\d{2})(\d{2})$/;

/**
 * Sortable chronology key for a notebook. `yymmdd`-named notebooks (e.g.
 * `260619`) sort by that real date; the six legacy color-coded notebooks use
 * a fixed ordinal (always smaller than any real date's key) so they sort
 * first without inventing dates for them.
 */
export function chronologyKey(notebook: string): number {
    const match = notebook.match(YYMMDD);
    if (match) {
        const [, yy, mm, dd] = match;
        return Date.UTC(2000 + Number(yy), Number(mm) - 1, Number(dd));
    }
    return FIXED_ORDER[notebook];
}
