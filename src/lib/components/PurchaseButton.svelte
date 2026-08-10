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

<!-- This component only ever renders inside the lightbox, whose ground is black
     in both themes — so it uses phosphor (`accent`, #39ff14) literally rather
     than the theme-aware `signal` token, which darkens on paper and would go
     muddy here.

     State language: an available drawing carries phosphor; sold and on-hold
     withhold it. Sold is not an error and gets no alert colour. -->
{#if compact}
    <!-- Compact variant for bottom bars -->
    {#if sold}
        <span class="font-mono text-label uppercase text-white/45 line-through">Sold</span>
    {:else if reserved}
        <span
            class="font-mono text-label uppercase text-white/70"
            title="In someone's checkout — check back soon"
        >On hold</span>
    {:else if priceId}
        <button
            onclick={handleCheckout}
            disabled={loading}
            class="bg-accent px-4 py-2 font-mono text-label uppercase text-black transition-all hover:bg-accent-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
            {#if loading}
                <svg class="inline h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24">
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
    <div class="flex flex-col items-center gap-3">
        {#if sold}
            <div class="border border-white/15 px-6 py-2.5 font-mono text-label uppercase text-white/45 line-through backdrop-blur-sm">
                Sold
            </div>
        {:else if reserved}
            <div
                class="border border-white/15 px-6 py-2.5 font-mono text-label uppercase text-white/70 backdrop-blur-sm"
                title="In someone's checkout — check back soon"
            >
                On hold
            </div>
        {:else if priceId}
            <button
                onclick={handleCheckout}
                disabled={loading}
                class="bg-accent px-8 py-3.5 font-mono text-label uppercase text-black transition-all hover:bg-accent-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {#if loading}
                    <span class="flex items-center gap-2">
                        <svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Redirecting…
                    </span>
                {:else}
                    Buy the original · {formattedPrice}
                {/if}
            </button>
            <p class="font-mono text-label uppercase text-white/60">Free worldwide shipping</p>
        {/if}
    </div>
{/if}

{#if errorMessage}
    <div
        role="alert"
        transition:fade={{ duration: 150 }}
        class="fixed bottom-6 left-1/2 z-[60] max-w-[90vw] -translate-x-1/2 border-l-2 border-alert bg-black px-5 py-3 text-center font-body text-meta text-white shadow-lg"
    >
        {errorMessage}
    </div>
{/if}
