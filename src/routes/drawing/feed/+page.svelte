<script lang="ts">
    import Feed from '$lib/components/Feed.svelte';
    import Gallery from '$lib/components/Gallery.svelte';
    import Seo from '$lib/components/Seo.svelte';
    import { chronologyKey } from '$lib/utils/chronology';
    import { seededShuffle } from '$lib/utils/shuffle';
    import { viewerOpen } from '$lib/stores/viewer';

    type Img = { original: string; sm: string; md: string; lg: string; slug: string; notebook?: string };

    let { data } = $props();

    type Availability = 'all' | 'available' | 'sold';
    const AVAILABILITY_OPTIONS: { value: Availability; label: string }[] = [
        { value: 'all', label: 'All' },
        { value: 'available', label: 'Available' },
        { value: 'sold', label: 'Sold' }
    ];

    let sort = $state<'newest' | 'oldest' | 'shuffle'>('newest');
    let availability = $state<Availability>('all');
    let query = $state('');
    // Bumped on every press of the Shuffle button. Starts at a fixed value so
    // the server render and the first client render agree; shuffle only ever
    // takes effect after a click.
    let shuffleSeed = $state(0);
    // null = show the grid; a number = the vertical viewer is open at that index
    // into the currently visible (sorted + filtered) list.
    let openIndex = $state<number | null>(null);

    // The nav and footer are chrome the grid wants and the immersive viewer
    // doesn't; the layout reads this store to hide them while it's open.
    $effect(() => {
        viewerOpen.set(openIndex !== null);
        return () => viewerOpen.set(false);
    });

    function pickShuffle() {
        // Pressing Shuffle while it's already active re-randomises, so the
        // one control both selects the mode and reshuffles.
        shuffleSeed = Math.floor(Math.random() * 2 ** 31);
        sort = 'shuffle';
    }

    // Unknown notebooks (no yymmdd, not one of the six legacy) sort as oldest so
    // a bad key never produces NaN comparisons that destabilise the sort.
    function key(notebook: string | undefined): number {
        const k = notebook ? chronologyKey(notebook) : NaN;
        return Number.isFinite(k) ? k : -1;
    }

    // Availability comes from the products map: only priced (listed) drawings
    // have an entry, and `reserved` is an active checkout hold. So "available"
    // means listed, unsold and un-held; an unlisted drawing matches neither
    // filter and shows only under "All".
    function matchesAvailability(slug: string): boolean {
        if (availability === 'all') return true;
        const p = data.products[slug];
        if (availability === 'sold') return !!p?.sold;
        return !!p && !p.sold && !p.reserved;
    }

    // Ordering happens before filtering so that narrowing the list never
    // reshuffles what's left — the shuffle is a permutation of the full set
    // that filtering just takes a subsequence of.
    //
    // For newest/oldest the server hands us drawings in display_order
    // (unshuffled) and a *stable* sort by the chronology key groups them by
    // notebook while preserving each notebook's own page order; flipping
    // direction only reorders the notebook groups, never the pages within one.
    let visible = $derived.by(() => {
        const q = query.trim().toLowerCase();
        const base = data.images as Img[];

        let ordered: Img[];
        if (sort === 'shuffle') {
            ordered = seededShuffle(base, shuffleSeed);
        } else {
            ordered = base.slice();
            ordered.sort((a, b) =>
                sort === 'newest' ? key(b.notebook) - key(a.notebook) : key(a.notebook) - key(b.notebook)
            );
        }

        return ordered.filter(
            (im) =>
                matchesAvailability(im.slug) &&
                (!q ||
                    im.slug.toLowerCase().includes(q) ||
                    (im.notebook ?? '').toLowerCase().includes(q))
        );
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
            <p class="mt-2 text-gray-800 dark:text-white">
                Every drawing across all notebooks — sort, shuffle or filter by availability.
            </p>

            <!-- View toggle: Notebooks ⇄ All Drawings (this page) -->
            <div class="mt-6 inline-flex rounded-full border border-black/10 dark:border-white/15 p-1 text-sm">
                <a
                    href="/drawing"
                    class="px-4 py-1.5 rounded-full text-black dark:text-white hover:text-accent dark:hover:text-accent transition-colors"
                >
                    Notebooks
                </a>
                <span class="px-4 py-1.5 rounded-full bg-black text-white dark:bg-white dark:text-black font-medium">
                    All Drawings
                </span>
            </div>
        </div>

        <!-- Filter bar: order + availability + text search -->
        <div class="mb-6 flex flex-wrap items-center gap-3">
            <div class="inline-flex rounded-full border border-black/10 dark:border-white/15 p-1 text-sm">
                <button
                    type="button"
                    aria-pressed={sort === 'newest'}
                    onclick={() => (sort = 'newest')}
                    class="px-4 py-1.5 rounded-full transition-colors {sort === 'newest'
                        ? 'bg-black text-white dark:bg-white dark:text-black font-medium'
                        : 'text-black dark:text-white hover:text-accent dark:hover:text-accent'}"
                >
                    Newest
                </button>
                <button
                    type="button"
                    aria-pressed={sort === 'oldest'}
                    onclick={() => (sort = 'oldest')}
                    class="px-4 py-1.5 rounded-full transition-colors {sort === 'oldest'
                        ? 'bg-black text-white dark:bg-white dark:text-black font-medium'
                        : 'text-black dark:text-white hover:text-accent dark:hover:text-accent'}"
                >
                    Oldest
                </button>
                <button
                    type="button"
                    aria-pressed={sort === 'shuffle'}
                    onclick={pickShuffle}
                    title={sort === 'shuffle' ? 'Shuffle again' : 'Random order'}
                    class="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full transition-colors {sort === 'shuffle'
                        ? 'bg-black text-white dark:bg-white dark:text-black font-medium'
                        : 'text-black dark:text-white hover:text-accent dark:hover:text-accent'}"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        class="h-4 w-4"
                        aria-hidden="true"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M16.5 3.75 20.25 7.5m0 0L16.5 11.25M20.25 7.5H16.5a4.5 4.5 0 0 0-3.6 1.8l-4.8 6.4a4.5 4.5 0 0 1-3.6 1.8H3.75M16.5 12.75l3.75 3.75m0 0-3.75 3.75m3.75-3.75H16.5a4.5 4.5 0 0 1-3.6-1.8M3.75 7.5H4.5a4.5 4.5 0 0 1 3.6 1.8"
                        />
                    </svg>
                    Shuffle
                </button>
            </div>

            <div class="inline-flex rounded-full border border-black/10 dark:border-white/15 p-1 text-sm">
                {#each AVAILABILITY_OPTIONS as opt}
                    <button
                        type="button"
                        aria-pressed={availability === opt.value}
                        onclick={() => (availability = opt.value)}
                        class="px-4 py-1.5 rounded-full transition-colors {availability === opt.value
                            ? 'bg-black text-white dark:bg-white dark:text-black font-medium'
                            : 'text-black dark:text-white hover:text-accent dark:hover:text-accent'}"
                    >
                        {opt.label}
                    </button>
                {/each}
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
            <p class="py-16 text-center text-gray-800 dark:text-white">
                {#if query.trim()}
                    No drawings match “{query}”.
                {:else if availability === 'sold'}
                    No drawings have sold yet.
                {:else}
                    No drawings are available right now.
                {/if}
            </p>
        {:else}
            <Gallery images={visible} onOpen={(i) => (openIndex = i)} />
        {/if}
    </div>
{/if}
