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

<div class="select-none flex flex-col" role="img" aria-label="Binary representation of: {text}">
  {#each rows as row}
    <div class="flex flex-row" title="{row.char} = {row.byte}">
      {#each toBits(row.byte, 8) as bit}
        <div style="width:{squareSize}px;height:{squareSize}px;{bit
          ? `background-color:${colorOn};mix-blend-mode:${blendMode};${glowSize > 0 ? `box-shadow:0 0 ${glowSize}px ${colorOn}` : ''}`
          : `background-color:${colorOff}`}"></div>
      {/each}
    </div>
  {/each}
</div>
