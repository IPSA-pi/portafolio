<script lang="ts">
    import Seo from '$lib/components/Seo.svelte';

    // Owner-only hub. Reaching this page means Cloudflare Access has already
    // issued the domain-wide CF_Authorization cookie, so owner controls are now
    // unlocked across the site (e.g. editing on /new-music). Add new admin
    // features here as they appear.
    const links = [
        { href: '/admin/sales', label: 'Sales', note: 'Revenue, orders & inventory' },
        { href: '/new-music', label: 'New Music', note: 'Curate the release worklist' },
    ];
</script>

<Seo title="Admin" description="Owner tools." path="/admin" />
<svelte:head>
    <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="shell pb-20">
    <div class="max-w-2xl pt-10">
        <header class="mb-6">
            <h1 class="text-display text-content">Admin</h1>
            <p class="mt-2 font-mono text-label uppercase text-content-dim">Signed in as owner.</p>
        </header>

        <ul class="space-y-2">
            {#each links as l}
                <li>
                    <a
                        href={l.href}
                        class="group flex items-center justify-between gap-3 border border-line/12 bg-surface-raised p-4 transition-colors hover:border-signal"
                    >
                        <span>
                            <span class="text-title text-content transition-colors group-hover:text-signal">{l.label}</span>
                            <span class="mt-1 block text-meta text-content-dim">{l.note}</span>
                        </span>
                        <span class="font-mono text-content-dim">→</span>
                    </a>
                </li>
            {/each}
        </ul>
    </div>
</div>
