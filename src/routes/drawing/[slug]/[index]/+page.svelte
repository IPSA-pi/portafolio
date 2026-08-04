<script lang="ts">
    import { page } from '$app/stores';
    import Feed from '$lib/components/Feed.svelte';
    import Seo from '$lib/components/Seo.svelte';
    import { formatTombstone } from '$lib/utils/artwork';
    let { data } = $props();
    let startIndex = $derived(Math.max(0, data.index - 1)); // URL is 1-based

    // Title from the drawing's own title when it has one, else the notebook dir
    // name as before; the tombstone becomes the description. A drawing with no
    // metadata produces exactly today's output (dir name, default description).
    let current = $derived(data.images?.[startIndex]);
    let seoTitle = $derived(current?.title?.trim() || data.slug || 'Drawing');
    let seoDescription = $derived((current && formatTombstone(current)) || undefined);
</script>

<Seo
    title={seoTitle}
    description={seoDescription}
    image={data.slug ? `/og/${data.slug}.jpg` : undefined}
    path={$page.url.pathname}
/>

<Feed
    images={data.images}
    products={data.products}
    {startIndex}
    notebookSlug={data.slug}
/>
