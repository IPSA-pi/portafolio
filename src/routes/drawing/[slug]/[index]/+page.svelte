<script lang="ts">
    import { page } from '$app/stores';
    import Feed from '$lib/components/Feed.svelte';
    import Seo from '$lib/components/Seo.svelte';
    let { data } = $props();
    let startIndex = $derived(Math.max(0, data.index - 1)); // URL is 1-based
</script>

<Seo
    title={data.slug ?? 'Drawing'}
    image={data.slug ? `/og/${data.slug}.jpg` : undefined}
    path={$page.url.pathname}
/>

<Feed
    images={data.images}
    products={data.products}
    {startIndex}
    notebookSlug={data.slug}
/>
