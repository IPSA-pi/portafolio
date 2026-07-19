# SvelteKit: load, hooks, and endpoints

Svelte is the UI library; SvelteKit is the framework around it — routing, server rendering,
data loading. This chapter covers the three building blocks the whole site is assembled from,
plus one design decision (the seeded shuffle) that shows them working together.

## Server-side `load` functions

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

## Hooks — code that runs on every request

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

## The "seeded shuffle"

What is that seed *for*? Each visitor gets one random number in a cookie (set by the hook
above). That number seeds a deterministic shuffle of the artwork (`src/lib/utils/shuffle.ts`,
used in `loadNotebook.ts`). The result: the gallery looks freshly randomized for each visitor,
but stays *stable* as they navigate around — image #3 is still image #3 when they come back.
Randomness that's reproducible.

> Concepts: **cookies**, **deterministic randomness (seeding)**, **idempotency** (same seed →
> same order every time).

## API endpoints (`+server.ts`)

`/api/checkout` and `/api/webhook` aren't pages — they return data/responses. `PurchaseButton`
calls checkout with `fetch`, gets back a Stripe URL, and redirects the browser there.

> Concept: **the front end and back end of the same app talking over HTTP/JSON** — the basic
> shape of almost every web app.
