<script lang="ts">
	import { fade } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { cartItems, addToCart, removeFromCart, MAX_CART_ITEMS } from '$lib/stores/cart';
	import { formatTitle } from '$lib/utils/formatTitle';

	let { images = [], products = {}, notebookSlug = '' } = $props();

	let cartFullMessage = $state<string | null>(null);
	let cartFullTimeout: ReturnType<typeof setTimeout> | undefined;

	function showCartFull() {
		cartFullMessage = `Cart is full (${MAX_CART_ITEMS} max)`;
		clearTimeout(cartFullTimeout);
		cartFullTimeout = setTimeout(() => (cartFullMessage = null), 3000);
	}

	function formatPrice(cents: number): string {
		return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
	}
</script>

<div class="grid grid-cols-3 gap-0 md:grid-cols-4 lg:grid-cols-6">
	{#each images as image, index}
		{@const product = products[image.slug]}
		{@const isSold = product?.sold}
		{@const isReserved = product?.reserved}
		{@const isForSale = product && !isSold && !isReserved}
		{@const inCart = isForSale && $cartItems.some((i) => i.slug === image.slug)}
		<div
			role="button"
			tabindex="0"
			class="relative cursor-pointer overflow-hidden w-full p-0 border-0 block aspect-[3/5] bg-zinc-200 dark:bg-zinc-800"
			onclick={() => goto(`/drawing/${notebookSlug}/${index + 1}`)}
			onkeydown={(e) => {
				if (e.target !== e.currentTarget) return; // let the nested add-to-cart button handle its own keydowns
				if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goto(`/drawing/${notebookSlug}/${index + 1}`); }
			}}
			aria-label="View {formatTitle(image.slug)} in fullscreen"
		>
			<img
				src={image.sm}
				srcset="{image.sm} 640w,
						{image.md} 1024w,
						{image.lg} 1920w"
				sizes="(min-width: 1024px) 17vw, (min-width: 768px) 25vw, 33vw"
				alt={formatTitle(image.slug)}
				class="absolute inset-0 h-full w-full object-cover transition-opacity duration-300 opacity-0 {isSold || isReserved ? 'grayscale-[0.5]' : ''}"
				loading={index < 3 ? 'eager' : 'lazy'}
				onload={(e) => (e.currentTarget as HTMLImageElement).classList.replace('opacity-0', isSold || isReserved ? 'opacity-60' : 'opacity-100')}
			/>
			{#if isSold}
				<div class="absolute top-2 right-2">
					<span class="bg-black/70 text-white px-2 py-1 rounded text-xs font-bold uppercase tracking-widest">Sold</span>
				</div>
			{:else if isReserved}
				<div class="absolute top-2 right-2" title="In someone's checkout — check back soon">
					<span class="bg-zinc-600/80 text-white px-2 py-1 rounded text-xs font-semibold uppercase tracking-widest">On hold</span>
				</div>
			{/if}
			{#if isForSale}
				<div class="absolute bottom-2 right-2">
					<button
						type="button"
						onclick={(e) => {
							e.stopPropagation();
							if (inCart) removeFromCart(image.slug);
							else if (!addToCart({ slug: image.slug, notebook: image.notebook ?? notebookSlug, price: product.price, image: image.sm })) showCartFull();
						}}
						class="bg-amber-700/80 text-white px-2 py-1 rounded text-xs font-semibold backdrop-blur-sm hover:bg-amber-700 transition-colors"
						aria-label={inCart ? `Remove ${formatTitle(image.slug)} from cart` : `Add ${formatTitle(image.slug)} to cart — ${formatPrice(product.price)}`}
					>
						{inCart ? '✓' : `+ ${formatPrice(product.price)}`}
					</button>
				</div>
			{/if}
		</div>
	{/each}
</div>

{#if cartFullMessage}
	<div
		transition:fade={{ duration: 150 }}
		class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-black text-white text-sm px-5 py-3 rounded-full shadow-lg border border-white/10 max-w-[90vw] text-center"
	>
		{cartFullMessage}
	</div>
{/if}
