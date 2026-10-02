# Portfolio — iansebelius.com

SvelteKit app deployed to Cloudflare Workers. Uses Supabase (database),
Stripe (drawing sales), and Resend (email).

## Stack

- **Framework:** SvelteKit with `@sveltejs/adapter-cloudflare`
- **Runtime:** Cloudflare Workers (`nodejs_compat` flag enabled — Buffer,
  streams, and most Node built-ins work, but not all)
- **Database:** Supabase (service role key only — no client-side auth)
- **Payments:** Stripe
- **Email:** Resend

## Development

```bash
npm run dev        # Vite dev server on localhost:5173
npm run check      # svelte-check + tsc
npm run build      # standardize-images.js → vite build (don't call vite build directly)
```

## Deployment

Push to `main` — Cloudflare's Git integration builds and deploys automatically.
For manual deploys: `npx wrangler deploy`.

## Environment variables

**Dev vs prod database:** `.env.local` always targets the **dev** Supabase
project; prod credentials live only in gitignored `.env.prod`, loaded solely
by the explicit `:prod` npm wrappers. Full mechanics (env-file layering,
what CI and the Worker use, key rotation): README → "Dev and prod
databases". Rules for agents: never run a `:prod` script unless the user
explicitly asks for prod; always check the `Supabase target: <ref> [<label>]`
line every data-pipeline script prints at startup (seed/set-price also print
`Stripe target: [TEST|LIVE]`); the `:prod` overlay swaps in the **live**
Stripe key along with the prod Supabase pair — a `:prod` run is fully prod.

**Runtime (Cloudflare Workers / `.env.local` locally):**

| Variable | Used by |
|---|---|
| `SUPABASE_URL` | app + scripts |
| `SUPABASE_SERVICE_ROLE_KEY` | app + scripts |
| `STRIPE_SECRET_KEY` | checkout, webhook |
| `STRIPE_WEBHOOK_SECRET` | webhook signature verification |
| `RESEND_API_KEY` | email |
| `CF_ACCESS_TEAM_DOMAIN` | owner-JWT verification (`https://<team>.cloudflareaccess.com`) |
| `CF_ACCESS_AUD` | owner-JWT verification (the Access application's Audience/AUD tag) |
| `ADMIN_DEV_BYPASS` | set to `1` locally to unlock `/admin` without Cloudflare Access |

**No new environment variables** for the paid digital file: it uses the same
Stripe, Supabase and Resend keys, and Managed Payments is Dashboard state, not
config.

**Scripts only (not in Workers runtime):**

| Variable | Used by |
|---|---|
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | `enrich-spotify.js` |
| `TIDAL_CLIENT_ID` / `TIDAL_CLIENT_SECRET` | `enrich-music.js` |

## Owner-gated surfaces — `/admin`

`locals.isAdmin` is set in `hooks.server.ts` from the Cloudflare Access
assertion (`Cf-Access-Jwt-Assertion` header / `CF_Authorization` cookie).
Locally, set `ADMIN_DEV_BYPASS=1` in `.env.local` to turn it on.

Everything owner-only lives under **`/admin/*`**, protected in production by a
single Cloudflare Access application (self-hosted, path `admin`). Visiting
`/admin` triggers the Access login, after which Cloudflare sets the
domain-wide `CF_Authorization` cookie — so `locals.isAdmin` then reads true
across the whole site, including public pages. Add new owner features under
`/admin`.

- **`/admin`** — owner hub/dashboard. `admin/+layout.server.ts` is a
  fail-closed 404 backstop for all `/admin` **pages** (layout loads don't run
  for `+server.ts` endpoints — those must re-check `locals.isAdmin` themselves).
- **`/admin/new-music/status`** (POST) — writes a release's status. Re-checks
  `locals.isAdmin` → 403. It lives under `/admin` on purpose: the origin only
  checks for the *presence* of the CF cookie (no JWT verification yet), so the
  write path must stay behind Access at the edge.

The public read surface is separate:

- **`/new-music`** — public, read-only. Anyone can browse the curated release
  list and mark items "heard" (persisted in `localStorage`, per-browser). The
  owner additionally sees editing controls and the full list including
  `dismissed`/`unavailable` items, gated on `data.isAdmin` in the page.

## Contact page — `/contact`

Deliberately minimal: email, Instagram handle, and location, as constants at
the top of `src/routes/contact/+page.svelte`. Editing them is a code change.
It's public (footer link + sitemap entry) — there's no draft gate and no
`/about` page.

## Stripe integration

- `src/routes/api/checkout/+server.ts` — reserves 1–20 drawings atomically
  in Supabase (all-or-nothing; rolls back on any failure — a taken slug, a
  missing price, or Stripe session creation itself failing) and creates ONE
  Checkout session covering all of them
- `src/routes/api/checkout/cancel/+server.ts` — best-effort release for a
  buyer who backs out of Checkout. Expires the Stripe session if still open,
  then releases via the shared `releaseSessionReservations` helper (below)
- `src/routes/api/checkout/session-status/+server.ts` — public
  `{ paid, slugs }` lookup for a session id, used to verify payment before
  showing a purchase-confirmed banner
- `src/routes/api/drawings/status/+server.ts` — public sold/reserved/price
  lookup for a slug list, used by the cart page to re-check availability
- `src/routes/api/checkout/digital/+server.ts` — the paid digital file.
  Body `{ slugs, notebookSlug? }` (1–20, deduped; `notebookSlug` is only used
  if it matches a notebook of the requested drawings, else the cancel URL falls
  back to `/drawing/feed`). **No Supabase writes** — nothing is reserved. Any
  slug that isn't Listed → 409 `{ error, unavailable }`; a Stripe failure → 500.
  Creates a **Managed Payments** session (`managed_payments: { enabled: true }`,
  per session — the Dashboard's "Enable by default" stays off so the physical
  checkout is never MP). MP forbids `shipping_address_collection`,
  `automatic_tax`, `expires_at`, `payment_method_types`, `invoice_creation` and
  `payment_intent_data`; the endpoint's comment lists them — don't add one.
  Success URL is `/drawing/digital?session_id=…`
- `src/routes/api/webhook/+server.ts` — handles `checkout.session.completed`
  (only when `payment_status === 'paid'`), `async_payment_succeeded`,
  `async_payment_failed`, and `expired`. Paid events branch on
  `isDigitalSession(session)`: digital → `fulfillDigitalOrder`
  (`src/lib/server/digitalOrders.ts`), else `fulfillOrder`. `expired` /
  `async_payment_failed` have no digital branch — release is a no-op for a
  digital session by the metadata contract. `fulfillDigitalOrder` is the
  opposite of the physical path on failure: its **idempotency is the `orders`
  unique constraint** (`upsert … ignoreDuplicates` on `stripe_session_id,
  drawing_slug`), the insert comes first, and a failed insert or read → 500 so
  Stripe retries (nothing has happened yet). Once the row is in, emails go
  through `allSettled` with labelled failure logging and can't 500. Known gap:
  if the insert commits but its response is lost, the retry sees a replay and
  sends no email (fix needs a delivery-marker column; TASKS P14)
- `src/lib/server/reservations.ts` — `STALE_RESERVATION_MS` (35 min, the
  single source of truth for "how old is a dead reservation") and
  `releaseSessionReservations(session)`, shared by the webhook and the
  cancel endpoint. Release is scoped to reservations that both (a) aren't
  sold and (b) were taken out at or before the given session's creation
  time — so a stale/replayed session id can never release a *different*,
  newer buyer's live hold, and a paid session's reservation is never
  released by the cancel endpoint
- **Shipping:** everything lives in `src/lib/shipping.ts`, shared by client
  and server. Online checkout ships to `SHIPPING_COUNTRIES` — Canada, the US,
  Japan, the EU 27 + UK/EFTA, and ten Latin American countries (owner decision
  2026-10-02; Canada-only before that). **Canada is free; everywhere else is a
  flat fee per order**: $10 standard (untracked) or $35 registered (tracking
  number), set from Canada Post letter-post rates checked 2026-10-02 ($8.60
  oversize ≤100 g international, $4.29 US, +$26.25 registered). The buyer
  picks the **country before Stripe** (`ShipToPicker.svelte`: inline on
  `/cart`, in a dialog on the viewer's Buy button; state in
  `stores/shipTo.ts`, localStorage `shipto:v1`), because hosted Checkout can't
  reprice shipping after an address is typed. `/api/checkout` requires
  `country` (400 `reason: 'country'` before anything is reserved), locks the
  session to it (`allowed_countries: [country]`) and attaches
  `shippingOptionsFor(country)` as `shipping_options`; the buyer chooses
  standard vs registered at Stripe. "Somewhere else" swaps the pay button for
  `internationalMailto(slugs)` (prefilled with the drawings). `/api/geo`
  (Cloudflare's country, `no-store`, never in cached page data) only
  pre-selects the picker — a hint, never a block. The webhook recovers the
  chosen option from `session.shipping_cost.amount_total`
  (`shippingOptionForAmount`) for the owner's email ("Shipping" row) and the
  buyer's tracked/untracked sentence; **`orders` does not store it** (needs a
  migration), so admin sales doesn't show the method. Copy that must change
  with the list or prices: `SHIPS_ABROAD_TO` (same file; `DrawingFacts.svelte`
  on the notebook and All Drawings pages — the viewer's offer rows carry no
  notes), `/terms` §3 (names the countries by hand; fees described, not
  quoted), and the unused full variant of `PurchaseButton`
- **Metadata contract — two disjoint key sets.** Physical sessions:
  `metadata.slugs` is the JSON-encoded array of every slug in the session
  (what a cart checkout actually needs); `metadata.slug` is kept as the first
  slug for backward compat with older sessions.
  `src/lib/server/checkoutSlugs.ts`'s `getSlugsFromSession(session)` is the
  one place that reads this — falls back to the legacy single-slug field if
  `slugs` is missing or unparseable. `client_reference_id` is also just the
  first slug, not the full cart. Digital sessions: `metadata.kind = 'digital'`
  plus `metadata.digital_slugs` (JSON array), read only through
  `isDigitalSession` / `getDigitalSlugsFromSession`; `client_reference_id` is
  `digital:<first slug>`. **A digital session must never carry `slug`/`slugs`**:
  those mean "physical drawings this session reserved", and
  `releaseSessionReservations` releases by slug, so a digital session carrying
  them could release another buyer's live hold. Keep `getSlugsFromSession`
  blind to `digital_slugs`. Must not change for the digital feature (check
  `git diff --stat main..HEAD -- <path>` is empty): `reservations.ts`,
  `api/checkout/+server.ts`, `api/checkout/cancel/+server.ts`,
  `api/drawings/status/+server.ts`, and `getSlugsFromSession`
- **Success/cancel URLs** differ by flow: a single drawing bought with
  notebook context (the notebook page's Buy button) keeps
  `/drawing/[notebook]?success=…` / `?canceled=…`; everything else (a
  multi-item cart, or a single item with no notebook context) routes
  through `/drawing?success=…` / `/cart?canceled=…`. Digital sessions are a
  third shape: success `/drawing/digital?session_id=…`, cancel
  `/drawing/[notebookSlug]` (or `/drawing/feed`)
- **Orders table** (`scripts/schema.sql`, service-role only): one row per
  sold drawing, written at webhook fulfillment alongside the sold-update and
  the confirmation emails. Durable in a way the emails aren't — a Resend
  failure doesn't lose the buyer's details. `amount_total` is per-drawing
  (that row's price), not the session total. `kind` is `'original'` (default)
  or `'digital'` (CHECK-constrained); a digital row has null
  `shipping_address` / `shipped_at` and `amount_total` = `digital_price_cents`,
  **pre-tax** — the session's own `amount_total` includes tax Stripe withholds,
  so never read it for revenue. Admin sales shows a "Digital" chip, no address
  and no ship control for these, a `kind` CSV column, and its "drawings sold"
  tile counts originals only

## Currency

All prices are **CAD** (owner decision — never mix currencies across
`stripe_price_id`s, or a mixed-currency cart 500s at Stripe session
creation). Four places encode this and must stay in sync:

- `src/lib/utils/formatPrice.ts` — the full (non-compact) format uses
  `Intl.NumberFormat('en-CA', { currency: 'CAD' })`. The compact badge
  variant is `'$' + toLocaleString('en-US', …)` — `en-US` there is only
  digit grouping (no currency), so it's fine to leave.
- `src/routes/api/webhook/+server.ts` — the confirmation email formats the
  amount with `en-CA` / `CAD`.
- `scripts/set-price.js` — creates Stripe prices with `currency: 'cad'`.
- `scripts/set-digital-price.js` — same for the digital file's prices, plus
  `tax_behavior: 'exclusive'`.

Digital files differ in one way: under Managed Payments, Stripe/Link is the
merchant of record and **presents the buyer's local currency** (MXN, EUR, USD…)
at Checkout, but the price is CAD and it **settles in CAD** — the webhook's
`currency` is always `cad`. Tax is added **on top** by buyer location (Dashboard
"Include tax in prices" = No, and every price is `exclusive`), so the net is a
flat CAD price; whether tax is collected at all is Stripe's call by country
(sandbox collected no MX IVA — verify live, TASKS P13). Never add
`automatic_tax` to a session; MP forbids it.

## Drawing data model

Two concepts that are easy to conflate:

- **Notebook** — a physical sketchbook. Slugs like `negro_1`, `verde_3`.
  Defined statically in `src/lib/notebooks.ts` (not in Supabase). One OG
  image per notebook at `static/og/[slug].jpg`.
- **Drawing** — an individual piece within a notebook. Stored in Supabase
  `drawings` table with columns: `slug`, `notebook`, `storage_url`,
  `stripe_price_id`, `price_cents`, `sold`, `reserved`, `display_order`,
  `digital_object_path`, `digital_stripe_product_id`,
  `digital_stripe_price_id`, `digital_price_cents`. The three digital price
  columns are owned by `set-digital-price`, not `seed` (they're in the Insert
  omit-list beside `digital_object_path`).

Drawing images are served from Supabase storage (not `static/`), with four
size variants derived by suffix: original, `-sm.webp`, `-md.webp`, `-lg.webp`.

### Digital files

A drawing's high-resolution PNG is delivered two ways: **free** with the
physical original, and **paid** on its own. Two buckets, and the distinction is
the whole security model:

- **`drawings`** (public) — the WebP variants the gallery serves.
- **`drawings-masters`** (**private**) — the finished PNG masters.
  `digital_object_path` names an object in here. It is read only server-side,
  passed only to `createSignedUrl`, and must never be serialized to a client or
  turned into a public URL. `loadNotebook` does select it (for the Listed rule)
  on a publicly cached loader — safe only while `buildImages`/`buildProducts`
  never spread a row; grep the SSR HTML and `__data.json` after touching them.

`npm run upload-masters -- --notebook <nb>` finishes and uploads them (flatten,
named sRGB, max lossless compression; the scanned density tag is preserved as-is)
and writes `digital_object_path`. Not every drawing has one, and the null path
is normal.

**Free copy** (buyer of the original): a one-year signed URL in the physical
confirmation email (`signDownloads` / `buildDownloadSection` in
`src/lib/server/digitalDelivery.ts`, shared with the paid path). Signing is
**non-fatal by design**: the product is the original; the file rides along. A
sale that is already recorded must never 500 because a bonus link couldn't be
signed. No path → the email simply renders no download section.

**Paid file** (anyone, worldwide, via Managed Payments): *Listed* ⇔
`digital_object_path IS NOT NULL AND digital_stripe_price_id IS NOT NULL AND
digital_price_cents > 0`. Derived, never stored — do not add a boolean.
`digitalListing(row)` in `src/lib/server/digital.ts` is the only place the rule
lives, and it never returns the path. Listing is independent of `sold` /
`reserved`: the file sells whether or not the original has. Gallery: the
"Digital file" row in `PurchaseButton` (button "Get · $X"; an entry exists when the
original is priced **or** the file is listed; cart, shipping captions and the
Available/Sold filter key off the *original* being priced). The button never
touches the cart or `setPendingCheckout` — **the cart skips digital**.
`set-digital-price` creates the products (`tax_code: txcd_10505001`,
`metadata.kind = 'digital'`, `metadata.drawing_slug` — never `metadata.slug`,
which `seed` matches physical products on).

**Download page** `/drawing/digital?session_id=…` (`src/routes/drawing/digital/`):
the session id is the bearer credential, so the page 404s unless it names a
**paid digital** session (`orders` row with `kind = 'digital'`, else a Stripe
retrieve fallback; a physical, unpaid or garbage id → 404; a Stripe outage → 500,
not a 404, since the buyer just paid). It mints **1-hour** signed URLs
(`&download=` so the button saves) on every load, returns titles, tombstones and
URLs only, sends `cache-control: no-store` and `noindex`, and stays valid after
the email: the delivery email links this page, not a file. A refunded sale keeps
its page (accepted for v1). The Cloudflare Web Analytics beacon reports this URL
including `session_id` — accepted (owner decision 2026-10-01).

Licence and seller text live in `src/lib/digitalLicense.ts`
(`DIGITAL_LICENSE`, `DIGITAL_FILE_DESCRIPTION`, `DIGITAL_SELLER_NOTE`),
imported by the confirmation emails, the download page and `/terms`, so what a
buyer is shown at purchase and what the legal page says cannot drift. (`/terms`
§4's merchant-of-record refund sentence is literal copy — keep it in step by
hand.)

Post-purchase flow, single-item (notebook page): Stripe redirects to
`/drawing/[notebook_slug]?success=...&drawing=...&session_id=...`.
`loadNotebook` optimistically marks the drawing sold by retrieving the
session from Stripe directly and checking `payment_status === 'paid'`. The
webhook does the authoritative DB write (sold flag, `orders` row, emails).
These run in parallel — both are needed; the optimistic path is UI-only and
never itself writes to the DB.

Post-purchase flow, cart checkout: Stripe redirects to
`/drawing?success=true&session_id=...`. That page calls
`/api/checkout/session-status` to verify `payment_status === 'paid'` before
showing the confirmation banner — unlike the notebook page, there's no
server-rendered optimistic state to fall back on — then removes exactly the
purchased slugs from the cart store (not the whole cart, which may hold
items added since checkout started).

Post-purchase flow, digital file: Stripe redirects to
`/drawing/digital?session_id=…`, a server-rendered page that verifies and signs
as above. It has no optimistic-sold step, calls no `session-status`, and never
touches the cart store. The webhook writes the `kind = 'digital'` order row and
sends the emails (customer: link to the page + licence, no amounts, "not a
receipt — Link sends that"; artist: per-row prices) in parallel.

Cart contents live client-side only, in `src/lib/stores/cart.ts`
(localStorage, key `cart:v1`, capped at `MAX_CART_ITEMS` = 20 to match
checkout's own limit). See `/cart` (`src/routes/cart/`) for the review page.

## Data-pipeline scripts (`scripts/`)

Node.js scripts, not part of the app build. Always run via the npm script
wrappers — they pass `--env-file=.env.local` automatically; script flags go
after `--` (`npm run seed -- --dry-run`). Per-script reference (flags, what
each writes, failure modes, pipeline ordering): README → "Data-pipeline
scripts".

```bash
npm run seed              # seed drawings to Supabase
npm run upload            # upload drawing assets
npm run upload-masters    # finish + upload PNG masters to the PRIVATE bucket
npm run set-price         # create Stripe product/price + update Supabase
npm run set-digital-price # same for the paid digital file (digital_* columns)
npm run scrape            # scrape new music from sources
npm run enrich            # Tidal enrichment
npm run enrich:spotify    # Spotify enrichment
npm run enrich:apple      # Apple Music enrichment (no credentials needed)
npm run enrich:all        # Tidal + Spotify + Apple in sequence
```

Safety rules:

- All of the above hit the **dev** DB. The `:prod` variants (`seed:prod`,
  `upload:prod`, `upload-masters:prod`, `set-price:prod`,
  `set-digital-price:prod`, `scrape:prod`, `enrich:all:prod`) are the only local path to production — never run one
  unprompted.
- `delete-drawing.js` is destructive and deliberately has no wrapper, no
  dry-run, and no `:prod` variant; a prod deletion is a manual, careful,
  hand-assembled command.
- `seed` preserves DB-side `sold` / `reserved` / `display_order` (and the
  Stripe link, when its Stripe scan finds none) on rows that already exist —
  keep it that way; the webhook records sales in Supabase only. Its Stripe
  scan also skips any product with `metadata.kind === 'digital'`, so a digital
  product can never be linked to a drawing row as its original — keep that guard.
- `set-digital-price` skips drawings with no `digital_object_path` (run
  `upload-masters` first) and does **not** skip sold ones. Like `set-price`, it
  prints `Stripe target`; `:prod` swaps in the live key.
- `scrape` is insert-only (never clobbers the owner's `status`); the enrich
  passes only fill still-null availability columns.

`scripts/sources/` contains scraper source modules — one file per source:
`ra.js` (Resident Advisor GraphQL), `nodata.js` (nodata.tv RSS).

A daily GitHub Actions workflow (`.github/workflows/scrape-music.yml`) runs
`scrape` + `enrich` + `enrich:spotify` + `enrich:apple` at 13:00 UTC against
prod, via repo secrets — it doesn't read the env files. The Apple pass needs no
secrets (public iTunes Search API), so it's the only one that can't be a no-op.

## Learn section — `/learn`

Teaching content ("how this site was built") lives as one Markdown file per
chapter in `learn/` at the repo root. `src/lib/learn/chapters.ts` is the
manifest (slug, file, title, part) that drives the `/learn` index, the
`/learn/[chapter]` pages (prev/next, prerender `entries`), and the sitemap;
`src/lib/server/learn.ts` renders the Markdown (marked + Shiki) at build time —
both routes are fully prerendered, nothing runs at the edge. To add a chapter:
add the `.md` file, one manifest entry, and a line in `LEARN.md` (the
repo-facing TOC). Cross-chapter links inside chapters use absolute site paths
(`/learn/<slug>`); repo-relative `.md` links get rewritten to GitHub URLs.

## Static media — `static/`

- `static/drawings/covers/` — WebP thumbnails for the shop listing
- `static/home/` — hero video poster frames (WebP)
- `static/og/` — OG images (**JPG**, not WebP — intentional for social
  crawler compatibility, do not convert these)

`npm run build` runs `scripts/standardize-images.js` first, which converts
source images to WebP. The OG images are the exception.

Drawing sources in `src/lib/assets/drawings/` should be **lossless PNG** for any
new notebook — `standardize-images.js` derives the lossy variants from them, so a
lossy source makes `-lg` a second generation of loss. Scanner and export
settings: README → "Scanning and exporting".

**`260619` is the exception and stays that way.** Its sources are lossy WebP
from before the PNG workflow existed, so its `-lg` is a double encode. Re-exporting
was considered and **declined** (2026-08-13) — the loss isn't visible at gallery
sizes and the masters are fine for print. Don't propose it again, and don't treat
the mismatch as a bug. Both formats are supported on purpose: `seed.js` discovers
`.png` or `.webp`, and `standardize-images.js` only has to choose when one slug
has both.
