<script lang="ts">
	import Lightbox from "./Lightbox.svelte";

	let { images = [] } = $props();
	let selectedImage = $state(null);
</script>

{#if selectedImage}
	<Lightbox image={selectedImage} onClose={() => (selectedImage = null)} />
{/if}

<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
	{#each images as image}
		<button
			type="button"
			class="cursor-pointer overflow-hidden rounded-lg bg-gray-100 shadow-md transition-transform hover:scale-[1.02] dark:bg-gray-800 w-full p-0 border-0 block"
			onclick={() => (selectedImage = image)}
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
