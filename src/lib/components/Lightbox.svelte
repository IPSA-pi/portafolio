<script lang="ts">
    import { fade, scale } from "svelte/transition";
    import { untrack } from "svelte";
    import { page } from "$app/stores";
    import PurchaseButton from "./PurchaseButton.svelte";

    interface Props {
        images: { original: string; sm: string; md: string; lg: string; slug: string }[];
        products: Record<string, { priceId: string; price: number; sold: boolean }>;
        startIndex: number;
        onClose: () => void;
    }

    let { images, products, startIndex, onClose }: Props = $props();
    let currentIndex = $state(untrack(() => startIndex));
    let notebookSlug = $derived($page.params.slug ?? "");
    let rotation = $state(0);
    let loading = $state(true);

    const ZOOM_STEPS = [1, 1.5, 2, 3];
    let zoomIndex = $state(0);
    let zoom = $derived(ZOOM_STEPS[zoomIndex]);
    let panX = $state(0);
    let panY = $state(0);
    let isDragging = $state(false);
    let dragStart = { x: 0, y: 0, px: 0, py: 0 };

    $effect(() => {
        currentIndex;
        rotation = 0;
        loading = true;
        zoomIndex = 0;
        panX = 0;
        panY = 0;
        isDragging = false;
    });

    let currentImage = $derived(images[currentIndex]);
    let currentProduct = $derived(products[currentImage.slug] || {});
    let nextIndex = $derived((currentIndex + 1) % images.length);
    let prevIndex = $derived(
        (currentIndex - 1 + images.length) % images.length,
    );

    function next() {
        currentIndex = nextIndex;
    }

    function prev() {
        currentIndex = prevIndex;
    }

    function handleRotate(e: Event) {
        e.stopPropagation();
        rotation += 90;
    }

    function zoomIn(e: Event) {
        e.stopPropagation();
        if (zoomIndex < ZOOM_STEPS.length - 1) zoomIndex++;
    }

    function zoomOut(e: Event) {
        e.stopPropagation();
        if (zoomIndex > 0) {
            zoomIndex--;
            if (zoomIndex === 0) { panX = 0; panY = 0; }
        }
    }

    function clampPan(x: number, y: number) {
        const maxX = (typeof window !== 'undefined' ? window.innerWidth : 1200) * 0.85 * (zoom - 1) / 2;
        const maxY = (typeof window !== 'undefined' ? window.innerHeight : 800) * 0.85 * (zoom - 1) / 2;
        return {
            x: Math.max(-maxX, Math.min(maxX, x)),
            y: Math.max(-maxY, Math.min(maxY, y)),
        };
    }

    function handlePointerDown(e: PointerEvent) {
        if (zoom === 1) return;
        e.stopPropagation();
        isDragging = true;
        dragStart = { x: e.clientX, y: e.clientY, px: panX, py: panY };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }

    function handlePointerMove(e: PointerEvent) {
        if (!isDragging) return;
        const clamped = clampPan(
            dragStart.px + (e.clientX - dragStart.x),
            dragStart.py + (e.clientY - dragStart.y),
        );
        panX = clamped.x;
        panY = clamped.y;
    }

    function handlePointerUp() {
        isDragging = false;
    }

    function formatTitle(slug: string): string {
        const parts = slug.split('_');
        const num = parts[parts.length - 1];
        const notebook = parts.slice(0, -1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
        return `${notebook} — ${num}`;
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            onClose();
        } else if (e.key === "ArrowRight") {
            next();
        } else if (e.key === "ArrowLeft") {
            prev();
        } else if (e.key === "+" || e.key === "=") {
            e.preventDefault();
            if (zoomIndex < ZOOM_STEPS.length - 1) zoomIndex++;
        } else if (e.key === "-") {
            e.preventDefault();
            if (zoomIndex > 0) {
                zoomIndex--;
                if (zoomIndex === 0) { panX = 0; panY = 0; }
            }
        }
    }

    let cursorClass = $derived(
        zoom === 1 ? '' : isDragging ? 'cursor-grabbing' : 'cursor-grab'
    );

    let imageTransform = $derived(
        `translate(${panX}px, ${panY}px) rotate(${rotation}deg) scale(${zoom})`
    );
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Backdrop -->
<div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm transition-all outline-none"
    onclick={onClose}
    onkeydown={(e) => e.key === "Escape" && onClose()}
    role="button"
    tabindex="0"
    aria-label="Close lightbox"
    transition:fade={{ duration: 200 }}
>
    <!-- Close Button -->
    <button
        class="absolute right-4 top-4 z-50 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
        onclick={(e) => {
            e.stopPropagation();
            onClose();
        }}
        aria-label="Close lightbox"
    >
        <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            class="h-6 w-6"
        >
            <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M6 18L18 6M6 6l12 12"
            />
        </svg>
    </button>

    <!-- Navigation Buttons -->
    <button
        class="absolute left-4 top-1/2 z-50 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20"
        onclick={(e) => {
            e.stopPropagation();
            prev();
        }}
        aria-label="Previous image"
    >
        <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            class="h-6 w-6"
        >
            <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M15.75 19.5L8.25 12l7.5-7.5"
            />
        </svg>
    </button>

    <button
        class="absolute right-4 top-1/2 z-50 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20"
        onclick={(e) => {
            e.stopPropagation();
            next();
        }}
        aria-label="Next image"
    >
        <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            class="h-6 w-6"
        >
            <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M8.25 4.5l7.5 7.5-7.5 7.5"
            />
        </svg>
    </button>

    <!-- Action Bar -->
    <div
        class="absolute bottom-8 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-4"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
        role="presentation"
    >
        <PurchaseButton
            priceId={currentProduct.priceId}
            price={currentProduct.price}
            slug={currentImage.slug}
            {notebookSlug}
            sold={currentProduct.sold}
        />

        <div class="flex items-center gap-2">
            <!-- Zoom Out -->
            <button
                class="rounded-full bg-white/10 p-2 text-white backdrop-blur-md transition hover:bg-white/20 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                onclick={zoomOut}
                disabled={zoomIndex === 0}
                aria-label="Zoom out"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-5 w-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 10.607zM13.5 10.5h-6" />
                </svg>
            </button>

            <!-- Rotate -->
            <button
                class="rounded-full bg-white/10 px-6 py-2 text-white backdrop-blur-md transition hover:bg-white/20 active:scale-95"
                onclick={handleRotate}
            >
                <div class="flex items-center gap-2">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        class="h-5 w-5"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                        />
                    </svg>
                    <span class="text-sm">Rotate</span>
                </div>
            </button>

            <!-- Zoom In -->
            <button
                class="rounded-full bg-white/10 p-2 text-white backdrop-blur-md transition hover:bg-white/20 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                onclick={zoomIn}
                disabled={zoomIndex === ZOOM_STEPS.length - 1}
                aria-label="Zoom in"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-5 w-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
                </svg>
            </button>
        </div>
    </div>

    <!-- Loading Spinner -->
    {#if loading}
        <div
            class="absolute inset-0 flex items-center justify-center z-40 pointer-events-none"
            transition:fade
        >
            <svg
                class="animate-spin h-10 w-10 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
            >
                <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                ></circle>
                <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
            </svg>
        </div>
    {/if}

    <!-- Image Container -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
        class="relative flex items-center justify-center outline-none {cursorClass}"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
        onpointerdown={handlePointerDown}
        onpointermove={handlePointerMove}
        onpointerup={handlePointerUp}
        onpointercancel={handlePointerUp}
        role="group"
        tabindex="-1"
    >
        {#key currentImage}
            <div
                style="transform: {imageTransform}; transition: {isDragging ? 'none' : 'transform 300ms ease-out'};"
                class="will-change-transform"
                transition:scale={{ duration: 300, start: 0.9 }}
            >
                <img
                    src={currentImage.lg}
                    alt={formatTitle(currentImage.slug)}
                    class="max-h-[85vh] w-auto max-w-[85vw] object-contain shadow-2xl transition-opacity duration-300 select-none {loading
                        ? 'opacity-0'
                        : 'opacity-100'}"
                    draggable="false"
                    onload={() => (loading = false)}
                />
            </div>
        {/key}
    </div>

    <!-- Preloader -->
    <div class="hidden">
        <img src={images[nextIndex].lg} alt="" />
        <img src={images[prevIndex].lg} alt="" />
    </div>
</div>
