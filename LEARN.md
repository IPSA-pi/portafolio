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
7. [Interesting design decisions worth understanding](#interesting-design-decisions)
8. [Auth and cookies: how the owner gate works](#auth-and-cookies-how-the-owner-gate-works)
9. [Glossary](#glossary)
10. [Where to go next](#where-to-go-next)

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
| `src/lib/components/` | Reusable UI pieces: `Feed`, `PurchaseButton`, `ThemeToggle`, `BinaryClock`. |
| `src/lib/server/` | Server-only modules. The `server/` name makes SvelteKit guarantee they never ship to the browser. |
| `src/lib/stores/` | App-wide shared state (`theme`, `fullscreen`). |
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
const formattedPrice = $derived(
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
        .format(price / 100)
);

// src/routes/+layout.svelte — breadcrumbs follow the URL
let segments = $derived($page.url.pathname.split('/').filter(Boolean));
```

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
    return { ...data, index: Number(params.index) };
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
availability**; Stripe is the **source of truth for money**. The `slug` (e.g. `negro_2_09`) is the
only link between them — it travels through Stripe's session metadata so the webhook knows which
database row to update.

### Data model

Each drawing has one row in the Supabase `drawings` table:

| Column | Role |
|--------|------|
| `slug` | Unique identifier, e.g. `negro_2_09`. The key that ties everything together. |
| `stripe_product_id` | The Stripe Product object for this drawing. |
| `stripe_price_id` | The active Stripe Price (the amount the buyer pays). |
| `price_cents` | Mirror of the Stripe price — used to display the price without calling Stripe. |
| `sold` | `true` once payment is confirmed. Permanent. |
| `reserved` | `true` while a checkout session is active (≤ 30 min). Temporary. |
| `reserved_at` | Timestamp of the reservation, used to detect stale locks. |

Images are stored in Supabase Storage (bucket: `drawings`) with four variants per drawing:
`negro_2_09.webp`, `negro_2_09-sm.webp`, `negro_2_09-md.webp`, `negro_2_09-lg.webp`.

### Purchase flow

```
User clicks Buy
      │
      ▼
POST /api/checkout
  Supabase: UPDATE drawings SET reserved=true, reserved_at=now()
            WHERE slug=? AND sold=false
            AND (reserved=false OR reserved_at < 35 minutes ago)
  → If 0 rows updated: drawing is taken → return 409
  → If 1 row updated: read stripe_price_id from that row
  Stripe: checkout.sessions.create({ price: stripe_price_id, metadata: { slug } })
  → Return the Stripe-hosted checkout URL to the browser
      │
      ▼
User pays on Stripe's page (30-min session window)
      │
      ├─ Payment succeeds ──────────────────────────────────────────────────────┐
      │                                                                         ▼
      │                                                         POST /api/webhook
      │                                                           (checkout.session.completed)
      │                                                         Verify Stripe signature
      │                                                         Supabase: sold=true, reserved=false
      │                                                         Resend: email to buyer + artist
      │
      └─ Session expires (user abandons) ──────────────────────────────────────┐
                                                                               ▼
                                                               POST /api/webhook
                                                                 (checkout.session.expired)
                                                               Supabase: reserved=false
                                                               → Drawing is available again
```

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

- **Atomic reservation** — the `UPDATE ... WHERE` is a single Postgres operation. If two users click
  Buy at the same instant, Postgres serializes them: exactly one succeeds, the other gets a 409.
- **Stale reservation cleanup** — the 35-minute threshold (slightly above Stripe's 30-minute session
  expiry) means a reservation whose checkout session has definitely expired can be taken over. A
  `pg_cron` job also sweeps stale reservations every 10 minutes (see `schema.sql`).
- **Webhook idempotency** — the webhook checks `sold` before updating, so duplicate event deliveries
  from Stripe are harmless.
- **Signature verification** — every webhook request is verified with `STRIPE_WEBHOOK_SECRET` before
  any database write, preventing spoofed payment notifications.

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
buy the same piece. `PurchaseButton` watches for a `409 Conflict` response ("someone bought it
first"), and the data layer treats an item as unavailable if it's either `sold` **or** `reserved`.

> Concept: **race conditions and concurrency** — what happens when two users act at the same time.

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

---

## Where to go next

- **Official Svelte 5 tutorial:** https://svelte.dev/tutorial — the interactive runes tutorial is the fastest way to internalize this file.
- **SvelteKit docs:** https://svelte.dev/docs/kit — routing, loading, hooks.
- **Try it in this repo:** pick one component and trace it end to end. `PurchaseButton.svelte` is a great first read (small, uses props + state + derived + a fetch call).

---

*This document is a living reference. As features are added, extend the relevant section with a
short "why" and a real code snippet rather than just describing what changed.*
