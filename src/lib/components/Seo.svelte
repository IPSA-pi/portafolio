<script lang="ts">
    import {
        SITE_NAME,
        DEFAULT_DESCRIPTION,
        DEFAULT_OG_IMAGE,
        absoluteUrl,
        type Seo,
    } from '$lib/seo';

    let { title, description, image, path, type = 'website' }: Seo = $props();

    let fullTitle = $derived(title ? `${title} | ${SITE_NAME}` : SITE_NAME);
    let desc = $derived(description ?? DEFAULT_DESCRIPTION);
    let ogImage = $derived(absoluteUrl(image ?? DEFAULT_OG_IMAGE));
    let canonical = $derived(path ? absoluteUrl(path) : undefined);
</script>

<svelte:head>
    <title>{fullTitle}</title>
    <meta name="description" content={desc} />
    {#if canonical}<link rel="canonical" href={canonical} />{/if}

    <!-- Open Graph -->
    <meta property="og:type" content={type} />
    <meta property="og:site_name" content={SITE_NAME} />
    <meta property="og:title" content={fullTitle} />
    <meta property="og:description" content={desc} />
    <meta property="og:image" content={ogImage} />
    {#if canonical}<meta property="og:url" content={canonical} />{/if}

    <!-- Twitter / X -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={fullTitle} />
    <meta name="twitter:description" content={desc} />
    <meta name="twitter:image" content={ogImage} />
</svelte:head>
