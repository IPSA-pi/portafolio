import { error } from '@sveltejs/kit';
import { chapters, parts } from '$lib/learn/chapters';
import { renderChapter } from '$lib/server/learn';

// Prerender: SvelteKit runs this load during `vite build` and bakes each
// chapter into a static HTML page. Nothing in this file (or the renderer it
// imports) ships to the client or runs at the edge.
export const prerender = true;

// A dynamic route matches infinitely many URLs; entries() enumerates the real
// ones so the prerenderer knows exactly which chapter pages to build.
export function entries() {
    return chapters.map((c) => ({ chapter: c.slug }));
}

export async function load({ params }) {
    const index = chapters.findIndex((c) => c.slug === params.chapter);
    if (index === -1) throw error(404, 'Chapter not found');

    const chapter = chapters[index];
    const html = await renderChapter(chapter.file);
    if (html === null) throw error(404, 'Chapter not found');

    const part = parts.find((p) => p.chapters.includes(chapter))!;
    const link = (c: (typeof chapters)[number] | undefined) =>
        c ? { slug: c.slug, title: c.title } : null;

    return {
        html,
        slug: chapter.slug,
        title: chapter.title,
        description: chapter.description,
        part: part.title,
        prev: link(chapters[index - 1]),
        next: link(chapters[index + 1])
    };
}
