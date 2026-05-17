<script lang="ts">
  import "../app.css";
  import ThemeToggle from "$lib/components/ThemeToggle.svelte";
  import { page } from "$app/stores";

  interface Props {
    children?: import("svelte").Snippet;
  }

  let { children }: Props = $props();
  let menuOpen = $state(false);
  let videoEl = $state<HTMLVideoElement | null>(null);

  $effect(() => {
    if (!videoEl) return;

    const RATE = .5 ;
    videoEl.playbackRate = RATE;

    let rafId: number;
    let lastTs: number | undefined;
    let forward = true;

    function reverseStep(ts: number) {
      if (!videoEl) return;
      if (lastTs !== undefined) {
        const dt = (ts - lastTs) / 1000;
        videoEl.currentTime = Math.max(0, videoEl.currentTime - RATE * dt);
        if (videoEl.currentTime <= 0) {
          forward = true;
          lastTs = undefined;
          videoEl.play();
          return;
        }
      }
      lastTs = ts;
      rafId = requestAnimationFrame(reverseStep);
    }

    function onEnded() {
      forward = false;
      lastTs = undefined;
      rafId = requestAnimationFrame(reverseStep);
    }

    videoEl.addEventListener('ended', onEnded);
    return () => {
      videoEl?.removeEventListener('ended', onEnded);
      cancelAnimationFrame(rafId);
    };
  });

  const navLinks = [
    { href: '/drawing', label: 'Drawing' },
    { href: '/video', label: 'Video' },
    { href: '', label: 'Photography' },
    { href: '', label: 'Web Art' },
  ];
</script>

<!-- Persistent background video -->
<video
  bind:this={videoEl}
  autoplay
  muted
  playsinline
  poster="/home/A001_04102104_C004-poster.webp"
  class="fixed inset-0 w-full h-full object-cover -z-10"
>
  <source src="/home/A001_04102104_C004.webm" type="video/webm" />
  <source src="/home/A001_04102104_C004.mp4" type="video/mp4" />
</video>
<div class="fixed inset-0 bg-black/40 -z-10"></div>

<nav class="sticky top-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm transition-colors duration-200">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex justify-between h-16">

      <!-- Logo -->
      <div class="flex items-center">
        <a href="/" class="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">is</a>

        <!-- Desktop links -->
        <div class="hidden sm:ml-8 sm:flex sm:space-x-8">
          {#each navLinks as link}
            {#if link.href}
              <a
                href={link.href}
                class="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
              >{link.label}</a>
            {:else}
              <span class="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-300 dark:text-gray-600 cursor-not-allowed">{link.label}</span>
            {/if}
          {/each}
        </div>
      </div>

      <!-- Right side: theme toggle + hamburger -->
      <div class="flex items-center gap-3">
        <ThemeToggle />

        <!-- Hamburger (portrait / mobile only) -->
        <button
          class="sm:hidden p-2 rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
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
    <div class="sm:hidden absolute top-16 left-0 right-0 border-t border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm shadow-lg">
      {#each navLinks as link}
        {#if link.href}
          <a
            href={link.href}
            onclick={() => menuOpen = false}
            class="block px-6 py-4 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >{link.label}</a>
        {:else}
          <span class="block px-6 py-4 text-sm font-medium text-gray-300 dark:text-gray-600">{link.label}</span>
        {/if}
      {/each}
    </div>
  {/if}
</nav>

<main class="min-h-screen transition-colors duration-200">
  {@render children?.()}
</main>
