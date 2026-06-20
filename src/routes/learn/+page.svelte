<script lang="ts">
    import Seo from '$lib/components/Seo.svelte';

    let { data } = $props();
</script>

<Seo
    title="Learn — How this site was built"
    description="A concept-first walkthrough of how iansebelius.com is built with SvelteKit 5, and the core web-development ideas behind it — written for aspiring developers."
    path="/learn"
/>

<div class="container mx-auto px-4 py-12 max-w-3xl">
    <!--
      The content is rendered from LEARN.md at build time (see +page.server.ts).
      Tailwind Typography's `prose` styles the generated HTML; `dark:prose-invert`
      flips it for dark mode. Shiki code blocks carry their own dark background.
    -->
    <article
        class="prose prose-neutral dark:prose-invert max-w-none
               prose-headings:scroll-mt-24 prose-a:text-accent hover:prose-a:text-accent-hover
               prose-pre:rounded-lg prose-pre:p-4 prose-pre:overflow-x-auto
               prose-code:before:content-none prose-code:after:content-none"
    >
        {@html data.html}
    </article>
</div>
