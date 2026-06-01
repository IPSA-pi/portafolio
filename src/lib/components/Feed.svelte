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
    let windowWidth = $state(0);
    let windowHeight = $state(0);

    // Desktop small landscape window (e.g. 600×400): side-by-side layout
    let isLandscapeSmall = $derived(
        windowWidth > 0 && !isTouchDevice &&
        windowWidth > windowHeight && windowHeight < 500
    );
    // Very narrow portrait (e.g. 214×398, 166×416): compact bottom bar layout
    let isNarrowPortrait = $derived(
        windowWidth > 0 && windowWidth <= windowHeight && windowWidth <= 300
    );

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
        rotation = (rotation + 90) % 360;
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowDown') scrollToIndex(Math.min(currentIndex + 1, images.length - 1));
        else if (e.key === 'ArrowUp') scrollToIndex(Math.max(currentIndex - 1, 0));
        else if (e.key === 'r' || e.key === 'R') toggleRotation();
    }

    // Scroll to start on mount only
    $effect(() => {
        if (!container) return;
        untrack(() => scrollToIndex(startIndex, 'instant'));
    });

    // Observe slides for URL sync; re-registers when layout mode changes (slides re-render)
    $effect(() => {
        if (!container) return;
        isLandscapeSmall; isNarrowPortrait; // declare as reactive dependencies

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

    // Image container dimensions adapt to layout mode.
    // Narrow portrait uses calc(100dvh - 3rem) to leave exactly 3rem (h-12) for the bottom bar.
    let baseStyle = $derived(
        isLandscapeSmall ? 'width: 60vw; height: 88dvh;'
        : isNarrowPortrait ? 'width: 88vw; height: calc(100dvh - 3rem);'
        : 'width: 85vw; height: 80dvh;'
    );

    // 90°/270° swap the CSS box dimensions so the portrait drawing fills a landscape box after rotation.
    // 180° keeps the same dimensions, just flips upside down.
    let imageContainerStyle = $derived(
        rotation === 90 || rotation === 270
            ? `width: 80dvh; height: 85vw; transform: rotate(${rotation}deg);`
            : rotation === 180
                ? `${baseStyle} transform: rotate(180deg);`
                : baseStyle
    );
</script>

<svelte:window onkeydown={handleKeydown} bind:innerWidth={windowWidth} bind:innerHeight={windowHeight} />

<!-- Close button — always on top -->
<button
    onclick={close}
    class="fixed top-4 right-4 z-50 rounded-full bg-white/10 p-2 text-white backdrop-blur-sm transition hover:bg-white/20"
    aria-label="Back to gallery"
>
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-6 w-6">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
</button>

<!-- Rotate button — only in default portrait mode; landscape and narrow portrait embed it inline -->
{#if !isTouchDevice && !isLandscapeSmall && !isNarrowPortrait}
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

        {#if isLandscapeSmall}
            <!-- Landscape small: info panel left, image right -->
            <div
                data-index={i}
                class="snap-start h-dvh w-full flex flex-row overflow-hidden"
            >
                <!-- Left info panel -->
                <div class="w-[38%] shrink-0 flex flex-col justify-center items-start px-8 py-6 gap-4">
                    <p class="text-white/80 text-sm tracking-wide select-none">{formatTitle(image.slug)}</p>
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
                    <button
                        onclick={toggleRotation}
                        class="rounded-full bg-white/10 p-2 text-white backdrop-blur-sm transition hover:bg-white/20 active:scale-95"
                        aria-label="Rotate image"
                        title="Rotate (R)"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-6 w-6">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                        </svg>
                    </button>
                </div>

                <!-- Right image panel -->
                <div class="flex-1 flex items-center justify-center relative overflow-hidden">
                    {#if !mdLoaded[i]}
                        <div class="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                            <svg class="animate-spin h-8 w-8 text-white/40" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        </div>
                    {/if}
                    <div
                        class="relative transition-[transform,width,height] duration-300 ease-in-out"
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
            </div>

        {:else if isNarrowPortrait}
            <!-- Narrow portrait: image fills flex-1, bottom bar has rotate + title -->
            <div
                data-index={i}
                class="snap-start h-dvh w-full flex flex-col overflow-hidden"
            >
                <!-- Image area -->
                <div class="flex-1 min-h-0 flex items-center justify-center relative">
                    {#if !mdLoaded[i]}
                        <div class="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                            <svg class="animate-spin h-8 w-8 text-white/40" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        </div>
                    {/if}
                    <div
                        class="relative transition-[transform,width,height] duration-300 ease-in-out"
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

                <!-- Bottom bar: rotate + title (height matches the 3rem subtracted from image container) -->
                <div class="shrink-0 h-12 flex items-center gap-2 px-3 pointer-events-none">
                    {#if !isTouchDevice}
                        <button
                            onclick={toggleRotation}
                            class="pointer-events-auto shrink-0 rounded-full bg-white/10 p-1.5 text-white backdrop-blur-sm transition hover:bg-white/20 active:scale-95"
                            aria-label="Rotate image"
                            title="Rotate (R)"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-4 w-4">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                            </svg>
                        </button>
                    {/if}
                    <p class="text-white/70 text-xs tracking-wide select-none truncate flex-1 text-center">{formatTitle(image.slug)}</p>
                    {#if i === currentIndex && product}
                        <div class="pointer-events-auto shrink-0">
                            <PurchaseButton
                                priceId={product.priceId}
                                price={product.price}
                                slug={image.slug}
                                {notebookSlug}
                                sold={product.sold}
                            />
                        </div>
                    {/if}
                </div>
            </div>

        {:else}
            <!-- Default portrait layout -->
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
                        class="relative transition-[transform,width,height] duration-300 ease-in-out"
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
        {/if}
    {/each}
</div>
