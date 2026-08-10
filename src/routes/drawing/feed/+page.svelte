<script lang="ts">
    import Feed from '$lib/components/Feed.svelte';
    import Gallery from '$lib/components/Gallery.svelte';
    import Seo from '$lib/components/Seo.svelte';
    import PageHeader from '$lib/components/PageHeader.svelte';
    import { chronologyKey } from '$lib/utils/chronology';
    import { seededShuffle } from '$lib/utils/shuffle';
    import { viewerOpen } from '$lib/stores/viewer';
    import type { ArtworkImage as Img } from '$lib/utils/artwork';

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

    // One place decides segment styling, so the active/inactive rules can't
    // drift between the three control groups.
    const SEGMENT = 'border-b-2 px-4 py-2 font-mono text-label uppercase transition-colors';
    const segment = (active: boolean) =>
        `${SEGMENT} ${active
            ? 'border-signal bg-surface-raised text-content'
            : 'border-transparent text-content-dim hover:text-signal'}`;
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
    <div class="shell pb-20">
        <!-- The bit-rule encodes what's actually on screen, so it re-reads on
             every sort, filter and keystroke. `countMax` pins the bit width to
             the full set so the rule doesn't resize while you type. -->
        <PageHeader
            eyebrow="Original drawings"
            title="All drawings"
            count={visible.length}
            countMax={data.images.length}
            countUnit="shown"
        >
            Every page from every notebook, in one view. Sort it, shuffle it, or narrow
            it to what's still available.
        </PageHeader>

        <!-- View toggle: Notebooks ⇄ All Drawings (this page) -->
        <div class="mt-2 mb-6 inline-flex border border-line/15">
            <a
                href="/drawing"
                class="border-b-2 border-transparent px-5 py-2 font-mono text-label uppercase text-content-dim transition-colors hover:text-signal"
            >
                Notebooks
            </a>
            <span class="border-b-2 border-l border-signal border-l-line/15 bg-surface-raised px-5 py-2 font-mono text-label uppercase text-content">
                All drawings
            </span>
        </div>

        <!-- Filter bar: order + availability + text search -->
        <div class="mb-8 flex flex-wrap items-center gap-3">
            <div class="inline-flex border border-line/15">
                <button type="button" aria-pressed={sort === 'newest'} onclick={() => (sort = 'newest')} class={segment(sort === 'newest')}>
                    Newest
                </button>
                <button type="button" aria-pressed={sort === 'oldest'} onclick={() => (sort = 'oldest')} class="{segment(sort === 'oldest')} border-l border-l-line/15">
                    Oldest
                </button>
                <button
                    type="button"
                    aria-pressed={sort === 'shuffle'}
                    onclick={pickShuffle}
                    title={sort === 'shuffle' ? 'Shuffle again' : 'Random order'}
                    class="{segment(sort === 'shuffle')} inline-flex items-center gap-2 border-l border-l-line/15"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        class="h-3.5 w-3.5"
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

            <div class="inline-flex border border-line/15">
                {#each AVAILABILITY_OPTIONS as opt, i}
                    <button
                        type="button"
                        aria-pressed={availability === opt.value}
                        onclick={() => (availability = opt.value)}
                        class="{segment(availability === opt.value)} {i > 0 ? 'border-l border-l-line/15' : ''}"
                    >
                        {opt.label}
                    </button>
                {/each}
            </div>

            <input
                type="search"
                bind:value={query}
                placeholder="Search notebook or title"
                aria-label="Search drawings by notebook or title"
                class="min-w-0 flex-1 border border-line/15 bg-transparent px-4 py-2 font-mono text-label uppercase text-content transition-colors placeholder:text-content-dim focus:border-signal focus:outline-none sm:w-64 sm:flex-none"
            />
        </div>

        {#if visible.length === 0}
            <!-- An empty screen is an invitation to act, so each case says what
                 to do next rather than only what's missing. -->
            <div class="border border-line/12 bg-surface-raised px-6 py-16 text-center">
                {#if query.trim()}
                    <p class="font-body text-body text-content">No drawing matches “{query}”.</p>
                    <button
                        type="button"
                        onclick={() => (query = '')}
                        class="mt-3 font-mono text-label uppercase text-signal transition-colors hover:text-signal-strong"
                    >
                        Clear the search
                    </button>
                {:else if availability === 'sold'}
                    <p class="font-body text-body text-content">Nothing has sold yet — every drawing is still available.</p>
                    <button
                        type="button"
                        onclick={() => (availability = 'available')}
                        class="mt-3 font-mono text-label uppercase text-signal transition-colors hover:text-signal-strong"
                    >
                        Show what's available
                    </button>
                {:else}
                    <p class="font-body text-body text-content">Every drawing is spoken for right now.</p>
                    <button
                        type="button"
                        onclick={() => (availability = 'all')}
                        class="mt-3 font-mono text-label uppercase text-signal transition-colors hover:text-signal-strong"
                    >
                        Show all drawings
                    </button>
                {/if}
            </div>
        {:else}
            <Gallery images={visible} onOpen={(i) => (openIndex = i)} />
        {/if}
    </div>
{/if}
