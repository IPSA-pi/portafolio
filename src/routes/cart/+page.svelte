<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { cartItems, cartTotal, removeFromCart, MAX_CART_ITEMS } from '$lib/stores/cart';
    import { formatTitle } from '$lib/utils/formatTitle';
    import { formatPrice } from '$lib/utils/formatPrice';
    import { handleCheckoutReturn, setPendingCheckout } from '$lib/utils/checkoutReturn';
    import Seo from '$lib/components/Seo.svelte';
    import PageHeader from '$lib/components/PageHeader.svelte';
    import Notice from '$lib/components/Notice.svelte';

    type Availability = { sold: boolean; reserved: boolean; price_cents: number | null };

    let availability = $state<Record<string, Availability>>({});
    let checkingAvailability = $state(false);
    let checkingOutLoading = $state(false);
    let checkoutError = $state<string | null>(null);

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
        // Covers both the explicit ?canceled=true redirect AND a buyer who
        // used Back/closed the tab without hitting that URL — the cart
        // contents are kept either way, only the reservations are released.
        await handleCheckoutReturn($page.url);
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

            if (data.sessionId) setPendingCheckout(data.sessionId);
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

<div class="shell max-w-2xl pb-20">
    <!-- The bit-rule doubles as the cart's count readout: it fills as items go in. -->
    <PageHeader
        eyebrow="Checkout"
        title="Cart"
        count={$cartItems.length}
        countMax={MAX_CART_ITEMS}
        countUnit={$cartItems.length === 1 ? 'drawing' : 'drawings'}
    />

    {#if $cartItems.length === 0}
        <div class="border border-line/12 bg-surface-raised px-6 py-16 text-center">
            <p class="font-body text-body text-content">Nothing here yet.</p>
            <a
                href="/drawing/feed"
                class="mt-3 inline-block font-mono text-label uppercase text-signal transition-colors hover:text-signal-strong"
            >
                Browse the drawings →
            </a>
        </div>
    {:else}
        <ul class="mb-10 border-y border-line/12">
            {#each $cartItems as item (item.slug)}
                {@const unavailable = isUnavailable(item.slug)}
                <li class="flex items-center gap-4 border-b border-line/12 py-4 last:border-b-0">
                    <img
                        src={item.image}
                        alt={formatTitle(item.slug)}
                        class="h-20 w-20 flex-none border border-line/12 bg-surface-raised object-cover {unavailable ? 'grayscale opacity-50' : ''}"
                    />
                    <div class="min-w-0 flex-1">
                        <p class="truncate text-title {unavailable ? 'text-content-dim line-through' : 'text-content'}">
                            {formatTitle(item.slug)}
                        </p>
                        {#if unavailable}
                            <!-- Sold out mid-cart is a genuine failure of this
                                 flow, so it earns the alert hue. A drawing that
                                 was already sold when you found it does not. -->
                            <p class="mt-1 font-mono text-label uppercase text-alert">
                                Sold while in your cart
                            </p>
                        {:else}
                            <p class="mt-1 font-mono text-meta text-signal">
                                {formatPrice(availability[item.slug]?.price_cents ?? item.price)}
                            </p>
                        {/if}
                    </div>
                    <button
                        type="button"
                        onclick={() => removeFromCart(item.slug)}
                        class="flex-none font-mono text-label uppercase text-content-dim transition-colors hover:text-alert"
                    >
                        Remove
                    </button>
                </li>
            {/each}
        </ul>

        <div class="flex items-baseline justify-between border-b border-line/12 pb-4">
            <span class="font-mono text-label uppercase text-content-dim">Subtotal</span>
            <span class="font-mono text-title text-content">{formatPrice($cartTotal)}</span>
        </div>
        <p class="mt-4 font-body text-body text-content-dim">
            Every drawing here is a one-of-a-kind original. Shipping is free, worldwide.
        </p>

        {#if $cartItems.length >= MAX_CART_ITEMS}
            <p class="mt-4 font-mono text-label uppercase text-content-dim">
                Cart is full at {MAX_CART_ITEMS} — remove one to add another.
            </p>
        {/if}

        {#if checkoutError}
            <div class="mt-6">
                <Notice tone="error" label="Checkout failed">{checkoutError}</Notice>
            </div>
        {/if}

        <button
            type="button"
            onclick={handleCheckout}
            disabled={checkingOutLoading || checkingAvailability || anyUnavailable}
            class="mt-8 w-full bg-content py-4 font-mono text-label uppercase text-surface transition-all hover:bg-signal hover:text-surface active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-content"
        >
            {checkingOutLoading ? 'Redirecting to payment…' : 'Continue to payment'}
        </button>
        {#if anyUnavailable}
            <p class="mt-3 text-center font-mono text-label uppercase text-alert">
                Remove the sold drawing to continue
            </p>
        {/if}
    {/if}
</div>
