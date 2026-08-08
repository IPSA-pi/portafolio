<script lang="ts">
    import Seo from '$lib/components/Seo.svelte';

    const EMAIL = 'iansebelius@gmail.com';
</script>

<Seo
    title="Contact"
    path="/contact"
    description="Get in touch with Ian Sebelius — commissions, shipping questions, or an order you've already placed."
/>

<div class="min-h-screen bg-gray-100 dark:bg-neutral-950 py-16 px-4">
    <div class="max-w-2xl mx-auto px-8 py-12">

        <a href="/" class="text-sm text-gray-800 dark:text-white hover:text-black dark:hover:text-accent transition-colors">← Back</a>

        <h1 class="mt-6 text-3xl font-bold text-gray-900 dark:text-white">Contact</h1>

        <p class="mt-6 text-gray-700 dark:text-white leading-relaxed">
            For commissions, shipping questions, or an order you've already placed,
            email is the fastest way to reach me.
        </p>

        <p class="mt-6 text-lg">
            <a
                href="mailto:{EMAIL}"
                class="underline text-gray-900 dark:text-white hover:text-black dark:hover:text-accent transition-colors"
            >{EMAIL}</a>
        </p>

    </div>
</div>
