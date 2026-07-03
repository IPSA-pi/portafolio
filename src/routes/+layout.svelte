<script lang="ts">
  import { onMount } from 'svelte';
  import "../app.css";
  import ThemeToggle from "$lib/components/ThemeToggle.svelte";
  import { page } from "$app/stores";
  import { isFullscreen } from "$lib/stores/fullscreen";
  import { cartCount } from "$lib/stores/cart";

  interface Props {
    children?: import("svelte").Snippet;
    data?: { isAdmin?: boolean };
  }

  let { children, data }: Props = $props();
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

  let navLinks = $derived([
    { href: '/drawing', label: 'Drawing' },
    { href: '/video', label: 'Video' },
    { href: '/learn', label: 'Learn' },
    { href: '/new-music', label: 'New Music' },
    { href: '', label: 'Photography (soon)' },
    { href: '', label: 'Web Art (soon)' },
    // Owner-only hub (behind Cloudflare Access); only listed for the owner.
    ...(data?.isAdmin ? [{ href: '/admin', label: 'Admin' }] : []),
  ]);
</script>

<!-- Mobile menu outside-click backdrop -->
{#if menuOpen}
  <button
    type="button"
    aria-label="Close menu"
    class="fixed inset-0 z-40 appearance-none bg-transparent border-0 p-0 cursor-default"
    onclick={() => menuOpen = false}
  ></button>
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

      <!-- Right side: cart + theme toggle + hamburger -->
      <div class="flex items-center gap-3">
        {#if $cartCount > 0}
          <a
            href="/cart"
            class="relative p-2 rounded-md text-black/50 dark:text-white/50 hover:text-accent dark:hover:text-accent transition-colors"
            aria-label="View cart ({$cartCount} items)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.836l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 1.994-4.693 2.602-7.152.084-.34-.16-.68-.508-.68H5.106M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
            </svg>
            <span class="absolute top-0 right-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">{$cartCount}</span>
          </a>
        {/if}
        <ThemeToggle />

        <!-- Hamburger: mobile-only on the home page (inline links cover desktop
             there); always available on subpages, since those show breadcrumbs
             instead of the section links and have no other way to navigate. -->
        <button
          class="p-2 rounded-md text-black/50 dark:text-white/50 hover:text-accent dark:hover:text-accent transition-colors {segments.length === 0 ? 'sm:hidden' : ''}"
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

  <!-- Dropdown menu: full-bleed under the home page's inline links (mobile
       only there); on subpages (where the hamburger shows at all breakpoints)
       it's capped and right-aligned so it doesn't stretch full-bleed on desktop. -->
  {#if menuOpen}
    <div class="absolute top-16 border-t border-black/10 dark:border-white/10 bg-white dark:bg-black shadow-lg {segments.length === 0 ? 'sm:hidden left-0 right-0' : 'left-0 right-0 sm:left-auto sm:right-4 sm:w-64 sm:rounded-lg sm:border sm:border-black/10 sm:dark:border-white/10'}">
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
