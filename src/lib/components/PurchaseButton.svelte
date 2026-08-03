<script lang="ts">
    import { fade } from 'svelte/transition';
    import { setPendingCheckout } from '$lib/utils/checkoutReturn';
    import { formatPrice } from '$lib/utils/formatPrice';

    interface Props {
        priceId: string;
        price: number;
        slug: string;
        notebookSlug: string;
        sold: boolean;
        reserved?: boolean;
        compact?: boolean;
    }

    let { priceId, price, slug, notebookSlug, sold, reserved = false, compact = false }: Props = $props();
    let loading = $state(false);
    let errorMessage = $state<string | null>(null);
    let errorTimeout: ReturnType<typeof setTimeout> | undefined;

    function showError(message: string) {
        errorMessage = message;
        clearTimeout(errorTimeout);
        errorTimeout = setTimeout(() => (errorMessage = null), 4000);
    }

    async function handleCheckout() {
        if (sold || reserved || loading) return;
        loading = true;

        try {
            const response = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slugs: [slug], notebookSlug })
            });

            const data = await response.json();
            if (response.status === 409) {
                showError(data.error || 'Sorry, this drawing was just purchased by someone else.');
                // Give the toast a moment to be read before the reload clears it.
                setTimeout(() => window.location.reload(), 1500);
                return;
            }
            if (!response.ok || !data.url) {
                showError(data.error || 'Something went wrong. Please try again.');
                return;
            }
            if (data.sessionId) setPendingCheckout(data.sessionId);
            window.location.href = data.url;
        } catch (e) {
            console.error('Checkout error:', e);
            showError('Something went wrong. Please try again later.');
        } finally {
            loading = false;
        }
    }

    const formattedPrice = $derived(formatPrice(price));
</script>

{#if compact}
    <!-- Compact variant for bottom bars -->
    {#if sold}
        <span class="text-red-400 text-xs font-bold uppercase tracking-widest">Sold</span>
    {:else if reserved}
        <span
            class="text-white text-xs font-semibold uppercase tracking-widest"
            title="In someone's checkout — check back soon"
        >On hold</span>
    {:else if priceId}
        <button
            onclick={handleCheckout}
            disabled={loading}
            class="bg-white text-black px-3 py-1.5 rounded-full font-semibold text-sm hover:bg-gray-200 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
            {#if loading}
                <svg class="animate-spin h-4 w-4 inline" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            {:else}
                Buy · {formattedPrice}
            {/if}
        </button>
    {/if}
{:else}
    <!-- Full variant -->
    <div class="flex flex-col items-center gap-2">
        {#if sold}
            <div class="bg-red-500/80 text-white px-6 py-2 rounded-full font-bold uppercase tracking-widest text-lg backdrop-blur-sm">
                Sold
            </div>
        {:else if reserved}
            <div
                class="bg-zinc-600/80 text-white px-6 py-2 rounded-full font-bold uppercase tracking-widest text-lg backdrop-blur-sm"
                title="In someone's checkout — check back soon"
            >
                On hold
            </div>
        {:else if priceId}
            <button
                onclick={handleCheckout}
                disabled={loading}
                class="bg-white text-black px-8 py-3 rounded-full font-bold uppercase tracking-widest text-lg hover:bg-gray-200 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
                {#if loading}
                    <span class="flex items-center gap-2">
                        <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Processing...
                    </span>
                {:else}
                    Buy Original — {formattedPrice}
                {/if}
            </button>
            <p class="text-white text-xs">Free Worldwide Shipping</p>
        {/if}
    </div>
{/if}

{#if errorMessage}
    <div
        transition:fade={{ duration: 150 }}
        class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-black text-white text-sm px-5 py-3 rounded-full shadow-lg border border-white/10 max-w-[90vw] text-center"
    >
        {errorMessage}
    </div>
{/if}
