<script lang="ts">
    import { onMount, onDestroy } from 'svelte';

    interface Props {
        videoId: string;
        ytReady: boolean;
    }

    let { videoId, ytReady }: Props = $props();

    let container: HTMLElement | null = $state(null);
    let playerEl: HTMLDivElement | null = $state(null);
    let player: any = null;
    let playerReady = $state(false);
    let isLoaded = $state(false);
    let shouldPlay = $state(false);

    $effect(() => {
        if (!playerReady) return;
        if (shouldPlay) {
            player.playVideo();
        } else {
            player.pauseVideo();
        }
    });

    $effect(() => {
        if (ytReady && isLoaded && playerEl && !player) {
            player = new (window as any).YT.Player(playerEl, {
                videoId,
                playerVars: {
                    controls: 1,
                    rel: 0,
                    modestbranding: 1,
                    mute: 1,
                    playsinline: 1,
                    loop: 1,
                    playlist: videoId,
                    enablejsapi: 1,
                    origin: window.location.origin,
                },
                events: {
                    onReady: () => {
                        player.mute();
                        playerReady = true;
                        if (shouldPlay) player.playVideo();
                    },
                },
            });
        }
    });

    let blockMouse = $state(true);
    let hideTimer: ReturnType<typeof setTimeout>;

    function onMouseMove() {
        blockMouse = false;
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => { blockMouse = true; }, 1000);
    }

    function onMouseLeave() {
        clearTimeout(hideTimer);
        blockMouse = true;
    }

    let loadObs: IntersectionObserver;
    let playObs: IntersectionObserver;

    onMount(() => {
        if (!container) return;

        loadObs = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    isLoaded = true;
                    loadObs.disconnect();
                }
            },
            { rootMargin: '300px' }
        );

        playObs = new IntersectionObserver(
            ([entry]) => {
                shouldPlay = entry.isIntersecting;
            },
            { threshold: 0.5 }
        );

        loadObs.observe(container);
        playObs.observe(container);
    });

    onDestroy(() => {
        loadObs?.disconnect();
        playObs?.disconnect();
        player?.destroy();
        clearTimeout(hideTimer);
    });
</script>

<section
    bind:this={container}
    class="flex items-center justify-center bg-black landscape:h-[calc(100dvh-6.5rem)] landscape:snap-start"
>
    <!-- landscape: height-driven (fills screen); portrait: width-driven (flush stacking) -->
    <div
        role="presentation"
        onmousemove={onMouseMove}
        onmouseleave={onMouseLeave}
        class="relative aspect-video w-full overflow-hidden bg-neutral-950 landscape:h-full landscape:w-auto landscape:max-w-full"
    >
        {#if isLoaded}
            <div bind:this={playerEl} class="h-full w-full"></div>
        {/if}
        <!-- blocks mouse events from reaching iframe after 1s idle, forcing YT controls to hide -->
        <div class="absolute inset-0 {blockMouse ? '' : 'pointer-events-none'}"></div>
    </div>
</section>
