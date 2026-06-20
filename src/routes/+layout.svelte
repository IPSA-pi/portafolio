<script lang="ts">
  import { onMount } from 'svelte';
  import "../app.css";
  import ThemeToggle from "$lib/components/ThemeToggle.svelte";
  import { page } from "$app/stores";
  import { isFullscreen } from "$lib/stores/fullscreen";

  interface Props {
    children?: import("svelte").Snippet;
  }

  let { children }: Props = $props();
  let menuOpen = $state(false);
  let isFeedRoute = $derived(
    /^\/drawing\/[^/]+\/\d+$/.test($page.url.pathname) ||
    $page.url.pathname === '/drawing/feed'
  );

  // Breadcrumb segments derived from the URL (shown on subpages instead of the
  // section links). Underscores are stripped for display, e.g. verde_4 → verde4.
  let segments = $derived($page.url.pathname.split('/').filter(Boolean));
  let crumbs = $derived(
    segments.map((seg, i) => ({
      label: seg.replace(/_/g, ''),
      href: '/' + segments.slice(0, i + 1).join('/'),
    }))
  );

  onMount(() => {
    const handler = () => isFullscreen.set(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  });

  const navLinks = [
    { href: '/drawing', label: 'Drawing' },
    { href: '/video', label: 'Video' },
    { href: '/learn', label: 'Learn' },
    { href: '', label: 'Photography' },
    { href: '', label: 'Web Art' },
  ];
</script>

<!-- Mobile menu outside-click backdrop -->
{#if menuOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="fixed inset-0 z-40" onclick={() => menuOpen = false}></div>
{/if}

<!-- Persistent background video -->
<video
  autoplay
  loop
  muted
  playsinline
  poster="/home/hero-poster.webp"
  class="fixed inset-0 w-full h-full object-cover -z-10"
>
  <source src="/home/hero.webm" type="video/webm" />
  <source src="/home/hero.mp4" type="video/mp4" />
</video>
<div class="fixed inset-0 bg-black/40 -z-10"></div>

<nav class="sticky top-0 z-50 bg-white dark:bg-black border-b border-black/10 dark:border-white/10 backdrop-blur-sm transition-colors duration-200" class:hidden={$isFullscreen || isFeedRoute}>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex justify-between h-16">

      <!-- Logo -->
      <div class="flex items-center">
        <a href="/" class="text-xl font-bold tracking-tight text-black dark:text-white hover:text-accent transition-colors">is</a>

        {#if segments.length === 0}
          <!-- Desktop links (home only) -->
          <div class="hidden sm:ml-8 sm:flex sm:space-x-8">
            {#each navLinks as link}
              {#if link.href}
                <a
                  href={link.href}
                  class="inline-flex items-center px-1 pt-1 text-sm font-medium text-black/50 dark:text-white/50 hover:text-accent dark:hover:text-accent transition-colors"
                >{link.label}</a>
              {:else}
                <span class="inline-flex items-center px-1 pt-1 text-sm font-medium text-black/20 dark:text-white/20 cursor-not-allowed">{link.label}</span>
              {/if}
            {/each}
          </div>
        {:else}
          <!-- Breadcrumb (subpages) -->
          <div class="ml-2 flex items-center text-sm font-medium min-w-0">
            {#each crumbs as crumb}
              <span class="mx-1.5 text-black/30 dark:text-white/30">/</span>
              <a
                href={crumb.href}
                class="text-black/50 dark:text-white/50 hover:text-accent dark:hover:text-accent transition-colors truncate"
              >{crumb.label}</a>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Right side: theme toggle + hamburger -->
      <div class="flex items-center gap-3">
        <ThemeToggle />

        <!-- Hamburger (portrait / mobile only) -->
        <button
          class="sm:hidden p-2 rounded-md text-black/50 dark:text-white/50 hover:text-accent dark:hover:text-accent transition-colors"
          onclick={() => menuOpen = !menuOpen}
          aria-label="Toggle menu"
        >
          {#if menuOpen}
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          {/if}
        </button>
      </div>
    </div>
  </div>

  <!-- Mobile menu -->
  {#if menuOpen}
    <div class="sm:hidden absolute top-16 left-0 right-0 border-t border-black/10 dark:border-white/10 bg-white dark:bg-black shadow-lg">
      {#each navLinks as link}
        {#if link.href}
          <a
            href={link.href}
            onclick={() => menuOpen = false}
            class="block px-6 py-4 text-sm font-medium text-black/60 dark:text-white/60 hover:text-accent dark:hover:text-accent transition-colors"
          >{link.label}</a>
        {:else}
          <span class="block px-6 py-4 text-sm font-medium text-black/20 dark:text-white/20">{link.label}</span>
        {/if}
      {/each}
    </div>
  {/if}
</nav>

<main class="min-h-screen transition-colors duration-200">
  {@render children?.()}
</main>

<footer class="border-t border-black/10 dark:border-white/10 bg-white dark:bg-black transition-colors duration-200" class:hidden={$isFullscreen || isFeedRoute}>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
    <p class="text-xs text-black/30 dark:text-white/30">&copy; {new Date().getFullYear()} Ian Sebelius. All rights reserved.</p>
    <div class="flex gap-6">
      <a href="/privacy" class="text-xs text-black/40 dark:text-white/40 hover:text-accent dark:hover:text-accent transition-colors">Privacy Policy</a>
      <a href="/terms" class="text-xs text-black/40 dark:text-white/40 hover:text-accent dark:hover:text-accent transition-colors">Terms of Service</a>
    </div>
  </div>
</footer>
