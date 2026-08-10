<script lang="ts">
    import { onMount } from 'svelte';
    import { toBits } from '$lib/utils/toBits';

    interface Props {
        /** The number this rule encodes. */
        value: number;
        /** Largest value this rule will ever show. Fixes the bit count so the
         *  rule keeps a constant width while `value` changes — without it the
         *  All Drawings rule would resize on every keystroke. */
        max?: number;
        /** Unit shown after the decimal readout, e.g. "notebooks". */
        unit?: string;
    }

    let { value, max, unit = '' }: Props = $props();

    const MIN_BITS = 6;
    let width = $derived(Math.max(MIN_BITS, ((max ?? value) || 1).toString(2).length));
    let bits = $derived(toBits(Math.max(0, value), width));

    // The one orchestrated moment on the page: bits fill left to right on
    // mount. After that the rule updates instantly, so filtering a list
    // doesn't replay the animation on every keystroke.
    let revealed = $state(false);
    let settled = $state(false);
    let stagger = $state(30);

    onMount(() => {
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) stagger = 0;
        const raf = requestAnimationFrame(() => (revealed = true));
        const done = setTimeout(() => (settled = true), width * stagger + 300);
        return () => {
            cancelAnimationFrame(raf);
            clearTimeout(done);
        };
    });
</script>

<!-- Section divider that encodes the section's own count in binary — the same
     vocabulary as the homepage clock, reusing its toBits(). Decorative rules
     carry no information; this one does. -->
<div class="flex items-center gap-4 py-4" role="separator" aria-hidden="true">
    <span class="h-px flex-1 bg-line/15"></span>

    <span class="flex items-center gap-[3px]">
        {#each bits as on, i}
            <span
                class="h-[7px] w-[7px] transition-colors duration-300 {revealed && on
                    ? 'bg-signal dark:shadow-[0_0_6px_rgb(var(--signal)/0.55)]'
                    : 'border border-line/25'}"
                style="transition-delay: {settled ? 0 : i * stagger}ms"
            ></span>
        {/each}
    </span>

    <span class="font-mono text-label uppercase text-content-dim">
        {value}{unit ? ` ${unit}` : ''}
    </span>
</div>

<!-- Screen readers get the plain count; the squares above are decorative to them. -->
<span class="sr-only">{value}{unit ? ` ${unit}` : ''}</span>
