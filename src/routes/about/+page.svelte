<script lang="ts">
    import Seo from '$lib/components/Seo.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    let about = $derived(data.about);
    let instagramUrl = $derived(`https://instagram.com/${about.instagram}`);
</script>

<Seo
    title="About"
    description="{about.name} — {about.role.toLowerCase()} based in {about.location}. Original notebook drawings, and how to get in touch."
    path="/about"
/>
<svelte:head>
    {#if !data.published}
        <!-- Draft: belt-and-braces against indexing, though only the owner can load it. -->
        <meta name="robots" content="noindex, nofollow" />
    {/if}
</svelte:head>

<!-- No page background of its own: the layout's <main> already paints
     bg-surface here, which blocks the background video. The reading column
     sits inside .shell without re-centering, so it aligns with the nav logo. -->
<div class="shell pb-20">
    <div class="max-w-3xl pt-10">
        {#if !data.published}
            <!-- Same hairline-with-edge panel as Notice, kept inline so the
                 draft copy stays exactly as written. -->
            <p
                class="mb-8 border border-line/12 border-l-2 border-l-signal bg-surface-raised px-5 py-4 font-body text-body text-content"
            >
                <strong>Draft — only you can see this.</strong> Edit the text in
                <code>src/lib/about.ts</code>, then set
                <code>ABOUT_PUBLISHED = true</code> in that file and push to main to put it live.
            </p>
        {/if}

        <h1 class="text-display text-content">{about.name}</h1>
        <p class="mt-3 font-mono text-label uppercase text-content-dim">
            {about.role}{#if about.role && about.location}&nbsp;&middot;&nbsp;{/if}{about.location}
        </p>

        <section class="mt-8 space-y-4">
            {#each about.bio as paragraph}
                <p class="max-w-prose font-body text-body text-content">{paragraph}</p>
            {/each}
        </section>

        <hr class="my-10 border-line/12" />

        <section>
            <h2 class="font-mono text-label uppercase text-content-dim">
                Contact
            </h2>

            <ul class="mt-4 space-y-3">
                {#if about.email}
                    <li class="flex items-center gap-3">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke-width="1.5"
                            stroke="currentColor"
                            aria-hidden="true"
                            class="h-5 w-5 shrink-0 text-content-dim"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                            />
                        </svg>
                        <a
                            href="mailto:{about.email}"
                            class="break-all text-signal underline transition-colors hover:text-signal-strong"
                        >
                            {about.email}
                        </a>
                    </li>
                {/if}

                {#if about.instagram}
                    <li class="flex items-center gap-3">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke-width="1.5"
                            stroke="currentColor"
                            aria-hidden="true"
                            class="h-5 w-5 shrink-0 text-content-dim"
                        >
                            <rect x="3" y="3" width="18" height="18" rx="5" />
                            <circle cx="12" cy="12" r="4" />
                            <circle
                                cx="17.25"
                                cy="6.75"
                                r="0.75"
                                fill="currentColor"
                                stroke="none"
                            />
                        </svg>
                        <a
                            href={instagramUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-signal underline transition-colors hover:text-signal-strong"
                        >
                            @{about.instagram}
                        </a>
                    </li>
                {/if}

                {#if about.location}
                    <li class="flex items-center gap-3">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke-width="1.5"
                            stroke="currentColor"
                            aria-hidden="true"
                            class="h-5 w-5 shrink-0 text-content-dim"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                            />
                        </svg>
                        <span class="text-content">{about.location}</span>
                    </li>
                {/if}
            </ul>

            {#if about.contactNote}
                <p class="mt-6 max-w-prose font-body text-body text-content-dim">
                    {about.contactNote}
                </p>
            {/if}
        </section>

        <hr class="my-10 border-line/12" />

        <a
            href="/drawing"
            class="font-mono text-label uppercase text-signal transition-colors hover:text-signal-strong"
        >
            See the drawings &rarr;
        </a>
    </div>
</div>
