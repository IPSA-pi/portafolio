# Svelte 5: runes and reactivity

Svelte 5's headline feature is **runes** — special `$`-prefixed functions that mark what's
reactive. Older Svelte made *every* top-level `let` magically reactive; runes make it explicit,
which is easier to read and reason about. Every example in this chapter is real code from this
site.

## `$props()` — a component's inputs

Components receive data from their parent through props. You declare them by destructuring one
object, fully typed, with normal JavaScript defaults:

```ts
// src/lib/components/PurchaseButton.svelte
interface Props {
    priceId: string;
    price: number;
    sold: boolean;
    compact?: boolean;          // optional
}
let { priceId, price, sold, compact = false }: Props = $props();
```

> Concept: **props** are how data flows *down* from parent to child — the fundamental unit of
> composition in component frameworks (React, Vue, Svelte all share this idea).

## `$state()` — reactive local state

A value that re-renders the UI whenever you reassign it:

```ts
// src/routes/+layout.svelte
let menuOpen = $state(false);
// ...
onclick={() => menuOpen = !menuOpen}   // flipping it updates the DOM automatically
```

> Concept: **reactive state**. You change a variable; the framework updates the screen for you,
> so you never touch the DOM by hand. Note that non-reactive values (like the `navLinks` array)
> stay plain `const` — only things that *change over time* need `$state`.

## `$derived()` — computed values

A value calculated *from* other reactive values; it recomputes automatically when they change:

```ts
// src/lib/components/PurchaseButton.svelte — money formatting follows `price`
const formattedPrice = $derived(formatPrice(price));

// src/routes/+layout.svelte — breadcrumbs follow the URL
let segments = $derived($page.url.pathname.split('/').filter(Boolean));
```

(`formatPrice` itself lives in `src/lib/utils/formatPrice.ts` — it used to be
copy-pasted inline in four different places with two subtly different
outputs; see [Building the cart](/learn/cart) for that story.)

> Concept: **derived/computed state**. Instead of manually keeping two variables in sync, you
> express one *as a function of* the other. Fewer bugs, less bookkeeping.

## `$effect()` — side effects and cleanup

Runs code when its reactive dependencies change, and can return a cleanup function. This is the
tool for talking to the outside world (timers, browser APIs, subscriptions):

```ts
// src/lib/components/BinaryClock.svelte — a self-correcting clock tick
const effectiveInterval = $derived(baseInterval[msPrecision]);
$effect(() => {
    clearInterval(timer);
    timer = setInterval(() => { now = new Date(); }, effectiveInterval);
    return () => clearInterval(timer);   // cleanup runs before re-run / on unmount
});
```

Because the effect *reads* `effectiveInterval`, Svelte automatically re-runs it (tearing down the
old timer, starting a new one) whenever the precision changes.

A more advanced example in `Feed.svelte` uses an `IntersectionObserver` to detect which image is
on screen, then returns a cleanup that disconnects it:

```ts
// src/lib/components/Feed.svelte (abridged)
$effect(() => {
    const observer = new IntersectionObserver(/* update currentIndex + URL */);
    slides.forEach(s => observer.observe(s));
    return () => observer.disconnect();   // no memory leaks
});
```

> Concept: **side effects and lifecycle/cleanup**. Anything that reaches outside your component
> (timers, event listeners, observers) must be cleaned up when the component goes away, or you
> leak memory. The returned function is that cleanup.

## `untrack()` — opting *out* of reactivity

Inside an `$effect`, reading a reactive value normally subscribes you to it. Sometimes you want
to read a value *once* without re-running when it later changes:

```ts
// src/lib/components/Feed.svelte
let currentIndex = $state(untrack(() => startIndex));
// ...
untrack(() => scrollToIndex(startIndex, 'instant'));  // scroll once, don't re-fire on every index change
```

> Concept: **fine-grained reactivity control**. Knowing when *not* to react is as important as
> knowing when to. This prevents feedback loops (effect changes a value → value re-triggers effect).

## Snippets and `{@render}` — reusable markup / "slots"

A layout wraps the current page using a **snippet** (Svelte 5's replacement for slots):

```ts
// src/routes/+layout.svelte
let { children }: Props = $props();   // children is a Snippet
```
```svelte
<main>
  {@render children?.()}    <!-- render the current page here -->
</main>
```

> Concept: **composition / "holes" in a layout**. The layout defines a shell (nav, footer) and
> leaves a hole where each page's content gets injected.

## Event attributes — `onclick`, not `on:click`

Svelte 5 dropped the colon; events are plain HTML-like attributes:

```svelte
<button onclick={toggleTheme}>Toggle</button>
<svelte:window onkeydown={handleKeydown} onmousemove={showControls} />
```

## Stores still exist — and we use them on purpose

App-wide state (the theme, fullscreen mode) uses Svelte's classic **store** API rather than runes:

```ts
// src/lib/stores/fullscreen.ts
import { writable } from 'svelte/store';
export const isFullscreen = writable(false);
```
```svelte
<!-- the $ prefix auto-subscribes and reads the current value -->
<nav class:hidden={$isFullscreen}>…</nav>
```

> Concept: **local vs global state**. Use `$state` for state that lives inside one component;
> use a store for state that many unrelated components share. This codebase is a clean example of
> picking the right tool for each — not everything needs to be a rune.
