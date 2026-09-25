<script lang="ts">
    import Seo from '$lib/components/Seo.svelte';

    const EMAIL = 'iansebelius@gmail.com';
    const INSTAGRAM = 'iansebelius';
    const LOCATION = 'Victoria, BC';

    const linkClass =
        'underline text-gray-900 dark:text-white hover:text-black dark:hover:text-accent transition-colors';
</script>

<Seo
    title="Contact"
    path="/contact"
    description="Contact Ian Sebelius — {LOCATION}."
/>

<div class="min-h-screen bg-gray-100 dark:bg-neutral-950 py-16 px-4">
    <div class="max-w-2xl mx-auto px-8 py-12">

        <a href="/" class="text-sm text-gray-800 dark:text-white hover:text-black dark:hover:text-accent transition-colors">← Back</a>

        <h1 class="mt-6 text-3xl font-bold text-gray-900 dark:text-white">Contact</h1>

        <ul class="mt-8 space-y-3 text-lg text-gray-900 dark:text-white">
            <li><a href="mailto:{EMAIL}" class={linkClass}>{EMAIL}</a></li>
            <li>
                <a
                    href="https://instagram.com/{INSTAGRAM}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class={linkClass}
                >@{INSTAGRAM}</a>
            </li>
            <li>{LOCATION}</li>
        </ul>

    </div>
</div>
