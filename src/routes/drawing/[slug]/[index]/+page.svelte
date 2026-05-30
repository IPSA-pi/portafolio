<script lang="ts">
    import Feed from '$lib/components/Feed.svelte';
    let { data } = $props();
    let startIndex = $derived(Math.max(0, data.index - 1)); // URL is 1-based
</script>

<Feed
    images={data.images}
    products={data.products}
    {startIndex}
    notebookSlug={data.slug}
/>
