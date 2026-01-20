import { error } from '@sveltejs/kit';

export async function load({ params }) {
    const slug = params.slug;

    // We need to use a distinct glob import for each possible folder 
    // because Vite's import.meta.glob must be static strings (mostly).
    // However, we can glob EVERYTHING and filter at runtime, 
    // OR usage patterns support some dynamic variables if the depth is known.
    // The safest way is to glob all drawings and filter by path.

    // Glob all drawing images 3 levels deep (assets/drawings/FOLDER/IMAGE)
    const modules = import.meta.glob('$lib/assets/drawings/*/*', {
        eager: true,
        query: { enhanced: true, w: "1280;800;400" }
    });

    const images = [];

    for (const path in modules) {
        if (path.includes(`/${slug}/`)) {
            images.push((modules[path] as any).default);
        }
    }

    if (images.length === 0) {
        throw error(404, 'Notebook not found');
    }

    return {
        images
    };
}
