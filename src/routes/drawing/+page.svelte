<script lang="ts">
    let { data } = $props();
    const { notebooks } = data;
</script>

<svelte:head>
    <title>Drawings | Artist Name</title>
    <meta name="description" content="Selected drawings and sketches." />
</svelte:head>

<div class="container mx-auto px-4 py-8">
    <div class="mb-12">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
            Drawings
        </h1>
        <p class="mt-2 text-gray-600 dark:text-gray-400">
            Select a notebook to view.
        </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-12">
        {#each notebooks as notebook}
            <a href="/drawing/{notebook.slug}" class="group flex flex-col items-center text-center">
                <div class="relative w-full max-w-xs md:max-w-[160px] aspect-[3/4]">
                    <img
                        src="/drawings/covers/{notebook.slug}.webp"
                        alt="Cover of {notebook.title}"
                        class="absolute inset-0 w-full h-full object-cover transition-[transform,opacity] duration-500 group-hover:scale-105 drop-shadow-xl opacity-0"
                        loading="lazy"
                        onload={(e) => (e.currentTarget as HTMLImageElement).classList.replace('opacity-0', 'opacity-100')}
                    />
                </div>
            </a>
        {/each}
    </div>
</div>
