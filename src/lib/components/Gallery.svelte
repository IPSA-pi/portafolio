<script lang="ts">
	import Lightbox from "./Lightbox.svelte";

	let { images = [] } = $props();
	let selectedIndex = $state(-1);
</script>

{#if selectedIndex >= 0}
	<Lightbox
		{images}
		startIndex={selectedIndex}
		onClose={() => (selectedIndex = -1)}
	/>
{/if}

<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
	{#each images as image, index}
		<button
			type="button"
			class="cursor-pointer overflow-hidden rounded-lg bg-gray-100 shadow-md transition-transform hover:scale-[1.02] dark:bg-gray-800 w-full p-0 border-0 block"
			onclick={() => (selectedIndex = index)}
			aria-label="View artwork in fullscreen"
		>
			<enhanced:img
				src={image}
				alt="Drawing portfolio piece"
				class="h-full w-full object-cover"
				sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
			/>
		</button>
	{/each}
</div>
