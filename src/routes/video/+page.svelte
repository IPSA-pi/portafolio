<script lang="ts">
    import { onMount } from 'svelte';
    import VideoPlayer from '$lib/components/VideoPlayer.svelte';

    const videos = [
        { id: 'Q3eygejOhHg' },
        { id: '_pJOGOj4iJo' },
        { id: 'xZeS45tDgCc' },
        { id: 'ON9hl8skZz8' },
        { id: 'Kn-8c6b_JVc' },
        { id: 'EgFV6s3wTF0' },   
        { id: 'IT2WyGmoc3w' },   
    ];

    let ytReady = $state(false);

    onMount(() => {
        if ((window as any).YT?.Player) {
            ytReady = true;
            return;
        }

        (window as any).onYouTubeIframeAPIReady = () => {
            ytReady = true;
        };

        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);

        return () => {
            delete (window as any).onYouTubeIframeAPIReady;
        };
    });
</script>

<svelte:head>
    <title>Video | iansebelius</title>
    <meta name="description" content="Video work by Ian Sebelius." />
</svelte:head>

<div class="video-feed bg-black landscape:h-[calc(100dvh-4rem)] landscape:overflow-y-scroll landscape:overscroll-contain landscape:snap-y landscape:snap-mandatory">
    {#each videos as video (video.id)}
        <VideoPlayer videoId={video.id} {ytReady} />
    {/each}
</div>
