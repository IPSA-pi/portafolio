<script lang="ts">
    import VideoItem from "$lib/components/VideoItem.svelte";

    const videos = [
        {
            title: "Segunda bienal de la pipa 2021",
            description: "Segunda bienal de la pipa 2021",
            videoUrl:
                "https://www.youtube.com/embed/z8arUBNam5A?si=-EtlJd7bNmvo9ZhW",
        },
    ];
</script>

<svelte:head>
    <title>Video | Artist Name</title>
    <meta name="description" content="Video art and installations." />
</svelte:head>

<div class="max-w-7xl mx-auto py-8">
    <header class="mb-12">
        <h1 class="text-4xl font-light text-gray-900 tracking-tight">
            Video Work
        </h1>
    </header>

    <div class="max-w-4xl">
        {#each videos as video}
            <VideoItem
                title={video.title}
                description={video.description}
                videoUrl={video.videoUrl}
            />
        {/each}
    </div>
</div>
