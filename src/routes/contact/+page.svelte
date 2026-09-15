<script lang="ts">
    import Seo from '$lib/components/Seo.svelte';

    const EMAIL = 'iansebelius@gmail.com';
</script>

<Seo
    title="Contact"
    path="/contact"
    description="Get in touch with Ian Sebelius — commissions, shipping questions, or an order you've already placed."
/>

<div class="shell pb-20">
    <div class="max-w-2xl pt-10">

        <a href="/" class="font-mono text-label uppercase text-content-dim transition-colors hover:text-signal">← Back</a>

        <h1 class="mt-6 text-display text-content">Contact</h1>

        <p class="mt-6 max-w-prose font-body text-body text-content-dim">
            For commissions, shipping questions, or an order you've already placed,
            email is the fastest way to reach me.
        </p>

        <p class="mt-6 text-title">
            <a
                href="mailto:{EMAIL}"
                class="break-all text-signal underline transition-colors hover:text-signal-strong"
            >{EMAIL}</a>
        </p>

    </div>
</div>
