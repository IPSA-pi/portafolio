<script lang="ts">
  import { onMount } from 'svelte';

  type MsPrecision = 'ms' | 'cs' | 'ds' | 'none';
  type DisplayMode  = 'binary' | 'digits' | 'circle' | 'bars';
  type Orientation  = 'auto' | 'horizontal' | 'vertical';
  type Range        = 'full' | 'time' | 'date';

  let {
    msPrecision = 'none',
    mode        = 'binary',
    blendMode   = 'normal',
    showBg      = false,
    colorOn     = '#ffffff',
    colorOff    = '#000000',
    squareSize  = 20,
    orientation = 'auto',
    range       = 'full',
    glowSize    = 8,
  }: {
    msPrecision?: MsPrecision;
    mode?: DisplayMode;
    blendMode?: string;
    showBg?: boolean;
    colorOn?: string;
    colorOff?: string;
    squareSize?: number;
    orientation?: Orientation;
    range?: Range;
    glowSize?: number;
  } = $props();

  // ── Time update ────────────────────────────────────────────────────────────
  let now = $state(new Date());
  let timer: ReturnType<typeof setInterval>;

  const baseInterval: Record<MsPrecision, number> = { ms: 16, cs: 10, ds: 100, none: 1000 };

  const effectiveInterval = $derived(baseInterval[msPrecision]);

  $effect(() => {
    clearInterval(timer);
    timer = setInterval(() => { now = new Date(); }, effectiveInterval);
    return () => clearInterval(timer);
  });

  // ── Shared unit data ────────────────────────────────────────────────────────
  type Unit = { value: number; max: number };

  function getUnits(d: Date, r: Range, p: MsPrecision): Unit[] {
    const dateU: Unit[] = [
      { value: d.getFullYear() % 100, max: 100 },
      { value: d.getMonth() + 1,      max: 12  },
      { value: d.getDate(),           max: 31  },
    ];
    const timeU: Unit[] = [
      { value: d.getHours(),   max: 24 },
      { value: d.getMinutes(), max: 60 },
      { value: d.getSeconds(), max: 60 },
    ];
    let units = r === 'date' ? dateU : r === 'time' ? timeU : [...dateU, ...timeU];

    if (r !== 'date' && p !== 'none') {
      const ms = d.getMilliseconds();
      units = [...units,
        p === 'ds' ? { value: Math.floor(ms / 100), max: 10   } :
        p === 'cs' ? { value: Math.floor(ms / 10),  max: 100  } :
                     { value: ms,                    max: 1000 }
      ];
    }
    return units;
  }

  // ── Binary / digits helpers ────────────────────────────────────────────────
  type Col = { value: number; bits: number };

  function decimalDigits(value: number, count: number): Col[] {
    return String(value).padStart(count, '0').split('').map(ch => ({ value: Number(ch), bits: 4 }));
  }

  function msCols(d: Date, p: MsPrecision, dig: boolean): Col[] {
    if (p === 'none') return [];
    const ms = d.getMilliseconds();
    if (dig) {
      const v = p === 'ds' ? Math.floor(ms/100) : p === 'cs' ? Math.floor(ms/10) : ms;
      const w = p === 'ds' ? 1 : p === 'cs' ? 2 : 3;
      return decimalDigits(v, w);
    }
    return p === 'ds' ? [{ value: Math.floor(ms/100), bits: 4  }] :
           p === 'cs' ? [{ value: Math.floor(ms/10),  bits: 7  }] :
                        [{ value: ms,                  bits: 10 }];
  }

  function buildCols(d: Date, m: 'binary'|'digits', p: MsPrecision, r: Range): Col[] {
    const dig = m === 'digits';
    const datePart: Col[] = dig
      ? [...decimalDigits(d.getFullYear(),4), ...decimalDigits(d.getMonth()+1,2), ...decimalDigits(d.getDate(),2)]
      : [{ value: d.getFullYear(), bits: 11 }, { value: d.getMonth()+1, bits: 4 }, { value: d.getDate(), bits: 5 }];
    const timePart: Col[] = dig
      ? [...decimalDigits(d.getHours(),2), ...decimalDigits(d.getMinutes(),2), ...decimalDigits(d.getSeconds(),2)]
      : [{ value: d.getHours(), bits: 5 }, { value: d.getMinutes(), bits: 6 }, { value: d.getSeconds(), bits: 6 }];
    const base = r === 'date' ? datePart : r === 'time' ? timePart : [...datePart, ...timePart];
    return [...base, ...msCols(d, p, dig)];
  }

  function toBits(value: number, bits: number): boolean[] {
    return Array.from({ length: bits }, (_, i) => Boolean((value >> (bits - 1 - i)) & 1));
  }

  // ── Orientation classes ────────────────────────────────────────────────────
  const wrapperClass: Record<Orientation, string> = {
    horizontal: 'flex flex-row items-end',
    vertical:   'flex flex-col items-start',
    auto:       'flex landscape:flex-row landscape:items-end portrait:flex-col portrait:items-start',
  };
  const colClass: Record<Orientation, string> = {
    horizontal: 'flex flex-col',
    vertical:   'flex flex-row',
    auto:       'flex landscape:flex-col portrait:flex-row',
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  let units   = $derived(getUnits(now, range, msPrecision));
  let columns = $derived(buildCols(now, (mode === 'digits' ? 'digits' : 'binary'), msPrecision, range));

  // Circle
  const ringW  = $derived(Math.max(4, Math.floor(squareSize / 2.5)));
  const ringG  = 3;
  const innerR = 14;
  let circleUnits = $derived([...units].reverse());
  let circleSize  = $derived(2 * (innerR + circleUnits.length * (ringW + ringG) + ringW / 2) + 16);

  // Bars
  let barH = $derived(squareSize * 6);

  // SVG glow filter string
  const svgGlow = $derived(glowSize > 0 ? `drop-shadow(0 0 ${glowSize}px ${colorOn})` : '');
</script>

<!-- ─── Binary / Digits ──────────────────────────────────────────────────── -->
{#if mode === 'binary' || mode === 'digits'}
  <div
    class="select-none {wrapperClass[orientation]} {showBg ? 'bg-black/30 px-5 py-4 rounded' : ''}"
    aria-label="Binary clock" role="timer"
  >
    {#each columns as col}
      <div class={colClass[orientation]}>
        {#each toBits(col.value, col.bits) as bit}
          <div style="width:{squareSize}px;height:{squareSize}px;{bit
            ? `background-color:${colorOn};mix-blend-mode:${blendMode};${glowSize > 0 ? `box-shadow:0 0 ${glowSize}px ${colorOn}` : ''}`
            : `background-color:${colorOff}`}"></div>
        {/each}
      </div>
    {/each}
  </div>

<!-- ─── Circle ───────────────────────────────────────────────────────────── -->
{:else if mode === 'circle'}
  <svg width={circleSize} height={circleSize} aria-label="Circle clock" role="timer">
    {#each circleUnits as unit, i}
      {@const r   = innerR + i * (ringW + ringG)}
      {@const circ = 2 * Math.PI * r}
      {@const frac = unit.value / unit.max}
      <!-- Background ring -->
      <circle cx={circleSize/2} cy={circleSize/2} r={r}
        fill="none" stroke={colorOff} stroke-width={ringW} opacity="0.4" />
      <!-- Filled arc -->
      <circle cx={circleSize/2} cy={circleSize/2} r={r}
        fill="none" stroke={colorOn} stroke-width={ringW}
        stroke-dasharray={circ}
        stroke-dashoffset={circ * (1 - frac)}
        stroke-linecap="butt"
        transform="rotate(-90 {circleSize/2} {circleSize/2})"
        style={svgGlow ? `filter:${svgGlow}` : ''} />
    {/each}
  </svg>

<!-- ─── Bars ──────────────────────────────────────────────────────────────── -->
{:else if mode === 'bars'}
  {@const gap = 2}
  {@const totalW = units.length * (squareSize + gap) - gap}
  <svg width={totalW} height={barH} aria-label="Bar clock" role="timer">
    {#each units as unit, i}
      {@const x     = i * (squareSize + gap)}
      {@const fillH = Math.max(1, (unit.value / unit.max) * barH)}
      <rect x={x} y={0}           width={squareSize} height={barH}  fill={colorOff} opacity="0.4" />
      <rect x={x} y={barH - fillH} width={squareSize} height={fillH} fill={colorOn}
        style={svgGlow ? `filter:${svgGlow}` : ''} />
    {/each}
  </svg>

{/if}
