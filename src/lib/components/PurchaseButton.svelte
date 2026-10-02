<script lang="ts">
    import type { Snippet } from 'svelte';
    import { fade } from 'svelte/transition';
    import { setPendingCheckout } from '$lib/utils/checkoutReturn';
    import { formatPrice } from '$lib/utils/formatPrice';
    import { internationalMailto } from '$lib/shipping';

    interface Props {
        // Null when the original isn't priced — the entry then exists only
        // because the drawing's digital file is listed.
        priceId: string | null;
        price: number | null;
        slug: string;
        notebookSlug: string;
        sold: boolean;
        reserved?: boolean;
        // The paid digital file's price in cents; null/absent = not listed.
        digitalPrice?: number | null;
        compact?: boolean;
        // Compact only: a control to sit beside the primary one (Feed's
        // add-to-cart). It's passed in rather than laid out by the caller
        // because the digital button stacks *under* that pair.
        leading?: Snippet;
    }

    let { priceId, price, slug, notebookSlug, sold, reserved = false, digitalPrice = null, compact = false, leading }: Props = $props();
    let loading = $state(false);
    let digitalLoading = $state(false);
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

    // The file sells whether or not the original is sold or on hold, so this
    // is not gated on either. Nothing is reserved server-side, which is why
    // there's no setPendingCheckout here: a buyer who backs out of this
    // Checkout has nothing to release.
    async function handleDigitalCheckout() {
        if (digitalLoading) return;
        digitalLoading = true;

        try {
            const response = await fetch('/api/checkout/digital', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slugs: [slug], notebookSlug })
            });

            const data = await response.json();
            if (!response.ok || !data.url) {
                showError(
                    response.status === 409
                        ? 'Sorry, this digital file isn\u2019t available right now.'
                        : data.error || 'Something went wrong. Please try again.'
                );
                return;
            }
            window.location.href = data.url;
        } catch (e) {
            console.error('Digital checkout error:', e);
            showError('Something went wrong. Please try again later.');
        } finally {
            digitalLoading = false;
        }
    }

    const formattedPrice = $derived(price != null ? formatPrice(price) : '');
    const digitalListed = $derived(digitalPrice != null && digitalPrice > 0);
    const formattedDigitalPrice = $derived(digitalPrice != null ? formatPrice(digitalPrice) : '');
</script>

<!-- This component only ever renders inside the lightbox, whose ground is black
     in both themes — so it uses phosphor (`accent`, #39ff14) literally rather
     than the theme-aware `signal` token, which darkens on paper and would go
     muddy here.

     State language: an available drawing carries phosphor; sold and on-hold
     withhold it. Sold is not an error and gets no alert colour. -->
<!-- The digital file is the secondary offer: outlined, never phosphor-filled,
     so it can't be mistaken for the original's Buy. It renders in every state
     of the original — available, sold, on hold, or unpriced. -->
{#snippet digitalButton(sizing: string)}
    <button
        onclick={handleDigitalCheckout}
        disabled={digitalLoading}
        class="border border-white/30 {sizing} font-mono text-label uppercase text-white backdrop-blur-sm transition-all hover:border-white/60 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
    >
        {#if digitalLoading}
            <span class="flex items-center justify-center gap-2">
                <svg class="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Redirecting…
            </span>
        {:else}
            Digital file · {formattedDigitalPrice}
        {/if}
    </button>
{/snippet}

{#if compact}
    <!-- Compact variant for bottom bars. The digital button goes *under* the
         primary row, full width: side by side the two overflow a portrait
         phone, and stacked the block is no wider than cart + Buy was. -->
    <div class="flex flex-col items-stretch gap-2">
        <!-- No primary row at all when the only offer is the file. -->
        {#if sold || reserved || priceId}
            <div class="flex items-center justify-end gap-2">
                {@render leading?.()}
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
            </div>
        {/if}
        {#if digitalListed}
            {@render digitalButton('px-4 py-2')}
            <!-- w-0 + min-w-full: wraps to the buttons' width instead of
                 widening the block (and the bar) to fit on one line. -->
            <p class="pointer-events-none w-0 min-w-full select-none text-right font-mono text-label uppercase leading-snug text-white/60">Instant download · available worldwide</p>
        {/if}
    </div>
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
            <p class="font-mono text-label uppercase text-white/60">Free shipping in Canada</p>
            <!-- Originals ship to Canada only; the file sells worldwide. So
                 where one is listed it's the first answer for a buyer abroad,
                 and the email route stays for the original itself. -->
            {#if digitalListed}
                <p class="max-w-[20rem] text-center font-mono text-label leading-snug text-white/60">Outside Canada? Get the digital file, or <a href="{internationalMailto(slug)}" class="pointer-events-auto underline underline-offset-2 hover:text-white">email me</a> for the original</p>
            {:else}
                <a href="{internationalMailto(slug)}" class="pointer-events-auto font-mono text-label text-white/60 underline underline-offset-2 hover:text-white">Outside Canada? Email me</a>
            {/if}
            <p class="font-mono text-label uppercase text-white/45">Includes the digital file</p>
        {/if}
        {#if digitalListed}
            {@render digitalButton('px-8 py-3.5')}
            <p class="text-center font-mono text-label uppercase leading-snug text-white/60">Instant download · available worldwide</p>
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
