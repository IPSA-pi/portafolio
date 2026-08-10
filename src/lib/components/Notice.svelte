<script lang="ts">
    interface Props {
        /** `confirmed` and `pending` are ordinary outcomes; `error` is the only
         *  one that earns the alert hue. A sold-out drawing is not an error. */
        tone?: 'confirmed' | 'pending' | 'error';
        /** Mono classifier — states what happened, in the same words as the action. */
        label: string;
        children?: import('svelte').Snippet;
    }

    let { tone = 'confirmed', label, children }: Props = $props();

    const edge = {
        confirmed: 'border-l-signal',
        pending: 'border-l-content-dim',
        error: 'border-l-alert',
    };

    const labelColor = {
        confirmed: 'text-signal',
        pending: 'text-content-dim',
        error: 'text-alert',
    };
</script>

<!-- Hairline panel with a signal-coloured edge, not a filled pastel blob.
     State reads from the edge and the mono label; the message stays prose. -->
<div
    role={tone === 'error' ? 'alert' : 'status'}
    class="border border-line/12 border-l-2 bg-surface-raised px-5 py-4 {edge[tone]}"
>
    <p class="font-mono text-label uppercase {labelColor[tone]}">{label}</p>
    {#if children}
        <p class="mt-2 font-body text-body text-content">{@render children()}</p>
    {/if}
</div>
