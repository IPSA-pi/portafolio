<script lang="ts">
	import Lightbox from "./Lightbox.svelte";

	let { images = [], products = {} } = $props();
	let selectedIndex = $state(-1);

	function formatTitle(slug: string): string {
		const parts = slug.split('_');
		const num = parts[parts.length - 1];
		const notebook = parts.slice(0, -1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
		return `${notebook} — ${num}`;
	}

	function formatPrice(cents: number): string {
		return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
	}
</script>

{#if selectedIndex >= 0}
	<Lightbox
		{images}
		{products}
		startIndex={selectedIndex}
		onClose={() => (selectedIndex = -1)}
	/>
{/if}

<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
	{#each images as image, index}
		{@const product = products[image.slug]}
		{@const isSold = product?.sold}
		{@const isForSale = product && !isSold}
		<div>
			<button
				type="button"
				class="relative cursor-pointer overflow-hidden rounded-lg bg-gray-100 shadow-md transition-transform hover:scale-[1.02] dark:bg-gray-800 w-full p-0 border-0 block"
				onclick={() => (selectedIndex = index)}
				aria-label="View {formatTitle(image.slug)} in fullscreen"
			>
				<img
					src={image.md}
					srcset="{image.sm} 640w,
							{image.md} 1024w,
							{image.lg} 1920w"
					sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
					alt={formatTitle(image.slug)}
					class="h-full w-full object-cover {isSold ? 'opacity-60 grayscale-[0.5]' : ''}"
					loading="lazy"
				/>
				{#if isSold}
					<div class="absolute top-2 right-2">
						<span class="bg-black/70 text-white px-2 py-1 rounded text-xs font-bold uppercase tracking-widest">Sold</span>
					</div>
				{/if}
				{#if isForSale}
					<div class="absolute bottom-2 right-2">
						<span class="bg-amber-700/80 text-white px-2 py-1 rounded text-xs font-semibold backdrop-blur-sm">
							{formatPrice(product.price)}
						</span>
					</div>
				{/if}
			</button>
		</div>
	{/each}
</div>
