<script lang="ts">
    import { goto, replaceState, invalidateAll } from '$app/navigation';
    import { page } from '$app/stores';
    import { untrack } from 'svelte';
    import { fade } from 'svelte/transition';
    import PurchaseButton from './PurchaseButton.svelte';
    import { cartItems, cartCount, addToCart, removeFromCart, MAX_CART_ITEMS } from '$lib/stores/cart';
    import { artworkTitle, artworkAlt, type ArtworkImage } from '$lib/utils/artwork';
    import { formatPrice } from '$lib/utils/formatPrice';
    import { formatNotebook } from '$lib/utils/formatNotebook';

    interface Props {
        images: ArtworkImage[];
        // An entry exists when the original is priced OR its digital file is
        // listed, so the original's half (priceId / price) can be null.
        products: Record<string, { priceId: string | null; price: number | null; sold: boolean; reserved: boolean; digitalPrice: number | null }>;
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
    // Everything about the *original* — cart, Buy, the owner's booth
    // controls — keys off this rather than off the entry
    // existing: a digital-only entry has no original for sale.
    let originalPrice = $derived(currentProduct?.priceId ? currentProduct.price : null);
    let isPurchasable = $derived(!!currentProduct && originalPrice !== null && !currentProduct.sold && !currentProduct.reserved);
    let inCart = $derived(!!currentImage && $cartItems.some((i) => i.slug === currentImage.slug));

    let cartFullMessage = $state<string | null>(null);
    let cartFullTimeout: ReturnType<typeof setTimeout> | undefined;

    function toggleCart() {
        if (!currentImage || originalPrice === null) return;
        if (inCart) {
            removeFromCart(currentImage.slug);
            return;
        }
        const added = addToCart({ slug: currentImage.slug, notebook: currentImage.notebook ?? notebookSlug, price: originalPrice, image: currentImage.sm });
        if (!added) {
            cartFullMessage = `Cart is full (${MAX_CART_ITEMS} max)`;
            clearTimeout(cartFullTimeout);
            cartFullTimeout = setTimeout(() => (cartFullMessage = null), 3000);
        }
    }

    // Booth "mark sold" / undo — owner-only, in-person cash/e-transfer sales
    // (see /admin/drawings/sold). Gated on originalPrice: only drawings whose
    // original is priced get the controls, as before digital-only entries
    // existed.
    let isAdmin = $derived(Boolean($page.data.isAdmin));
    let ownerToast = $state<'none' | 'choose-method' | 'confirm-undo' | 'confirm-force'>('none');
    let ownerBusy = $state(false);
    let ownerMessage = $state<string | null>(null);
    let ownerMessageTimeout: ReturnType<typeof setTimeout> | undefined;
    // The method picked before a 'reserved' 409, so "Take it anyway" can retry
    // with it rather than asking cash/e-transfer a second time.
    let pendingMethod = $state<'cash' | 'etransfer'>('cash');

    function showOwnerMessage(message: string) {
        ownerMessage = message;
        clearTimeout(ownerMessageTimeout);
        ownerMessageTimeout = setTimeout(() => (ownerMessage = null), 6000);
    }

    async function postSoldStatus(sold: boolean, method?: 'cash' | 'etransfer', force = false) {
        if (!currentImage || ownerBusy) return;
        ownerBusy = true;
        ownerToast = 'none';
        try {
            const res = await fetch('/admin/drawings/sold', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    slug: currentImage.slug,
                    sold,
                    ...(method ? { method } : {}),
                    ...(force ? { force: true } : {})
                })
            });
            const resBody = await res.json().catch(() => ({}));
            if (!res.ok) {
                // A live online hold is the one refusal the owner can overrule:
                // they're holding the drawing and the cash. Offer the override
                // rather than leaving them stuck at the table for 35 minutes.
                if (res.status === 409 && resBody.reason === 'reserved' && method) {
                    pendingMethod = method;
                    ownerToast = 'confirm-force';
                    return;
                }
                showOwnerMessage(resBody.error ?? 'Something went wrong');
                return;
            }
            if (resBody.overrodeHold) {
                showOwnerMessage('Marked sold — refund that buyer if their checkout goes through');
            }
            await invalidateAll();
        } finally {
            ownerBusy = false;
        }
    }

    // The artwork never sits under the controls. Below `lg` the controls are
    // a bar along the bottom and every slide's image is fitted into the
    // viewport minus `barReserve`; from `lg` up they're a rail down the
    // right-hand side (`RAIL_WIDTH`) and the image gets the full height.
    //
    // The bar's own height changes from slide to slide (two offers, one, sold,
    // none), and letting the frame follow it would resize the artwork on every
    // swipe. So the reserve only ever grows — it's the tallest bar seen at this
    // viewport width — and the bar hangs from the top of that space, which
    // keeps the title at the same spot under every drawing.
    //
    // Must match Tailwind's `lg` breakpoint and the rail's `lg:w-[25rem]` /
    // the scroll container's `lg:[--rail-w:25rem]`.
    const RAIL_MIN_WIDTH = 1024;
    let barHeight = $state(0);
    let viewportWidth = $state(0);
    let barReserve = $state(0);
    let reservedAtWidth = 0;
    $effect(() => {
        const h = barHeight;
        const w = viewportWidth;
        untrack(() => {
            if (w >= RAIL_MIN_WIDTH) {
                // The rail is full-height; it reserves width, not height.
                reservedAtWidth = w;
                barReserve = 0;
            } else if (w !== reservedAtWidth) {
                reservedAtWidth = w;
                barReserve = h;
            } else if (h > barReserve) {
                barReserve = h;
            }
        });
    });

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
    }

    function toggleZoomButton() {
        if (zoom !== 1) resetZoom();
        else zoomIn();
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
        };
    });

    // Dimension-swap trick: when rotated 90°, swap CSS width/height so the
    // visual footprint stays the same but a portrait drawing fills the
    // rotated (landscape-shaped) box much more fully. The box is the frame's
    // content area: the viewport minus the bar or rail (`--bar-h` / `--rail-w`)
    // and minus the frame's own vertical padding (`--frame-py`), all set on the
    // scroll container. 85% of the width keeps a margin either side.
    let imageContainerStyle = $derived(
        Math.abs(rotation / 90) % 2 === 1
            ? `width: calc(100dvh - var(--bar-h) - var(--frame-py)); height: calc((100vw - var(--rail-w)) * 0.85); transform: rotate(${rotation}deg);`
            : `width: calc((100vw - var(--rail-w)) * 0.85); height: calc(100dvh - var(--bar-h) - var(--frame-py)); transform: rotate(${rotation}deg);`
    );
</script>

<svelte:window onkeydown={handleKeydown} bind:innerWidth={viewportWidth} />

<!-- Close button — outside scroll container, dark bg so it's visible against
     any image. Above the controls (z-[55]): from lg up the rail covers this
     corner and would otherwise take the click. -->
<button
    onclick={close}
    class="fixed top-4 right-4 z-[55] border border-white/15 bg-black/60 p-2 text-white shadow-lg backdrop-blur-sm transition hover:border-white/40"
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
        class="fixed top-4 left-4 z-50 flex items-center gap-2 border border-white/15 bg-black/60 px-3 py-2 text-white shadow-lg backdrop-blur-sm transition hover:border-white/40"
        aria-label="View cart ({$cartCount} items)"
    >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-5 w-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.836l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 1.994-4.693 2.602-7.152.084-.34-.16-.68-.508-.68H5.106M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
        </svg>
        <span class="font-mono text-label">{$cartCount}</span>
    </a>
{/if}

<!-- Scroll feed: vertical for the all-drawings feed, horizontal for a notebook lightbox -->
<!-- --frame-py is the frame's top + bottom padding below: on a phone the top
     clears the close button (top-4 + its 2.5rem) so the artwork's corner never
     sits under it; from lg up it's an even 1.5rem all round. -->
<div
    bind:this={container}
    class="fixed inset-0 z-40 bg-black scrollbar-none snap-mandatory [--rail-w:0px] [--frame-py:4.25rem] lg:[--rail-w:25rem] lg:[--frame-py:3rem] {vertical ? 'overflow-y-scroll snap-y' : 'flex overflow-x-scroll overflow-y-hidden snap-x'}"
    style="-webkit-overflow-scrolling: touch; --bar-h: {barReserve}px;"
>
    {#each images as image, i}
        <!-- Each slide is a full viewport; its image is fitted into the part
             not taken by the controls (above the bar, or left of the rail). -->
        <div
            data-index={i}
            class="snap-start snap-always h-dvh relative overflow-hidden {vertical ? 'w-full' : 'w-screen flex-none'}"
        >
            <!-- Spinner -->
            {#if !mdLoaded[i]}
                <div class="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                    <svg class="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                </div>
            {/if}

            <!-- Image: centred in the frame, rotatable, double-tap to zoom -->
            <div class="absolute left-0 top-0 right-[var(--rail-w)] bottom-[var(--bar-h)] flex items-center justify-center overflow-hidden pt-14 pb-3 lg:py-6">
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
                            alt={artworkAlt(image, image.slug)}
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

<!-- Controls: rotate · title · offers, on black beside the artwork (the
     slides reserve this space — see `barReserve`). Driven by the current
     slide. One element, two layouts:

     Below lg it's a bar along the bottom, pinned by its top edge to the start
     of the reserved space so a shorter bar leaves its spare room below, not
     above. Below sm it wraps: rotate + title share the first row and the
     offers take full-width rows under it (rotate + cart + Buy in one row left
     the title one character wide, "F…"). The owner's bar keeps the title on
     its own centred row above the buttons instead. From sm up it's a single
     row.

     From lg up it's a rail down the right-hand side — a wall label beside the
     work: the toolbar at the top, title and offers vertically centred — and
     the artwork gets the full viewport height. -->
<div
    bind:clientHeight={barHeight}
    class="fixed inset-x-0 z-50 flex flex-wrap content-start items-center gap-x-3 gap-y-3 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:flex-nowrap sm:items-start lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[25rem] lg:flex-col lg:items-stretch lg:gap-0 lg:overflow-y-auto lg:px-7 lg:pb-8 lg:pt-20 {barReserve ? 'top-[var(--bar-top)]' : 'bottom-0'}"
    style="--bar-top: calc(100dvh - {barReserve}px);"
>
    <!-- Toolbar: rotate · rotate · zoom. `contents` below lg so the buttons
         wrap with the rest of the bar; in the rail it's its own row, pinned
         to the top. -->
    <div class="contents lg:absolute lg:left-7 lg:top-4 lg:flex lg:gap-3">
        <!-- Rotate left (counter-clockwise, −90°). A near-full circle with the arrow
             head sitting on its rim reads as "spin", where the old hooked arrow
             read as undo/redo. -->
        <button
            onclick={() => rotateBy(-90)}
            class="flex-none border border-white/20 p-2.5 text-white backdrop-blur-sm transition hover:border-white/50 active:scale-95"
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
            class="flex-none border border-white/20 p-2.5 text-white backdrop-blur-sm transition hover:border-white/50 active:scale-95"
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
                class="flex-none border border-white/20 p-2.5 text-white backdrop-blur-sm transition hover:border-white/50 active:scale-95"
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
    </div>

    <!-- Title only. Material and size are the same for every drawing on the
         page, so the gallery page says them once (DrawingFacts) rather than
         the viewer repeating them under each one. The title truncates in the
         bar; in the rail it wraps and steps up a size. mt-auto / mb-auto on
         this and the offers block centre the pair in the rail; on a short
         window they collapse so nothing is pushed out of reach. -->
    {#if currentImage}
        <div class="min-w-0 select-none pointer-events-none sm:order-none sm:basis-auto sm:flex-1 sm:text-center lg:mt-auto lg:flex-none lg:text-left {isAdmin ? 'order-first basis-full text-center' : 'flex-1'}">
            <p class="truncate font-body text-white lg:whitespace-normal lg:text-title">
                {artworkTitle(currentImage, currentImage.slug)}
            </p>
            <!-- All Drawings mixes every notebook, so say which one this page
                 came from. Not in a notebook's own viewer: you're already
                 there. White rather than the page tokens,
                 since content-dim is graphite in light mode and would vanish
                 on this black ground. pointer-events-auto because the caption
                 block itself lets taps through to the artwork. -->
            {#if mode === 'all' && currentImage.notebook}
                <a
                    href="/drawing/{currentImage.notebook}"
                    class="pointer-events-auto mt-1 inline-block font-mono text-label uppercase text-white/55 transition-colors hover:text-accent focus-visible:text-accent lg:mt-2"
                >
                    Part of {formatNotebook(currentImage.notebook)} →
                </a>
            {/if}
        </div>
    {/if}

    <!-- Offers: one row per offer (original, digital file), laid out by
         PurchaseButton — a name and a button, no notes. Below sm they take
         the full width under the rotate + title row; from sm up they shrink to fit at the right of the
         single row; in the rail they sit under the title behind a hairline. -->
    {#if currentImage && currentProduct && !isAdmin}
        <div class="basis-full sm:w-auto sm:max-w-[23rem] sm:flex-none sm:basis-auto lg:mb-auto lg:mt-6 lg:w-auto lg:max-w-none lg:border-t lg:border-white/10 lg:pt-5">
            <!-- The cart button rides in as `leading` so it sits beside Buy,
                 inside the original's row. It belongs to the original, so it
                 only renders when the original is purchasable. -->
            <PurchaseButton
                priceId={currentProduct.priceId}
                price={currentProduct.price}
                slug={currentImage.slug}
                notebookSlug={currentImage.notebook ?? notebookSlug}
                sold={currentProduct.sold}
                reserved={currentProduct.reserved}
                digitalPrice={currentProduct.digitalPrice}
                compact
            >
                {#snippet leading()}
                    {#if isPurchasable}
                        <!-- Icon-only: the words "Add to cart" plus "Buy · $XX" beside
                             them overflowed a portrait phone, clipping the price. The
                             sign carries the action (＋ add / − remove) and the accent
                             colour carries the state (in cart), so the label lives in
                             aria-label / title rather than on screen. -->
                        <button
                            onclick={toggleCart}
                            class="flex items-center gap-1 px-3 py-2 backdrop-blur-sm transition-all active:scale-95 {inCart
                                ? 'border border-accent text-accent'
                                : 'border border-white/20 text-white hover:border-white/50'}"
                            aria-label={inCart ? 'Remove from cart' : 'Add to cart'}
                            title={inCart ? 'Remove from cart' : 'Add to cart'}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="h-3.5 w-3.5" aria-hidden="true">
                                {#if inCart}
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14" />
                                {:else}
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14M5 12h14" />
                                {/if}
                            </svg>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-5 w-5" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.836l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 1.994-4.693 2.602-7.152.084-.34-.16-.68-.508-.68H5.106M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                            </svg>
                        </button>
                    {/if}
                {/snippet}
            </PurchaseButton>
        </div>
    {:else}
        <!-- Owner controls (or a width-reserving spacer so the title stays centred).

             The owner gets a slimmed bar: no cart button, no Buy —
             affordances nobody taps on their own inventory, and three
             buttons plus the title overflow a portrait phone, pushing "Mark sold"
             (the one control a booth actually needs) off the edge. The price and
             the sold/on-hold state stay, as a plain label: the price is what you
             quote out loud, and "On hold" warns that someone is mid-checkout
             before you take cash for the same drawing. That label goes *above*
             the button — stacked it costs no horizontal room, so the title keeps
             room to truncate into instead of collapsing to nothing. -->
        <div class="ml-auto flex-none flex flex-col items-end gap-1 sm:ml-0 lg:mb-auto lg:mt-6 lg:items-start lg:gap-2" style="min-width: 2.75rem;">
            {#if isAdmin && currentProduct && originalPrice !== null && !currentProduct.sold}
                <!-- Same state language as PurchaseButton's compact variant:
                     available carries phosphor, on-hold withholds it. Sold needs no
                     label — the undo button below it already says "Sold". -->
                {#if currentProduct.reserved}
                    <p
                        class="select-none font-mono text-label uppercase text-white/70"
                        title="In someone's online checkout right now"
                    >On hold</p>
                {:else}
                    <p class="pointer-events-none select-none font-mono text-label uppercase text-accent">{formatPrice(originalPrice, { compact: true })}</p>
                {/if}
            {/if}
            <div class="flex items-center gap-2">
                {#if isAdmin && currentImage && currentProduct && originalPrice !== null}
                    {#if currentProduct.sold}
                        <button
                            onclick={() => (ownerToast = 'confirm-undo')}
                            class="border border-white/20 px-4 py-2 font-mono text-label uppercase text-white backdrop-blur-sm transition-all hover:border-white/50 active:scale-95"
                        >
                            Sold · undo
                        </button>
                    {:else}
                        <button
                            onclick={() => (ownerToast = 'choose-method')}
                            class="border border-white/20 px-4 py-2 font-mono text-label uppercase text-white backdrop-blur-sm transition-all hover:border-white/50 active:scale-95"
                        >
                            Mark sold
                        </button>
                    {/if}
                {/if}
            </div>
        </div>
    {/if}
</div>

{#if cartFullMessage}
    <div
        transition:fade={{ duration: 150 }}
        class="fixed bottom-24 left-1/2 z-[60] max-w-[90vw] -translate-x-1/2 border-l-2 border-alert bg-black px-5 py-3 text-center font-body text-meta text-white shadow-lg"
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
        <p class="text-xs text-white">Mark sold — payment method?</p>
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
                class="rounded-full bg-white/5 px-4 py-1.5 text-sm text-white hover:bg-white/10 disabled:opacity-50"
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
        <p class="text-xs text-white">Undo this sale?</p>
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
                class="rounded-full bg-white/5 px-4 py-1.5 text-sm text-white hover:bg-white/10 disabled:opacity-50"
            >
                Cancel
            </button>
        </div>
    </div>
{:else if ownerToast === 'confirm-force'}
    <div
        transition:fade={{ duration: 150 }}
        class="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-black px-4 py-3 text-white shadow-lg max-w-[90vw]"
    >
        <p class="text-xs text-white">Someone's in online checkout for this one.</p>
        <p class="max-w-[18rem] text-center text-xs text-white/60">
            Take it anyway if you're holding the drawing — if their payment goes through,
            you'll need to refund them in Stripe.
        </p>
        <div class="flex gap-2">
            <button
                onclick={() => postSoldStatus(true, pendingMethod, true)}
                disabled={ownerBusy}
                class="rounded-full bg-red-500/80 px-4 py-1.5 text-sm font-semibold hover:bg-red-500 disabled:opacity-50"
            >
                Take it anyway
            </button>
            <button
                onclick={() => (ownerToast = 'none')}
                disabled={ownerBusy}
                class="rounded-full bg-white/5 px-4 py-1.5 text-sm text-white hover:bg-white/10 disabled:opacity-50"
            >
                Cancel
            </button>
        </div>
    </div>
{/if}

{#if ownerMessage}
    <div
        transition:fade={{ duration: 150 }}
        class="fixed bottom-24 left-1/2 z-[60] max-w-[90vw] -translate-x-1/2 border-l-2 border-alert bg-black px-5 py-3 text-center font-body text-meta text-white shadow-lg"
    >
        {ownerMessage}
    </div>
{/if}
