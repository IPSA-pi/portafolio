<script lang="ts">
    import { summarizeMaterial, type ArtworkMeta } from '$lib/utils/artwork';
    import { INTERNATIONAL_STANDARD_CENTS, SHIPS_ABROAD_TO, internationalMailto } from '$lib/shipping';
    import { formatPrice } from '$lib/utils/formatPrice';

    interface Props {
        images: ArtworkMeta[];
    }

    let { images }: Props = $props();

    let material = $derived(summarizeMaterial(images));
</script>

<!-- What every drawing on the page has in common, said once here so the
     viewer doesn't repeat it under each one: what it's made of and how big it
     is, and how each offer reaches the buyer. The viewer's offer rows carry
     no notes of their own, so this is also where a buyer in a country the
     checkout doesn't ship to finds the email route. -->
<dl class="mt-6 grid max-w-prose gap-x-6 gap-y-1 font-mono text-meta text-content-dim sm:grid-cols-[auto_1fr] sm:gap-y-2 [&>dt:not(:first-child)]:mt-2 sm:[&>dt:not(:first-child)]:mt-0">
    {#if material}
        <dt class="text-label uppercase leading-[inherit]">Drawings</dt>
        <dd class="text-content">{material}</dd>
    {/if}
    <dt class="text-label uppercase leading-[inherit]">Originals</dt>
    <dd>
        Ship free in Canada, and for {formatPrice(INTERNATIONAL_STANDARD_CENTS, { compact: true })} per order to {SHIPS_ABROAD_TO}. Elsewhere,
        <a href={internationalMailto()} class="text-signal underline underline-offset-2 transition-colors hover:text-signal-strong">email me</a>.
    </dd>
    <dt class="text-label uppercase leading-[inherit]">Digital files</dt>
    <dd>Instant download, worldwide.</dd>
</dl>
