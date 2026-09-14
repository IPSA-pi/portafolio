<script lang="ts">
    import Seo from '$lib/components/Seo.svelte';

    let { data } = $props();
</script>

<Seo
    title="{data.title} — Learn"
    description={data.description}
    path="/learn/{data.slug}"
/>

<!-- No page background of its own: the layout's <main> already paints
     bg-surface on this route. Same wrapper as the /learn index — .shell for
     the gutter, a left-aligned reading column inside it. -->
<div class="shell pt-10 pb-20">
  <div class="max-w-3xl">
    <nav class="mb-8 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <a
            href="/learn"
            class="font-mono text-label uppercase text-content-dim transition-colors hover:text-signal"
            >← Learn</a
        >
        <span aria-hidden="true" class="font-mono text-label text-content-dim/60">/</span>
        <span class="font-mono text-label uppercase text-content-dim">{data.part}</span>
    </nav>

    <!--
      The chapter HTML is rendered from its Markdown source at build time (see
      +page.server.ts). Tailwind Typography's `prose` lays out the generated
      HTML; `prose-site` (app.css) points its palette at the design tokens, so
      it flips with the theme without `dark:prose-invert`. Shiki code blocks
      carry their own dark background in both themes.
    -->
    <article
        class="prose prose-site max-w-none font-body text-[1.0625rem]
               prose-headings:font-sans prose-table:font-sans
               prose-headings:scroll-mt-24 prose-a:text-signal hover:prose-a:text-signal-strong
               prose-pre:rounded-none prose-pre:border prose-pre:border-line/15 prose-pre:p-4 prose-pre:overflow-x-auto
               prose-code:before:content-none prose-code:after:content-none"
    >
        {@html data.html}
    </article>

    <!-- Prev/next as a segmented control (the pattern from /drawing/feed). An
         empty cell holds the missing side so Next stays on the right. -->
    <nav class="mt-12 grid grid-cols-2 border border-line/15">
        {#if data.prev}
            <a
                href="/learn/{data.prev.slug}"
                class="group border-b-2 border-transparent px-4 py-3 transition-colors hover:border-b-signal hover:bg-surface-raised"
            >
                <span class="block font-mono text-label uppercase text-content-dim">Previous</span>
                <span class="mt-2 block text-meta text-content transition-colors group-hover:text-signal">← {data.prev.title}</span>
            </a>
        {:else}
            <span></span>
        {/if}
        {#if data.next}
            <a
                href="/learn/{data.next.slug}"
                class="group border-b-2 border-l border-transparent border-l-line/15 px-4 py-3 text-right transition-colors hover:border-b-signal hover:bg-surface-raised"
            >
                <span class="block font-mono text-label uppercase text-content-dim">Next</span>
                <span class="mt-2 block text-meta text-content transition-colors group-hover:text-signal">{data.next.title} →</span>
            </a>
        {:else}
            <span class="border-l border-l-line/15"></span>
        {/if}
    </nav>
  </div>
</div>
