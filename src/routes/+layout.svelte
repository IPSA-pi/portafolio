<script lang="ts">
  import { onMount } from 'svelte';
  import "../app.css";
  import ThemeToggle from "$lib/components/ThemeToggle.svelte";
  import { page } from "$app/stores";
  import { isFullscreen } from "$lib/stores/fullscreen";
  import { viewerOpen } from "$lib/stores/viewer";
  import { cartCount } from "$lib/stores/cart";
  import { ABOUT_PUBLISHED } from "$lib/about";

  interface Props {
    children?: import("svelte").Snippet;
    data?: { isAdmin?: boolean };
  }

  let { children, data }: Props = $props();
  let menuOpen = $state(false);
  // The per-drawing feed routes are always immersive. /drawing/feed is not:
  // its grid keeps the nav, and only hides it while the in-place viewer is
  // open (signalled by the `viewerOpen` store).
  let hideChrome = $derived(
    /^\/drawing\/[^/]+\/\d+$/.test($page.url.pathname) || $viewerOpen
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

  // The hero video below is `-z-10`, which paints above the canvas background
  // that <body> propagates — so it shows through <main> on every route. Home,
  // Text2Binary and Video want that (their text is white by design). Ordinary
  // content pages don't: in light mode their near-black text landed on the dark
  // video and was unreadable, so they get an opaque light surface instead.
  // Dark mode keeps the video, where white-on-video reads fine.
  let videoForward = $derived(
    segments.length === 0 || segments[0] === 'text2binary' || segments[0] === 'video'
  );

  onMount(() => {
    const handler = () => isFullscreen.set(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  });

  // A section is current when the URL sits at or below its link. Drives the
  // phosphor underline in the nav — the site had no active-state indication.
  function isCurrent(href: string): boolean {
    return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');
  }

  let navLinks = $derived([
    // Points at the all-drawings feed, not the notebook listing at /drawing —
    // that page is still reachable (breadcrumb, cart, post-purchase returns).
    { href: '/drawing/feed', label: 'Drawing' },
    { href: '/learn', label: 'Learn' },
    { href: '/new-music', label: 'New Music' },
    { href: '/text2binary', label: 'Text2Binary' },
    // About stays hidden until ABOUT_PUBLISHED is flipped in src/lib/about.ts —
    // except for the owner, who sees it flagged as a draft.
    ...(ABOUT_PUBLISHED || data?.isAdmin
      ? [{ href: '/about', label: ABOUT_PUBLISHED ? 'About' : 'About (draft)' }]
      : []),
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
<!-- Overlay video: different loop length than hero.webm (3.295s) so the blend never repeats -->
<video
  autoplay
  loop
  muted
  playsinline
  class="fixed inset-0 w-full h-full object-cover -z-10 opacity-50"
>
  <source src="/home/overlay.webm" type="video/webm" />
  <source src="/home/overlay.mp4" type="video/mp4" />
</video>
<div class="fixed inset-0 bg-black/40 -z-10"></div>

<nav class="sticky top-0 z-50 bg-surface-raised border-b border-line/10 backdrop-blur-sm transition-colors duration-200" class:hidden={$isFullscreen || hideChrome}>
  <div class="shell">
    <div class="flex justify-between h-16">

      <!-- Logo -->
      <div class="flex items-center min-w-0">
        <a href="/" class="text-title font-bold tracking-tight text-content hover:text-signal transition-colors">is</a>

        {#if segments.length === 0}
          <!-- Desktop links (home only) -->
          <div class="hidden sm:ml-10 sm:flex sm:gap-7">
            {#each navLinks as link}
              {#if link.href}
                <a
                  href={link.href}
                  class="inline-flex items-center border-b-2 pt-1 font-mono text-[0.75rem] uppercase tracking-[0.12em] transition-colors {isCurrent(link.href)
                    ? 'border-signal text-content'
                    : 'border-transparent text-content-dim hover:text-signal'}"
                >{link.label}</a>
              {:else}
                <span class="inline-flex items-center pt-1 font-mono text-[0.75rem] uppercase tracking-[0.12em] text-content-dim/60 cursor-not-allowed">{link.label}</span>
              {/if}
            {/each}
          </div>
        {:else}
          <!-- Breadcrumb (subpages) -->
          <div class="ml-3 flex items-center font-mono text-[0.75rem] tracking-[0.08em] min-w-0">
            {#each crumbs as crumb, i}
              <span class="mx-1.5 text-content-dim/60">/</span>
              <a
                href={crumb.href}
                class="truncate transition-colors hover:text-signal {i === crumbs.length - 1 ? 'text-content' : 'text-content-dim'}"
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
            class="relative p-2 text-content hover:text-signal transition-colors"
            aria-label="View cart ({$cartCount} items)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.836l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 1.994-4.693 2.602-7.152.084-.34-.16-.68-.508-.68H5.106M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
            </svg>
            <span class="absolute top-0 right-0 flex h-4 min-w-4 items-center justify-center bg-signal px-1 font-mono text-[10px] font-bold text-surface">{$cartCount}</span>
          </a>
        {/if}
        <ThemeToggle />

        <!-- Hamburger: mobile-only on the home page (inline links cover desktop
             there); always available on subpages, since those show breadcrumbs
             instead of the section links and have no other way to navigate. -->
        <button
          class="p-2 text-content hover:text-signal transition-colors {segments.length === 0 ? 'sm:hidden' : ''}"
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
    <div class="absolute top-16 border-t border-line/10 bg-surface-raised shadow-lg {segments.length === 0 ? 'sm:hidden left-0 right-0' : 'left-0 right-0 sm:left-auto sm:right-4 sm:w-64 sm:border sm:border-line/10'}">
      {#each navLinks as link}
        {#if link.href}
          <a
            href={link.href}
            onclick={() => menuOpen = false}
            class="flex items-center gap-3 border-l-2 px-6 py-4 font-mono text-[0.75rem] uppercase tracking-[0.12em] transition-colors {isCurrent(link.href)
              ? 'border-signal text-content'
              : 'border-transparent text-content-dim hover:text-signal'}"
          >{link.label}</a>
        {:else}
          <span class="block px-6 py-4 font-mono text-[0.75rem] uppercase tracking-[0.12em] text-content-dim/60">{link.label}</span>
        {/if}
      {/each}
    </div>
  {/if}
</nav>

<main class="min-h-screen transition-colors duration-200 {videoForward ? '' : 'bg-surface'}">
  {@render children?.()}
</main>

<footer class="border-t border-line/10 bg-surface-raised transition-colors duration-200" class:hidden={$isFullscreen || hideChrome}>
  <div class="shell py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
    <p class="font-mono text-label uppercase text-content-dim">&copy; {new Date().getFullYear()} Ian Sebelius</p>
    <div class="flex flex-wrap justify-center gap-x-6 gap-y-2">
      {#if ABOUT_PUBLISHED}
        <a href="/about" class="font-mono text-label uppercase text-content-dim hover:text-signal transition-colors">About</a>
      {/if}
      <a href="/contact" class="font-mono text-label uppercase text-content-dim hover:text-signal transition-colors">Contact</a>
      <a href="/privacy" class="font-mono text-label uppercase text-content-dim hover:text-signal transition-colors">Privacy</a>
      <a href="/terms" class="font-mono text-label uppercase text-content-dim hover:text-signal transition-colors">Terms</a>
    </div>
  </div>
</footer>
