// Notebook metadata, shared between the notebook list, the per-notebook routes
// and SEO/Open Graph tags so titles stay consistent in one place.
export type Notebook = {
    slug: string;
    title: string;
    description: string;
};

export const NOTEBOOKS: Notebook[] = [
    { slug: 'negro_1', title: 'Notebook 01 (Black)', description: 'Early explorations.' },
    { slug: 'negro_2', title: 'Notebook 02 (Black)', description: 'Continued studies in black.' },
    { slug: 'verde_3', title: 'Notebook 03 (Green)', description: 'Introduction of organic forms.' },
    { slug: 'verde_4', title: 'Notebook 04 (Green)', description: 'Complex green compositions.' },
    { slug: 'azul_5',  title: 'Notebook 05 (Blue)',  description: 'Blue series studies.' },
    { slug: 'rojo_6',  title: 'Notebook 06 (Red)',   description: 'Vibrant red experiments.' },
];

export const NOTEBOOKS_BY_SLUG: Record<string, Notebook> = Object.fromEntries(
    NOTEBOOKS.map((n) => [n.slug, n])
);
