<script lang="ts">
    import { fade, scale } from "svelte/transition";

    interface Props {
        images: string[];
        startIndex: number;
        onClose: () => void;
    }

    let { images, startIndex, onClose }: Props = $props();
    let currentIndex = $state(startIndex);
    let rotation = $state(0);

    // Reset rotation when image changes
    $effect(() => {
        // We just need to depend on currentIndex to trigger this,
        // but we actually want to reset rotation whenever currentIndex changes.
        // creating a dependency:
        currentIndex;
        rotation = 0;
    });

    let currentImage = $derived(images[currentIndex]);

    function next() {
        currentIndex = (currentIndex + 1) % images.length;
    }

    function prev() {
        currentIndex = (currentIndex - 1 + images.length) % images.length;
    }

    function handleRotate(e: Event) {
        e.stopPropagation();
        rotation += 90;
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            onClose();
        } else if (e.key === "ArrowRight") {
            next();
        } else if (e.key === "ArrowLeft") {
            prev();
        }
    }
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

    <!-- Rotate Button -->
    <button
        class="absolute bottom-8 left-1/2 z-50 -translate-x-1/2 transform rounded-full bg-white/10 px-6 py-2 text-white backdrop-blur-md transition hover:bg-white/20 active:scale-95"
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
            <span>Rotate</span>
        </div>
    </button>

    <!-- Image Container -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
        class="relative flex items-center justify-center outline-none"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
        role="group"
        tabindex="-1"
    >
        {#key currentImage}
            <div
                class="transition-transform duration-300 ease-out"
                style="transform: rotate({rotation}deg)"
                transition:scale={{ duration: 300, start: 0.9 }}
            >
                <enhanced:img
                    src={currentImage}
                    alt="Fullscreen view"
                    class="max-h-[85vh] w-auto max-w-[85vw] object-contain shadow-2xl"
                    sizes="100vw"
                />
            </div>
        {/key}
    </div>
</div>
