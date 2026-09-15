<script lang="ts">
    import { SvelteSet } from 'svelte/reactivity';
    import Seo from '$lib/components/Seo.svelte';
    import type { Release, ReleaseStatus } from '$lib/server/supabase';
    import {
        musicWorklist,
        setVisitorStatus,
        serializeWorklist,
        parseWorklistFile,
        VISITOR_STATUSES,
        type VisitorStatus
    } from '$lib/stores/musicWorklist';

    let { data } = $props();

    // Everyone gets the same worklist UI (status picker, filters, batch copy).
    // The difference is where a status lands: the owner writes the shared
    // releases.status column; a visitor writes their personal per-browser
    // worklist (localStorage). See hooks.server.ts for isAdmin.
    let isAdmin = $derived(Boolean(data.isAdmin));

    // Local mutable copy so status changes update the UI optimistically.
    // svelte-ignore state_referenced_locally
    let releases = $state<Release[]>(data.releases);

    let statusFilter = $state<string>('all');
    let sourceFilter = $state<'all' | string>('all');
    let availableOnly = $state(false);
    let spotifyOnly = $state(false);
    let appleOnly = $state(false);
    let selected = new SvelteSet<string>();
    let copied = $state<string | null>(null); // id (or 'selected') most recently copied
    let importNote = $state<string | null>(null);
    let importInput = $state<HTMLInputElement | null>(null);

    const STATUSES: ReleaseStatus[] = ['new', 'liked', 'queued', 'unavailable', 'dismissed'];

    // Badge text stays on the plain foreground token; the tint carries the
    // status. liked/queued keep their pink/emerald hues on purpose. The rest
    // use tokens, so they flip with the theme.
    const STATUS_STYLES: Record<ReleaseStatus, string> = {
        new: 'bg-signal/15 text-content',
        liked: 'bg-pink-500/15 text-pink-500',
        queued: 'bg-emerald-500/15 text-emerald-500',
        unavailable: 'bg-content-dim/15 text-content',
        dismissed: 'bg-content-dim/10 text-content line-through'
    };

    // Visitor statuses reuse the owner palette where the meaning matches;
    // "heard" reads as settled/neutral, like the owner's "unavailable".
    const VISITOR_STATUS_STYLES: Record<VisitorStatus, string> = {
        heard: 'bg-content-dim/15 text-content',
        liked: STATUS_STYLES.liked,
        queued: STATUS_STYLES.queued,
        dismissed: STATUS_STYLES.dismissed
    };

    // A visitor's effective status for a row; absence of an entry = 'unheard'.
    function visitorStatus(id: string): VisitorStatus | 'unheard' {
        return $musicWorklist[id] ?? 'unheard';
    }

    let sources = $derived([...new Set(releases.flatMap((r) => r.sources ?? [r.source]))].sort());

    let filtered = $derived(
        releases.filter((r) => {
            const status = isAdmin ? r.status : visitorStatus(r.id);
            return (
                (statusFilter === 'all' || status === statusFilter) &&
                (sourceFilter === 'all' || (r.sources ?? [r.source]).includes(sourceFilter)) &&
                (!availableOnly || r.tidal_available === true) &&
                (!spotifyOnly || r.spotify_available === true) &&
                (!appleOnly || r.apple_available === true)
            );
        })
    );

    function label(r: Release): string {
        return `${r.artist} — ${r.title}`;
    }

    // Prefer the native-app URI schemes so links open Tidal/Spotify directly
    // rather than the browser web player. Both apps register these protocol
    // handlers on desktop and mobile; if the app isn't installed the OS falls
    // back to a prompt. Web-search URLs are kept as-is (no reliable app scheme).
    function tidalUrl(r: Release): string {
        if (r.tidal_album_url) {
            const m = r.tidal_album_url.match(/album\/(\d+)/);
            if (m) return `tidal://album/${m[1]}`;
            return r.tidal_album_url;
        }
        return `https://tidal.com/search?q=${encodeURIComponent(`${r.artist} ${r.title}`)}`;
    }

    function spotifyUrl(r: Release): string {
        if (r.spotify_album_url) {
            const m = r.spotify_album_url.match(/open\.spotify\.com\/(.+)$/);
            if (m) return `spotify:${m[1].split('?')[0].replace(/\//g, ':')}`;
            return r.spotify_album_url;
        }
        return `spotify:search:${encodeURIComponent(`${r.artist} ${r.title}`)}`;
    }

    // Apple is the exception to the scheme rule above: music.apple.com links are
    // universal links that already hand off to the Apple Music app when it's
    // installed, while a `music://` URL just dead-ends in desktop browsers where
    // nothing registers it. So the stored https URL is the better link as-is.
    function appleUrl(r: Release): string {
        if (r.apple_album_url) return r.apple_album_url;
        return `https://music.apple.com/ca/search?term=${encodeURIComponent(`${r.artist} ${r.title}`)}`;
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
        const res = await fetch('/admin/new-music/status', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: r.id, status })
        });
        if (!res.ok) r.status = prev; // revert on failure
    }

    function exportWorklist() {
        const blob = new Blob([serializeWorklist($musicWorklist)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'new-music-worklist.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    async function importWorklist(e: Event) {
        const input = e.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        input.value = ''; // allow re-importing the same file
        if (!file) return;
        const imported = parseWorklistFile(await file.text());
        if (imported === null) {
            importNote = 'Invalid file';
        } else {
            // Merge, imported entries winning — restoring a backup shouldn't
            // wipe statuses set since the export was taken.
            musicWorklist.update((w) => ({ ...w, ...imported }));
            importNote = `Restored ${Object.keys(imported).length} statuses`;
        }
        setTimeout(() => (importNote = null), 2500);
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

<!-- No page background of its own: the layout's <main> already paints
     bg-surface on this route. The column sits inside .shell without
     re-centering, so it aligns with the nav logo. -->
<div class="shell pb-20">
    <div class="max-w-5xl pt-10">
        <header class="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
                <h1 class="text-display text-content">New Music</h1>
                <p class="mt-2 font-mono text-label uppercase text-content-dim">
                    {filtered.length} of {releases.length} releases
                </p>
            </div>

            <!-- Filters -->
            <div class="flex flex-wrap items-center gap-2 text-meta">
                <select
                    bind:value={statusFilter}
                    class="border border-line/15 bg-surface-raised px-2 py-1 text-content"
                >
                    <option value="all">All statuses</option>
                    {#if isAdmin}
                        {#each STATUSES as s}
                            <option value={s}>{s}</option>
                        {/each}
                    {:else}
                        <option value="unheard">unheard</option>
                        {#each VISITOR_STATUSES as s}
                            <option value={s}>{s}</option>
                        {/each}
                    {/if}
                </select>
                {#if sources.length > 1}
                    <select
                        bind:value={sourceFilter}
                        class="border border-line/15 bg-surface-raised px-2 py-1 text-content"
                    >
                        <option value="all">All sources</option>
                        {#each sources as s}
                            <option value={s}>{s}</option>
                        {/each}
                    </select>
                {/if}
                <label class="flex items-center gap-1.5 text-content">
                    <input type="checkbox" bind:checked={availableOnly} class="h-3.5 w-3.5 accent-signal" />
                    Tidal only
                </label>
                <label class="flex items-center gap-1.5 text-content">
                    <input type="checkbox" bind:checked={spotifyOnly} class="h-3.5 w-3.5 accent-signal" />
                    Spotify only
                </label>
                <label class="flex items-center gap-1.5 text-content">
                    <input type="checkbox" bind:checked={appleOnly} class="h-3.5 w-3.5 accent-signal" />
                    Apple only
                </label>
                {#if !isAdmin}
                    <!-- Visitor statuses live only in this browser's localStorage;
                         export/import is the recovery path across devices/wipes. -->
                    <span class="flex items-center gap-3 font-mono text-label uppercase text-content-dim">
                        <button
                            onclick={exportWorklist}
                            class="underline underline-offset-2 transition-colors hover:text-signal"
                            title="Download your statuses as a backup file"
                        >
                            Export
                        </button>
                        <button
                            onclick={() => importInput?.click()}
                            class="underline underline-offset-2 transition-colors hover:text-signal"
                            title="Restore statuses from a backup file"
                        >
                            Import
                        </button>
                        <input
                            bind:this={importInput}
                            type="file"
                            accept=".json,application/json"
                            class="hidden"
                            onchange={importWorklist}
                        />
                        {#if importNote}
                            <span aria-live="polite">{importNote}</span>
                        {/if}
                    </span>
                {/if}
            </div>
        </header>

        <!-- Batch bar -->
        {#if selected.size > 0}
            <div
                class="sticky top-16 z-10 mb-3 flex items-center justify-between gap-3 border border-line/12 border-l-2 border-l-signal bg-surface-raised px-4 py-2"
            >
                <span class="font-mono text-label uppercase text-content">{selected.size} selected</span>
                <div class="flex items-center gap-2">
                    <button
                        onclick={copySelected}
                        class="bg-signal px-3 py-1.5 font-mono text-label uppercase text-surface transition-colors hover:bg-signal-strong"
                    >
                        {copied === 'selected' ? 'Copied!' : 'Copy all'}
                    </button>
                    <button
                        onclick={() => selected.clear()}
                        class="font-mono text-label uppercase text-content-dim transition-colors hover:text-signal"
                    >
                        Clear
                    </button>
                </div>
            </div>
        {/if}

        <!-- List -->
        {#if filtered.length === 0}
            <p class="py-16 text-center font-body text-body text-content-dim">
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
                        class="group flex flex-col gap-2 border border-line/12 bg-surface-raised p-3 transition-opacity sm:flex-row sm:items-start sm:gap-4"
                        class:ring-1={isAdmin && r.status === 'new'}
                        class:ring-signal={isAdmin && r.status === 'new'}
                        class:opacity-50={!isAdmin &&
                            (visitorStatus(r.id) === 'heard' || visitorStatus(r.id) === 'dismissed')}
                    >
                        <input
                            type="checkbox"
                            checked={selected.has(r.id)}
                            onchange={() => toggle(r.id)}
                            class="h-4 w-4 shrink-0 accent-signal"
                            aria-label="Select {label(r)}"
                        />

                        <!-- Main info -->
                        <div class="min-w-0 flex-1">
                            <div class="flex items-start justify-between gap-2">
                                <div class="min-w-0">
                                    <p class="truncate font-medium text-content">{r.title}</p>
                                    <p class="truncate text-meta text-content">{r.artist}</p>
                                    {#if r.label || r.release_year}
                                        <p class="mt-1 font-mono text-label uppercase text-content-dim">
                                            {#if r.label}
                                                <a
                                                    href="https://www.discogs.com/search?q={encodeURIComponent(r.label)}&type=label"
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    class="transition-colors hover:text-signal"
                                                >{r.label}</a>{#if r.release_year} · {/if}
                                            {/if}
                                            {#if r.release_year}{r.release_year}{/if}
                                        </p>
                                    {/if}
                                    {#if r.genre?.length}
                                        <div class="mt-1.5 flex flex-wrap gap-1">
                                            {#each r.genre as g}
                                                <span class="border border-line/12 px-1.5 py-0.5 font-mono text-[10px] text-content-dim">{g}</span>
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                                <div class="shrink-0 flex flex-col items-end gap-1.5 pt-0.5">
                                    {#if isAdmin}
                                        <span class="px-1.5 py-0.5 font-mono text-[11px] {STATUS_STYLES[r.status]}">{r.status}</span>
                                    {:else if $musicWorklist[r.id]}
                                        <span class="px-1.5 py-0.5 font-mono text-[11px] {VISITOR_STATUS_STYLES[$musicWorklist[r.id]]}">{$musicWorklist[r.id]}</span>
                                    {/if}
                                    <span class="font-mono text-[10px] leading-none text-content-dim">
                                        {#each r.sources ?? [r.source] as s, i}
                                            {#if i > 0}<span> · </span>{/if}
                                            {#if r.source_url?.includes(s)}
                                                <a
                                                    href={r.source_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    class="transition-colors hover:text-signal"
                                                >{s}</a>
                                            {:else}
                                                {s}
                                            {/if}
                                        {/each}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <!-- Actions: links left, status picker pinned to right edge -->
                        <!-- Wraps rather than squeezing: with four provider pills the
                             row no longer fits a narrow viewport, and letting flex
                             shrink them breaks each label across two lines. -->
                        <div class="flex w-full flex-wrap items-center gap-1.5 sm:flex-1">
                            <a
                                href={ytMusicUrl(r)}
                                target="_blank"
                                rel="noopener noreferrer"
                                class="shrink-0 whitespace-nowrap border border-line/15 px-2 py-1 font-mono text-label uppercase text-content transition-colors hover:border-signal hover:text-signal"
                            >
                                YT Music ↗
                            </a>
                            {#if r.tidal_available}
                                <a
                                    href={tidalUrl(r)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="shrink-0 whitespace-nowrap border border-line/15 px-2 py-1 font-mono text-label uppercase text-content transition-colors hover:border-signal hover:text-signal"
                                >
                                    Tidal ✓
                                </a>
                            {/if}
                            {#if r.spotify_available}
                                <a
                                    href={spotifyUrl(r)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="shrink-0 whitespace-nowrap border border-line/15 px-2 py-1 font-mono text-label uppercase text-content transition-colors hover:border-signal hover:text-signal"
                                >
                                    Spotify ✓
                                </a>
                            {/if}
                            {#if r.apple_available}
                                <a
                                    href={appleUrl(r)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="shrink-0 whitespace-nowrap border border-line/15 px-2 py-1 font-mono text-label uppercase text-content transition-colors hover:border-signal hover:text-signal"
                                >
                                    Apple ✓
                                </a>
                            {/if}
                            {#if isAdmin}
                                <select
                                    value={r.status}
                                    onchange={(e) => setStatus(r, e.currentTarget.value as ReleaseStatus)}
                                    class="ml-auto border border-line/15 bg-surface px-1.5 py-1 text-meta text-content"
                                    aria-label="Set status"
                                >
                                    {#each STATUSES as s}
                                        <option value={s}>{s}</option>
                                    {/each}
                                </select>
                            {:else}
                                <select
                                    value={$musicWorklist[r.id] ?? ''}
                                    onchange={(e) =>
                                        setVisitorStatus(
                                            r.id,
                                            (e.currentTarget.value || null) as VisitorStatus | null
                                        )}
                                    class="ml-auto border border-line/15 bg-surface px-1.5 py-1 text-meta text-content"
                                    title="Remembered on this device"
                                    aria-label="Set status"
                                >
                                    <option value="">unheard</option>
                                    {#each VISITOR_STATUSES as s}
                                        <option value={s}>{s}</option>
                                    {/each}
                                </select>
                            {/if}
                        </div>
                    </li>
                {/each}
            </ul>
        {/if}
    </div>
</div>
