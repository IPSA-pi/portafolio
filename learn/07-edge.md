# Running on the edge: Cloudflare Workers

This site doesn't run on "a server" in the classic sense — there is no machine somewhere
running Node with this app on it. It's deployed to **Cloudflare Workers**, which means the same
code runs in hundreds of Cloudflare locations around the world, and each visitor is served by
whichever one is nearest. This chapter is about what that buys, what it costs, and two real bugs
that only exist because the production runtime is *not* the one on the development machine.

## What "the edge" actually is

Classic hosting: your app lives on one server (or a cluster) in one region, and a visitor in
another hemisphere pays the round-trip for every request. Edge hosting: the platform copies your
code to every location in its network, and requests are handled close to wherever they come from.

Workers achieve this with **V8 isolates** — the same lightweight sandboxes Chrome uses to
separate tabs — instead of containers or virtual machines. An isolate starts in milliseconds
(there's effectively no cold start), and there's no operating system to patch or process to keep
alive. The trade-off: **a Worker is not Node**. It's a different JavaScript runtime with a
different set of built-in APIs — closer to what a browser's service worker can do than to a
Node process.

> Concept: **serverless / edge computing**. You give the platform a function; it decides where
> and when to run it. You give up control of the machine and, crucially, the assumption that
> your local runtime and your production runtime are the same thing.

## Not-quite-Node: the `nodejs_compat` asterisk

SvelteKit's Cloudflare adapter compiles the app into a Worker, and this project enables the
`nodejs_compat` flag, which teaches the Workers runtime a large slice of Node's API surface:
`Buffer`, streams, `crypto`, and most of the built-ins that libraries like `stripe` and
`supabase-js` expect. But it's a compatibility layer, not Node — *most* built-ins work, not all,
and the differences don't announce themselves. Your code compiles, deploys, and runs fine right
up until it calls the one API that behaves differently. Which is exactly what happened:

## War story: the webhook that worked only in dev

The Stripe webhook (the endpoint that marks drawings sold, writes `orders` rows, and sends the
confirmation emails — see [How the shop works](/learn/shop)) verifies every incoming request's
signature. Stripe's SDK offers `webhooks.constructEvent()` for this, and it worked perfectly all
through local development. Then the site went live, and **every single real delivery failed**:

```
SubtleCryptoProvider cannot be used in a synchronous context
```

`constructEvent` verifies the signature *synchronously*. Node has synchronous crypto, so in
`npm run dev` it just works. Workers only expose **SubtleCrypto** — the Web Crypto API — which is
async-only; there is no synchronous signature verification at all. So the verification threw on
every delivery, the webhook 400'd, and no purchase was ever fulfilled: no sold flag, no order
row, no email. The fix is one word:

```ts
// src/routes/api/webhook/+server.ts
// constructEventAsync, not constructEvent: on Cloudflare Workers the
// only crypto is SubtleCrypto, which is async-only — the sync variant
// works in local dev (Node) but throws on every real delivery.
event = await getStripe().webhooks.constructEventAsync(body, signature, env.STRIPE_WEBHOOK_SECRET);
```

What makes this bug nasty is *where* it hides. A webhook is called by Stripe's servers, not by a
browser — there's no page to look broken, no console error in front of you. The purchase flow
even *appeared* to work end to end, because the buyer-facing redirect and the optimistic UI are a
separate path from fulfillment. The only symptoms were quiet: webhook attempts marked failed in
the Stripe dashboard, and sales that never turned into `orders` rows.

> Concept: **dev/prod runtime parity**. "Works on my machine" is usually a joke about
> configuration; here it was literally about the JavaScript runtime itself. When dev and prod
> run different engines, the gap between them is exactly where bugs hide — so the paths that
> only ever execute in production (webhooks above all) are the ones that most need to be tested
> *on the production platform*, with a real end-to-end event, before you trust them.

## Environment variables exist only per-request

A second, subtler difference. In Node, `process.env` is there from the moment the process
starts, so reading configuration at the top of a module is normal. On Workers, the environment
is handed to your code **per request** — at module-evaluation time (when `import` statements
run), those values simply don't exist yet. Read them at the top level and you get `undefined`;
build a database client with them at the top level and you've built a client with no
credentials.

That's why every external client in `src/lib/server/` is created lazily, on first use inside a
request, instead of at import time:

```ts
// src/lib/server/supabase.ts
import { env } from '$env/dynamic/private';

let _client: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabase() {
    if (!_client) {
        if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
        }
        _client = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    }
    return _client;
}
```

The same pattern repeats for Stripe (`getStripe()`) and Resend (`getResend()`): a `getX()`
function that constructs the client the first time a request needs it, then reuses it. SvelteKit
cooperates here — `$env/dynamic/private` is specifically the "read at request time" flavor of
env access, as opposed to `$env/static/private`, which is baked in at build time.

> Concept: **platform lifecycle and lazy initialization**. "When does this line of code
> actually run?" has more possible answers than it seems — at build, at deploy, at module load,
> at first request, at every request. Code that's correct at one of those moments can be
> meaningless at another; deferring work until the moment its inputs exist (a getter instead of
> a top-level constant) is the standard cure.

## What runs where

Putting the whole picture together, this site's code executes in three different places, and
every file belongs to exactly one of them:

1. **Build time** (Node, on the build machine) — the image pipeline, and the prerendered pages,
   including the one you're reading; see [This page builds itself](/learn/meta).
2. **Request time** (a Worker, at the edge) — `hooks.server.ts`, every `load` function and
   `+server.ts` endpoint.
3. **In the browser** — the `.svelte` components and client stores.

The server/client split from [chapter 1](/learn/overview) is really a special case of this
bigger question, and it's the first thing to ask about any new piece of code: *when and where
does this run?*
