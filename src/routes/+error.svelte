<script lang="ts">
  import { page } from '$app/stores';

  let status = $derived($page.status);
  let message = $derived($page.error?.message || 'Something went wrong.');
</script>

<svelte:head>
  <title>{status} | Ian Sebelius</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-neutral-950 px-4">
  <div class="text-center">
    <p class="text-sm tracking-widest uppercase text-black dark:text-white">Error {status}</p>
    <h1 class="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">{message}</h1>
    <a
      href="/"
      class="mt-8 inline-block text-sm text-black dark:text-white hover:text-accent dark:hover:text-accent transition-colors"
    >← Back to home</a>
  </div>
</div>
