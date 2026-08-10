<script lang="ts">
    import { onMount } from "svelte";
    import { page } from "$app/stores";
    import { replaceState } from "$app/navigation";
    import Seo from "$lib/components/Seo.svelte";
    import PageHeader from "$lib/components/PageHeader.svelte";
    import Notice from "$lib/components/Notice.svelte";
    import { removeFromCart } from "$lib/stores/cart";
    import { clearPendingCheckout } from "$lib/utils/checkoutReturn";
    import { formatNotebook } from "$lib/utils/formatNotebook";

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

<div class="shell pb-20">
    {#if showSuccess}
        <div class="pt-8">
            <Notice label="Payment confirmed">
                Your drawing is packed and on its way. The receipt is already in your inbox.
            </Notice>
        </div>
    {:else if showPending}
        <div class="pt-8">
            <Notice tone="pending" label="Payment processing">
                Your bank is still confirming this payment. We'll email you the moment it clears.
            </Notice>
        </div>
    {/if}

    <PageHeader
        eyebrow="Original drawings"
        title="Notebooks"
        count={notebooks.length}
        countUnit="notebooks"
    >
        Each notebook is a physical sketchbook, filled front to back. Open one to see
        its pages — every page is sold once, as the original.
    </PageHeader>

    <!-- View toggle: Notebooks (this page) ⇄ All Drawings (flat feed).
         Squared segmented control; the active segment is underlined in signal. -->
    <div class="mt-2 mb-12 inline-flex border border-line/15">
        <span class="border-b-2 border-signal bg-surface-raised px-5 py-2 font-mono text-label uppercase text-content">
            Notebooks
        </span>
        <a
            href="/drawing/feed"
            class="border-b-2 border-transparent border-l border-l-line/15 px-5 py-2 font-mono text-label uppercase text-content-dim transition-colors hover:text-signal"
        >
            All drawings
        </a>
    </div>

    <ul class="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
        {#each notebooks as notebook}
            <li>
                <a href="/drawing/{notebook.slug}" class="group block">
                    <!-- Paper card: the cover sits on a raised surface with a
                         hairline, so a notebook reads as an object rather than
                         a floating thumbnail. -->
                    <div class="relative aspect-[3/4] overflow-hidden border border-line/12 bg-surface-raised">
                        <img
                            src={notebook.cover}
                            alt="Cover of notebook {formatNotebook(notebook.slug)}"
                            class="absolute inset-0 h-full w-full object-cover opacity-0 transition-[transform,opacity] duration-500 group-hover:scale-[1.03]"
                            loading="lazy"
                            onload={(e) => (e.currentTarget as HTMLImageElement).classList.replace('opacity-0', 'opacity-100')}
                        />
                    </div>
                    <p class="mt-3 text-title text-content transition-colors group-hover:text-signal">
                        {formatNotebook(notebook.slug)}
                    </p>
                    <p class="mt-1 font-mono text-label uppercase text-content-dim">
                        {notebook.slug}
                    </p>
                </a>
            </li>
        {/each}
    </ul>
</div>
