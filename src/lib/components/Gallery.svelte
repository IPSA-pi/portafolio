<script lang="ts">
	import Lightbox from "./Lightbox.svelte";

	let { images = [], products = {} } = $props();
	let selectedIndex = $state(-1);
</script>

{#if selectedIndex >= 0}
	<Lightbox
		{images}
		{products}
		startIndex={selectedIndex}
		onClose={() => (selectedIndex = -1)}
	/>
{/if}

<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
	{#each images as image, index}
		<button
			type="button"
			class="relative cursor-pointer overflow-hidden rounded-lg bg-gray-100 shadow-md transition-transform hover:scale-[1.02] dark:bg-gray-800 w-full p-0 border-0 block"
			onclick={() => (selectedIndex = index)}
			aria-label="View artwork in fullscreen"
		>
			<img
				src={image.md}
				srcset="{image.sm} 640w,
						{image.md} 1024w,
						{image.lg} 1920w"
				sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
				alt="Drawing portfolio piece"
				class="h-full w-full object-cover {products[image.slug]?.sold ? 'opacity-60 grayscale-[0.5]' : ''}"
				loading="lazy"
			/>
			{#if products[image.slug]?.sold}
				<div class="absolute inset-0 flex items-center justify-center">
					<span class="bg-black/70 text-white px-4 py-2 rounded font-bold uppercase tracking-widest text-xl">Sold</span>
				</div>
			{/if}
		</button>
	{/each}
</div>
