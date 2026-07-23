<script lang="ts">
    import Feed from '$lib/components/Feed.svelte';
    import Gallery from '$lib/components/Gallery.svelte';
    import Seo from '$lib/components/Seo.svelte';
    import { chronologyKey } from '$lib/utils/chronology';

    type Img = { original: string; sm: string; md: string; lg: string; slug: string; notebook?: string };

    let { data } = $props();

    let sort = $state<'newest' | 'oldest'>('newest');
    let query = $state('');
    // null = show the grid; a number = the vertical viewer is open at that index
    // into the currently visible (sorted + filtered) list.
    let openIndex = $state<number | null>(null);

    // Unknown notebooks (no yymmdd, not one of the six legacy) sort as oldest so
    // a bad key never produces NaN comparisons that destabilise the sort.
    function key(notebook: string | undefined): number {
        const k = notebook ? chronologyKey(notebook) : NaN;
        return Number.isFinite(k) ? k : -1;
    }

    // The server hands us drawings in display_order (unshuffled). A *stable* sort
    // by the chronology key groups them by notebook while preserving each
    // notebook's own page order; flipping direction only reorders the notebook
    // groups, never the pages within a notebook.
    let visible = $derived.by(() => {
        const q = query.trim().toLowerCase();
        const base = data.images as Img[];
        const filtered = q
            ? base.filter(
                  (im) =>
                      im.slug.toLowerCase().includes(q) ||
                      (im.notebook ?? '').toLowerCase().includes(q)
              )
            : base.slice();
        filtered.sort((a, b) =>
            sort === 'newest' ? key(b.notebook) - key(a.notebook) : key(a.notebook) - key(b.notebook)
        );
        return filtered;
    });
</script>

<Seo
    title="All Drawings"
    description="Every original drawing by Ian Sebelius — browse all notebooks in one filterable, chronological view."
    path="/drawing/feed"
/>

{#if openIndex !== null}
    <Feed
        images={visible}
        products={data.products}
        startIndex={openIndex}
        notebookSlug=""
        mode="all"
        onClose={() => (openIndex = null)}
    />
{:else}
    <div class="container mx-auto px-4 py-8">
        <div class="mb-8">
            <h1 class="text-3xl font-bold text-gray-900 dark:text-white">All Drawings</h1>
            <p class="mt-2 text-gray-600 dark:text-gray-400">
                Every drawing across all notebooks — newest first.
            </p>

            <!-- View toggle: Notebooks ⇄ All Drawings (this page) -->
            <div class="mt-6 inline-flex rounded-full border border-black/10 dark:border-white/15 p-1 text-sm">
                <a
                    href="/drawing"
                    class="px-4 py-1.5 rounded-full text-black/50 dark:text-white/50 hover:text-accent dark:hover:text-accent transition-colors"
                >
                    Notebooks
                </a>
                <span class="px-4 py-1.5 rounded-full bg-black text-white dark:bg-white dark:text-black font-medium">
                    All Drawings
                </span>
            </div>
        </div>

        <!-- Filter bar: sort direction + text search -->
        <div class="mb-6 flex flex-wrap items-center gap-3">
            <div class="inline-flex rounded-full border border-black/10 dark:border-white/15 p-1 text-sm">
                <button
                    type="button"
                    onclick={() => (sort = 'newest')}
                    class="px-4 py-1.5 rounded-full transition-colors {sort === 'newest'
                        ? 'bg-black text-white dark:bg-white dark:text-black font-medium'
                        : 'text-black/50 dark:text-white/50 hover:text-accent dark:hover:text-accent'}"
                >
                    Newest
                </button>
                <button
                    type="button"
                    onclick={() => (sort = 'oldest')}
                    class="px-4 py-1.5 rounded-full transition-colors {sort === 'oldest'
                        ? 'bg-black text-white dark:bg-white dark:text-black font-medium'
                        : 'text-black/50 dark:text-white/50 hover:text-accent dark:hover:text-accent'}"
                >
                    Oldest
                </button>
            </div>

            <input
                type="search"
                bind:value={query}
                placeholder="Search notebook or title…"
                aria-label="Search drawings by notebook or title"
                class="min-w-0 flex-1 sm:flex-none sm:w-64 rounded-full border border-black/10 dark:border-white/15 bg-transparent px-4 py-1.5 text-sm text-gray-900 dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
        </div>

        {#if visible.length === 0}
            <p class="py-16 text-center text-gray-500 dark:text-gray-400">
                No drawings match “{query}”.
            </p>
        {:else}
            <Gallery images={visible} products={data.products} onOpen={(i) => (openIndex = i)} />
        {/if}
    </div>
{/if}
