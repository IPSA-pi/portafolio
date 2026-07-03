<script lang="ts">
    import { onMount } from "svelte";
    import { page } from "$app/stores";
    import { invalidateAll, replaceState } from "$app/navigation";
    import Gallery from "$lib/components/Gallery.svelte";
    import Seo from "$lib/components/Seo.svelte";
    import { NOTEBOOKS_BY_SLUG } from "$lib/notebooks";

    let { data } = $props();

    let notebook = $derived(NOTEBOOKS_BY_SLUG[$page.params.slug ?? ""]);
    let title = $derived($page.params.slug ?? "Gallery");

    onMount(async () => {
        const params = $page.url.searchParams;
        if (params.get("canceled") === "true" && params.get("session_id")) {
            try {
                await fetch("/api/checkout/cancel", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sessionId: params.get("session_id") }),
                });
            } catch (e) {
                console.error("Error releasing canceled reservation:", e);
            }
            await invalidateAll();
            const url = new URL($page.url);
            url.searchParams.delete("canceled");
            url.searchParams.delete("session_id");
            replaceState(url, {});
        }
    });
</script>

<Seo
    {title}
    description={notebook?.description}
    image={notebook ? `/og/${notebook.slug}.jpg` : undefined}
    path={$page.url.pathname}
/>

<div class="container mx-auto px-4 py-8">
    <div class="mb-8 flex items-baseline gap-4">
        <a
            href="/drawing"
            class="text-sm text-gray-500 hover:text-black dark:hover:text-white transition-colors"
            >← Back</a
        >
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
            {title}
        </h1>
    </div>

    {#if $page.url.searchParams.has('success')}
        <div class="mb-8 p-4 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded-lg border border-green-200 dark:border-green-800 flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-500">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p class="font-medium">Thank you for your purchase! You will receive an email confirmation shortly.</p>
        </div>
    {/if}

    <Gallery images={data.images} products={data.products} notebookSlug={data.slug} />
</div>
