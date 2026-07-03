// e.g. 'negro_1_03' -> 'Negro 1 — 03'
export function formatTitle(slug: string): string {
    const parts = slug.split('_');
    const num = parts[parts.length - 1];
    const notebook = parts.slice(0, -1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    return `${notebook} — ${num}`;
}
