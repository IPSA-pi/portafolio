<script lang="ts">
    import { invalidateAll } from '$app/navigation';
    import Seo from '$lib/components/Seo.svelte';
    import { formatPrice } from '$lib/utils/formatPrice';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    // Per-card mark-shipped state, keyed by Stripe session id.
    let tracking = $state<Record<string, string>>({});
    let shipping = $state<Record<string, boolean>>({});
    let shipError = $state<Record<string, string>>({});

    async function markShipped(sessionId: string) {
        shipping[sessionId] = true;
        shipError[sessionId] = '';
        try {
            const res = await fetch('/admin/sales/ship', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId, trackingNumber: tracking[sessionId] ?? '' }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const out = await res.json();
            if (!out.emailSent && !out.alreadyShipped) {
                shipError[sessionId] = 'Marked shipped, but the buyer email failed — send it manually.';
            }
            await invalidateAll();
        } catch {
            shipError[sessionId] = 'Failed to mark shipped — try again.';
        } finally {
            shipping[sessionId] = false;
        }
    }

    const kpis = $derived(data.kpis);
    const totals = $derived(data.totals);

    function formatDate(iso: string): string {
        return new Date(iso).toLocaleDateString('en-CA', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    }

    // Download the server-built CSV of the full order history.
    function downloadCsv() {
        const blob = new Blob([data.csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }
</script>

<Seo title="Sales" description="Owner sales & inventory dashboard." path="/admin/sales" />
<svelte:head>
    <meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#snippet tile(label: string, value: string, sub?: string)}
    <div class="border border-line/12 bg-surface-raised p-4">
        <div class="font-mono text-label uppercase text-content-dim">{label}</div>
        <div class="mt-2 font-mono text-2xl tabular-nums text-content">{value}</div>
        {#if sub}<div class="mt-1 text-meta text-content-dim">{sub}</div>{/if}
    </div>
{/snippet}

<!-- No page background of its own: the layout's <main> already paints
     bg-surface here. Left-aligned inside .shell so it lines up with the nav. -->
<div class="shell pb-20">
    <div class="max-w-4xl pt-10">
        <header class="mb-6 flex items-end justify-between gap-3">
            <div>
                <a href="/admin" class="font-mono text-label uppercase text-content-dim transition-colors hover:text-signal">← Admin</a>
                <h1 class="mt-3 text-display text-content">Sales</h1>
                <p class="mt-2 text-meta text-content-dim">Revenue, orders &amp; inventory.</p>
            </div>
            <button
                onclick={downloadCsv}
                disabled={!data.csv}
                class="shrink-0 border border-line/15 bg-surface-raised px-3 py-2 font-mono text-label uppercase text-content transition-colors hover:border-signal disabled:opacity-40 disabled:hover:border-line/15"
            >
                Export CSV
            </button>
        </header>

        {#if !data.ok}
            <p class="mb-6 border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                Couldn't load some data — showing what's available. Check the server logs.
            </p>
        {/if}

        <!-- Revenue KPIs -->
        <section class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {@render tile('Revenue', formatPrice(kpis.totalRevenue), 'all time')}
            {@render tile('Last 30 days', formatPrice(kpis.revenue30))}
            {@render tile('Orders', String(kpis.orderCount), `${kpis.unitsSold} drawing${kpis.unitsSold === 1 ? '' : 's'} sold`)}
            {@render tile('Avg order', formatPrice(kpis.avgOrderValue))}
        </section>

        <!-- Inventory KPIs -->
        <section class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            {@render tile('For sale', String(kpis.forSale), 'buyable now')}
            {@render tile('Reserved', String(kpis.reserved), 'active holds')}
            {@render tile('Unlisted', String(kpis.unlisted), 'no price set')}
            {@render tile('Sold', String(totals.sold), `of ${totals.total} total`)}
        </section>

        <!-- Inventory by notebook -->
        <section class="mb-8">
            <h2 class="mb-3 font-mono text-label uppercase text-content-dim">Inventory by notebook</h2>
            <div class="overflow-x-auto border border-line/12 bg-surface-raised">
                <table class="w-full text-meta">
                    <thead>
                        <tr class="border-b border-line/12 text-left font-mono text-label uppercase text-content-dim">
                            <th class="px-3 py-2 font-medium">Notebook</th>
                            <th class="px-3 py-2 font-medium text-right">Total</th>
                            <th class="px-3 py-2 font-medium text-right">Sold</th>
                            <th class="px-3 py-2 font-medium text-right">For sale</th>
                            <th class="px-3 py-2 font-medium text-right">Reserved</th>
                            <th class="px-3 py-2 font-medium text-right">Unlisted</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each data.inventory as n (n.notebook)}
                            <tr class="border-b border-line/5 last:border-0 text-content">
                                <td class="px-3 py-2 font-medium text-content">{n.notebook}</td>
                                <td class="px-3 py-2 text-right tabular-nums">{n.total}</td>
                                <td class="px-3 py-2 text-right tabular-nums">{n.sold}</td>
                                <td class="px-3 py-2 text-right tabular-nums">{n.forSale}</td>
                                <td class="px-3 py-2 text-right tabular-nums">{n.reserved || '—'}</td>
                                <td
                                    class="px-3 py-2 text-right tabular-nums {n.unlisted > 0
                                        ? 'text-amber-600 dark:text-amber-400 font-medium'
                                        : ''}"
                                >
                                    {n.unlisted || '—'}
                                </td>
                            </tr>
                        {:else}
                            <tr><td colspan="6" class="px-3 py-6 text-center text-content-dim">No drawings yet.</td></tr>
                        {/each}
                    </tbody>
                </table>
            </div>
            {#if kpis.unlisted > 0}
                <p class="mt-2 text-meta text-content-dim">
                    {kpis.unlisted} unlisted drawing{kpis.unlisted === 1 ? '' : 's'} have no price — set one with
                    <code class="font-mono text-content">scripts/set-price.js</code> to list them.
                </p>
            {/if}
        </section>

        <!-- Recent orders -->
        <section>
            <h2 class="mb-3 font-mono text-label uppercase text-content-dim">Recent orders</h2>
            <ul class="space-y-2">
                {#each data.recentOrders as o (o.sessionId)}
                    <li class="border border-line/12 bg-surface-raised p-4">
                        <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                                {#if o.manual}
                                    <span class="inline-flex items-center border border-line/15 px-2 py-0.5 font-mono text-label uppercase text-content">
                                        In person · {o.paymentMethod === 'etransfer' ? 'e-transfer' : 'cash'}
                                    </span>
                                {:else}
                                    <div class="truncate font-medium text-content">
                                        {o.customerName || 'Unknown buyer'}
                                    </div>
                                    {#if o.customerEmail}
                                        <div class="truncate text-meta text-content-dim">{o.customerEmail}</div>
                                    {/if}
                                {/if}
                            </div>
                            <div class="shrink-0 text-right">
                                <div class="font-mono tabular-nums text-content">{formatPrice(o.amount)}</div>
                                <div class="mt-1 text-meta text-content-dim">{formatDate(o.createdAt)}</div>
                            </div>
                        </div>
                        <div class="mt-2 flex flex-wrap gap-1">
                            {#each o.slugs as slug (slug)}
                                <span class="border border-line/12 px-1.5 py-0.5 font-mono text-xs text-content-dim">{slug}</span>
                            {/each}
                        </div>
                        {#if o.address}
                            <div class="mt-2 text-meta text-content-dim">{o.address}</div>
                        {/if}
                        {#if o.shippedAt}
                            <div class="mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                {#if o.manual}
                                    Sold in person {formatDate(o.shippedAt)}
                                {:else}
                                    Shipped {formatDate(o.shippedAt)}{o.trackingNumber ? ` · ${o.trackingNumber}` : ''}
                                {/if}
                            </div>
                        {:else}
                            <div class="mt-3 flex flex-wrap items-center gap-2">
                                <input
                                    bind:value={tracking[o.sessionId]}
                                    placeholder="Tracking number or link"
                                    class="min-w-0 flex-1 border border-line/15 bg-surface px-2.5 py-1.5 text-meta text-content placeholder:text-content-dim focus:border-signal focus:outline-none"
                                />
                                <button
                                    onclick={() => markShipped(o.sessionId)}
                                    disabled={shipping[o.sessionId]}
                                    class="shrink-0 border border-line/15 bg-surface-raised px-2.5 py-1.5 font-mono text-label uppercase text-content transition-colors hover:border-signal disabled:opacity-40"
                                >
                                    {shipping[o.sessionId] ? 'Shipping…' : 'Mark shipped'}
                                </button>
                            </div>
                            <p class="mt-1 text-[11px] text-content-dim">Emails the buyer their tracking info.</p>
                            {#if shipError[o.sessionId]}
                                <p class="mt-1 text-meta text-alert">{shipError[o.sessionId]}</p>
                            {/if}
                        {/if}
                    </li>
                {:else}
                    <li class="border border-line/12 bg-surface-raised p-6 text-center font-body text-body text-content-dim">
                        No orders yet.
                    </li>
                {/each}
            </ul>
        </section>
    </div>
</div>
