<script lang="ts">
    import BitRule from './BitRule.svelte';

    interface Props {
        /** Mono classifier above the title — says what kind of page this is. */
        eyebrow: string;
        title: string;
        /** Count encoded by the bit-rule. Omit to render a plain hairline. */
        count?: number;
        countMax?: number;
        countUnit?: string;
        /** Optional prose intro, set in the serif. */
        children?: import('svelte').Snippet;
    }

    let { eyebrow, title, count, countMax, countUnit = '', children }: Props = $props();
</script>

<header class="pt-10 pb-2">
    <p class="font-mono text-label uppercase text-content-dim">{eyebrow}</p>
    <h1 class="mt-3 text-display text-content">{title}</h1>

    {#if count !== undefined}
        <BitRule value={count} max={countMax} unit={countUnit} />
    {:else}
        <div class="py-4"><span class="block h-px bg-line/15"></span></div>
    {/if}

    {#if children}
        <div class="max-w-prose font-body text-body text-content-dim">
            {@render children()}
        </div>
    {/if}
</header>
