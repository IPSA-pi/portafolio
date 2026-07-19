<script lang="ts">
    import Seo from '$lib/components/Seo.svelte';

    let { data } = $props();
</script>

<Seo
    title="{data.title} — Learn"
    description={data.description}
    path="/learn/{data.slug}"
/>

<!--
  Full-width solid background blocks the layout's fixed background video so the
  long-form text stays readable. Theme-aware: light gray in light mode, near-black
  in dark mode (matching the prose colors below).
-->
<div class="min-h-screen bg-gray-100 dark:bg-neutral-950">
  <div class="container mx-auto px-4 py-12 max-w-3xl">
    <nav class="mb-8 text-sm">
        <a href="/learn" class="text-accent hover:text-accent-hover">← Learn</a>
        <span class="ml-3 uppercase tracking-widest text-neutral-500 dark:text-neutral-400"
            >{data.part}</span
        >
    </nav>

    <!--
      The chapter HTML is rendered from its Markdown source at build time (see
      +page.server.ts). Tailwind Typography's `prose` styles the generated HTML;
      `dark:prose-invert` flips it for dark mode. Shiki code blocks carry their
      own dark background.
    -->
    <article
        class="prose prose-neutral dark:prose-invert max-w-none
               prose-headings:scroll-mt-24 prose-a:text-accent hover:prose-a:text-accent-hover
               prose-pre:rounded-lg prose-pre:p-4 prose-pre:overflow-x-auto
               prose-code:before:content-none prose-code:after:content-none"
    >
        {@html data.html}
    </article>

    <nav
        class="mt-12 flex items-stretch justify-between gap-4 border-t border-neutral-200 dark:border-neutral-800 pt-6"
    >
        {#if data.prev}
            <a
                href="/learn/{data.prev.slug}"
                class="max-w-[48%] text-sm text-neutral-600 dark:text-neutral-400 hover:text-accent transition-colors"
            >
                <span class="block text-xs uppercase tracking-widest">Previous</span>
                <span class="mt-1 block font-semibold">← {data.prev.title}</span>
            </a>
        {:else}
            <span></span>
        {/if}
        {#if data.next}
            <a
                href="/learn/{data.next.slug}"
                class="max-w-[48%] text-right text-sm text-neutral-600 dark:text-neutral-400 hover:text-accent transition-colors"
            >
                <span class="block text-xs uppercase tracking-widest">Next</span>
                <span class="mt-1 block font-semibold">{data.next.title} →</span>
            </a>
        {/if}
    </nav>
  </div>
</div>
