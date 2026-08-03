<script lang="ts">
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import BinaryText from '$lib/components/BinaryText.svelte';
  import Seo from '$lib/components/Seo.svelte';
  import { isFullscreen } from '$lib/stores/fullscreen';
  import { hexToRgba } from '$lib/utils/hexToRgba';

  let text         = $state('');
  let colorOn      = $state('#ffffff');
  let alphaOn      = $state(100);
  let colorOff     = $state('#000000');
  let alphaOff     = $state(100);
  let squareSize   = $state(16);
  let glowSize     = $state(8);
  let settingsOpen = $state(false);
  let isPortrait   = $state(true);
  let inputEl: HTMLInputElement | undefined = $state();
  let displayEl: HTMLElement | undefined = $state();
  let settingsEl: HTMLElement | undefined = $state();
  let gearEl: HTMLElement | undefined = $state();

  onMount(() => {
    const mq = window.matchMedia('(orientation: portrait)');
    isPortrait = mq.matches;
    const orientHandler = (e: MediaQueryListEvent) => { isPortrait = e.matches; };
    mq.addEventListener('change', orientHandler);
    inputEl?.focus();
    return () => mq.removeEventListener('change', orientHandler);
  });

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      settingsOpen = false;
      document.documentElement.requestFullscreen();
    }
  }

  function resetColors() {
    colorOn  = '#ffffff';
    alphaOn  = 100;
    colorOff = '#000000';
    alphaOff = 100;
  }

  function swapColors() {
    [colorOn, colorOff]   = [colorOff, colorOn];
    [alphaOn, alphaOff]   = [alphaOff, alphaOn];
  }

  let colorOnRgba  = $derived(hexToRgba(colorOn,  alphaOn));
  let colorOffRgba = $derived(hexToRgba(colorOff, alphaOff));

  const MIN_SIZE = 8;
  const MAX_SIZE = 48;
  const SIZE_STEP = 4;
</script>

<Seo title="Text2Binary" path="/text2binary"
  description="Type text and watch it render live as binary — each character becomes a row of UTF-8 bits." />

<div class="{$isFullscreen ? 'min-h-screen' : 'min-h-[calc(100vh-4rem)]'} flex flex-col items-center gap-8 py-10 px-4">

  <div class="w-full max-w-md flex items-center gap-2">
    <label for="t2b-input" class="sr-only">Text to convert to binary</label>
    <input
      id="t2b-input"
      bind:this={inputEl}
      bind:value={text}
      type="text"
      placeholder="type something…"
      autocomplete="off"
      spellcheck="false"
      class="flex-1 bg-black/60 text-white font-mono text-sm px-3 py-2 border border-white/20 focus:border-white/60 focus:outline-none placeholder:text-white/25"
    />
    <button
      bind:this={gearEl}
      onclick={() => settingsOpen = !settingsOpen}
      title="Display settings"
      class="px-2 py-2 text-white hover:text-white border border-white/20 hover:border-white/50 transition-colors"
    >
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
        <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
      </svg>
    </button>
  </div>

  {#if text}
    <button
      type="button"
      bind:this={displayEl}
      onclick={() => settingsOpen = !settingsOpen}
      aria-label="Toggle display settings"
      class="appearance-none bg-transparent border-0 p-0 cursor-pointer"
    >
      <BinaryText {text} colorOn={colorOnRgba} colorOff={colorOffRgba} {squareSize} {glowSize} />
    </button>
  {:else}
    <p class="text-xs font-mono text-white/60">each character becomes a row of 8 bits (utf-8)</p>
  {/if}

</div>

<svelte:window onclick={(e) => {
  if (!$isFullscreen || !settingsOpen) return;
  const t = e.target as Node;
  if (settingsEl?.contains(t) || displayEl?.contains(t) || gearEl?.contains(t)) return;
  settingsOpen = false;
}} />

<!-- Settings panel -->
{#if settingsOpen}
  <div
    bind:this={settingsEl}
    transition:fly={{ x: isPortrait ? 0 : -288, y: isPortrait ? 288 : 0, duration: 220 }}
    class="
      fixed z-20 bg-black overflow-y-auto
      landscape:left-0 {$isFullscreen ? 'landscape:top-0' : 'landscape:top-16'} landscape:bottom-0 landscape:w-72 landscape:border-r landscape:border-white/10
      portrait:bottom-0 portrait:inset-x-0 portrait:max-h-[70vh] portrait:rounded-t-xl portrait:border-t portrait:border-white/10
    "
  >
    <!-- Drag handle (portrait only) -->
    <div class="portrait:flex landscape:hidden justify-center pt-3 pb-1">
      <div class="w-8 h-[3px] rounded-full bg-white/20"></div>
    </div>

    <div class="p-5 flex flex-col gap-4">
      <div class="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 items-center">

        <!-- Size -->
        <span class="text-[10px] font-mono uppercase tracking-widest text-white">size</span>
        <div class="flex items-center gap-2">
          <button
            onclick={() => { squareSize = Math.max(MIN_SIZE, squareSize - SIZE_STEP); }}
            class="w-6 h-6 flex items-center justify-center text-white hover:text-white border border-white/20 hover:border-white/50 font-mono text-sm transition-colors"
          >−</button>
          <span class="text-xs font-mono text-white w-8 text-center">{squareSize}</span>
          <button
            onclick={() => { squareSize = Math.min(MAX_SIZE, squareSize + SIZE_STEP); }}
            class="w-6 h-6 flex items-center justify-center text-white hover:text-white border border-white/20 hover:border-white/50 font-mono text-sm transition-colors"
          >+</button>
        </div>

        <!-- Glow -->
        <span class="text-[10px] font-mono uppercase tracking-widest text-white">glow</span>
        <div class="flex items-center gap-2">
          <button
            onclick={() => glowSize = Math.max(0, glowSize - 2)}
            class="w-6 h-6 flex items-center justify-center text-white hover:text-white border border-white/20 hover:border-white/50 font-mono text-sm transition-colors"
          >−</button>
          <span class="text-xs font-mono text-white w-8 text-center">{glowSize}px</span>
          <button
            onclick={() => glowSize = Math.min(40, glowSize + 2)}
            class="w-6 h-6 flex items-center justify-center text-white hover:text-white border border-white/20 hover:border-white/50 font-mono text-sm transition-colors"
          >+</button>
        </div>

        <!-- Color 0 -->
        <span class="text-[10px] font-mono uppercase tracking-widest text-white">color 0</span>
        <div class="flex flex-col gap-1">
          <div class="flex items-center gap-2">
            <input type="color" bind:value={colorOff} class="w-7 h-5 cursor-pointer rounded-sm border-0 bg-transparent p-0" />
            <span class="text-[10px] font-mono text-white/60">{colorOff}</span>
          </div>
          <div class="flex items-center gap-2">
            <input type="range" min="0" max="100" bind:value={alphaOff} class="flex-1 h-[2px] accent-white cursor-pointer" />
            <span class="text-[10px] font-mono text-white/60 w-7 text-right">{alphaOff}%</span>
          </div>
        </div>

        <!-- Swap colors -->
        <div class="col-span-2 flex justify-center">
          <button
            onclick={swapColors}
            title="Swap colors"
            class="p-1 text-white/65 hover:text-white transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 7.5 7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
            </svg>
          </button>
        </div>

        <!-- Color 1 -->
        <span class="text-[10px] font-mono uppercase tracking-widest text-white">color 1</span>
        <div class="flex flex-col gap-1">
          <div class="flex items-center gap-2">
            <input type="color" bind:value={colorOn} class="w-7 h-5 cursor-pointer rounded-sm border-0 bg-transparent p-0" />
            <span class="text-[10px] font-mono text-white/60">{colorOn}</span>
          </div>
          <div class="flex items-center gap-2">
            <input type="range" min="0" max="100" bind:value={alphaOn} class="flex-1 h-[2px] accent-white cursor-pointer" />
            <span class="text-[10px] font-mono text-white/60 w-7 text-right">{alphaOn}%</span>
          </div>
        </div>

        <!-- Reset colors + fullscreen -->
        <div class="col-span-2 pt-1 flex gap-2">
          <button
            onclick={resetColors}
            class="flex-1 py-1 text-xs font-mono text-white hover:text-white border border-white/10 hover:border-white/40 transition-colors"
          >reset colors</button>
          <button
            onclick={toggleFullscreen}
            title="Fullscreen"
            class="px-3 py-1 text-white hover:text-white border border-white/10 hover:border-white/40 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          </button>
        </div>

      </div>
    </div>
  </div>
{/if}
