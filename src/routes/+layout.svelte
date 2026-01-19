<script lang="ts">
  import "../app.css";
  import ThemeToggle from "$lib/components/ThemeToggle.svelte";

  interface Props {
    children?: import("svelte").Snippet;
  }

  let { children }: Props = $props();
</script>

<nav
  class="sticky top-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800 transition-colors duration-200"
>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex justify-between h-16">
      <div class="flex">
        <div class="flex-shrink-0 flex items-center">
          <a
            href="/"
            class="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100"
            >ARTIST NAME</a
          >
        </div>
        <div class="hidden sm:ml-8 sm:flex sm:space-x-8">
          <a
            href="/photography"
            class="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
            >Photography</a
          >
          <a
            href="/video"
            class="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
            >Video</a
          >
          <a
            href="/drawing"
            class="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
            >Drawing</a
          >
          <a
            href="/about"
            class="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
            >About</a
          >
          <a
            href="/cv"
            class="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
            >CV</a
          >
        </div>
      </div>
      <div class="flex items-center">
        <ThemeToggle />
      </div>
    </div>
  </div>
</nav>

<main
  class="min-h-screen bg-white dark:bg-black transition-colors duration-200"
>
  {@render children?.()}
</main>
