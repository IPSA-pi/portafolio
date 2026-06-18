<script lang="ts">
    import Feed from '$lib/components/Feed.svelte';
    import Seo from '$lib/components/Seo.svelte';
    let { data } = $props();
</script>

<Seo
    title="Feed"
    description="A continuous feed of original drawings by Ian Sebelius."
    path="/drawing/feed"
/>

<Feed
    images={data.images}
    products={data.products}
    startIndex={0}
    notebookSlug=""
    mode="all"
/>
