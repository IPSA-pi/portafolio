<script lang="ts">
    const notebooks = [
        {
            slug: "01_negro",
            title: "Notebook 01 (Black)",
            description: "Early explorations.",
            cover: "/drawings/cover_negro.jpg", // Placeholder or we could import one real image
        },
        {
            slug: "05_azul",
            title: "Notebook 05 (Blue)",
            description: "Blue series studies.",
            cover: "/drawings/cover_azul.jpg",
        },
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

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {#each notebooks as notebook}
            <a href="/drawing/{notebook.slug}" class="group block">
                <div
                    class="aspect-[4/3] bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden mb-4 relative"
                >
                    <div
                        class="absolute inset-0 flex items-center justify-center text-gray-300 dark:text-gray-600"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke-width="1.5"
                            stroke="currentColor"
                            class="w-12 h-12"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                            />
                        </svg>
                    </div>
                </div>
                <h2
                    class="text-xl font-medium text-gray-900 dark:text-white group-hover:underline decoration-1 underline-offset-4"
                >
                    {notebook.title}
                </h2>
                <p class="text-sm text-gray-500 mt-1">{notebook.description}</p>
            </a>
        {/each}
    </div>
</div>
