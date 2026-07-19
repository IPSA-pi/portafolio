<script lang="ts">
    import Seo from '$lib/components/Seo.svelte';
    import { parts, chapters } from '$lib/learn/chapters';

    // Continuous chapter numbering across parts; the appendix stays unnumbered.
    function chapterNumber(slug: string): number {
        return chapters.findIndex((c) => c.slug === slug) + 1;
    }
</script>

<Seo
    title="Learn — How this site was built"
    description="A concept-first walkthrough of how iansebelius.com is built with SvelteKit 5, organized into chapters — from runes and routing to Stripe, Cloudflare Workers, and real bugs — written for aspiring developers."
    path="/learn"
/>

<!--
  Full-width solid background blocks the layout's fixed background video so the
  long-form text stays readable. Theme-aware: light gray in light mode, near-black
  in dark mode (matching the chapter pages).
-->
<div class="min-h-screen bg-gray-100 dark:bg-neutral-950">
  <div class="container mx-auto px-4 py-12 max-w-3xl">
    <h1 class="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
        Learn — how this site is built
    </h1>
    <p class="mt-4 text-neutral-700 dark:text-neutral-300 leading-relaxed">
        This is the conceptual companion to the site's
        <a
            href="https://github.com/IPSA-pi/portafolio"
            target="_blank"
            rel="noopener noreferrer"
            class="text-accent hover:text-accent-hover underline">source code</a
        >: it explains <em>why</em> the site is built the way it is, and uses the real code as a
        way to learn core web-development concepts — including the bugs that happened along the
        way and what each one teaches.
    </p>
    <p class="mt-3 text-neutral-700 dark:text-neutral-300 leading-relaxed">
        Written for curious beginners and intermediate devs. The chapters build on each other
        loosely, but each stands alone — if one assumes knowledge you don't have yet, skip it and
        come back.
    </p>

    {#each parts as part}
        <section class="mt-10">
            <h2
                class="text-sm font-semibold uppercase tracking-widest text-neutral-500 dark:text-neutral-400"
            >
                {part.title}
            </h2>
            <ul class="mt-4 space-y-4">
                {#each part.chapters as chapter}
                    <li>
                        <a
                            href="/learn/{chapter.slug}"
                            class="group block rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 transition-colors hover:border-neutral-400 dark:hover:border-neutral-600"
                        >
                            <span class="flex items-baseline gap-3">
                                {#if part.title !== 'Appendix'}
                                    <span
                                        class="text-sm font-mono text-neutral-400 dark:text-neutral-500"
                                    >
                                        {String(chapterNumber(chapter.slug)).padStart(2, '0')}
                                    </span>
                                {/if}
                                <span
                                    class="font-semibold text-neutral-900 dark:text-neutral-100 group-hover:text-accent transition-colors"
                                >
                                    {chapter.title}
                                </span>
                            </span>
                            <span
                                class="mt-1 block text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed"
                            >
                                {chapter.description}
                            </span>
                        </a>
                    </li>
                {/each}
            </ul>
        </section>
    {/each}
  </div>
</div>
