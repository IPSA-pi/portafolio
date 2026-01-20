<script lang="ts">
    import MediaGrid from "$lib/components/MediaGrid.svelte";

    const images = [
        "/drawings/azul_5_a-1.png",
        "https://images.unsplash.com/photo-1552083375-1447ce886485?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1542332213-31f87348057f?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1521185496955-15097b20c5fe?auto=format&fit=crop&w=800&q=80",
    ];
</script>

<svelte:head>
    <title>Photography | Artist Name</title>
    <meta name="description" content="Selected photography works." />
</svelte:head>

<div class="max-w-7xl mx-auto py-8">
    <header class="mb-12">
        <h1 class="text-4xl font-light text-gray-900 tracking-tight">
            Photography
        </h1>
    </header>

    <MediaGrid {images} />
</div>
