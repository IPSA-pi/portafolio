<script lang="ts">
    import VideoItem from "$lib/components/VideoItem.svelte";

    const videos = [
        {
            title: "Abstract Motions in Nature",
            description:
                "A study of wind and water dynamics filmed in high contrast monochrome. 2024.",
            videoUrl: "https://www.youtube.com/embed/lxI1FOmT-u0",
        },
        {
            title: "Urban Decay: Industrial Echoes",
            description:
                "Documenting the forgotten architecture of the post-industrial era. A visual journey through abandoned spaces and silence. 2023.",
            videoUrl: "https://www.youtube.com/embed/ScMzIvxBSi4",
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
