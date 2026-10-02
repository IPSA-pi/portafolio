<script lang="ts">
    import Seo from '$lib/components/Seo.svelte';
    import PageHeader from '$lib/components/PageHeader.svelte';
    import Notice from '$lib/components/Notice.svelte';
    import { DIGITAL_LICENSE, DIGITAL_FILE_DESCRIPTION } from '$lib/digitalLicense';

    // Deliberately inert: no checkout-return handling, no cart writes, no
    // session-status call. A digital purchase reserved nothing and came from
    // no cart, and the server load has already verified the payment.
    let { data } = $props();
    let files = $derived(data.files);
    let multiple = $derived(files.length > 1);
</script>

<!-- No `path`: the only URL this page has carries the buyer's session id, so
     there is no canonical to advertise. -->
<Seo title={multiple ? 'Your digital files' : 'Your digital file'} />
<svelte:head>
    <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="shell max-w-2xl pb-20">
    <div class="pt-8">
        <Notice label="Payment confirmed">
            {multiple ? 'Your files are ready to download.' : 'Your file is ready to download.'}
            Your receipt was sent by Link (Stripe).
        </Notice>
    </div>

    <PageHeader
        eyebrow="Digital download"
        title={multiple ? 'Your files' : 'Your file'}
        count={files.length}
        countUnit={multiple ? 'files' : 'file'}
    >
        {multiple ? 'Each file is' : 'The file is'} {DIGITAL_FILE_DESCRIPTION}.
    </PageHeader>

    <ul class="mt-8 border-y border-line/12">
        {#each files as file}
            <li class="flex flex-col gap-4 border-b border-line/12 py-5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
                <div class="min-w-0">
                    <p class="text-title text-content">{file.title}</p>
                    {#if file.tombstone}
                        <p class="mt-1 font-mono text-meta text-content-dim">{file.tombstone}</p>
                    {/if}
                </div>
                {#if file.url}
                    <a
                        href={file.url}
                        rel="noreferrer"
                        class="flex-none bg-content px-6 py-3.5 text-center font-mono text-label uppercase text-surface transition-all hover:bg-signal hover:text-surface active:scale-[0.99]"
                    >
                        Download PNG
                    </a>
                {:else}
                    <p class="font-mono text-label uppercase text-alert sm:text-right">
                        Not ready — reload, or email me
                    </p>
                {/if}
            </li>
        {/each}
    </ul>

    <p class="mt-6 font-body text-body text-content-dim">
        This page keeps working; bookmark it or use the link in your email. The
        download {multiple ? 'buttons are' : 'button is'} refreshed each time you open it.
    </p>

    <h2 class="mt-10 font-mono text-label uppercase text-content-dim">Licence</h2>
    <p class="mt-3 font-body text-body text-content-dim">{DIGITAL_LICENSE}</p>

    <p class="mt-10 font-body text-body text-content-dim">
        Something wrong with a file? Email
        <a href="mailto:sebeliusancira@gmail.com" class="text-signal underline transition-colors hover:text-signal-strong">sebeliusancira@gmail.com</a>.
    </p>
</div>
