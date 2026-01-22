import { error } from '@sveltejs/kit';

export async function load({ params }) {
    const slug = params.slug;

    // Glob ALL images (original + webp variants)
    const modules = import.meta.glob('$lib/assets/drawings/*/*', {
        eager: true
    });

    const groupedImages: Record<string, { original: string, sm: string, md: string, lg: string }> = {};

    for (const path in modules) {
        if (!path.includes(`/${slug}/`)) continue;

        const url = (modules[path] as any).default;

        // Extract basename (e.g. "drawing1" from "drawing1-sm.webp" or "drawing1.jpg")
        const filename = path.split('/').pop() || "";
        let basename = filename;
        let type: 'original' | 'sm' | 'md' | 'lg' = 'original';

        const match = filename.match(/^(.*)-(sm|md|lg)\.webp$/);
        if (match) {
            basename = match[1];
            type = match[2] as any;
        } else {
            // Remove extension for original files to get key
            basename = filename.replace(/\.(png|jpg|jpeg|webp)$/i, "");
        }

        if (!groupedImages[basename]) {
            groupedImages[basename] = { original: "", sm: "", md: "", lg: "" };
        }

        groupedImages[basename][type] = url;
    }

    // Convert map to array, filtering out incomplete sets if necessary
    // We expect every image to have generated variants.
    const images = Object.values(groupedImages).filter(set => set.original || set.lg);

    // Sort logic could go here if needed, currently implicitly sorted by file system/glob order
    // But since keys are object properties, order isn't guaranteed. 
    // Let's sort keys to ensure stability
    const sortedKeys = Object.keys(groupedImages).sort();
    const sortedImages = sortedKeys.map(k => groupedImages[k]);

    if (sortedImages.length === 0) {
        throw error(404, 'Notebook not found');
    }

    return {
        images: sortedImages
    };
}
