<script lang="ts">
    import type { Snippet } from 'svelte';
    import { fade } from 'svelte/transition';
    import { setPendingCheckout } from '$lib/utils/checkoutReturn';
    import { formatPrice } from '$lib/utils/formatPrice';
    import { ELSEWHERE, internationalMailto } from '$lib/shipping';
    import { shipTo } from '$lib/stores/shipTo';
    import ShipToPicker from './ShipToPicker.svelte';

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
        // because it belongs inside the original's row, beside Buy.
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

    // Buy doesn't go straight to Stripe: it first asks where the drawing is
    // going (ShipToPicker, in the dialog at the bottom of this file). The
    // country sets the shipping price and is what the Stripe session gets
    // locked to; "somewhere else" ends at an email link instead of a payment
    // page with no matching country in it.
    let shipDialog = $state<HTMLDialogElement | null>(null);

    function handleCheckout() {
        if (sold || reserved || loading) return;
        shipDialog?.showModal();
    }

    async function confirmCheckout() {
        if (sold || reserved || loading || $shipTo === ELSEWHERE) return;
        loading = true;

        try {
            const response = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slugs: [slug], notebookSlug, country: $shipTo })
            });

            const data = await response.json();
            if (response.status === 409) {
                shipDialog?.close();
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

    // The compact variant drops the cents ("$20", not "$20.00"): it sits in a
    // bar that's already dense, and every price is whole dollars.
    const formattedPrice = $derived(price != null ? formatPrice(price, { compact }) : '');
    const digitalListed = $derived(digitalPrice != null && digitalPrice > 0);
    const formattedDigitalPrice = $derived(digitalPrice != null ? formatPrice(digitalPrice, { compact }) : '');
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
<!-- `label` is what precedes the price: the full variant has to name the
     product on the button; the compact one names it beside the button. -->
{#snippet digitalButton(sizing: string, label = 'Digital file')}
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
            {label} · {formattedDigitalPrice}
        {/if}
    </button>
{/snippet}

{#if compact}
    <!-- Compact variant for the viewer's bar / rail: one row per offer — its
         name on the left, its control on the right, and nothing else. How
         each one ships (free to the listed countries / email from elsewhere / instant
         download) is said once on the gallery page, in DrawingFacts, instead
         of under every drawing.

         The names are sentence case, so the two uppercase buttons are the
         loudest thing in the bar; they tighten `text-label`'s tracking,
         which is tuned for uppercase. -->
    <div class="flex flex-col gap-2">
        <!-- No original row at all when the only offer is the file. -->
        {#if sold || reserved || priceId}
            <!-- min-h = the height of Feed's rotate buttons, so a row with
                 no button in it ("Sold") still lines up with them. -->
            <div class="flex min-h-[2.625rem] items-center justify-between gap-3">
                <p class="pointer-events-none select-none font-mono text-label tracking-[0.04em] {sold ? 'text-white/45' : 'text-white'}">Original</p>
                <div class="flex flex-none items-center gap-2">
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
            </div>
        {/if}
        {#if digitalListed}
            <div class="flex min-h-[2.625rem] items-center justify-between gap-3">
                <p class="pointer-events-none select-none font-mono text-label tracking-[0.04em] text-white">Digital file</p>
                {@render digitalButton('flex-none px-4 py-2', 'Get')}
            </div>
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
            <!-- Originals ship to SHIPPING_COUNTRIES only; the file sells worldwide. So
                 where one is listed it's the first answer for a buyer abroad,
                 and the email route stays for the original itself. -->
            {#if digitalListed}
                <p class="max-w-[20rem] text-center font-mono text-label leading-snug text-white/60">Can’t ship to you? Get the digital file, or <a href="{internationalMailto(slug)}" class="pointer-events-auto underline underline-offset-2 hover:text-white">email me</a> for the original</p>
            {:else}
                <a href="{internationalMailto(slug)}" class="pointer-events-auto font-mono text-label text-white/60 underline underline-offset-2 hover:text-white">Not shipping to your country? Email me</a>
            {/if}
            <p class="font-mono text-label uppercase text-white/45">Includes the digital file</p>
        {/if}
        {#if digitalListed}
            {@render digitalButton('px-8 py-3.5')}
            <p class="text-center font-mono text-label uppercase leading-snug text-white/60">Instant download · available worldwide</p>
        {/if}
    </div>
{/if}

<!-- Ship-to step for Buy. A native modal <dialog>: it traps focus, closes on
     Esc, and sits in the top layer above the viewer. Keydowns stop here so
     they don't reach Feed's window handler — otherwise Esc would also close
     the viewer and the arrow keys in the country list would change slides.
     Theme tokens, not the viewer's white-on-black: it's a panel of the page,
     and the picker inside is shared with the cart. -->
<dialog
    bind:this={shipDialog}
    onkeydown={(e) => e.stopPropagation()}
    onclick={(e) => { if (e.target === e.currentTarget) shipDialog?.close(); }}
    aria-labelledby="ship-dialog-title-{slug}"
    class="m-auto w-[min(92vw,26rem)] border border-line/15 bg-surface p-0 text-content backdrop:bg-black/75"
>
    <div class="p-6">
        <div class="flex items-start justify-between gap-4">
            <h2 id="ship-dialog-title-{slug}" class="text-title text-content">Where is it going?</h2>
            <button
                type="button"
                onclick={() => shipDialog?.close()}
                class="-mr-2 -mt-2 p-2 text-content-dim transition-colors hover:text-content"
                aria-label="Close"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-5 w-5" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>

        <div class="mt-5">
            <ShipToPicker slugs={[slug]} />
        </div>

        {#if errorMessage}
            <!-- The toast below renders under this dialog's backdrop. -->
            <p role="alert" class="mt-4 border-l-2 border-alert pl-3 font-body text-meta text-content">{errorMessage}</p>
        {/if}

        {#if $shipTo === ELSEWHERE}
            <a
                href={internationalMailto(slug)}
                class="mt-6 block w-full bg-content py-3.5 text-center font-mono text-label uppercase text-surface transition-all hover:bg-signal active:scale-[0.99]"
            >
                Email me about this drawing
            </a>
        {:else}
            <button
                type="button"
                onclick={confirmCheckout}
                disabled={loading}
                class="mt-6 w-full bg-content py-3.5 font-mono text-label uppercase text-surface transition-all hover:bg-signal active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            >
                {loading ? 'Redirecting to payment…' : `Continue to payment · ${formattedPrice}`}
            </button>
        {/if}
    </div>
</dialog>

{#if errorMessage}
    <div
        role="alert"
        transition:fade={{ duration: 150 }}
        class="fixed bottom-6 left-1/2 z-[60] max-w-[90vw] -translate-x-1/2 border-l-2 border-alert bg-black px-5 py-3 text-center font-body text-meta text-white shadow-lg"
    >
        {errorMessage}
    </div>
{/if}
