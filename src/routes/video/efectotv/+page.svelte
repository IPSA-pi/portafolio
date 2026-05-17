<script lang="ts">
    import { getContext } from 'svelte';
    import VideoPlayer from '$lib/components/VideoPlayer.svelte';

    const ctx = getContext<{ ytReady: boolean }>('ytReady');

    const videos: { id: string }[] = [];
</script>

<svelte:head>
    <title>EfectoTV | Video | iansebelius</title>
    <meta name="description" content="EfectoTV work by Ian Sebelius." />
</svelte:head>

<div class="video-feed bg-black landscape:h-[calc(100dvh-6.5rem)] landscape:overflow-y-scroll landscape:overscroll-contain landscape:snap-y landscape:snap-mandatory">
    {#each videos as video (video.id)}
        <VideoPlayer videoId={video.id} ytReady={ctx.ytReady} />
    {/each}
</div>
