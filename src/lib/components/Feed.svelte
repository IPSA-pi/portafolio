<script lang="ts">
    import { goto } from '$app/navigation';
    import { untrack } from 'svelte';
    import PurchaseButton from './PurchaseButton.svelte';

    interface Props {
        images: { original: string; sm: string; md: string; lg: string; slug: string; notebook?: string }[];
        products: Record<string, { priceId: string; price: number; sold: boolean; reserved: boolean }>;
        startIndex: number;
        notebookSlug: string;
        // 'notebook' = single-notebook viewer (per-image URL); 'all' = the random
        // feed of every drawing (no per-image URL rewrite, closes to /drawing).
        mode?: 'notebook' | 'all';
    }

    let { images, products, startIndex, notebookSlug, mode = 'notebook' }: Props = $props();

    // The all-drawings feed scrolls vertically (doom-scroll); a single notebook's
    // lightbox scrolls horizontally.
    let vertical = $derived(mode === 'all');

    let container = $state<HTMLElement | null>(null);
    let currentIndex = $state(untrack(() => startIndex));
    let mdLoaded: boolean[] = $state(untrack(() => Array(images.length).fill(false) as boolean[]));
    let rotation = $state(0);

    // Double-click zoom, centred on the click point — desktop only. On touch
    // devices we leave the browser's own pinch / double-tap zoom to the user
    // instead. Deliberately simple: no panning — click to inspect detail, click
    // again to reset. Resets automatically on navigation so a new slide starts 1×.
    let canDblZoom = $state(false);
    let zoom = $state(1);
    let zoomOrigin = $state({ x: 50, y: 50 });
    let zoomStyle = $derived(
        `transform: scale(${zoom}); transform-origin: ${zoomOrigin.x}% ${zoomOrigin.y}%; cursor: ${canDblZoom ? (zoom === 1 ? 'zoom-in' : 'zoom-out') : 'default'};`
    );

    // Floating controls auto-hide after a short idle so the artwork is unobscured;
    // any pointer movement or tap brings them back.
    let controlsVisible = $state(true);
    let hideTimer: ReturnType<typeof setTimeout>;
    function showControls() {
        controlsVisible = true;
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => { controlsVisible = false; }, 4500);
    }

    let currentImage = $derived(images[currentIndex]);
    let currentProduct = $derived(currentImage ? products[currentImage.slug] : undefined);

    function formatTitle(slug: string): string {
        const parts = slug.split('_');
        const num = parts[parts.length - 1];
        const notebook = parts.slice(0, -1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
        return `${notebook} — ${num}`;
    }

    function scrollToIndex(i: number, behavior: ScrollBehavior = 'smooth') {
        if (vertical) container?.scrollTo({ top: i * window.innerHeight, behavior });
        else container?.scrollTo({ left: i * window.innerWidth, behavior });
    }

    function close() {
        goto(mode === 'all' ? '/drawing' : '/drawing/' + notebookSlug);
    }

    // Rotate in 90° steps, either direction. The angle accumulates freely
    // (no wrap) so the CSS transition always animates the short 90° way and
    // never spins backward across a 360° boundary.
    function rotateBy(delta: number) {
        rotation += delta;
        showControls();
    }

    function toggleZoom(e: MouseEvent) {
        if (!canDblZoom) return; // touch devices use native pinch zoom
        if (zoom !== 1) { zoom = 1; return; }
        if (!(e.currentTarget instanceof HTMLElement)) return;
        const rect = e.currentTarget.getBoundingClientRect();
        zoomOrigin = {
            x: ((e.clientX - rect.left) / rect.width) * 100,
            y: ((e.clientY - rect.top) / rect.height) * 100
        };
        zoom = 2;
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') scrollToIndex(Math.min(currentIndex + 1, images.length - 1));
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') scrollToIndex(Math.max(currentIndex - 1, 0));
        else if (e.key === 'r' || e.key === 'R') rotateBy(e.shiftKey ? -90 : 90);
    }

    // In the horizontal lightbox a mouse wheel scrolls vertically, which would do
    // nothing. Translate any wheel gesture into one step of horizontal navigation,
    // with a short lock so a single flick advances exactly one image. (The vertical
    // feed uses native scrolling, so this is only wired up in horizontal mode.)
    let wheelLock = false;
    function handleWheel(e: WheelEvent) {
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
        untrack(() => scrollToIndex(startIndex, 'instant'));
        untrack(showControls);
        if (!vertical) container.addEventListener('wheel', handleWheel, { passive: false });

        const slides = container.querySelectorAll<HTMLElement>('[data-index]');
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
                        const i = Number((entry.target as HTMLElement).dataset.index);
                        if (i !== currentIndex) zoom = 1; // new slide always starts at 1×
                        currentIndex = i;
                        if (mode === 'notebook') {
                            history.replaceState(null, '', `/drawing/${notebookSlug}/${i + 1}`);
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

<!-- Scroll feed: vertical for the all-drawings feed, horizontal for a notebook lightbox -->
<div
    bind:this={container}
    onpointerdown={showControls}
    onscroll={() => { if (zoom !== 1) zoom = 1; }}
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
                <!-- Zoom layer: scales toward the tap point -->
                <div
                    ondblclick={toggleZoom}
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
                        <img
                            src={image.lg}
                            alt=""
                            aria-hidden="true"
                            class="absolute inset-0 w-full h-full object-contain select-none opacity-0 transition-opacity duration-300"
                            draggable="false"
                            loading={Math.abs(i - startIndex) <= 1 ? 'eager' : 'lazy'}
                            onload={(e) => (e.currentTarget as HTMLImageElement).classList.replace('opacity-0', 'opacity-100')}
                        />
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
    <!-- Rotate left (counter-clockwise, −90°): left-pointing curved arrow -->
    <button
        onclick={() => rotateBy(-90)}
        class="flex-none rounded-full bg-white/10 backdrop-blur-sm p-2.5 text-white transition hover:bg-white/20 active:scale-95"
        aria-label="Rotate left"
        title="Rotate left (Shift+R)"
    >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-5 w-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
        </svg>
    </button>

    <!-- Rotate right (clockwise, +90°): right-pointing curved arrow -->
    <button
        onclick={() => rotateBy(90)}
        class="flex-none rounded-full bg-white/10 backdrop-blur-sm p-2.5 text-white transition hover:bg-white/20 active:scale-95"
        aria-label="Rotate right"
        title="Rotate right (R)"
    >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-5 w-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="m15 15 6-6m0 0-6-6m6 6H9a6 6 0 0 0 0 12h3" />
        </svg>
    </button>

    <!-- Title -->
    {#if currentImage}
        <p class="flex-1 min-w-0 text-center text-white/80 text-sm tracking-wide truncate select-none pointer-events-none drop-shadow">
            {formatTitle(currentImage.slug)}
        </p>
    {/if}

    <!-- Buy (or width-reserving spacer so the title stays centred) -->
    <div class="flex-none flex justify-end" style="min-width: 2.75rem;">
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
    </div>
</div>
