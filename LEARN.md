# LEARN — how this site is built (and the web-dev ideas behind it)

This is the **conceptual** companion to the [README](./README.md). The README tells you
*how to run and deploy* the site; this file explains *why it's built the way it is* and uses
the real code as a way to learn core web-development concepts.

It's written to grow as the project grows, and to eventually become the source for an on-site
"How this site was built" page.

> Audience: curious beginners and intermediate devs. If a section assumes knowledge you don't
> have yet, skip it and come back — the sections are independent.

---

## Table of contents

1. [The 30-second pitch](#the-30-second-pitch)
2. [How a request flows through the site](#how-a-request-flows-through-the-site)
3. [Folder map](#folder-map)
4. [Svelte 5 features, with examples from this site](#svelte-5-features-with-examples-from-this-site)
5. [SvelteKit concepts: routing, loading, server vs client](#sveltekit-concepts)
6. [Stripe + Supabase: how the shop works](#stripe-supabase-how-the-shop-works)
7. [Building the cart: troubles along the way](#building-the-cart-troubles-along-the-way)
8. [Interesting design decisions worth understanding](#interesting-design-decisions)
9. [Auth and cookies: how the owner gate works](#auth-and-cookies-how-the-owner-gate-works)
10. [Glossary](#glossary)
11. [Where to go next](#where-to-go-next)

---

## The 30-second pitch

A **SvelteKit 5** artist portfolio where every drawing is a one-of-a-kind item for sale.
Each page splits into a **server loader** that safely talks to the database
([Supabase](#glossary)) and payments ([Stripe](#glossary)), and a **Svelte component** that
renders the result in the browser. The UI is built with **Svelte 5 runes** for reactivity,
styled with **Tailwind CSS**, and deployed to the edge on **Cloudflare**.

---

## How a request flows through the site

```
Browser asks for /drawing/negro_1
  │
  ▼
hooks.server.ts        Runs first, on every request. Assigns a per-visitor random
                       "seed" cookie used to shuffle the art consistently.
  │
  ▼
+page.server.ts        Runs ONLY on the server. Queries Supabase for that notebook's
  (load function)      drawings and checks Stripe. Returns plain data (JSON).
  │
  ▼
+page.svelte           Runs in the browser. Receives that data as a prop and renders
                       the gallery with Svelte 5 runes.
  │
  ▼
User clicks "Buy"  →  POST /api/checkout  →  Stripe Checkout page  →  payment
                                                                        │
                                                                        ▼
                                                       /api/webhook marks it "sold"
                                                       and sends a confirmation email
```

**The single most important idea:** files ending in `.server.ts` (and anything in a
`lib/server/` folder) **never get sent to the browser**. That's where secret keys live. The
`.svelte` files are the public UI. This server/client split is the backbone of how SvelteKit
keeps secrets safe while still rendering dynamic pages.

---

## Folder map

| Path | Role |
|------|------|
| `src/routes/` | Each folder is a URL. Special filenames have special meaning (see below). |
| `src/routes/cart/` | The client-rendered cart review page (`+page.svelte`) — no server data of its own; it reads `src/lib/stores/cart.ts`. |
| `src/routes/api/checkout/`, `.../cancel/`, `.../session-status/` | Checkout session creation, best-effort reservation release, and public payment-status lookup — see [Stripe + Supabase](#stripe-supabase-how-the-shop-works). |
| `src/routes/api/drawings/status/` | Public sold/reserved/price lookup for a slug list — how the cart page re-checks availability before checkout. |
| `src/lib/components/` | Reusable UI pieces: `Feed`, `Gallery`, `PurchaseButton`, `ThemeToggle`, `BinaryClock`. |
| `src/lib/server/` | Server-only modules. The `server/` name makes SvelteKit guarantee they never ship to the browser. Includes `reservations.ts` (the one place that releases a Stripe session's reservations) and `checkoutSlugs.ts` (the one place that reads which drawings a session covers). |
| `src/lib/stores/` | App-wide shared state (`theme`, `fullscreen`, `cart`). |
| `src/lib/utils/` | Small, pure, framework-agnostic helpers shared across components: `formatTitle`, `formatPrice`, `checkoutReturn` (the Stripe-return-detection helper used by both the cart page and the notebook page). |
| `src/hooks.server.ts` | Runs on every request before pages — sets the session seed. |
| `scripts/` | Node tooling to process/upload images and seed the database. |

**Special route filenames** (SvelteKit convention):

| File | Meaning |
|------|---------|
| `+page.svelte` | The page UI at this URL. |
| `+page.server.ts` | Server-only data loader for that page (`load` function). |
| `+server.ts` | An API endpoint (returns JSON/responses, not a page). |
| `+layout.svelte` | Wraps all pages in this folder and below (nav, footer, background). |

**Dynamic routes** use square brackets:
- `drawing/[slug]/` → matches `/drawing/negro_1`, `/drawing/verde_3`, … (`slug` is a variable)
- `drawing/[slug]/[index]/` → matches `/drawing/negro_1/3` (image #3 of that notebook)

---

## Svelte 5 features, with examples from this site

Svelte 5's headline feature is **runes** — special `$`-prefixed functions that mark what's
reactive. Older Svelte made *every* top-level `let` magically reactive; runes make it explicit,
which is easier to read and reason about.

### `$props()` — a component's inputs

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

### `$state()` — reactive local state

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

### `$derived()` — computed values

A value calculated *from* other reactive values; it recomputes automatically when they change:

```ts
// src/lib/components/PurchaseButton.svelte — money formatting follows `price`
const formattedPrice = $derived(formatPrice(price));

// src/routes/+layout.svelte — breadcrumbs follow the URL
let segments = $derived($page.url.pathname.split('/').filter(Boolean));
```

(`formatPrice` itself lives in `src/lib/utils/formatPrice.ts` — it used to be
copy-pasted inline in four different places with two subtly different
outputs; see [Building the cart](#building-the-cart-troubles-along-the-way)
for that story.)

> Concept: **derived/computed state**. Instead of manually keeping two variables in sync, you
> express one *as a function of* the other. Fewer bugs, less bookkeeping.

### `$effect()` — side effects and cleanup

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

### `untrack()` — opting *out* of reactivity

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

### Snippets and `{@render}` — reusable markup / "slots"

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

### Event attributes — `onclick`, not `on:click`

Svelte 5 dropped the colon; events are plain HTML-like attributes:

```svelte
<button onclick={toggleTheme}>Toggle</button>
<svelte:window onkeydown={handleKeydown} onmousemove={showControls} />
```

### Stores still exist — and we use them on purpose

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

---

## SvelteKit concepts

### Server-side `load` functions

When you visit `/drawing/negro_1`, SvelteKit runs the matching `+page.server.ts` **on the server**
before rendering. It fetches data and hands the page a ready-made object:

```ts
// src/routes/drawing/[slug]/[index]/+page.server.ts
export async function load({ params, locals }) {
    const data = await loadNotebook(params.slug, locals.sessionSeed);

    const index = Number(params.index);
    if (!Number.isInteger(index) || index < 1 || index > data.images.length) {
        throw redirect(302, `/drawing/${params.slug}/1`);   // bad/out-of-range index -> slide 1
    }

    return { ...data, index };
}
```

- `params.slug` is the `[slug]` part of the URL.
- `locals.sessionSeed` was set earlier by `hooks.server.ts` (see below).
- The returned object becomes the page's `data` prop.

> Concept: **server-side rendering & data loading**. The page arrives at the browser already
> populated with data — better for speed and for search engines than fetching after load.

### Hooks — code that runs on every request

`hooks.server.ts` is a chokepoint every request passes through. Here it gives each visitor a
random seed stored in a cookie:

```ts
// src/hooks.server.ts
export const handle = async ({ event, resolve }) => {
    let seed = Number(event.cookies.get('session_seed'));
    if (!seed) {
        seed = Math.floor(Math.random() * 2 ** 32);
        event.cookies.set('session_seed', String(seed), { path: '/', sameSite: 'lax' });
    }
    event.locals.sessionSeed = seed;   // now available to every load function
    return resolve(event);
};
```

> Concept: **middleware**. A single place to run logic (auth, cookies, logging) for *all*
> requests, instead of repeating it in every route.

### API endpoints (`+server.ts`)

`/api/checkout` and `/api/webhook` aren't pages — they return data/responses. `PurchaseButton`
calls checkout with `fetch`, gets back a Stripe URL, and redirects the browser there.

> Concept: **the front end and back end of the same app talking over HTTP/JSON** — the basic
> shape of almost every web app.

---

## Stripe + Supabase: how the shop works

Stripe and Supabase each own a different part of the sale. Supabase is the **source of truth for
availability**; Stripe is the **source of truth for money**. The **slugs** of the drawings in a
cart (e.g. `negro_2_09`) are the only link between them — they travel through Stripe's session
metadata so the webhook knows which database rows to update, whether that's one drawing bought
straight from a notebook page or several bought together from the cart.

### Data model

Each drawing has one row in the Supabase `drawings` table:

| Column | Role |
|--------|------|
| `slug` | Unique identifier, e.g. `negro_2_09`. The key that ties everything together. |
| `stripe_product_id` | The Stripe Product object for this drawing. |
| `stripe_price_id` | The active Stripe Price (the amount the buyer pays). |
| `price_cents` | Mirror of the Stripe price — used to display the price without calling Stripe. |
| `sold` | `true` once payment is confirmed. Permanent. |
| `reserved` | `true` while a checkout session is active (≤ 30 min, see below). Temporary. |
| `reserved_at` | Timestamp of the reservation, used to detect stale locks. |

Images are stored in Supabase Storage (bucket: `drawings`) with four variants per drawing:
`negro_2_09.webp`, `negro_2_09-sm.webp`, `negro_2_09-md.webp`, `negro_2_09-lg.webp`.

A second table, `orders`, is the durable record of a sale — written by the webhook once payment is
confirmed, independent of whether the confirmation emails succeed:

| Column | Role |
|--------|------|
| `drawing_slug` | Which drawing this row is for — one row per sold drawing. |
| `stripe_session_id` | The checkout session the sale belongs to. A cart sale produces several `orders` rows sharing the same session id, so this column is **not** unique by itself — the uniqueness (and the guard against inserting the same row twice if a webhook retries) is on `(stripe_session_id, drawing_slug)` together. |
| `payment_intent`, `amount_total`, `customer_name`, `customer_email`, `shipping_address` | Buyer/payment details captured at fulfillment time. `amount_total` here is *per drawing* (that row's own price), not the whole session's total — summing it across a multi-item order gives the right answer; writing the session total on every row would not. |

> Concept: **normalization**. `drawings` answers "is this available and for how much"; `orders`
> answers "what actually got sold and to whom." Splitting them means a slow/failed confirmation
> email never risks losing the fact that a sale happened.

### The cart itself lives in the browser

Unlike `drawings`/`orders`, the **cart is not a database table at all** — it's a Svelte
`writable` store (`src/lib/stores/cart.ts`) persisted to `localStorage` under the key `cart:v1`,
following the same pattern as the `theme` store covered earlier (SSR-safe read via a `browser`
check, write-through on every change):

```ts
// src/lib/stores/cart.ts (abridged)
export const cartItems = writable<CartItem[]>(getInitialItems());

cartItems.subscribe((items) => {
    if (!browser) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }
    catch { /* storage unavailable (private mode, quota) — in-memory only */ }
});
```

Each item is a **display snapshot** — `{ slug, notebook, price, image }` — not a source of truth.
The server never trusts the price a cart item claims to have; `/api/checkout` always re-reads
`stripe_price_id` from Supabase before creating a Stripe session. This matters: a client-side
store is trivially editable in the browser's dev tools, so nothing security- or money-relevant can
depend on what it contains — it's a convenience cache of what the *server* already told the
browser, re-verified at the moment it matters.

> Concept: **never trust the client**. Anything that affects money or access must be re-derived or
> re-checked server-side, no matter how carefully the client-side copy was built.

### Purchase flow

A single click on "Buy" and a cart checkout both go through the *same* endpoint —
`/api/checkout` accepts `{ slugs: string[] }` (1 to 20 drawings), reserves every one of them
atomically, and creates **one** Stripe Checkout session covering all of them:

```
User clicks Buy (one drawing) or Checkout (a cart of N drawings)
      │
      ▼
POST /api/checkout   { slugs: [...] }
  Supabase: one set-based UPDATE, not N round trips —
            UPDATE drawings SET reserved=true, reserved_at=now()
            WHERE slug IN (...) AND sold=false
            AND (reserved=false OR reserved_at < 35 minutes ago)
            RETURNING slug, stripe_price_id
  → Any requested slug NOT in the returned rows is unavailable.
    If ANY slug is unavailable: roll back every reservation this
    request just took, return 409 { error, unavailable: [...] } —
    all-or-nothing, so a cart never partially checks out.
  Stripe: checkout.sessions.create({
            line_items: [one per drawing],
            metadata: { slug: firstSlug, slugs: JSON.stringify(allSlugs) }
          })
  → Return the Stripe-hosted checkout URL (+ session id) to the browser
      │
      ▼
User pays on Stripe's page (30-min session window)
      │
      ├─ Payment succeeds ──────────────────────────────────────────────────────┐
      │                                                                         ▼
      │                                                    POST /api/webhook
      │                                                      (checkout.session.completed,
      │                                                       only if payment_status === 'paid';
      │                                                       async_payment_succeeded also fulfills —
      │                                                       delayed methods like OXXO/bank transfer
      │                                                       settle later than the redirect)
      │                                                    Verify Stripe signature
      │                                                    Supabase: one conditional UPDATE ... WHERE
      │                                                      sold=false RETURNING slug — only the
      │                                                      rows actually flipped get fulfilled
      │                                                      (idempotent against webhook retries)
      │                                                    orders: one row per sold drawing
      │                                                    Resend: one combined email to the buyer
      │                                                      listing every drawing, one to the artist
      │
      └─ Buyer backs out (expired / async_payment_failed / explicit cancel / no
         cancel URL at all — Back button, closed tab) ────────────────────────┐
                                                                               ▼
                                                          Reservation released via ONE shared
                                                          helper (releaseSessionReservations,
                                                          src/lib/server/reservations.ts) — used
                                                          by the webhook AND the cancel endpoint,
                                                          so there is exactly one release
                                                          implementation to reason about.
```

The session's `metadata.slugs` is a JSON-encoded array of every slug it covers; `metadata.slug`
is kept as just the first slug, for backward compatibility with sessions created before carts
existed. `src/lib/server/checkoutSlugs.ts`'s `getSlugsFromSession(session)` is the *one* place
that reads this — every other file that needs "which drawings does this session cover" calls it,
rather than re-deriving the fallback logic itself.

> Concept: **a single source of truth for a derived fact**. Three different call sites (the
> webhook, the cancel endpoint, the optimistic notebook-page check) all need "which slugs does
> this session cover." Writing that logic once and importing it everywhere means a future format
> change (or bug fix) only has to happen in one place.

### Verifying payment before trusting the browser

After Stripe redirects back, the URL alone (`?success=true&session_id=...`) is not proof of
payment — it's just a string the browser sent, and delayed payment methods redirect here with
`payment_status: 'unpaid'` too. Two different pages verify this two different ways, matched to
what each already has available:

- The **notebook page** (single-item purchase) re-retrieves the session from Stripe server-side
  in its `load` function and only treats a drawing as sold if `payment_status === 'paid'` —
  it already talks to Stripe for other reasons, so this is "free."
- The **cart's success landing** has no server load of its own (the cart lives client-side), so it
  calls a small public endpoint, `GET /api/checkout/session-status?session_id=...`, which returns
  just `{ paid, slugs }` — enough to decide whether to show the confirmation banner and *which*
  cart items to remove (`removeFromCart` per slug, never a blanket `clearCart()` — the cart may
  hold items added after checkout started, which were never part of this purchase).

> Concept: **don't conflate "the browser is telling me this" with "this is true."** A query
> parameter is user-controlled input the moment it's in a URL; anything that changes what the UI
> promises the user (like "your payment succeeded") has to be re-verified against the actual
> source of truth, not read off the request.

### Setting prices

Prices are managed with `scripts/set-price.js`. It creates a Stripe Product + Price, sets it as the
product's default, and mirrors `stripe_price_id` and `price_cents` back into Supabase — all in one
command:

```sh
node --env-file=.env.local scripts/set-price.js negro_2_09 150
node --env-file=.env.local scripts/set-price.js --notebook negro_2 150
```

**Why Stripe prices are immutable:** Stripe doesn't let you edit the amount on an existing price
object. To change a price you create a new one and make it the default. The script handles this
automatically — re-running it on an already-priced drawing creates a new price and deactivates the
old one in Stripe if Supabase fails to update (so you never accumulate orphaned prices).

### Key safety properties

- **Atomic reservation, set-based** — one `UPDATE ... WHERE slug IN (...)` reserves every
  available drawing in a cart in a single Postgres statement; Postgres locks and re-checks the
  `WHERE` per matched row, so two overlapping requests still can't both reserve the same drawing —
  exactly the same guarantee as reserving one row at a time, just fewer round trips.
- **All-or-nothing carts** — if any slug in the request is unavailable, every reservation that
  request *did* take is rolled back before returning. A cart either checks out completely or not
  at all; it never silently drops the sold-out item and charges for the rest.
- **Ownership-scoped release** — `releaseSessionReservations` only releases a reservation that (a)
  isn't sold and (b) was taken out at or before the session it's given was created. Without (b), a
  stale or replayed session id could release a *different*, newer buyer's still-live hold on the
  same drawing — see [Building the cart](#building-the-cart-troubles-along-the-way) for how that
  bug actually happened here.
- **Never release a paid reservation** — the cancel endpoint additionally refuses to act on a
  session whose `payment_status` is `'paid'`; the webhook (or a fulfillment race) owns that outcome.
- **Stale reservation cleanup** — `STALE_RESERVATION_MS` (35 minutes, defined once in
  `src/lib/server/reservations.ts` and imported everywhere else that needs it) sits just above
  Stripe's 30-minute session expiry, so a reservation whose checkout session has definitely expired
  can be taken over by someone else. A `pg_cron` job also sweeps stale reservations every 10
  minutes (see `schema.sql`) as a backstop for a missed webhook.
- **Webhook idempotency** — fulfillment is a single conditional `UPDATE ... WHERE sold=false
  RETURNING slug`; only the rows that statement actually flips get emailed and recorded, so
  duplicate event deliveries from Stripe (which Stripe's own docs say to expect) are harmless.
- **Signature verification** — every webhook request is verified with `STRIPE_WEBHOOK_SECRET` before
  any database write, preventing spoofed payment notifications.
- **Server-side re-derivation, not client trust** — cart prices are display-only; the server always
  re-reads `stripe_price_id` from Supabase, dedupes and caps the requested slug list, and validates
  every input before it touches the database or Stripe.

---

## Building the cart: troubles along the way

The single-item checkout in the previous section shipped first and looked solid. Turning it into a
real multi-item cart — and then reviewing that work with fresh eyes — surfaced a series of bugs
that are worth walking through individually, because each one is really a general lesson wearing a
Stripe/Supabase costume. This chapter is that walkthrough.

### Collapsing two different states into one boolean

The very first version of "is this drawing available" was:

```ts
sold: d.sold || d.reserved
```

That reads fine until you notice what it *means*: a drawing someone merely clicked "Buy" on —
maybe seconds ago, maybe abandoned — displays identically to one that's actually, permanently
gone. Worse, a buyer who clicked Buy and then hit **Back** on Stripe's page came home to see their
*own* drawing marked "Sold," with no way to retry for up to 35 minutes (the reservation's own
release-if-abandoned window).

The fix was to stop collapsing the two facts and carry them separately:

```ts
sold:     d.sold,
reserved: d.reserved && !d.sold,
```

`sold` is permanent; `reserved` is temporary and can be undone. Once they're separate booleans,
the UI can tell a genuinely-gone drawing ("Sold," a hard stop) from a temporarily-held one ("On
hold — check back soon," with a path back to buying it).

> Concept: **state modeling**. `X || Y` is tempting whenever two conditions currently produce the
> same *visible* effect, but if they have different *meanings* — one reversible, one not — squashing
> them into one boolean throws away information the rest of the program (and the user) needs later.
> This is the same idea as not using a single `status: boolean` for something that actually has
> three states (`available` / `held` / `gone`).

### A library that doesn't throw the way you'd expect

Several places in this codebase call Supabase like this:

```ts
try {
    await getSupabase().from('orders').insert(rows);
} catch (err) {
    console.error('Error inserting order records:', err);
}
```

This looks like defensive error handling. It is — for *network* failures. But `supabase-js`
doesn't throw for a failed database operation (a missing table, a constraint violation, a bad
column); it **resolves successfully** with the problem described in the result object's `error`
field. The `try/catch` above can never catch that, because nothing throws. The `orders` table
didn't exist yet on the live database when this shipped, so every single insert was silently
failing — no error, no log line, nothing — for as long as it went unnoticed.

The fix is to always destructure and check the result, regardless of whether you also keep a
`try/catch` for genuine exceptions:

```ts
const { error: insertError } = await getSupabase().from('orders').insert(rows);
if (insertError) {
    console.error('Error inserting order records:', insertError);
}
```

> Concept: **know your dependency's actual failure contract, not the one you'd assume.** Not every
> library signals failure the same way (`throw`, a result-object error field, a rejected promise, a
> callback's first argument, a magic sentinel return value…). Skimming the docs for "what does
> success look like" is only half the job — you also have to check "what does *failure* look like,
> specifically, for this call."

### The replay bug: releasing someone else's reservation

This is the sharpest bug in the batch, so it's worth reading slowly. The endpoint that lets a
buyer cancel out of Stripe Checkout released a reservation like this:

```ts
// ⚠️ the version with the bug
await getSupabase()
    .from('drawings')
    .update({ reserved: false, reserved_at: null })
    .eq('slug', slug)
    .eq('sold', false);
```

That looks safe: it only touches *this* drawing, and only if it's not sold. But it says nothing
about *whose* reservation it's releasing. Walk through this sequence:

1. Buyer **A** starts checkout on a drawing. It's reserved, `reserved_at = 10:00:00`.
2. A abandons the tab. Nothing calls the cancel endpoint yet — the session id is just sitting in
   the URL, unused, because A never clicked anything.
3. Buyer **B** starts checkout on the *same* drawing later — legitimately, because A's session is
   dead and the drawing is fair game again. B's reservation is `reserved_at = 10:40:00`.
4. Someone (or something) replays A's old cancel request — a retried request, a re-opened old tab,
   or in principle an attacker who simply captured A's URL.
5. The query above runs: `slug = X AND sold = false`. It matches the row — the *current* row,
   whatever its `reserved_at` is now — and releases it. **B's live reservation, mid-payment, just
   got wiped**, and a third buyer could now buy the same one-of-a-kind drawing out from under B.

The missing piece is an **ownership check**: don't just ask "is this drawing reserved," ask "is
this drawing reserved *by the session I was actually given*":

```ts
// the fix — src/lib/server/reservations.ts
const sessionCreatedAt = new Date((session.created + 5) * 1000).toISOString();
await getSupabase()
    .from('drawings')
    .update({ reserved: false, reserved_at: null })
    .in('slug', slugs)
    .eq('sold', false)
    .lte('reserved_at', sessionCreatedAt);   // ← only release a hold at least as old as this session
```

If the reservation currently on the row is *newer* than the session doing the releasing, it can't
possibly be that session's own reservation — so leave it alone. A stale/replayed cancel request
becomes a safe no-op instead of a way to steal someone else's hold. (A second, related check —
never release a reservation backing a session that's already `paid` — closes the same door from a
slightly different angle: don't let a slow network race undo a successful payment either.)

This was verified, not just reasoned about: reserve as A, release A, reserve the same drawing as
B, then replay A's *original* cancel call against B's now-live reservation — B's hold survived,
confirming the fix actually blocks the exploit rather than just looking like it does on paper.

> Concept: **TOCTOU (time-of-check to time-of-use) and replay attacks**. Checking "is this thing in
> the state I expect" and then acting on it are two separate moments; if anything (a network retry,
> another user, an attacker) can act in between, your check is stale by the time you use it. The fix
> is almost always the same shape: bind the check to *something specific to the request being
> honored* (here: "only if the hold is at least as old as *this* session"), not just to the current
> state of the world.

### Trusting a URL to mean "you paid"

`/drawing?success=true&session_id=...` used to show "Thank you for your purchase!" and clear the
entire cart the instant those two params were present — no server round trip at all. Two ways that
goes wrong:

- **Delayed payment methods.** Stripe redirects to the success URL as soon as checkout is
  *submitted*, not necessarily once money has actually moved — a bank transfer or OXXO voucher can
  report `payment_status: 'unpaid'` at that exact moment and only settle minutes or hours later.
  The banner claimed a sale that hadn't happened yet.
- **It's just a string.** Nothing stops a browser from typing `?success=true&session_id=anything`
  into the address bar directly. The server was trusting user-supplied input to decide what to tell
  the user.

The fix adds one server round trip before the banner renders: a narrow endpoint that returns only
`{ paid, slugs }` for a given session id, and the page shows the confirmation *only* if `paid` is
true — otherwise a neutral "your payment is processing" notice, and the cart is left untouched
either way until it's earned.

> Concept: this is the same **client vs. server trust boundary** from the "secrets never reach the
> browser" section, applied to a different kind of secret: not "don't leak data to the client," but
> "don't let the client tell you what happened — go check."

### An event handler that ate its child's keyboard input

The cart's "add to cart" button lives *inside* a clickable gallery tile — click the tile, open the
lightbox; click the button, add to cart, `stopPropagation()` stops it from also opening the
lightbox. That works fine with a mouse. With a keyboard, it didn't:

```ts
// the tile wrapper's keydown handler
onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        goto(`/drawing/${notebookSlug}/${index + 1}`);
    }
}}
```

A keydown on the *button* still **bubbles up** through the DOM to this handler on the wrapper —
`stopPropagation` was only ever wired to the button's `click`, not its `keydown`. Tab to the price
button, press Enter, and this outer handler fires first, calling `preventDefault()` and navigating
away before the button ever gets to activate itself. A mouse click never has this problem because
there's nothing to bubble through in the same way for `click` (the button's own handler already
stops it) — the bug only exists for the *keyboard* path, which is exactly the kind of thing that's
invisible if you only ever test with a mouse.

The fix checks *where the event actually started*, not just what key was pressed:

```ts
onkeydown={(e) => {
    if (e.target !== e.currentTarget) return;   // let the nested button handle its own keydowns
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goto(/* … */); }
}}
```

> Concept: **event bubbling**, and why keyboard accessibility needs its own testing pass. `target`
> is where an event actually originated; `currentTarget` is whichever element's handler is
> currently running. They're only equal when the event started right there — any other bubbled
> event has a `target` somewhere further down the tree. Mouse and keyboard interactions don't always
> traverse the DOM the same way, so "it works when I click it" doesn't prove "it works when I tab to
> it and press Enter."

### A loop that raced against itself

Reserving a cart's drawings one at a time, in a loop, seemed like the obvious way to reuse the
existing single-item logic:

```ts
for (const slug of drawingSlugs) {
    await getSupabase().from('drawings')
        .update({ reserved: true, reserved_at: now })
        .eq('slug', slug).eq('sold', false)
        .or(`reserved.eq.false,reserved_at.lt.${staleThreshold}`);
    // ...
}
```

Send a body with a duplicate slug — `{ slugs: ['x', 'x'] }`, whether by an honest bug in a client
or a hand-crafted request — and the *second* iteration's `WHERE` clause matches nothing: the first
iteration just set `reserved = true, reserved_at = now()` on that row, so `reserved.eq.false` is
now false and `reserved_at.lt.staleThreshold` is false too (it's brand new, not stale). The request
fails with "no longer available" for an item that is, in fact, sitting right there available.

The immediate fix is to dedupe before doing anything else — `[...new Set(slugs)]` — so a request
never gets to race against its own earlier iteration. But this bug is also *why* the loop was later
replaced with a single set-based `UPDATE ... WHERE slug IN (...)` (see [Key safety
properties](#key-safety-properties) above): one statement reserving N rows at once
can't race against itself the way N sequential statements can, because there's no "first iteration"
to have already changed the state the second one checks.

> Concept: **a request can conflict with itself**, not just with other concurrent requests. It's
> easy to design for "what if two users hit this at the same time" and forget "what if this one
> request's own steps interfere with each other." Deduping input and preferring one atomic
> operation over N sequential ones are two different fixes for the same underlying shape of bug.

### Designing for the user who doesn't follow the happy path

The cancel flow was built around one specific URL: Stripe's `cancel_url`, which fires when a buyer
clicks the "back to site" link *inside* Stripe Checkout. That covers the buyer who cancels the way
the UI suggests. It does nothing for the buyer who just presses the browser's own **Back** button,
or closes the tab — both perfectly normal things to do that never touch `cancel_url` at all. Their
reservation just sits there, "held," until the 35-minute staleness window quietly lets it go.

The fix accepts that the intended flow won't always happen, and adds a fallback that doesn't depend
on it: right before redirecting to Stripe, the browser stashes the session id in `sessionStorage`.
Landing back on the cart or notebook page then checks *either* signal — the explicit
`?canceled=true` URL, or a leftover `sessionStorage` marker — and releases the hold either way. It's
safe to call unconditionally, even when there's nothing to release, because the ownership and
payment guards from the earlier bug make a spurious call a no-op rather than a risk.

> Concept: **don't design for only the path you drew in the diagram.** Real users (and real
> browsers) will always find the exit you didn't wire up — closing a tab, using Back, following a
> bookmark, losing network mid-flow. Anywhere a flow depends on the user reaching a specific URL to
> "complete" it, ask what happens if they never do — and prefer a fallback that's *safe to run even
> when unnecessary* over trying to catch every possible way of leaving.

### Not every duplicate is a mistake — but check before you assume that

A price-formatting helper existed, copy-pasted, in four places by the time the cart shipped. Three
of them agreed: `new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`, producing
`"$150.00"`. The fourth — the gallery's grid price badge — deliberately overrode it:

```ts
'$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
```

producing `"$150"` instead. The instinct when you spot four copies of "the same" function is to
extract one and delete the rest. Doing that blindly here would have made every grid badge
noticeably wider ("$150.00" instead of "$150") in a tiny fixed-size pill where the extra four
characters visibly crowd the layout — a real, if small, regression, and one a diff/type-checker
would never catch, because both versions type-check and both "work."

The actual fix extracted the shared logic but kept the *behavioral* difference explicit and
intentional instead of accidental:

```ts
// src/lib/utils/formatPrice.ts
export function formatPrice(cents: number, options?: { compact?: boolean }): string {
    if (options?.compact) {
        return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);
}
```

One function, one place to fix a real bug in the formatting logic later, but the call site still
chooses which *style* it wants — `formatPrice(price)` for a full-width buy button,
`formatPrice(price, { compact: true })` for a cramped grid badge.

(The prices themselves are all **CAD** now — the site later standardized its currency, and having
one `formatPrice` meant that switch touched a single line here instead of the four copies it would
have before. The compact branch keeps `en-US` purely for its digit grouping; it prints a bare `$`
and no currency code, so the locale there is cosmetic.)

> Concept: **duplication isn't automatically a code smell** — sometimes near-identical code encodes
> a real difference in requirements (here: available layout width) that happens to look like an
> oversight. Before collapsing four copies into one, check whether they actually behave the same;
> if they don't, the right refactor preserves *both* behaviors behind one shared implementation,
> rather than silently picking one and calling it cleanup.

---

## Interesting design decisions

These are the bits worth understanding deeply, because they show *why* the architecture is shaped
the way it is.

### The "seeded shuffle"

Each visitor gets one random number in a cookie (`hooks.server.ts`). That number seeds a
deterministic shuffle of the artwork (`src/lib/utils/shuffle.ts`, used in `loadNotebook.ts`). The
result: the gallery looks freshly randomized for each visitor, but stays *stable* as they navigate
around — image #3 is still image #3 when they come back. Randomness that's reproducible.

> Concepts: **cookies**, **deterministic randomness (seeding)**, **idempotency** (same seed →
> same order every time).

### Secrets never reach the browser

The Supabase service-role key and Stripe secret key are imported only inside `src/lib/server/`.
Because of the `server/` folder convention, SvelteKit will refuse to bundle them into client code.
The browser only ever sees the harmless rendered result.

> Concept: **the trust boundary** between client and server — the foundation of web security.

### Guarding a one-of-a-kind purchase

Because each original can only be sold once, the checkout flow has to handle two people trying to
buy the same piece — or, for a cart, several people each trying to buy *some overlapping subset* of
several pieces. Both `PurchaseButton` and the cart page watch for a `409 Conflict` response
("someone bought it first"); the cart page additionally reads the `unavailable` slug list the
server sends back and flags exactly those items, rather than treating the whole cart as failed.
`sold` and `reserved` are tracked as two distinct facts (see [Building the
cart](#building-the-cart-troubles-along-the-way) for the bug that came from conflating them), and a
reservation is all a checkout attempt ever gets — sold is permanent and only the webhook sets it.

> Concept: **race conditions and concurrency** — what happens when two users (or one user's own
> request, see the self-conflicting-loop story above) act at the same time.

---

## Auth and cookies: how the owner gate works

Most of this site is public. A few surfaces are not: everything under `/admin`
(the owner hub and the endpoint that edits the music worklist). This section
explains how the site knows *you* are the owner, why that turns out to be a
surprisingly subtle problem, and how the same ideas apply to auth on any site.

### Cookies in 60 seconds

A **cookie** is a small `name=value` string the server asks the browser to store.
Once stored, the browser automatically attaches it to *every* future request to
that site — that's the whole trick. HTTP itself is stateless (each request knows
nothing about the last), so cookies are how a site recognizes a returning browser.

A cookie carries attributes that control its safety:

| Attribute | What it does | Why it matters |
|---|---|---|
| `HttpOnly` | Hides the cookie from JavaScript (`document.cookie`) | Stops a cross-site-scripting bug from stealing it |
| `Secure` | Only sent over HTTPS | Stops network eavesdroppers from reading it |
| `SameSite` | `Lax`/`Strict`/`None` — whether it's sent on cross-site requests | The core defense against CSRF (see the threats table) |
| `Domain` / `Path` | Which URLs the cookie is sent to | Scopes a cookie to exactly where it's needed |
| `Max-Age` / `Expires` | When the browser discards it | Absent = "session cookie", gone when the browser closes |

This site sets two cookies, and they're a nice contrast:

- **`session_seed`** (`hooks.server.ts`) — a random number used only to shuffle
  the gallery consistently for a visitor. It's *not* sensitive, so it's a plain
  session cookie (`httpOnly: false`, no expiry). If someone copied it, the worst
  they could do is see the same art order.
- **`CF_Authorization`** — the login token from Cloudflare Access (below). This
  one is sensitive: it's the difference between "a visitor" and "the owner."

> Concepts: **statelessness**, **cookies**, **cookie attributes as a security surface**.

### How Cloudflare Access proves who you are

The `/admin` paths sit behind **Cloudflare Access** (Zero Trust). When you request
one while logged out, Cloudflare — *not our code* — intercepts the request at the
edge and makes you authenticate with an identity provider (Google, a one-time
email code, etc.). Only after that does Cloudflare do two things:

1. Sets the **`CF_Authorization`** cookie on your browser, scoped to the whole
   domain, so it comes back on every later request — including public pages.
2. On the protected path, also injects a `Cf-Access-Jwt-Assertion` request header
   before forwarding to our origin.

Both of those values are the same thing: a **JWT** (JSON Web Token). A JWT is
three base64url chunks joined by dots — `header.payload.signature`. The payload is
just readable JSON claims (`aud`, `iss`, `exp`, your email…). The important part is
the **signature**: Cloudflare computes it with a *private* key that only it holds.
Anyone can verify that signature with Cloudflare's matching *public* key, but
nobody else can produce a valid one. That asymmetry is what makes the token
trustworthy — it's a sealed, tamper-evident statement of "Cloudflare logged this
person in."

> Concepts: **identity provider**, **JWT / JWS**, **public-key (asymmetric) signatures**,
> **the edge as a security boundary**.

### The subtle bug: "is the cookie there?" is not "is the cookie real?"

The first version of this gate just checked whether the `CF_Authorization` cookie
*existed*:

```typescript
// ⚠️ naive — do not do this
return Boolean(event.cookies.get('CF_Authorization'));
```

That is safe *only* as long as every path that reads it also sits behind Access,
because Access validates the token before the request ever reaches us. The moment
we made `/new-music` public (so visitors could browse), that assumption broke.
Cookies are **client-controlled**: anyone can open dev tools, or send a raw
request, with `Cookie: CF_Authorization=anything`. On a public path, Cloudflare no
longer vets it, so our presence check would happily treat a forged string as
"owner." The token being *unforgeable* only helps if we actually **check the
signature**.

### The fix: verify the signature and the claims

`src/lib/server/access.ts` verifies the token with [`jose`](https://github.com/panva/jose),
a JWT library that runs on Cloudflare's edge because it's built on the same Web
Crypto API. `createRemoteJWKSet` fetches and caches Cloudflare's public keys (and
handles key rotation); `jwtVerify` then checks the signature *and* the claims in
one call:

```typescript
import { createRemoteJWKSet, jwtVerify } from 'jose';

const jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));

await jwtVerify(token, jwks, {
    issuer: teamDomain,   // must be minted by our Cloudflare team
    audience: appAud,     // must be for THIS Access application
    algorithms: ['RS256'] // and signed with the expected algorithm
});
// jose also rejects an expired token (`exp`) automatically.
// If any check fails it throws; we catch it and return "not owner".
```

Checking the claims matters as much as the signature. A valid signature only says
"Cloudflare minted this token"; the claims say it was minted **for this
application** (`aud`), **by our team** (`iss`), and **is still valid** (`exp`).
Skip those and a genuine token from a *different* Access app could be replayed
against ours. Pinning `algorithms` also blocks the classic JWT downgrade attack
where a token claims a weaker algorithm than you expect.

`hooks.server.ts` then reduces all of this to one boolean, `locals.isAdmin`, that
the rest of the app reads.

### Threats, and how each is handled

| Threat | What it is | Mitigation here |
|---|---|---|
| **Forged cookie** | Attacker invents a `CF_Authorization` value | Signature verification — a fake fails the crypto check |
| **Token replay from another app** | A real token, wrong audience | `aud` / `iss` claim checks |
| **Stale/stolen token reuse** | Using an old token forever | `exp` expiry check; Access sessions are short-lived |
| **XSS (script steals the cookie)** | Injected JS reads `document.cookie` | Access marks `CF_Authorization` `HttpOnly`; we never echo untrusted HTML |
| **CSRF (a page auto-submits as you)** | Another site rides your cookie | `SameSite` on the cookie; writes are `POST` behind Access |
| **Reaching the origin directly** | Skipping the edge check | Origin re-verifies the JWT itself; write endpoint also re-checks `locals.isAdmin` |
| **Key rotation / DoS on key fetch** | Keys change, or a bogus `kid` spams refetch | Keys cached with a TTL and a minimum refetch interval |

The pattern to notice: **defense in depth**. Cloudflare Access blocks unauthenticated
traffic at the edge; the origin independently verifies the token; and the write
endpoint re-checks `locals.isAdmin` one more time (a layout guard can't protect a
`+server.ts` endpoint, so it guards itself). Any single layer failing open still
leaves two behind it.

### Alternatives (and why this choice)

Cloudflare Access isn't the only way to gate an owner-only area. Common options,
roughly from simplest to most involved:

| Approach | Idea | Trade-off |
|---|---|---|
| **HTTP Basic auth** | Browser prompts for a shared password | Trivial, but one static secret, no real identity, easy to leak |
| **Signed session cookie** | You issue an `HMAC`-signed cookie after a login you build | Full control, but you own login, storage, rotation, resets |
| **Session + database** | Random session id in a cookie, state in a DB table | Easy revocation, but a DB round-trip per request |
| **OAuth / OIDC (Auth.js, Supabase Auth)** | Delegate login to Google/GitHub | Robust and standard, but more moving parts for a one-user site |
| **Cloudflare Access (this site)** | The platform handles login + issues a JWT | Zero login code; the app just *verifies* a token. Tied to Cloudflare |
| **Network-level (mTLS, IP allowlist)** | Only certain clients/networks connect | Very strong, but clumsy for a person on the move |

For a **single owner** on a site already hosted on Cloudflare, Access is the sweet
spot: no password to leak, no login UI to build, no session store to run — the app
only has to check a signature, which is exactly what `access.ts` does.

### Should this be written down at all?

Fair question: does documenting the gate *help* an attacker? The honest answer is
**no, and hiding it wouldn't help you** — this is the difference between *secrecy*
and *security*. A design is only genuinely secure if it stays safe even when the
attacker knows exactly how it works; the security has to live in the **secret key
and the verified signature**, never in "they don't know the endpoint exists."
Relying on the latter is called **security through obscurity**, and it fails the
moment someone reads your JavaScript, scans your routes, or finds this file.

What actually protects this site is unchanged whether or not you read this section:
the attacker still can't produce a valid signature without Cloudflare's private
key. What you must *never* publish is the opposite category — secrets themselves:
the service-role key, the Stripe secret, session-signing keys, the contents of
`.env.local`. Mechanisms can be open; keys must be closed. (That's also why
serious cryptography is public and peer-reviewed — obscurity is a comfort, not a
control.)

> Concept: **Kerckhoffs's principle** — a system should be secure even if
> everything about it except the key is public knowledge.

---

## Glossary

| Term | Plain-English meaning |
|------|-----------------------|
| **SvelteKit** | The framework that handles routing, server rendering, and building. Svelte is the UI library; SvelteKit is the full app framework around it. |
| **Rune** | A `$`-prefixed function (`$state`, `$derived`, `$effect`, `$props`) that marks reactive behavior in Svelte 5. |
| **Reactivity** | The framework automatically updating the screen when data changes. |
| **Prop** | A value passed from a parent component into a child. |
| **Store** | A holder for state that many components can share, with `$` auto-subscription. |
| **Supabase** | Hosted Postgres database + file storage. Holds drawing metadata and the image files. |
| **Stripe** | Payment processor. Hosts the checkout page and tells us (via webhook) when something sold. |
| **Resend** | Service for sending transactional email (order confirmations). |
| **Cloudflare** | The host/CDN that serves the site from servers near each visitor ("the edge"). |
| **Webhook** | An HTTP call *from* an external service *to* us, to notify of an event (e.g. "payment succeeded"). |
| **SSR** | Server-Side Rendering — building the HTML on the server before sending it. |
| **Edge** | Running code on servers geographically close to the user for lower latency. |
| **Cookie** | A small `name=value` string the browser stores and re-sends to the site on every request; how a stateless protocol "remembers" a browser. |
| **JWT** | JSON Web Token — a signed, base64url-encoded `header.payload.signature` bundle of claims. If the signature verifies, the claims are trustworthy. |
| **Claim** | A field inside a JWT's payload (e.g. `aud` audience, `iss` issuer, `exp` expiry) asserting something about the token. |
| **Cloudflare Access** | Zero-Trust gateway that authenticates users at the edge and issues a JWT (`CF_Authorization`) proving they logged in. |
| **Public-key signature** | A signature made with a private key and checked with the matching public key — anyone can verify, only the holder can sign. |
| **CSRF** | Cross-Site Request Forgery — another site tricking your browser into sending an authenticated request; blunted by `SameSite` cookies. |
| **Security through obscurity** | Relying on attackers not knowing how a system works, rather than on real secrets — an anti-pattern (see Kerckhoffs's principle). |
| **Idempotency** | Doing something twice has the same effect as doing it once — e.g. a webhook retry that re-checks `sold` before writing, so a duplicate delivery is harmless. |
| **TOCTOU** | Time-Of-Check-To-Time-Of-Use — a bug where the world can change between checking a condition and acting on it; the fix is usually to bind the action to something specific about the request, not just the current state. |
| **Replay attack** | Reusing a previously-valid message/request (a session id, a token) after the situation it was valid for has changed. |
| **Event bubbling** | A DOM event fired on a nested element also triggers handlers on its ancestors, in order, unless something calls `stopPropagation()`. |
| **`target` vs `currentTarget`** | On a DOM event, `target` is where it actually originated; `currentTarget` is whichever element's handler is currently running. They differ whenever the event bubbled up from a descendant. |

---

## Where to go next

- **Official Svelte 5 tutorial:** https://svelte.dev/tutorial — the interactive runes tutorial is the fastest way to internalize this file.
- **SvelteKit docs:** https://svelte.dev/docs/kit — routing, loading, hooks.
- **Try it in this repo:** pick one component and trace it end to end. `PurchaseButton.svelte` is a great first read (small, uses props + state + derived + a fetch call). For the ecommerce side specifically, `src/lib/server/reservations.ts` is short, does one job, and is the file the [replay-bug story](#building-the-cart-troubles-along-the-way) is about — a good next read once `PurchaseButton` makes sense.

---

*This document is a living reference. As features are added, extend the relevant section with a
short "why" and a real code snippet rather than just describing what changed.*
