<svelte:head>
    <title>Artist Name - Portfolio</title>
    <meta
        name="description"
        content="Personal portfolio of Artist Name, featuring photography, video, and drawing works."
    />
</svelte:head>

<div
    class="min-h-[80vh] flex flex-col justify-center items-center text-center px-4 fade-in"
>
    <div class="max-w-4xl">
        <h1
            class="text-6xl md:text-9xl font-thin tracking-tighter text-gray-900 dark:text-gray-100 mb-4 select-none"
        >
            ARTIST
        </h1>
        <h1
            class="text-6xl md:text-9xl font-thin tracking-tighter text-gray-400 dark:text-gray-600 mb-12 select-none"
        >
            NAME
        </h1>
        <p
            class="text-xl md:text-2xl text-gray-600 dark:text-gray-400 font-light tracking-widest uppercase mb-16"
        >
            Photography <span class="mx-2">·</span> Video
            <span class="mx-2">·</span> Drawing
        </p>

        <a
            href="/photography"
            class="inline-block border border-gray-900 dark:border-white px-8 py-3 text-sm uppercase tracking-widest text-gray-900 dark:text-white hover:bg-gray-900 hover:text-white dark:hover:bg-white dark:hover:text-black transition-all duration-300"
        >
            View Selected Works
        </a>
    </div>
</div>
