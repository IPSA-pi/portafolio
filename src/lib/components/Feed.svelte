<script lang="ts">
    import { goto, replaceState, invalidateAll } from '$app/navigation';
    import { page } from '$app/stores';
    import { untrack } from 'svelte';
    import { fade } from 'svelte/transition';
    import PurchaseButton from './PurchaseButton.svelte';
    import { cartItems, cartCount, addToCart, removeFromCart, MAX_CART_ITEMS } from '$lib/stores/cart';
    import { formatTitle } from '$lib/utils/formatTitle';

    interface Props {
        images: { original: string; sm: string; md: string; lg: string; slug: string; notebook?: string }[];
        products: Record<string, { priceId: string; price: number; sold: boolean; reserved: boolean }>;
        startIndex: number;
        notebookSlug: string;
        // 'notebook' = single-notebook viewer (per-image URL); 'all' = the random
        // feed of every drawing (no per-image URL rewrite, closes to /drawing).
        mode?: 'notebook' | 'all';
        // When set, closing (Esc / the back button) calls this instead of
        // navigating away — the All Drawings grid uses it to return in-place
        // to the grid rather than reloading /drawing.
        onClose?: () => void;
    }

    let { images, products, startIndex, notebookSlug, mode = 'notebook', onClose }: Props = $props();

    // The all-drawings feed scrolls vertically (doom-scroll); a single notebook's
    // lightbox scrolls horizontally.
    let vertical = $derived(mode === 'all');

    let container = $state<HTMLElement | null>(null);
    let currentIndex = $state(untrack(() => startIndex));
    let mdLoaded: boolean[] = $state(untrack(() => Array(images.length).fill(false) as boolean[]));
    let rotation = $state(0);

    // Double-click (or the toolbar button) zooms toward the click point, then
    // drag to pan — desktop only. On touch devices we leave the browser's own
    // pinch / double-tap zoom to the user instead. Resets automatically on
    // navigation so a new slide always starts at 1×.
    let canDblZoom = $state(false);
    // Only fetch the lg (1920w) variant on viewports large enough to benefit,
    // or once the current slide is zoomed in — small screens get the md
    // variant only, so every slide isn't downloaded twice.
    let largeViewport = $state(false);
    const ZOOM_LEVEL = 2;
    let zoom = $state(1);
    // Panning is expressed as a plain pixel translate against a fixed, centred
    // transform-origin (rather than moving the origin around), so the drag
    // maths and the clamp below stay in one coordinate space.
    let pan = $state({ x: 0, y: 0 });
    let panning = $state(false);
    // Half the overhang of the scaled box, i.e. how far the image can travel
    // before its edge would pull inside the frame. Set whenever we zoom in.
    let panLimit = { x: 0, y: 0 };
    // The per-slide zoom layers, so the toolbar button can measure the current
    // one the same way a click does.
    let zoomLayers: HTMLElement[] = [];
    let zoomStyle = $derived(
        `transform: translate(${pan.x}px, ${pan.y}px) scale(${zoom}); transform-origin: 50% 50%;` +
            (panning ? ' transition: none;' : '') +
            ` cursor: ${canDblZoom ? (zoom === 1 ? 'zoom-in' : panning ? 'grabbing' : 'grab') : 'default'};`
    );

    let currentImage = $derived(images[currentIndex]);
    let currentProduct = $derived(currentImage ? products[currentImage.slug] : undefined);
    let isPurchasable = $derived(!!currentProduct && !currentProduct.sold && !currentProduct.reserved);
    let inCart = $derived(!!currentImage && $cartItems.some((i) => i.slug === currentImage.slug));

    let cartFullMessage = $state<string | null>(null);
    let cartFullTimeout: ReturnType<typeof setTimeout> | undefined;

    function toggleCart() {
        if (!currentImage || !currentProduct) return;
        if (inCart) {
            removeFromCart(currentImage.slug);
            return;
        }
        const added = addToCart({ slug: currentImage.slug, notebook: currentImage.notebook ?? notebookSlug, price: currentProduct.price, image: currentImage.sm });
        if (!added) {
            cartFullMessage = `Cart is full (${MAX_CART_ITEMS} max)`;
            clearTimeout(cartFullTimeout);
            cartFullTimeout = setTimeout(() => (cartFullMessage = null), 3000);
        }
    }

    // Booth "mark sold" / undo — owner-only, in-person cash/e-transfer sales
    // (see /admin/drawings/sold). Gated on currentProduct like PurchaseButton
    // itself: only listed (priced) drawings have a products entry.
    let isAdmin = $derived(Boolean($page.data.isAdmin));
    let ownerToast = $state<'none' | 'choose-method' | 'confirm-undo'>('none');
    let ownerBusy = $state(false);
    let ownerError = $state<string | null>(null);
    let ownerErrorTimeout: ReturnType<typeof setTimeout> | undefined;

    function showOwnerError(message: string) {
        ownerError = message;
        clearTimeout(ownerErrorTimeout);
        ownerErrorTimeout = setTimeout(() => (ownerError = null), 4000);
    }

    async function postSoldStatus(sold: boolean, method?: 'cash' | 'etransfer') {
        if (!currentImage || ownerBusy) return;
        ownerBusy = true;
        ownerToast = 'none';
        try {
            const res = await fetch('/admin/drawings/sold', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slug: currentImage.slug, sold, ...(method ? { method } : {}) })
            });
            const resBody = await res.json().catch(() => ({}));
            if (!res.ok) {
                showOwnerError(resBody.error ?? 'Something went wrong');
                return;
            }
            await invalidateAll();
        } finally {
            ownerBusy = false;
        }
    }

    // Floating controls auto-hide after a short idle so the artwork is unobscured;
    // any pointer movement or tap brings them back. Slides with a purchasable
    // drawing keep the bar visible so the buy control is never lost mid-browse.
    let controlsVisible = $state(true);
    let hideTimer: ReturnType<typeof setTimeout>;
    function showControls() {
        controlsVisible = true;
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
            if (!isPurchasable) controlsVisible = false;
        }, 4500);
    }

    function scrollToIndex(i: number, behavior: ScrollBehavior = 'smooth') {
        if (vertical) container?.scrollTo({ top: i * window.innerHeight, behavior });
        else container?.scrollTo({ left: i * window.innerWidth, behavior });
    }

    function close() {
        if (onClose) { onClose(); return; }
        goto(mode === 'all' ? '/drawing' : '/drawing/' + notebookSlug);
    }

    // Rotate in 90° steps, either direction. The angle accumulates freely
    // (no wrap) so the CSS transition always animates the short 90° way and
    // never spins backward across a 360° boundary.
    function rotateBy(delta: number) {
        rotation += delta;
        showControls();
    }

    function resetZoom() {
        zoom = 1;
        pan = { x: 0, y: 0 };
    }

    function clampPan(x: number, y: number) {
        return {
            x: Math.max(-panLimit.x, Math.min(panLimit.x, x)),
            y: Math.max(-panLimit.y, Math.min(panLimit.y, y))
        };
    }

    // Zoom in on the current slide, keeping the point under the cursor put.
    // With a centred origin a point `d` px from the centre lands at `d * zoom`,
    // so translating by `d * (1 - zoom)` puts it back where it was. Called with
    // no coordinates (the toolbar button) it just zooms on the centre.
    function zoomIn(clientX?: number, clientY?: number) {
        const el = zoomLayers[currentIndex];
        if (!el) return;
        const rect = el.getBoundingClientRect(); // zoom is 1 here, so unscaled
        panLimit = {
            x: (rect.width * (ZOOM_LEVEL - 1)) / 2,
            y: (rect.height * (ZOOM_LEVEL - 1)) / 2
        };
        const dx = clientX === undefined ? 0 : clientX - (rect.left + rect.width / 2);
        const dy = clientY === undefined ? 0 : clientY - (rect.top + rect.height / 2);
        zoom = ZOOM_LEVEL;
        pan = clampPan(dx * (1 - ZOOM_LEVEL), dy * (1 - ZOOM_LEVEL));
    }

    function toggleZoom(e: MouseEvent) {
        if (!canDblZoom) return; // touch devices use native pinch zoom
        if (zoom !== 1) { resetZoom(); return; }
        zoomIn(e.clientX, e.clientY);
        showControls();
    }

    function toggleZoomButton() {
        if (zoom !== 1) resetZoom();
        else zoomIn();
        showControls();
    }

    // Drag to pan while zoomed. Only ever engages at zoom > 1, which touch
    // devices never reach, so this can't fight the native swipe/scroll.
    let panStart = { x: 0, y: 0, panX: 0, panY: 0 };

    function startPan(e: PointerEvent) {
        if (zoom === 1 || !(e.currentTarget instanceof HTMLElement)) return;
        panning = true;
        panStart = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
    }

    function movePan(e: PointerEvent) {
        if (!panning) return;
        pan = clampPan(panStart.panX + (e.clientX - panStart.x), panStart.panY + (e.clientY - panStart.y));
    }

    function endPan(e: PointerEvent) {
        if (!panning) return;
        panning = false;
        if (e.currentTarget instanceof HTMLElement) e.currentTarget.releasePointerCapture(e.pointerId);
    }

    function handleKeydown(e: KeyboardEvent) {
        // Escape backs out of the zoom first, then out of the viewer.
        if (e.key === 'Escape') { if (zoom > 1) resetZoom(); else close(); }
        else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') scrollToIndex(Math.min(currentIndex + 1, images.length - 1));
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') scrollToIndex(Math.max(currentIndex - 1, 0));
        else if (e.key === 'r' || e.key === 'R') rotateBy(e.shiftKey ? -90 : 90);
        else if (e.key === 'z' || e.key === 'Z') toggleZoomButton();
    }

    // Two jobs. While zoomed in, swallow the wheel entirely: otherwise the
    // faintest trackpad nudge scrolls the feed (or steps to the next slide) out
    // from under the zoom, which on a desktop reads as the zoom not working at
    // all. Otherwise, in the horizontal lightbox a vertical wheel would do
    // nothing, so translate any wheel gesture into one step of horizontal
    // navigation, with a short lock so a single flick advances exactly one
    // image. (The vertical feed uses native scrolling at 1×.)
    let wheelLock = false;
    function handleWheel(e: WheelEvent) {
        if (zoom > 1) { e.preventDefault(); return; }
        if (vertical) return;
        const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
        if (Math.abs(delta) < 10) return;
        e.preventDefault();
        if (wheelLock) return;
        wheelLock = true;
        if (delta > 0) scrollToIndex(Math.min(currentIndex + 1, images.length - 1));
        else scrollToIndex(Math.max(currentIndex - 1, 0));
        setTimeout(() => { wheelLock = false; }, 450);
    }

    $effect(() => {
        if (!container) return;
        // A fine, hovering pointer (mouse/trackpad) gets click-to-zoom; touch
        // devices fall back to the browser's native pinch zoom.
        canDblZoom = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        largeViewport = window.matchMedia('(min-width: 1024px)').matches;
        untrack(() => scrollToIndex(startIndex, 'instant'));
        untrack(showControls);
        // Wired up in both modes: even the vertical feed needs it to hold the
        // scroll still while zoomed.
        container.addEventListener('wheel', handleWheel, { passive: false });

        const slides = container.querySelectorAll<HTMLElement>('[data-index]');
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
                        const i = Number((entry.target as HTMLElement).dataset.index);
                        if (i !== currentIndex) resetZoom(); // new slide always starts at 1×
                        currentIndex = i;
                        if (mode === 'notebook') {
                            replaceState(`/drawing/${notebookSlug}/${i + 1}`, {});
                        }
                    }
                }
            },
            { threshold: 0.5 }
        );
        slides.forEach(s => observer.observe(s));
        return () => {
            observer.disconnect();
            container?.removeEventListener('wheel', handleWheel);
            clearTimeout(hideTimer);
        };
    });

    // Dimension-swap trick: when rotated 90°, swap CSS width/height so the
    // visual footprint stays the same but a portrait drawing fills the
    // rotated (landscape-shaped) box much more fully. The image now fills the
    // full viewport height; the floating controls overlay it.
    let imageContainerStyle = $derived(
        Math.abs(rotation / 90) % 2 === 1
            ? `width: 100dvh; height: 85vw; transform: rotate(${rotation}deg);`
            : `width: 85vw; height: 100dvh; transform: rotate(${rotation}deg);`
    );
</script>

<svelte:window onkeydown={handleKeydown} onmousemove={showControls} />

<!-- Close button — outside scroll container, dark bg so it's visible against any image -->
<button
    onclick={close}
    class="fixed top-4 right-4 z-50 rounded-full bg-black/60 p-2 text-white backdrop-blur-sm shadow-lg transition hover:bg-black/80"
    aria-label="Back to gallery"
>
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-6 w-6">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
</button>

<!-- Floating cart badge — the nav (and its own cart icon) is hidden on feed
     routes, so lightbox users need another way to see/reach their cart. -->
{#if $cartCount > 0}
    <a
        href="/cart"
        class="fixed top-4 left-4 z-50 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-2 text-white backdrop-blur-sm shadow-lg transition hover:bg-black/80"
        aria-label="View cart ({$cartCount} items)"
    >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-5 w-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.836l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 1.994-4.693 2.602-7.152.084-.34-.16-.68-.508-.68H5.106M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
        </svg>
        <span class="text-sm font-semibold">{$cartCount}</span>
    </a>
{/if}

<!-- Scroll feed: vertical for the all-drawings feed, horizontal for a notebook lightbox -->
<div
    bind:this={container}
    onpointerdown={showControls}
    class="fixed inset-0 z-40 bg-black scrollbar-none snap-mandatory {vertical ? 'overflow-y-scroll snap-y' : 'flex overflow-x-scroll overflow-y-hidden snap-x'}"
    style="-webkit-overflow-scrolling: touch;"
>
    {#each images as image, i}
        <!-- Each slide is full-bleed; the floating controls overlay the image. -->
        <div
            data-index={i}
            class="snap-start snap-always h-dvh relative overflow-hidden {vertical ? 'w-full' : 'w-screen flex-none'}"
        >
            <!-- Spinner -->
            {#if !mdLoaded[i]}
                <div class="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                    <svg class="animate-spin h-8 w-8 text-white/40" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                </div>
            {/if}

            <!-- Image: centred, rotatable, double-tap to zoom -->
            <div class="absolute inset-0 flex items-center justify-center overflow-hidden">
                <!-- Zoom layer: scales toward the tap point, then drags to pan -->
                <div
                    bind:this={zoomLayers[i]}
                    ondblclick={toggleZoom}
                    onpointerdown={startPan}
                    onpointermove={movePan}
                    onpointerup={endPan}
                    onpointercancel={endPan}
                    role="presentation"
                    class="transition-transform duration-300 ease-out"
                    style={i === currentIndex ? zoomStyle : ''}
                >
                    <!-- Rotation layer -->
                    <div
                        class="transition-[transform,width,height] duration-300 ease-in-out"
                        style={imageContainerStyle}
                    >
                        <img
                            src={image.md}
                            alt={formatTitle(image.slug)}
                            class="w-full h-full object-contain shadow-2xl select-none"
                            draggable="false"
                            loading={Math.abs(i - startIndex) <= 1 ? 'eager' : 'lazy'}
                            onload={() => { mdLoaded[i] = true; }}
                        />
                        {#if largeViewport || (i === currentIndex && zoom > 1)}
                            <img
                                src={image.lg}
                                alt=""
                                aria-hidden="true"
                                class="absolute inset-0 w-full h-full object-contain select-none opacity-0 transition-opacity duration-300"
                                draggable="false"
                                loading={Math.abs(i - startIndex) <= 1 ? 'eager' : 'lazy'}
                                onload={(e) => (e.currentTarget as HTMLImageElement).classList.replace('opacity-0', 'opacity-100')}
                            />
                        {/if}
                    </div>
                </div>
            </div>
        </div>
    {/each}
</div>

<!-- Floating controls: rotate · title · buy. Overlay the artwork on a soft
     bottom gradient and auto-hide after idle. Driven by the current slide. -->
<div
    class="fixed inset-x-0 bottom-0 z-50 flex items-center gap-3 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-12 bg-gradient-to-t from-black/70 via-black/40 to-transparent transition-opacity duration-300 {controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}"
>
    <!-- Rotate left (counter-clockwise, −90°). A near-full circle with the arrow
         head sitting on its rim reads as "spin", where the old hooked arrow
         read as undo/redo. -->
    <button
        onclick={() => rotateBy(-90)}
        class="flex-none rounded-full bg-white/10 backdrop-blur-sm p-2.5 text-white transition hover:bg-white/20 active:scale-95"
        aria-label="Rotate left"
        title="Rotate left (Shift+R)"
    >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-5 w-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 3v5h5" />
        </svg>
    </button>

    <!-- Rotate right (clockwise, +90°) -->
    <button
        onclick={() => rotateBy(90)}
        class="flex-none rounded-full bg-white/10 backdrop-blur-sm p-2.5 text-white transition hover:bg-white/20 active:scale-95"
        aria-label="Rotate right"
        title="Rotate right (R)"
    >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-5 w-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1.06 6.74 2.74L21 8" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 3v5h-5" />
        </svg>
    </button>

    <!-- Zoom toggle — desktop only (touch uses native pinch). Double-clicking the
         artwork does the same thing, but nothing on screen said so. -->
    {#if canDblZoom}
        <button
            onclick={toggleZoomButton}
            class="flex-none rounded-full bg-white/10 backdrop-blur-sm p-2.5 text-white transition hover:bg-white/20 active:scale-95"
            aria-label={zoom === 1 ? 'Zoom in' : 'Zoom out'}
            title={zoom === 1 ? 'Zoom in (Z) — double-click the artwork, then drag to pan' : 'Zoom out (Z)'}
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-5 w-5">
                {#if zoom === 1}
                    <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
                {:else}
                    <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM13.5 10.5h-6" />
                {/if}
            </svg>
        </button>
    {/if}

    <!-- Title -->
    {#if currentImage}
        <p class="flex-1 min-w-0 text-center text-white/80 text-sm tracking-wide truncate select-none pointer-events-none drop-shadow">
            {formatTitle(currentImage.slug)}
        </p>
    {/if}

    <!-- Buy (or width-reserving spacer so the title stays centred) -->
    <div class="flex-none flex flex-col items-end gap-1" style="min-width: 2.75rem;">
        {#if isPurchasable}
            <p class="text-white/50 text-[10px] tracking-wide select-none pointer-events-none">Free worldwide shipping</p>
        {/if}
        <div class="flex items-center gap-2">
            {#if isPurchasable}
                <button
                    onclick={toggleCart}
                    class="rounded-full px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 {inCart ? 'bg-white/20 text-white' : 'bg-white/10 text-white hover:bg-white/20'} backdrop-blur-sm"
                >
                    {inCart ? 'In cart ✓' : 'Add to cart'}
                </button>
            {/if}
            {#if currentImage && currentProduct}
                <PurchaseButton
                    priceId={currentProduct.priceId}
                    price={currentProduct.price}
                    slug={currentImage.slug}
                    notebookSlug={currentImage.notebook ?? notebookSlug}
                    sold={currentProduct.sold}
                    reserved={currentProduct.reserved}
                    compact
                />
            {/if}
            {#if isAdmin && currentImage && currentProduct}
                {#if currentProduct.sold}
                    <button
                        onclick={() => (ownerToast = 'confirm-undo')}
                        class="rounded-full px-3 py-1.5 text-xs font-semibold bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm transition-all active:scale-95"
                    >
                        Sold · undo
                    </button>
                {:else}
                    <button
                        onclick={() => (ownerToast = 'choose-method')}
                        class="rounded-full px-3 py-1.5 text-xs font-semibold bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm transition-all active:scale-95"
                    >
                        Mark sold
                    </button>
                {/if}
            {/if}
        </div>
    </div>
</div>

{#if cartFullMessage}
    <div
        transition:fade={{ duration: 150 }}
        class="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] bg-black text-white text-sm px-5 py-3 rounded-full shadow-lg border border-white/10 max-w-[90vw] text-center"
    >
        {cartFullMessage}
    </div>
{/if}

<!-- Owner booth controls: mark-sold payment-method chooser / undo confirm -->
{#if ownerToast === 'choose-method'}
    <div
        transition:fade={{ duration: 150 }}
        class="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-black px-4 py-3 text-white shadow-lg max-w-[90vw]"
    >
        <p class="text-xs text-white/70">Mark sold — payment method?</p>
        <div class="flex gap-2">
            <button
                onclick={() => postSoldStatus(true, 'cash')}
                disabled={ownerBusy}
                class="rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold hover:bg-white/20 disabled:opacity-50"
            >
                Cash
            </button>
            <button
                onclick={() => postSoldStatus(true, 'etransfer')}
                disabled={ownerBusy}
                class="rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold hover:bg-white/20 disabled:opacity-50"
            >
                E-transfer
            </button>
            <button
                onclick={() => (ownerToast = 'none')}
                disabled={ownerBusy}
                class="rounded-full bg-white/5 px-4 py-1.5 text-sm text-white/70 hover:bg-white/10 disabled:opacity-50"
            >
                Cancel
            </button>
        </div>
    </div>
{:else if ownerToast === 'confirm-undo'}
    <div
        transition:fade={{ duration: 150 }}
        class="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-black px-4 py-3 text-white shadow-lg max-w-[90vw]"
    >
        <p class="text-xs text-white/70">Undo this sale?</p>
        <div class="flex gap-2">
            <button
                onclick={() => postSoldStatus(false)}
                disabled={ownerBusy}
                class="rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold hover:bg-white/20 disabled:opacity-50"
            >
                Undo
            </button>
            <button
                onclick={() => (ownerToast = 'none')}
                disabled={ownerBusy}
                class="rounded-full bg-white/5 px-4 py-1.5 text-sm text-white/70 hover:bg-white/10 disabled:opacity-50"
            >
                Cancel
            </button>
        </div>
    </div>
{/if}

{#if ownerError}
    <div
        transition:fade={{ duration: 150 }}
        class="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] bg-black text-white text-sm px-5 py-3 rounded-full shadow-lg border border-white/10 max-w-[90vw] text-center"
    >
        {ownerError}
    </div>
{/if}
