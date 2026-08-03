<script lang="ts">
    import { onMount } from "svelte";
    import { page } from "$app/stores";
    import { invalidateAll, replaceState } from "$app/navigation";
    import Gallery from "$lib/components/Gallery.svelte";
    import Seo from "$lib/components/Seo.svelte";
    import { removeFromCart } from "$lib/stores/cart";
    import { handleCheckoutReturn, clearPendingCheckout } from "$lib/utils/checkoutReturn";

    let { data } = $props();

    let title = $derived($page.params.slug ?? "Gallery");
    let showSuccess = $state(false);

    onMount(async () => {
        const params = $page.url.searchParams;
        if (params.get("success") === "true") {
            // The server-side optimistic sold-marking in loadNotebook already
            // gates on session.payment_status === 'paid', so the drawing data
            // itself is honest — this banner just mirrors that outcome.
            showSuccess = true;
            // Payment went through — nothing to release, just forget the marker.
            clearPendingCheckout();
            // The purchased drawing may also have been sitting in the cart —
            // drop it there too so the cart doesn't try to sell it again.
            if (params.get("drawing")) removeFromCart(params.get("drawing")!);

            const url = new URL($page.url);
            url.searchParams.delete("success");
            url.searchParams.delete("drawing");
            url.searchParams.delete("session_id");
            replaceState(url, {});
        }

        // Covers both the explicit ?canceled=true redirect AND a buyer who
        // used Back/closed the tab without hitting that URL.
        const released = await handleCheckoutReturn($page.url);
        if (released) await invalidateAll();
    });
</script>

<Seo
    {title}
    image={$page.params.slug ? `/og/${$page.params.slug}.jpg` : undefined}
    path={$page.url.pathname}
/>

<div class="container mx-auto px-4 py-8">
    <div class="mb-8 flex items-baseline gap-4">
        <a
            href="/drawing"
            class="text-sm text-gray-800 dark:text-white hover:text-black dark:hover:text-accent transition-colors"
            >← Back</a
        >
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
            {title}
        </h1>
    </div>

    {#if showSuccess}
        <div class="mb-8 p-4 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded-lg border border-green-200 dark:border-green-800 flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-500">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p class="font-medium">Thank you for your purchase! You will receive an email confirmation shortly.</p>
        </div>
    {/if}

    <Gallery images={data.images} notebookSlug={data.slug} />
</div>
