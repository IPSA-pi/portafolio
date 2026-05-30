<script lang="ts">
    import { goto } from '$app/navigation';
    import { untrack } from 'svelte';
    import PurchaseButton from './PurchaseButton.svelte';

    interface Props {
        images: { original: string; sm: string; md: string; lg: string; slug: string }[];
        products: Record<string, { priceId: string; price: number; sold: boolean }>;
        startIndex: number;
        notebookSlug: string;
    }

    let { images, products, startIndex, notebookSlug }: Props = $props();

    let container = $state<HTMLElement | null>(null);
    let currentIndex = $state(untrack(() => startIndex));
    let mdLoaded: boolean[] = $state(untrack(() => Array(images.length).fill(false) as boolean[]));
    let rotation = $state(0);       // 0 or 90 degrees
    let isTouchDevice = $state(false);

    function formatTitle(slug: string): string {
        const parts = slug.split('_');
        const num = parts[parts.length - 1];
        const notebook = parts.slice(0, -1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
        return `${notebook} — ${num}`;
    }

    function scrollToIndex(i: number, behavior: ScrollBehavior = 'smooth') {
        container?.scrollTo({ top: i * window.innerHeight, behavior });
    }

    function close() {
        goto('/drawing/' + notebookSlug);
    }

    function toggleRotation() {
        rotation = rotation === 0 ? 90 : 0;
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowDown') scrollToIndex(Math.min(currentIndex + 1, images.length - 1));
        else if (e.key === 'ArrowUp') scrollToIndex(Math.max(currentIndex - 1, 0));
        else if (e.key === 'r' || e.key === 'R') toggleRotation();
    }

    // Scroll to start + observe slides for URL sync
    $effect(() => {
        if (!container) return;
        untrack(() => scrollToIndex(startIndex, 'instant'));

        const slides = container.querySelectorAll<HTMLElement>('[data-index]');
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
                        const i = Number((entry.target as HTMLElement).dataset.index);
                        currentIndex = i;
                        history.replaceState(null, '', `/drawing/${notebookSlug}/${i + 1}`);
                    }
                }
            },
            { threshold: 0.5 }
        );
        slides.forEach(s => observer.observe(s));
        return () => observer.disconnect();
    });

    // On touch devices: auto-rotate to fill screen when device orientation changes
    $effect(() => {
        isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
        if (!isTouchDevice) return;

        const mql = window.matchMedia('(orientation: landscape)');
        function sync(e: MediaQueryList | MediaQueryListEvent) {
            rotation = e.matches ? 90 : 0;
        }
        sync(mql);
        mql.addEventListener('change', sync);
        return () => mql.removeEventListener('change', sync);
    });

    // When rotated 90°, swap width/height so the CSS box dimensions are transposed.
    // After rotate(90deg), the visual footprint stays width=85vw × height=80dvh but
    // the portrait drawing inside fills the swapped (landscape) CSS box much larger.
    let imageContainerStyle = $derived(
        rotation % 180 !== 0
            ? `width: 80dvh; height: 85vw; transform: rotate(${rotation}deg);`
            : `width: 85vw; height: 80dvh;`
    );
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Close button — outside scroll container, always on top -->
<button
    onclick={close}
    class="fixed top-4 right-4 z-50 rounded-full bg-white/10 p-2 text-white backdrop-blur-sm transition hover:bg-white/20"
    aria-label="Back to gallery"
>
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-6 w-6">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
</button>

<!-- Rotate button — desktop only (touch devices auto-rotate via orientation sensor) -->
{#if !isTouchDevice}
    <button
        onclick={toggleRotation}
        class="fixed bottom-6 left-6 z-50 rounded-full bg-white/10 p-2 text-white backdrop-blur-sm transition hover:bg-white/20 active:scale-95"
        aria-label="Rotate image"
        title="Rotate (R)"
    >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-6 w-6">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
    </button>
{/if}

<!-- Scroll feed -->
<div
    bind:this={container}
    class="fixed inset-0 z-40 overflow-y-scroll snap-y snap-mandatory bg-black scrollbar-none"
    style="-webkit-overflow-scrolling: touch;"
>
    {#each images as image, i}
        {@const product = products[image.slug]}
        <div
            data-index={i}
            class="snap-start h-dvh w-full relative overflow-hidden"
        >
            <!-- Spinner while md loads -->
            {#if !mdLoaded[i]}
                <div class="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                    <svg class="animate-spin h-8 w-8 text-white/40" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                </div>
            {/if}

            <!-- Image: centered absolutely so dimension-swapping doesn't shift the label -->
            <div class="absolute inset-0 flex items-center justify-center">
                <div
                    class="transition-[transform,width,height] duration-300 ease-in-out"
                    style={imageContainerStyle}
                >
                    <img
                        src={image.md}
                        alt={formatTitle(image.slug)}
                        class="w-full h-full object-contain shadow-2xl select-none"
                        draggable="false"
                        onload={() => { mdLoaded[i] = true; }}
                    />
                    <img
                        src={image.lg}
                        alt=""
                        aria-hidden="true"
                        class="absolute inset-0 w-full h-full object-contain select-none opacity-0 transition-opacity duration-300"
                        draggable="false"
                        onload={(e) => (e.currentTarget as HTMLImageElement).classList.replace('opacity-0', 'opacity-100')}
                    />
                </div>
            </div>

            <!-- Label + purchase button pinned to the bottom of the slide -->
            <div class="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-3 pointer-events-none">
                {#if i === currentIndex && product}
                    <div class="pointer-events-auto">
                        <PurchaseButton
                            priceId={product.priceId}
                            price={product.price}
                            slug={image.slug}
                            {notebookSlug}
                            sold={product.sold}
                        />
                    </div>
                {/if}
                <p class="text-white/70 text-sm tracking-wide select-none">
                    {formatTitle(image.slug)}
                </p>
            </div>
        </div>
    {/each}
</div>
