<script lang="ts">
    import { SvelteSet } from 'svelte/reactivity';
    import Seo from '$lib/components/Seo.svelte';
    import type { Release, ReleaseStatus } from '$lib/server/supabase';

    let { data } = $props();

    // Local mutable copy so status changes update the UI optimistically.
    let releases = $state<Release[]>(data.releases);

    let statusFilter = $state<'all' | ReleaseStatus>('all');
    let sourceFilter = $state<'all' | string>('all');
    let availableOnly = $state(false);
    let spotifyOnly = $state(false);
    let selected = new SvelteSet<string>();
    let copied = $state<string | null>(null); // id (or 'selected') most recently copied

    const STATUSES: ReleaseStatus[] = ['new', 'liked', 'queued', 'unavailable', 'dismissed'];

    const STATUS_STYLES: Record<ReleaseStatus, string> = {
        new: 'bg-accent/15 text-accent',
        liked: 'bg-pink-500/15 text-pink-500',
        queued: 'bg-emerald-500/15 text-emerald-500',
        unavailable: 'bg-neutral-500/15 text-neutral-400',
        dismissed: 'bg-neutral-500/10 text-neutral-500 line-through'
    };

    let sources = $derived([...new Set(releases.flatMap((r) => r.sources ?? [r.source]))].sort());

    let filtered = $derived(
        releases.filter(
            (r) =>
                (statusFilter === 'all' || r.status === statusFilter) &&
                (sourceFilter === 'all' || (r.sources ?? [r.source]).includes(sourceFilter)) &&
                (!availableOnly || r.tidal_available === true) &&
                (!spotifyOnly || r.spotify_available === true)
        )
    );

    function label(r: Release): string {
        return `${r.artist} — ${r.title}`;
    }

    function tidalUrl(r: Release): string {
        if (r.tidal_album_url) return r.tidal_album_url;
        return `https://tidal.com/search?q=${encodeURIComponent(`${r.artist} ${r.title}`)}`;
    }

    function spotifyUrl(r: Release): string {
        if (r.spotify_album_url) return r.spotify_album_url;
        return `https://open.spotify.com/search/${encodeURIComponent(`${r.artist} ${r.title}`)}`;
    }

    function ytMusicUrl(r: Release): string {
        return `https://music.youtube.com/search?q=${encodeURIComponent(`${r.artist} ${r.title}`)}`;
    }

    async function copy(text: string, key: string) {
        try {
            await navigator.clipboard.writeText(text);
            copied = key;
            setTimeout(() => {
                if (copied === key) copied = null;
            }, 1500);
        } catch {
            /* clipboard unavailable */
        }
    }

    function copySelected() {
        const text = releases
            .filter((r) => selected.has(r.id))
            .map(label)
            .join('\n');
        if (text) copy(text, 'selected');
    }

    async function setStatus(r: Release, status: ReleaseStatus) {
        const prev = r.status;
        r.status = status; // optimistic
        const res = await fetch('/new-music/status', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: r.id, status })
        });
        if (!res.ok) r.status = prev; // revert on failure
    }

    function toggle(id: string) {
        if (selected.has(id)) selected.delete(id);
        else selected.add(id);
    }
</script>

<Seo
    title="New Music"
    description="A worklist of new music releases scraped from nodata.tv and other sources."
    path="/new-music"
/>

<div class="min-h-screen bg-gray-100 dark:bg-neutral-950">
    <div class="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <header class="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
                <h1 class="text-2xl font-bold tracking-tight text-black dark:text-white">New Music</h1>
                <p class="text-sm text-black/50 dark:text-white/50">
                    {filtered.length} of {releases.length} releases
                </p>
            </div>

            <!-- Filters -->
            <div class="flex flex-wrap items-center gap-2 text-sm">
                <select
                    bind:value={statusFilter}
                    class="rounded-md border border-black/10 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1 text-black dark:text-white"
                >
                    <option value="all">All statuses</option>
                    {#each STATUSES as s}
                        <option value={s}>{s}</option>
                    {/each}
                </select>
                {#if sources.length > 1}
                    <select
                        bind:value={sourceFilter}
                        class="rounded-md border border-black/10 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1 text-black dark:text-white"
                    >
                        <option value="all">All sources</option>
                        {#each sources as s}
                            <option value={s}>{s}</option>
                        {/each}
                    </select>
                {/if}
                <label class="flex items-center gap-1.5 text-black/60 dark:text-white/60">
                    <input type="checkbox" bind:checked={availableOnly} class="h-3.5 w-3.5 accent-accent" />
                    Tidal only
                </label>
                <label class="flex items-center gap-1.5 text-black/60 dark:text-white/60">
                    <input type="checkbox" bind:checked={spotifyOnly} class="h-3.5 w-3.5 accent-accent" />
                    Spotify only
                </label>
            </div>
        </header>

        <!-- Batch bar -->
        {#if selected.size > 0}
            <div
                class="sticky top-16 z-10 mb-3 flex items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent/10 px-4 py-2 text-sm backdrop-blur-sm"
            >
                <span class="text-black dark:text-white">{selected.size} selected</span>
                <div class="flex items-center gap-2">
                    <button
                        onclick={copySelected}
                        class="rounded-md bg-accent px-3 py-1 font-medium text-white hover:bg-accent-hover transition-colors"
                    >
                        {copied === 'selected' ? 'Copied!' : 'Copy all'}
                    </button>
                    <button
                        onclick={() => selected.clear()}
                        class="text-black/50 dark:text-white/50 hover:text-accent transition-colors"
                    >
                        Clear
                    </button>
                </div>
            </div>
        {/if}

        <!-- List -->
        {#if filtered.length === 0}
            <p class="py-16 text-center text-black/40 dark:text-white/40">
                {#if releases.length === 0}
                    No releases. Run <code class="font-mono">npm run scrape</code> to populate.
                {:else}
                    No releases match these filters.
                {/if}
            </p>
        {:else}
            <ul class="space-y-2">
                {#each filtered as r (r.id)}
                    <li
                        class="group flex flex-col gap-2 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 p-3 sm:flex-row sm:items-start sm:gap-4"
                        class:ring-1={r.status === 'new'}
                        class:ring-accent={r.status === 'new'}
                    >
                        <input
                            type="checkbox"
                            checked={selected.has(r.id)}
                            onchange={() => toggle(r.id)}
                            class="h-4 w-4 shrink-0 accent-accent"
                            aria-label="Select {label(r)}"
                        />

                        <!-- Main info -->
                        <div class="min-w-0 flex-1">
                            <div class="flex items-start justify-between gap-2">
                                <div class="min-w-0">
                                    <p class="truncate font-semibold text-black dark:text-white">{r.artist}</p>
                                    <p class="truncate text-sm text-black/80 dark:text-white/80">{r.title}</p>
                                    {#if r.label || r.release_year}
                                        <p class="mt-0.5 text-xs text-black/45 dark:text-white/45">
                                            {[r.label, r.release_year].filter(Boolean).join(' · ')}
                                        </p>
                                    {/if}
                                    {#if r.genre?.length}
                                        <div class="mt-1.5 flex flex-wrap gap-1">
                                            {#each r.genre as g}
                                                <span class="rounded px-1.5 py-0.5 text-[10px] bg-black/5 dark:bg-white/10 text-black/55 dark:text-white/50">{g}</span>
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                                <div class="shrink-0 flex flex-col items-end gap-1.5 pt-0.5">
                                    <span class="rounded px-1.5 py-0.5 text-[11px] font-medium {STATUS_STYLES[r.status]}">{r.status}</span>
                                    <span class="text-[10px] text-black/30 dark:text-white/30 leading-none">
                                        {(r.sources ?? [r.source]).join(' · ')}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <!-- Actions: links left, status picker pinned to right edge -->
                        <div class="flex w-full items-center gap-1.5 sm:flex-1">
                            <a
                                href={ytMusicUrl(r)}
                                target="_blank"
                                rel="noopener noreferrer"
                                class="rounded-md border border-black/10 dark:border-white/15 px-2 py-1 text-xs text-black/60 dark:text-white/60 hover:text-accent hover:border-accent transition-colors"
                            >
                                YT Music ↗
                            </a>
                            {#if r.tidal_available}
                                <a
                                    href={tidalUrl(r)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="rounded-md border border-black/10 dark:border-white/15 px-2 py-1 text-xs text-black/60 dark:text-white/60 hover:text-accent hover:border-accent transition-colors"
                                >
                                    Tidal ✓
                                </a>
                            {/if}
                            {#if r.spotify_available}
                                <a
                                    href={spotifyUrl(r)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="rounded-md border border-black/10 dark:border-white/15 px-2 py-1 text-xs text-black/60 dark:text-white/60 hover:text-accent hover:border-accent transition-colors"
                                >
                                    Spotify ✓
                                </a>
                            {/if}
                            <select
                                value={r.status}
                                onchange={(e) => setStatus(r, e.currentTarget.value as ReleaseStatus)}
                                class="ml-auto rounded-md border border-black/10 dark:border-white/15 bg-white dark:bg-neutral-900 px-1.5 py-1 text-xs text-black dark:text-white"
                                aria-label="Set status"
                            >
                                {#each STATUSES as s}
                                    <option value={s}>{s}</option>
                                {/each}
                            </select>
                        </div>
                    </li>
                {/each}
            </ul>
        {/if}
    </div>
</div>
