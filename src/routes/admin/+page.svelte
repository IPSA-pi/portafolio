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

<div class="min-h-screen bg-gray-100 dark:bg-neutral-950">
    <div class="max-w-2xl mx-auto px-4 sm:px-6 py-10">
        <header class="mb-6">
            <h1 class="text-2xl font-bold tracking-tight text-black dark:text-white">Admin</h1>
            <p class="text-sm text-black dark:text-white">Signed in as owner.</p>
        </header>

        <ul class="space-y-2">
            {#each links as l}
                <li>
                    <a
                        href={l.href}
                        class="flex items-center justify-between gap-3 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 p-4 hover:border-accent transition-colors"
                    >
                        <span>
                            <span class="font-semibold text-black dark:text-white">{l.label}</span>
                            <span class="block text-xs text-black dark:text-white">{l.note}</span>
                        </span>
                        <span class="text-black/65 dark:text-white/65">→</span>
                    </a>
                </li>
            {/each}
        </ul>
    </div>
</div>
