<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { replaceState } from '$app/navigation';
    import { cartItems, cartTotal, removeFromCart } from '$lib/stores/cart';
    import { formatTitle } from '$lib/utils/formatTitle';
    import Seo from '$lib/components/Seo.svelte';

    type Availability = { sold: boolean; reserved: boolean; price_cents: number | null };

    let availability = $state<Record<string, Availability>>({});
    let checkingAvailability = $state(false);
    let checkingOutLoading = $state(false);
    let checkoutError = $state<string | null>(null);

    function formatPrice(cents: number): string {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
    }

    async function refreshAvailability() {
        const slugs = $cartItems.map((i) => i.slug);
        if (slugs.length === 0) {
            availability = {};
            return;
        }
        checkingAvailability = true;
        try {
            const response = await fetch(`/api/drawings/status?slugs=${encodeURIComponent(slugs.join(','))}`);
            if (response.ok) {
                availability = await response.json();
            }
        } catch (e) {
            console.error('Error checking cart availability:', e);
        } finally {
            checkingAvailability = false;
        }
    }

    onMount(async () => {
        const params = $page.url.searchParams;
        if (params.get('canceled') === 'true' && params.get('session_id')) {
            // The user changed their mind about paying, not about the items —
            // release the reservations immediately, but keep the cart contents.
            try {
                await fetch('/api/checkout/cancel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId: params.get('session_id') }),
                });
            } catch (e) {
                console.error('Error releasing canceled reservation:', e);
            }
            const url = new URL($page.url);
            url.searchParams.delete('canceled');
            url.searchParams.delete('session_id');
            replaceState(url, {});
        }
        await refreshAvailability();
    });

    function isUnavailable(slug: string): boolean {
        const a = availability[slug];
        return !!a && (a.sold || a.reserved);
    }

    let anyUnavailable = $derived($cartItems.some((i) => isUnavailable(i.slug)));

    async function handleCheckout() {
        if (checkingOutLoading || anyUnavailable || $cartItems.length === 0) return;
        checkingOutLoading = true;
        checkoutError = null;

        try {
            const response = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slugs: $cartItems.map((i) => i.slug) }),
            });

            const data = await response.json();

            if (response.status === 409) {
                const unavailable: string[] = data.unavailable ?? [];
                availability = {
                    ...availability,
                    ...Object.fromEntries(unavailable.map((slug) => [slug, { sold: true, reserved: false, price_cents: null }])),
                };
                checkoutError = data.error ?? 'Some drawings are no longer available.';
                return;
            }

            if (!response.ok || !data.url) {
                checkoutError = data.error ?? 'Something went wrong. Please try again.';
                return;
            }

            window.location.href = data.url;
        } catch (e) {
            console.error('Cart checkout error:', e);
            checkoutError = 'Something went wrong. Please try again.';
        } finally {
            checkingOutLoading = false;
        }
    }
</script>

<Seo title="Cart" path="/cart" />
<svelte:head>
    <meta name="robots" content="noindex" />
</svelte:head>

<div class="container mx-auto px-4 py-8 max-w-2xl">
    <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-8">Cart</h1>

    {#if $cartItems.length === 0}
        <div class="text-center py-16">
            <p class="text-gray-500 dark:text-gray-400 mb-4">Your cart is empty.</p>
            <a href="/drawing" class="text-sm font-medium text-black dark:text-white hover:text-accent dark:hover:text-accent transition-colors">
                Browse drawings →
            </a>
        </div>
    {:else}
        <ul class="divide-y divide-black/10 dark:divide-white/10 mb-8">
            {#each $cartItems as item (item.slug)}
                {@const unavailable = isUnavailable(item.slug)}
                <li class="flex items-center gap-4 py-4">
                    <img
                        src={item.image}
                        alt={formatTitle(item.slug)}
                        class="w-20 h-20 object-cover rounded bg-zinc-200 dark:bg-zinc-800 flex-none {unavailable ? 'grayscale opacity-60' : ''}"
                    />
                    <div class="flex-1 min-w-0">
                        <p class="font-medium text-gray-900 dark:text-white truncate">{formatTitle(item.slug)}</p>
                        {#if unavailable}
                            <p class="text-sm text-red-600 dark:text-red-400 mt-1">No longer available — please remove</p>
                        {:else}
                            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                {formatPrice(availability[item.slug]?.price_cents ?? item.price)}
                            </p>
                        {/if}
                    </div>
                    <button
                        type="button"
                        onclick={() => removeFromCart(item.slug)}
                        class="text-sm text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors flex-none"
                    >
                        Remove
                    </button>
                </li>
            {/each}
        </ul>

        <div class="flex items-center justify-between mb-2 text-lg">
            <span class="font-medium text-gray-900 dark:text-white">Subtotal</span>
            <span class="font-semibold text-gray-900 dark:text-white">{formatPrice($cartTotal)}</span>
        </div>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Each drawing is a one-of-a-kind original. Free worldwide shipping.
        </p>

        {#if checkoutError}
            <p class="text-sm text-red-600 dark:text-red-400 mb-4">{checkoutError}</p>
        {/if}

        <button
            type="button"
            onclick={handleCheckout}
            disabled={checkingOutLoading || checkingAvailability || anyUnavailable}
            class="w-full bg-black dark:bg-white text-white dark:text-black py-3 rounded-full font-bold uppercase tracking-widest text-sm hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
            {checkingOutLoading ? 'Redirecting…' : 'Checkout'}
        </button>
    {/if}
</div>
