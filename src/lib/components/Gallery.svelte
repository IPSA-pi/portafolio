<script lang="ts">
	import { goto } from '$app/navigation';
	import { artworkTitle, artworkAlt, type ArtworkImage } from '$lib/utils/artwork';

	interface Props {
		images?: ArtworkImage[];
		notebookSlug?: string;
		// `onOpen`, when provided, intercepts a tile click and receives the tile's
		// index instead of navigating to a per-drawing URL. The All Drawings grid
		// (/drawing/feed) uses it to open the in-place vertical viewer; the
		// per-notebook gallery leaves it unset and keeps its `/drawing/[slug]/[i]`
		// navigation.
		onOpen?: (index: number) => void;
	}

	let { images = [], notebookSlug = '', onOpen = undefined }: Props = $props();

	function openTile(index: number) {
		if (onOpen) onOpen(index);
		else goto(`/drawing/${notebookSlug}/${index + 1}`);
	}
</script>

<!-- Contact-sheet grid: the artwork is the only chrome. Availability carries no
	 visual weight here at all — sold and on-hold tiles render exactly like the
	 rest, so the grid reads as pure imagery. Price, Sold/On-hold status and the
	 buy / add-to-cart controls all live in the lightbox (Feed.svelte); the All
	 Drawings grid (/drawing/feed) additionally has an availability filter. -->
<div class="grid grid-cols-3 gap-0 md:grid-cols-4 lg:grid-cols-6">
	{#each images as image, index}
		<div
			role="button"
			tabindex="0"
			class="relative cursor-pointer overflow-hidden w-full p-0 border-0 block aspect-[3/5] bg-zinc-200 dark:bg-zinc-800"
			onclick={() => openTile(index)}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTile(index); }
			}}
			aria-label="View {artworkTitle(image, image.slug)} in fullscreen"
		>
			<img
				src={image.sm}
				srcset="{image.sm} 640w,
						{image.md} 1024w,
						{image.lg} 1920w"
				sizes="(min-width: 1024px) 17vw, (min-width: 768px) 25vw, 33vw"
				alt={artworkAlt(image, image.slug)}
				class="absolute inset-0 h-full w-full object-cover transition-opacity duration-300 opacity-0"
				loading={index < 3 ? 'eager' : 'lazy'}
				onload={(e) => (e.currentTarget as HTMLImageElement).classList.replace('opacity-0', 'opacity-100')}
			/>
		</div>
	{/each}
</div>
