<script lang="ts">
  interface Props {
    images: string[];
  }
  let { images }: Props = $props();
</script>

<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
  {#each images as src, i}
    <div class="relative group overflow-hidden bg-gray-100 aspect-[3/4]">
      <img 
        {src} 
        alt="Portfolio item {i + 1}" 
        class="object-cover w-full h-full transition-transform duration-700 ease-out group-hover:scale-105"
        loading="lazy"
      />
    </div>
  {/each}
</div>
