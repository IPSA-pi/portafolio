# Glossary & further reading

Plain-English definitions for every term of art used across the chapters, followed by
suggestions for where to go next.

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
| **Prerendering** | Rendering a page to static HTML once at *build* time instead of on every request — the Learn pages work this way. |
| **Edge** | Running code on servers geographically close to the user for lower latency. |
| **Isolate** | The lightweight V8 sandbox Cloudflare Workers run in — starts in milliseconds, but is not a full Node process. |
| **Cookie** | A small `name=value` string the browser stores and re-sends to the site on every request; how a stateless protocol "remembers" a browser. |
| **JWT** | JSON Web Token — a signed, base64url-encoded `header.payload.signature` bundle of claims. If the signature verifies, the claims are trustworthy. |
| **Claim** | A field inside a JWT's payload (e.g. `aud` audience, `iss` issuer, `exp` expiry) asserting something about the token. |
| **Cloudflare Access** | Zero-Trust gateway that authenticates users at the edge and issues a JWT (`CF_Authorization`) proving they logged in. |
| **Public-key signature** | A signature made with a private key and checked with the matching public key — anyone can verify, only the holder can sign. |
| **Client-credentials grant** | An OAuth flow where an *app* (not a user) authenticates with its own id/secret — used by the music-enrichment scripts for catalog search. |
| **CSRF** | Cross-Site Request Forgery — another site tricking your browser into sending an authenticated request; blunted by `SameSite` cookies. |
| **Security through obscurity** | Relying on attackers not knowing how a system works, rather than on real secrets — an anti-pattern (see Kerckhoffs's principle). |
| **Idempotency** | Doing something twice has the same effect as doing it once — e.g. a webhook retry that re-checks `sold` before writing, so a duplicate delivery is harmless. |
| **TOCTOU** | Time-Of-Check-To-Time-Of-Use — a bug where the world can change between checking a condition and acting on it; the fix is usually to bind the action to something specific about the request, not just the current state. |
| **Replay attack** | Reusing a previously-valid message/request (a session id, a token) after the situation it was valid for has changed. |
| **Event bubbling** | A DOM event fired on a nested element also triggers handlers on its ancestors, in order, unless something calls `stopPropagation()`. |
| **`target` vs `currentTarget`** | On a DOM event, `target` is where it actually originated; `currentTarget` is whichever element's handler is currently running. They differ whenever the event bubbled up from a descendant. |
| **`srcset` / `sizes`** | `<img>` attributes declaring which size variants of an image exist and how wide it will display, so the browser can download the smallest file that looks sharp. |
| **Rate limiting / 429** | A server telling a client to slow down (`429 Too Many Requests`, often with a `Retry-After` header); polite clients wait and retry. |
| **Cron** | The classic schedule syntax for recurring jobs — `0 8 * * *` means "daily at 08:00" — used by the GitHub Actions workflow that runs the music pipeline. |
| **Natural key** | Identifying a record by its real-world content (like `artist|title`) instead of an arbitrary id — how scraped releases from different sources get deduplicated. |

## Where to go next

- **Official Svelte 5 tutorial:** https://svelte.dev/tutorial — the interactive runes tutorial is the fastest way to internalize the [Svelte chapter](/learn/svelte).
- **SvelteKit docs:** https://svelte.dev/docs/kit — routing, loading, hooks.
- **Try it in this repo:** pick one component and trace it end to end. `PurchaseButton.svelte` is a great first read (small, uses props + state + derived + a fetch call). For the ecommerce side specifically, `src/lib/server/reservations.ts` is short, does one job, and is the file the [replay-bug story](/learn/cart) is about — a good next read once `PurchaseButton` makes sense.
