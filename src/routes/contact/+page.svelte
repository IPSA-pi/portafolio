<script lang="ts">
    import Seo from '$lib/components/Seo.svelte';

    const EMAIL = 'iansebelius@gmail.com';
    const INSTAGRAM = 'iansebelius';
    const LOCATION = 'Victoria, BC';

    const linkClass =
        'break-all text-signal underline transition-colors hover:text-signal-strong';
</script>

<Seo
    title="Contact"
    path="/contact"
    description="Contact Ian Sebelius — {LOCATION}."
/>

<div class="shell pb-20">
    <div class="max-w-2xl pt-10">

        <a href="/" class="font-mono text-label uppercase text-content-dim transition-colors hover:text-signal">← Back</a>

        <h1 class="mt-6 text-display text-content">Contact</h1>

        <ul class="mt-8 space-y-3 text-title text-content">
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
