<script lang="ts">
    import Seo from '$lib/components/Seo.svelte';
    import PageHeader from '$lib/components/PageHeader.svelte';
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

<!-- No page background of its own: the layout's <main> already paints
     bg-surface on this route, which blocks the fixed background video. The
     reading column sits inside .shell without re-centering, so it stays
     aligned with the nav logo. -->
<div class="shell pb-20">
  <div class="max-w-3xl">
    <PageHeader
        eyebrow="Learn"
        title="How this site is built"
        count={chapters.length}
        countUnit="chapters"
    >
        <p>
            This is the conceptual companion to the site's
            <a
                href="https://github.com/IPSA-pi/portafolio"
                target="_blank"
                rel="noopener noreferrer"
                class="text-signal underline transition-colors hover:text-signal-strong">source code</a
            >: it explains <em>why</em> the site is built the way it is, and uses the real code as a
            way to learn core web-development concepts — including the bugs that happened along the
            way and what each one teaches.
        </p>
        <p class="mt-3">
            Written for curious beginners and intermediate devs. The chapters build on each other
            loosely, but each stands alone — if one assumes knowledge you don't have yet, skip it and
            come back.
        </p>
    </PageHeader>

    {#each parts as part}
        <section class="mt-10">
            <h2 class="font-mono text-label uppercase text-content-dim">
                {part.title}
            </h2>
            <ul class="mt-4 space-y-3">
                {#each part.chapters as chapter}
                    <li>
                        <a
                            href="/learn/{chapter.slug}"
                            class="group block border border-line/15 bg-surface-raised p-4 transition-colors hover:border-line/30"
                        >
                            <span class="flex items-baseline gap-3">
                                {#if part.title !== 'Appendix'}
                                    <span class="font-mono text-meta text-content-dim">
                                        {String(chapterNumber(chapter.slug)).padStart(2, '0')}
                                    </span>
                                {/if}
                                <span class="text-title text-content transition-colors group-hover:text-signal">
                                    {chapter.title}
                                </span>
                            </span>
                            <span class="mt-1 block font-body text-body text-content-dim">
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
