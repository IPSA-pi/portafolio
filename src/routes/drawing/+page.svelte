<script lang="ts">
    const notebooks = [
        { slug: "negro_1", title: "Notebook 01 (Black)", description: "Early explorations." },
        { slug: "negro_2", title: "Notebook 02 (Black)", description: "Continued studies in black." },
        { slug: "verde_3", title: "Notebook 03 (Green)", description: "Introduction of organic forms." },
        { slug: "verde_4", title: "Notebook 04 (Green)", description: "Complex green compositions." },
        { slug: "azul_5",  title: "Notebook 05 (Blue)",  description: "Blue series studies." },
        { slug: "rojo_6",  title: "Notebook 06 (Red)",   description: "Vibrant red experiments." },
    ];
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

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
        {#each notebooks as notebook}
            <a href="/drawing/{notebook.slug}" class="group flex flex-col items-center text-center">
                <img
                    src="/drawings/covers/{notebook.slug}.webp"
                    alt="Cover of {notebook.title}"
                    class="w-full max-w-xs transition-transform duration-500 group-hover:scale-105 drop-shadow-xl"
                    loading="lazy"
                />
            </a>
        {/each}
    </div>
</div>
