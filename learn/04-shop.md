# How the shop works: Stripe + Supabase

Stripe and Supabase each own a different part of the sale. Supabase is the **source of truth for
availability**; Stripe is the **source of truth for money**. The **slugs** of the drawings in a
cart (e.g. `negro_2_09`) are the only link between them — they travel through Stripe's session
metadata so the webhook knows which database rows to update, whether that's one drawing bought
straight from a notebook page or several bought together from the cart.

## Data model

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
`negro_2_09.webp`, `negro_2_09-sm.webp`, `negro_2_09-md.webp`, `negro_2_09-lg.webp` — see
[Images and media](/learn/images) for why.

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

## The cart itself lives in the browser

Unlike `drawings`/`orders`, the **cart is not a database table at all** — it's a Svelte
`writable` store (`src/lib/stores/cart.ts`) persisted to `localStorage` under the key `cart:v1`,
following the same pattern as the `theme` store covered in
[Svelte 5](/learn/svelte#stores-still-exist-and-we-use-them-on-purpose) (SSR-safe read via a
`browser` check, write-through on every change):

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

## Purchase flow

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

## Verifying payment before trusting the browser

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

## Setting prices

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

## Guarding a one-of-a-kind purchase

Because each original can only be sold once, the checkout flow has to handle two people trying to
buy the same piece — or, for a cart, several people each trying to buy *some overlapping subset* of
several pieces. Both `PurchaseButton` and the cart page watch for a `409 Conflict` response
("someone bought it first"); the cart page additionally reads the `unavailable` slug list the
server sends back and flags exactly those items, rather than treating the whole cart as failed.
`sold` and `reserved` are tracked as two distinct facts (see [Building the cart](/learn/cart) for
the bug that came from conflating them), and a reservation is all a checkout attempt ever gets —
sold is permanent and only the webhook sets it.

> Concept: **race conditions and concurrency** — what happens when two users (or one user's own
> request, see the self-conflicting-loop story in [Building the cart](/learn/cart)) act at the
> same time.

## Key safety properties

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
  same drawing — see [Building the cart](/learn/cart) for how that bug actually happened here.
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
  any database write, preventing spoofed payment notifications. (How that verification nearly
  didn't run at all on Cloudflare is its own story — see [Running on the edge](/learn/edge).)
- **Server-side re-derivation, not client trust** — cart prices are display-only; the server always
  re-reads `stripe_price_id` from Supabase, dedupes and caps the requested slug list, and validates
  every input before it touches the database or Stripe.
