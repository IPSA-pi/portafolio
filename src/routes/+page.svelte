<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { fly } from 'svelte/transition';
  import BinaryClock from '$lib/components/BinaryClock.svelte';
  import { isFullscreen } from '$lib/stores/fullscreen';

  type MsPrecision = 'ms' | 'cs' | 'ds' | 'none';
  type DisplayMode = 'binary' | 'digits' | 'dots' | 'circle' | 'bars' | 'lissajous' | 'analog' | 'noise';
  type Orientation = 'auto' | 'horizontal' | 'vertical';
  type Range       = 'full' | 'time' | 'date';

  let msPrecision  = $state<MsPrecision>('none');
  let mode         = $state<DisplayMode>('binary');
  let colorOn      = $state('#ffffff');
  let alphaOn      = $state(100);
  let colorOff     = $state('#000000');
  let alphaOff     = $state(100);
  let squareSize   = $state(20);
  let glowSize     = $state(8);
  let orientation  = $state<Orientation>('auto');
  let range        = $state<Range>('full');
  let settingsOpen = $state(false);
  let isPortrait   = $state(true);
  let clockEl: HTMLElement;
  let settingsEl: HTMLElement;

  onMount(() => {
    document.body.style.overflow = 'hidden';
    const mq = window.matchMedia('(orientation: portrait)');
    isPortrait = mq.matches;
    fitToScreen();
    const orientHandler = (e: MediaQueryListEvent) => { isPortrait = e.matches; };
    mq.addEventListener('change', orientHandler);
    return () => {
      document.body.style.overflow = '';
      mq.removeEventListener('change', orientHandler);
    };
  });

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      settingsOpen = false;
      document.documentElement.requestFullscreen();
    }
  }


  $effect(() => {
    range;
    isPortrait;
    $isFullscreen;
    settingsOpen;
    const raf = requestAnimationFrame(() => untrack(fitToScreen));
    return () => cancelAnimationFrame(raf);
  });

  function fitToScreen() {
    if (!clockEl) return;
    const rect = clockEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const PADDING = 32;
    const availW = $isFullscreen
      ? window.innerWidth  - PADDING * 2
      : window.innerWidth  - (isPortrait ? 0 : 288) - PADDING * 2;
    const availH = $isFullscreen
      ? window.innerHeight - PADDING * 2
      : window.innerHeight - (isPortrait ? 0 : 64)  - PADDING * 2;
    const ratio = Math.min(availW / rect.width, availH / rect.height);
    const newSize = Math.round((squareSize * ratio) / SIZE_STEP) * SIZE_STEP;
    squareSize = Math.max(MIN_SIZE, Math.min(MAX_SIZE, newSize));
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

  function hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha / 100})`;
  }

  let colorOnRgba  = $derived(hexToRgba(colorOn,  alphaOn));
  let colorOffRgba = $derived(hexToRgba(colorOff, alphaOff));

  const MIN_SIZE = 8;
  const MAX_SIZE = 48;
  const SIZE_STEP = 4;

  const precisionOptions: { value: MsPrecision; label: string }[] = [
    { value: 'none', label: 'none' },
    { value: 'ds',   label: 'ds'   },
    { value: 'cs',   label: 'cs'   },
    { value: 'ms',   label: 'ms'   },
  ];
</script>

<svelte:head>
  <title>iansebelius</title>
  <meta name="description" content="Personal portfolio of Ian Sebelius, featuring drawings." />
</svelte:head>

<div class="{$isFullscreen ? 'h-screen' : 'h-[calc(100vh-4rem)]'} flex flex-col justify-center items-center overflow-hidden">

  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div bind:this={clockEl} onclick={() => settingsOpen = !settingsOpen} class="cursor-pointer portrait:scale-[2] portrait:my-16">
    <BinaryClock {msPrecision} {mode} blendMode="normal" showBg={false}
      colorOn={colorOnRgba} colorOff={colorOffRgba} {squareSize} {glowSize} {orientation} {range} />
  </div>

</div>

<svelte:window onclick={(e) => {
  if (!$isFullscreen || !settingsOpen) return;
  const t = e.target as Node;
  if (settingsEl?.contains(t) || clockEl?.contains(t)) return;
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

        <!-- Mode -->
        <span class="text-[10px] font-mono uppercase tracking-widest text-white/40">mode</span>
        <select bind:value={mode} class="bg-black text-white text-xs font-mono px-2 py-1 border border-white/20 focus:border-white/50 focus:outline-none cursor-pointer">
          <option value="binary">binary</option>
          <option value="digits">digits</option>
          <option value="dots">dots</option>
          <option value="circle">circle</option>
          <option value="bars">bars</option>
          <option value="lissajous">lissajous</option>
          <option value="analog">analog</option>
          <option value="noise">noise</option>
        </select>

        <!-- Last column -->
        <span class="text-[10px] font-mono uppercase tracking-widest text-white/40">last col</span>
        <select bind:value={msPrecision} class="bg-black text-white text-xs font-mono px-2 py-1 border border-white/20 focus:border-white/50 focus:outline-none cursor-pointer">
          {#each precisionOptions as opt}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>

        <!-- Range -->
        <span class="text-[10px] font-mono uppercase tracking-widest text-white/40">range</span>
        <select bind:value={range} class="bg-black text-white text-xs font-mono px-2 py-1 border border-white/20 focus:border-white/50 focus:outline-none cursor-pointer">
          <option value="full">ymdhms</option>
          <option value="time">hms</option>
          <option value="date">ymd</option>
        </select>

        <!-- Orientation -->
        <span class="text-[10px] font-mono uppercase tracking-widest text-white/40">orientation</span>
        <select bind:value={orientation} class="bg-black text-white text-xs font-mono px-2 py-1 border border-white/20 focus:border-white/50 focus:outline-none cursor-pointer">
          <option value="auto">auto</option>
          <option value="horizontal">vertical</option>
          <option value="vertical">horizontal</option>
        </select>

        <!-- Glow -->
        <span class="text-[10px] font-mono uppercase tracking-widest text-white/40">glow</span>
        <div class="flex items-center gap-2">
          <button
            onclick={() => glowSize = Math.max(0, glowSize - 2)}
            class="w-6 h-6 flex items-center justify-center text-white/50 hover:text-white border border-white/20 hover:border-white/50 font-mono text-sm transition-colors"
          >−</button>
          <span class="text-xs font-mono text-white/40 w-8 text-center">{glowSize}px</span>
          <button
            onclick={() => glowSize = Math.min(40, glowSize + 2)}
            class="w-6 h-6 flex items-center justify-center text-white/50 hover:text-white border border-white/20 hover:border-white/50 font-mono text-sm transition-colors"
          >+</button>
        </div>

        <!-- Color 1 -->
        <span class="text-[10px] font-mono uppercase tracking-widest text-white/40">color 1</span>
        <div class="flex flex-col gap-1">
          <div class="flex items-center gap-2">
            <input type="color" bind:value={colorOn} class="w-7 h-5 cursor-pointer rounded-sm border-0 bg-transparent p-0" />
            <span class="text-[10px] font-mono text-white/25">{colorOn}</span>
          </div>
          <div class="flex items-center gap-2">
            <input type="range" min="0" max="100" bind:value={alphaOn} class="flex-1 h-[2px] accent-white cursor-pointer" />
            <span class="text-[10px] font-mono text-white/25 w-7 text-right">{alphaOn}%</span>
          </div>
        </div>

        <!-- Swap colors -->
        <div class="col-span-2 flex justify-center">
          <button
            onclick={swapColors}
            title="Swap colors"
            class="p-1 text-white/30 hover:text-white/80 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 7.5 7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
            </svg>
          </button>
        </div>

        <!-- Color 0 -->
        <span class="text-[10px] font-mono uppercase tracking-widest text-white/40">color 0</span>
        <div class="flex flex-col gap-1">
          <div class="flex items-center gap-2">
            <input type="color" bind:value={colorOff} class="w-7 h-5 cursor-pointer rounded-sm border-0 bg-transparent p-0" />
            <span class="text-[10px] font-mono text-white/25">{colorOff}</span>
          </div>
          <div class="flex items-center gap-2">
            <input type="range" min="0" max="100" bind:value={alphaOff} class="flex-1 h-[2px] accent-white cursor-pointer" />
            <span class="text-[10px] font-mono text-white/25 w-7 text-right">{alphaOff}%</span>
          </div>
        </div>

        <!-- Reset colors + fullscreen -->
        <div class="col-span-2 pt-1 flex gap-2">
          <button
            onclick={resetColors}
            class="flex-1 py-1 text-xs font-mono text-white/40 hover:text-white border border-white/10 hover:border-white/40 transition-colors"
          >reset colors</button>
          <button
            onclick={toggleFullscreen}
            title="Fullscreen"
            class="px-3 py-1 text-white/40 hover:text-white border border-white/10 hover:border-white/40 transition-colors"
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
