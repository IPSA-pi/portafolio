<script lang="ts">
    import { onMount } from 'svelte';
    import { shipTo, chooseShipTo, guessShipTo } from '$lib/stores/shipTo';
    import {
        ELSEWHERE,
        HOME_COUNTRY,
        INTERNATIONAL_REGISTERED_CENTS,
        INTERNATIONAL_STANDARD_CENTS,
        internationalMailto,
        shippingCountryNames,
        type ShipTo
    } from '$lib/shipping';
    import { formatPrice } from '$lib/utils/formatPrice';

    interface Props {
        /** What the buyer is about to pay for — named in the email a buyer
         *  from an unlisted country is pointed at. */
        slugs: string[];
    }

    let { slugs }: Props = $props();

    const countries = shippingCountryNames();

    onMount(guessShipTo);
</script>

<!-- "Where is this going?", asked before Stripe rather than discovered there:
     the answer sets the shipping price (hosted Checkout can't reprice once an
     address is typed) and catches a buyer the checkout doesn't ship to, who
     would otherwise reach Stripe's address form and simply not find their
     country in it. Theme tokens throughout — it renders on the cart page and
     inside PurchaseButton's dialog. -->
<div>
    <label class="flex items-center justify-between gap-4">
        <span class="font-mono text-label uppercase text-content-dim">Ship to</span>
        <select
            value={$shipTo}
            onchange={(e) => chooseShipTo(e.currentTarget.value as ShipTo)}
            class="min-w-0 max-w-[16rem] flex-1 border border-line/15 bg-surface px-3 py-2 font-mono text-meta text-content transition-colors focus:border-signal focus:outline-none"
        >
            {#each countries as c (c.code)}
                <option value={c.code}>{c.name}</option>
            {/each}
            <option value={ELSEWHERE}>Somewhere else</option>
        </select>
    </label>

    <p class="mt-3 font-body text-meta text-content-dim" aria-live="polite">
        {#if $shipTo === ELSEWHERE}
            The online checkout doesn't ship there yet.
            <a href={internationalMailto(slugs)} class="text-signal underline underline-offset-2 transition-colors hover:text-signal-strong">Email me</a>
            what you'd like and where it's going, and I'll arrange it.
        {:else if $shipTo === HOME_COUNTRY}
            Shipping is free in Canada.
        {:else}
            Shipping is {formatPrice(INTERNATIONAL_STANDARD_CENTS, { compact: true })} per order, or
            {formatPrice(INTERNATIONAL_REGISTERED_CENTS, { compact: true })} by registered mail with a
            tracking number — you choose at payment. Any import duties are the buyer's.
        {/if}
    </p>
</div>
