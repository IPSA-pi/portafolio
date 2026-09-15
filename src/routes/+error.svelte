<script lang="ts">
  import { page } from '$app/stores';

  let status = $derived($page.status);
  let message = $derived($page.error?.message || 'Something went wrong.');
</script>

<svelte:head>
  <title>{status} | Ian Sebelius</title>
</svelte:head>

<!-- bg-surface stays on this wrapper: an error can render on a route whose
     <main> is transparent over the background video (home, text2binary). -->
<div class="shell flex min-h-screen items-center justify-center bg-surface">
  <div class="text-center">
    <p class="font-mono text-label uppercase text-content-dim">Error {status}</p>
    <h1 class="mt-3 text-display text-content">{message}</h1>
    <a
      href="/"
      class="mt-8 inline-block font-mono text-label uppercase text-content-dim transition-colors hover:text-signal"
    >← Back to home</a>
  </div>
</div>
