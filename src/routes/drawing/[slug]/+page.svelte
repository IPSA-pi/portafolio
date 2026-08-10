<script lang="ts">
    import { onMount } from "svelte";
    import { page } from "$app/stores";
    import { invalidateAll, replaceState } from "$app/navigation";
    import Gallery from "$lib/components/Gallery.svelte";
    import Seo from "$lib/components/Seo.svelte";
    import PageHeader from "$lib/components/PageHeader.svelte";
    import Notice from "$lib/components/Notice.svelte";
    import { removeFromCart } from "$lib/stores/cart";
    import { handleCheckoutReturn, clearPendingCheckout } from "$lib/utils/checkoutReturn";
    import { formatNotebook } from "$lib/utils/formatNotebook";

    let { data } = $props();

    let title = $derived($page.params.slug ?? "Gallery");
    let displayTitle = $derived(formatNotebook(title));
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

<div class="shell pb-20">
    {#if showSuccess}
        <div class="pt-8">
            <Notice label="Payment confirmed">
                Your drawing is packed and on its way. The receipt is already in your inbox.
            </Notice>
        </div>
    {/if}

    <div class="pt-8">
        <a
            href="/drawing"
            class="font-mono text-label uppercase text-content-dim transition-colors hover:text-signal"
            >← All notebooks</a
        >
    </div>

    <PageHeader
        eyebrow="Notebook"
        title={displayTitle}
        count={data.images.length}
        countUnit="pages"
    >
        Every page below is the original — one of one. Open any page to see it full
        size, with its price and availability.
    </PageHeader>

    <div class="mt-8">
        <Gallery images={data.images} notebookSlug={data.slug} />
    </div>
</div>
