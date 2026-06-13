<script lang="ts">
    import { goto } from '$app/navigation';
    import { untrack } from 'svelte';
    import PurchaseButton from './PurchaseButton.svelte';

    interface Props {
        images: { original: string; sm: string; md: string; lg: string; slug: string; notebook?: string }[];
        products: Record<string, { priceId: string; price: number; sold: boolean }>;
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

    // Bottom bar is h-16 (64px). Image height accounts for it exactly.
    const BAR_H = 64;

    let container = $state<HTMLElement | null>(null);
    let currentIndex = $state(untrack(() => startIndex));
    let mdLoaded: boolean[] = $state(untrack(() => Array(images.length).fill(false) as boolean[]));
    let rotation = $state(0);

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

    function toggleRotation() {
        rotation = rotation === 0 ? 90 : 0;
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') scrollToIndex(Math.min(currentIndex + 1, images.length - 1));
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') scrollToIndex(Math.max(currentIndex - 1, 0));
        else if (e.key === 'r' || e.key === 'R') toggleRotation();
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
        untrack(() => scrollToIndex(startIndex, 'instant'));
        if (!vertical) container.addEventListener('wheel', handleWheel, { passive: false });

        const slides = container.querySelectorAll<HTMLElement>('[data-index]');
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
                        const i = Number((entry.target as HTMLElement).dataset.index);
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
        };
    });

    // Dimension-swap trick: when rotated 90°, swap CSS width/height so the
    // visual footprint stays the same but a portrait drawing fills the
    // rotated (landscape-shaped) box much more fully.
    // Height uses calc(100dvh - BAR_H) so the image never hides behind the bar.
    let imageContainerStyle = $derived(
        rotation % 180 !== 0
            ? `width: calc(100dvh - ${BAR_H}px); height: 85vw; transform: rotate(${rotation}deg);`
            : `width: 85vw; height: calc(100dvh - ${BAR_H}px);`
    );
</script>

<svelte:window onkeydown={handleKeydown} />

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
    class="fixed inset-0 z-40 bg-black scrollbar-none snap-mandatory {vertical ? 'overflow-y-scroll snap-y' : 'flex overflow-x-scroll overflow-y-hidden snap-x'}"
    style="-webkit-overflow-scrolling: touch;"
>
    {#each images as image, i}
        {@const product = products[image.slug]}
        <!-- Each slide: flex column so the bar is always at the bottom -->
        <div
            data-index={i}
            class="snap-start h-dvh flex flex-col overflow-hidden {vertical ? 'w-full' : 'w-screen flex-none'}"
        >
            <!-- Image area: fills all space above the bottom bar -->
            <div class="flex-1 min-h-0 relative">
                <!-- Spinner -->
                {#if !mdLoaded[i]}
                    <div class="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                        <svg class="animate-spin h-8 w-8 text-white/40" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    </div>
                {/if}

                <!-- Image: centered, rotatable -->
                <div class="absolute inset-0 flex items-center justify-center overflow-hidden">
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

            <!-- Bottom bar: fixed height, always visible. Title is absolutely
                 centred so it stays centred regardless of the side controls. -->
            <div class="h-16 flex-none relative flex items-center px-4 bg-black border-t border-white/10">
                <!-- Left: rotate button (always shown) -->
                <button
                    onclick={toggleRotation}
                    class="flex-none rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20 active:scale-95"
                    aria-label="Rotate image"
                    title="Rotate (R)"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-5 w-5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                </button>

                <!-- Centre: drawing title (absolutely centred) -->
                <p class="absolute left-1/2 -translate-x-1/2 max-w-[55%] text-center text-white/70 text-sm tracking-wide truncate select-none pointer-events-none">
                    {formatTitle(image.slug)}
                </p>

                <!-- Right: buy button or spacer -->
                <div class="ml-auto flex-none flex justify-end" style="min-width: 2.25rem;">
                    {#if product}
                        <PurchaseButton
                            priceId={product.priceId}
                            price={product.price}
                            slug={image.slug}
                            notebookSlug={image.notebook ?? notebookSlug}
                            sold={product.sold}
                            compact
                        />
                    {/if}
                </div>
            </div>
        </div>
    {/each}
</div>
