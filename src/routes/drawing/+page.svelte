<script lang="ts">
    import Gallery from "$lib/components/Gallery.svelte";

    // Glob import for all images in the drawings directory
    // w=2400;1200;800;400 generates 4 variants of each image
    const images = import.meta.glob("$lib/assets/drawings/*", {
        eager: true,
        query: { enhanced: true, w: "2400;1200;800;400" },
    });
    // Extract the default export (the image object) from the modules
    const imageList = Object.values(images).map((mod: any) => mod.default);
</script>

<svelte:head>
    <title>Drawings | Portfolio</title>
    <meta name="description" content="A collection of my drawings." />
</svelte:head>

<div class="container mx-auto px-4 py-8">
    <div class="mb-8">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
            Drawings
        </h1>
        <p class="mt-2 text-gray-600 dark:text-gray-400">
            Selected works and sketches.
        </p>
    </div>

    <Gallery images={imageList} />
</div>
