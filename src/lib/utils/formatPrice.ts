// cents -> display price. `compact: true` drops the cents (all drawing
// prices are whole dollars) for space-constrained badges/pills — e.g.
// Gallery's grid tile price badge — where "$150.00" would crowd a tiny
// overlay; everywhere else gets the full currency format.
export function formatPrice(cents: number, options?: { compact?: boolean }): string {
    if (options?.compact) {
        return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);
}
