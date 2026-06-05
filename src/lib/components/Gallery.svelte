<script lang="ts">
	import { goto } from '$app/navigation';

	let { images = [], products = {}, notebookSlug = '' } = $props();

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

<div class="grid grid-cols-3 gap-0 md:grid-cols-4 md:mx-auto md:w-1/3">
	{#each images as image, index}
		{@const product = products[image.slug]}
		{@const isSold = product?.sold}
		{@const isForSale = product && !isSold}
		<button
			type="button"
			class="relative cursor-pointer overflow-hidden w-full p-0 border-0 block aspect-[3/5] bg-zinc-200 dark:bg-zinc-800"
			onclick={() => goto(`/drawing/${notebookSlug}/${index + 1}`)}
			aria-label="View {formatTitle(image.slug)} in fullscreen"
		>
			<img
				src={image.md}
				srcset="{image.sm} 640w,
						{image.md} 1024w,
						{image.lg} 1920w"
				sizes="33vw"
				alt={formatTitle(image.slug)}
				class="absolute inset-0 h-full w-full object-cover transition-opacity duration-300 opacity-0 {isSold ? 'grayscale-[0.5]' : ''}"
				loading={index < 3 ? 'eager' : 'lazy'}
				onload={(e) => (e.currentTarget as HTMLImageElement).classList.replace('opacity-0', isSold ? 'opacity-60' : 'opacity-100')}
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
	{/each}
</div>
