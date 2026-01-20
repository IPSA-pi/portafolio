<script lang="ts">
    import { page } from "$app/stores";
    import Gallery from "$lib/components/Gallery.svelte";

    let { data } = $props();

    // Map of slugs to titles
    const titles: Record<string, string> = {
        "01_negro": "Notebook 01 (Black)",
        "05_azul": "Notebook 05 (Blue)",
    };

    let title = $derived(titles[$page.params.slug ?? ""] || "Gallery");
</script>

<svelte:head>
    <title>{title} | Artist Name</title>
</svelte:head>

<div class="container mx-auto px-4 py-8">
    <div class="mb-8 flex items-baseline gap-4">
        <a
            href="/drawing"
            class="text-sm text-gray-500 hover:text-black dark:hover:text-white transition-colors"
            >← Back</a
        >
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
            {title}
        </h1>
    </div>

    <Gallery images={data.images} />
</div>
