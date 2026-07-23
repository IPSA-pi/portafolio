<script lang="ts">
    import { onMount } from "svelte";
    import { page } from "$app/stores";
    import { replaceState } from "$app/navigation";
    import Seo from "$lib/components/Seo.svelte";
    import { removeFromCart } from "$lib/stores/cart";
    import { clearPendingCheckout } from "$lib/utils/checkoutReturn";

    let { data } = $props();
    let notebooks = $derived(data.notebooks);
    let showSuccess = $state(false);
    let showPending = $state(false);

    onMount(async () => {
        const params = $page.url.searchParams;
        const sessionId = params.get("session_id");
        if (params.get("success") === "true" && sessionId) {
            // Payment went through or not — nothing to release either way,
            // just forget the marker so a stray Back navigation later doesn't
            // fire a spurious (harmless, but pointless) cancel call.
            clearPendingCheckout();

            try {
                const response = await fetch(`/api/checkout/session-status?session_id=${encodeURIComponent(sessionId)}`);
                const status = await response.json();
                if (status.paid) {
                    showSuccess = true;
                    // Only the slugs this session actually paid for — not the
                    // whole cart, which may hold items added since checkout.
                    for (const slug of status.slugs as string[]) removeFromCart(slug);
                } else {
                    // Delayed payment method (e.g. OXXO/bank transfer) or a
                    // hand-crafted session_id — either way, don't claim success
                    // and don't touch the cart.
                    showPending = true;
                }
            } catch (e) {
                console.error("Error verifying checkout session:", e);
                showPending = true;
            }

            const url = new URL($page.url);
            url.searchParams.delete("success");
            url.searchParams.delete("session_id");
            replaceState(url, {});
        }
    });
</script>

<Seo
    title="Drawings"
    description="Browse notebooks of original drawings by Ian Sebelius — each page available as a one-of-a-kind original."
    path="/drawing"
/>

<div class="container mx-auto px-4 py-8">
    {#if showSuccess}
        <div class="mb-8 p-4 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded-lg border border-green-200 dark:border-green-800 flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-500">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p class="font-medium">Thank you for your purchase! You will receive an email confirmation shortly.</p>
        </div>
    {:else if showPending}
        <div class="mb-8 p-4 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 rounded-lg border border-amber-200 dark:border-amber-800 flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-500">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p class="font-medium">Your payment is processing — you'll receive an email once it's confirmed.</p>
        </div>
    {/if}

    <div class="mb-12">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
            Drawings
        </h1>
        <p class="mt-2 text-gray-600 dark:text-gray-400">
            Select a notebook to view.
        </p>

        <!-- View toggle: Notebooks (this page) ⇄ All Drawings (flat feed) -->
        <div class="mt-6 inline-flex rounded-full border border-black/10 dark:border-white/15 p-1 text-sm">
            <span class="px-4 py-1.5 rounded-full bg-black text-white dark:bg-white dark:text-black font-medium">
                Notebooks
            </span>
            <a
                href="/drawing/feed"
                class="px-4 py-1.5 rounded-full text-black/50 dark:text-white/50 hover:text-accent dark:hover:text-accent transition-colors"
            >
                All Drawings
            </a>
        </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-12">
        {#each notebooks as notebook}
            <a href="/drawing/{notebook.slug}" class="group flex flex-col items-center text-center">
                <div class="relative w-full max-w-xs md:max-w-[160px] aspect-[3/4]">
                    <img
                        src={notebook.cover}
                        alt="Cover of notebook {notebook.title}"
                        class="absolute inset-0 w-full h-full object-cover transition-[transform,opacity] duration-500 group-hover:scale-105 drop-shadow-xl opacity-0"
                        loading="lazy"
                        onload={(e) => (e.currentTarget as HTMLImageElement).classList.replace('opacity-0', 'opacity-100')}
                    />
                </div>
                <span class="mt-3 text-sm font-medium text-gray-900 dark:text-white group-hover:text-accent transition-colors">
                    {notebook.title}
                </span>
            </a>
        {/each}
    </div>
</div>
