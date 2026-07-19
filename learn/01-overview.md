# How the site fits together

This chapter is the map for everything that follows: what the site is, what happens between
typing a URL and seeing a page, and the one architectural idea — the server/client split —
that every other chapter builds on.

## The 30-second pitch

A **SvelteKit 5** artist portfolio where every drawing is a one-of-a-kind item for sale.
Each page splits into a **server loader** that safely talks to the database
([Supabase](/learn/appendix)) and payments ([Stripe](/learn/appendix)), and a **Svelte
component** that renders the result in the browser. The UI is built with **Svelte 5 runes**
for reactivity, styled with **Tailwind CSS**, and deployed to the edge on **Cloudflare**.

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

## Folder map

| Path | Role |
|------|------|
| `src/routes/` | Each folder is a URL. Special filenames have special meaning (see below). |
| `src/routes/cart/` | The client-rendered cart review page (`+page.svelte`) — no server data of its own; it reads `src/lib/stores/cart.ts`. |
| `src/routes/api/checkout/`, `.../cancel/`, `.../session-status/` | Checkout session creation, best-effort reservation release, and public payment-status lookup — see [How the shop works](/learn/shop). |
| `src/routes/api/drawings/status/` | Public sold/reserved/price lookup for a slug list — how the cart page re-checks availability before checkout. |
| `src/lib/components/` | Reusable UI pieces: `Feed`, `Gallery`, `PurchaseButton`, `ThemeToggle`, `BinaryClock`. |
| `src/lib/server/` | Server-only modules. The `server/` name makes SvelteKit guarantee they never ship to the browser. Includes `reservations.ts` (the one place that releases a Stripe session's reservations) and `checkoutSlugs.ts` (the one place that reads which drawings a session covers). |
| `src/lib/stores/` | App-wide shared state (`theme`, `fullscreen`, `cart`). |
| `src/lib/utils/` | Small, pure, framework-agnostic helpers shared across components: `formatTitle`, `formatPrice`, `checkoutReturn` (the Stripe-return-detection helper used by both the cart page and the notebook page). |
| `src/hooks.server.ts` | Runs on every request before pages — sets the session seed. |
| `scripts/` | Node tooling to process/upload images and seed the database — see [Data pipelines](/learn/pipelines). |

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

## Secrets never reach the browser

The Supabase service-role key and Stripe secret key are imported only inside `src/lib/server/`.
Because of the `server/` folder convention, SvelteKit will refuse to bundle them into client code.
The browser only ever sees the harmless rendered result.

> Concept: **the trust boundary** between client and server — the foundation of web security.
> It comes back again and again in later chapters: the cart's prices are display-only
> ([the shop](/learn/shop)), a `?success=true` URL is not proof of payment
> ([war stories](/learn/cart)), and a cookie's *presence* is not a login
> ([the owner gate](/learn/auth)).
