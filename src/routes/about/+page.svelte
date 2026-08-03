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

<!--
  Full-width solid background blocks the layout's fixed background video so the
  text stays readable, matching /learn and /privacy.
-->
<div class="min-h-screen bg-gray-100 dark:bg-neutral-950">
    <div class="container mx-auto px-4 py-16 max-w-3xl">
        {#if !data.published}
            <p
                class="mb-8 rounded-md border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-neutral-900 dark:text-white"
            >
                <strong>Draft — only you can see this.</strong> Edit the text in
                <code>src/lib/about.ts</code>, then set
                <code>ABOUT_PUBLISHED = true</code> in that file and push to main to put it live.
            </p>
        {/if}

        <h1 class="text-3xl font-bold text-neutral-900 dark:text-white">{about.name}</h1>
        <p class="mt-2 text-sm uppercase tracking-widest text-neutral-800 dark:text-white">
            {about.role}{#if about.role && about.location}&nbsp;&middot;&nbsp;{/if}{about.location}
        </p>

        <section class="mt-8 space-y-4">
            {#each about.bio as paragraph}
                <p class="text-neutral-800 dark:text-white leading-relaxed">{paragraph}</p>
            {/each}
        </section>

        <hr class="my-10 border-neutral-200 dark:border-neutral-800" />

        <section>
            <h2
                class="text-sm font-semibold uppercase tracking-widest text-neutral-800 dark:text-white"
            >
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
                            class="w-5 h-5 shrink-0 text-neutral-800 dark:text-white"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                            />
                        </svg>
                        <a
                            href="mailto:{about.email}"
                            class="text-accent hover:text-accent-hover underline break-all"
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
                            class="w-5 h-5 shrink-0 text-neutral-800 dark:text-white"
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
                            class="text-accent hover:text-accent-hover underline"
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
                            class="w-5 h-5 shrink-0 text-neutral-800 dark:text-white"
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
                        <span class="text-neutral-800 dark:text-white">{about.location}</span>
                    </li>
                {/if}
            </ul>

            {#if about.contactNote}
                <p class="mt-6 text-sm text-neutral-800 dark:text-white leading-relaxed">
                    {about.contactNote}
                </p>
            {/if}
        </section>

        <hr class="my-10 border-neutral-200 dark:border-neutral-800" />

        <a href="/drawing" class="text-accent hover:text-accent-hover underline">
            See the drawings &rarr;
        </a>
    </div>
</div>
