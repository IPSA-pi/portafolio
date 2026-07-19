# LEARN — how this site is built (and the web-dev ideas behind it)

This is the **conceptual** companion to the [README](./README.md). The README tells you
*how to run and deploy* the site; these chapters explain *why it's built the way it is* and use
the real code as a way to learn core web-development concepts.

The content lives as **one Markdown file per chapter** in [`learn/`](./learn), and is rendered
at build time into the on-site Learn section at
[iansebelius.com/learn](https://iansebelius.com/learn) — the machinery for that is itself a
chapter ([This page builds itself](./learn/10-meta.md)). The chapter list below and the site's
index both come from the same manifest, `src/lib/learn/chapters.ts`.

> Audience: curious beginners and intermediate devs. The chapters build on each other loosely,
> but each stands alone — if one assumes knowledge you don't have yet, skip it and come back.

## Chapters

**Part I — Foundations**

1. [How the site fits together](./learn/01-overview.md) — the 30-second pitch, how a request
   flows, the folder map, and the server/client split that keeps secrets safe.
2. [Svelte 5: runes and reactivity](./learn/02-svelte.md) — `$props`, `$state`, `$derived`,
   `$effect`, snippets, and stores, with real examples from this site.
3. [SvelteKit: load, hooks, and endpoints](./learn/03-sveltekit.md) — server load functions,
   hooks as middleware, API endpoints, and the seeded shuffle.

**Part II — The shop**

4. [How the shop works: Stripe + Supabase](./learn/04-shop.md) — data model, purchase flow,
   payment verification, and the checkout's safety properties.
5. [Building the cart: war stories](./learn/05-cart.md) — seven real bugs from building the
   multi-item cart, and the general lesson inside each one.

**Part III — Security**

6. [Auth and cookies: the owner gate](./learn/06-auth.md) — cookies, JWTs, and Cloudflare
   Access: why a cookie being present is not a login.

**Part IV — Behind the scenes**

7. [Running on the edge: Cloudflare Workers](./learn/07-edge.md) — async-only crypto,
   per-request env vars, and why dev is not prod.
8. [Data pipelines and automation](./learn/08-pipelines.md) — the daily scrape-and-enrich
   pipeline: idempotent jobs, conservative matching, and guardrails around prod.
9. [Images and media](./learn/09-images.md) — WebP variants, `srcset`/`sizes`, lazy loading,
   and why the OG images stay JPG.
10. [This page builds itself](./learn/10-meta.md) — Markdown to highlighted HTML at build time.

**Appendix**

- [Glossary & further reading](./learn/99-appendix.md)

## Extending it

This is a living reference. As features are added, extend the relevant chapter with a short
"why" and a real code snippet rather than just describing what changed. A brand-new topic gets a
new file in `learn/` plus one entry in `src/lib/learn/chapters.ts` (and a line here) — that's
the entire publishing process.
