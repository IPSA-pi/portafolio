<script lang="ts">
    import { page } from '$app/stores';
    import Feed from '$lib/components/Feed.svelte';
    import Seo from '$lib/components/Seo.svelte';
    import { NOTEBOOKS_BY_SLUG } from '$lib/notebooks';
    let { data } = $props();
    let startIndex = $derived(Math.max(0, data.index - 1)); // URL is 1-based
    let notebook = $derived(NOTEBOOKS_BY_SLUG[data.slug ?? '']);
</script>

<Seo
    title={notebook?.title ?? 'Drawing'}
    description={notebook?.description}
    image={notebook ? `/og/${notebook.slug}.jpg` : undefined}
    path={$page.url.pathname}
/>

<Feed
    images={data.images}
    products={data.products}
    {startIndex}
    notebookSlug={data.slug}
/>
