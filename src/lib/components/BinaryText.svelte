<script lang="ts">
  import { toBits } from '$lib/utils/toBits';

  let {
    text       = '',
    colorOn    = '#ffffff',
    colorOff   = '#000000',
    squareSize = 20,
    glowSize   = 8,
    blendMode  = 'normal',
  }: {
    text?: string;
    colorOn?: string;
    colorOff?: string;
    squareSize?: number;
    glowSize?: number;
    blendMode?: string;
  } = $props();

  const encoder = new TextEncoder();

  type Row = { byte: number; char: string };

  // One row per UTF-8 byte; multi-byte characters (é, emoji) span several rows.
  let rows = $derived.by(() => {
    const out: Row[] = [];
    for (const char of text) {
      for (const byte of encoder.encode(char)) out.push({ byte, char });
    }
    return out;
  });
</script>

<!-- Same layering as BinaryClock: off squares below, lit squares in an
     overlay that carries one drop-shadow filter for the whole layer. -->
<div class="select-none relative" role="img" aria-label="Binary representation of: {text}">
  <div class="flex flex-col">
    {#each rows as row}
      <div class="flex flex-row" title="{row.char} = {row.byte}">
        {#each toBits(row.byte, 8) as bit}
          <div style="width:{squareSize}px;height:{squareSize}px;{bit ? '' : `background-color:${colorOff}`}"></div>
        {/each}
      </div>
    {/each}
  </div>
  <div
    class="absolute inset-0 pointer-events-none flex flex-col"
    style={glowSize > 0 ? `filter:drop-shadow(0 0 ${glowSize}px ${colorOn})` : ''}
    aria-hidden="true"
  >
    {#each rows as row}
      <div class="flex flex-row">
        {#each toBits(row.byte, 8) as bit}
          <div style="width:{squareSize}px;height:{squareSize}px;{bit ? `background-color:${colorOn};mix-blend-mode:${blendMode}` : ''}"></div>
        {/each}
      </div>
    {/each}
  </div>
</div>
