<script lang="ts">
    import Feed from '$lib/components/Feed.svelte';
    let { data } = $props();
</script>

<svelte:head>
    <title>Feed | Drawings</title>
</svelte:head>

<Feed
    images={data.images}
    products={data.products}
    startIndex={0}
    notebookSlug=""
    mode="all"
/>
