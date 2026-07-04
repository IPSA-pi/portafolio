# iansebelius.com

Personal portfolio and drawing gallery with e-commerce, built with SvelteKit and deployed on Cloudflare Workers.

Live at [iansebelius.com](https://iansebelius.com)

> New to the codebase or learning web dev? See [LEARN.md](./LEARN.md) for a concept-first
> walkthrough of how the site works and the ideas behind it. This README covers running and
> operating the site.

## Stack

- **SvelteKit** — framework (`@sveltejs/adapter-cloudflare`)
- **Tailwind CSS** — styling
- **Cloudflare Workers** — hosting and edge runtime (`nodejs_compat` enabled)
- **Supabase** — image storage (Storage) and drawing metadata (Postgres)
- **Stripe** — payments (all prices in **CAD**)
- **Resend** — transactional email

## Environment variables

Create a `.env.local` file in the project root:

```sh
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...
ADMIN_DEV_BYPASS=1   # optional — unlocks /admin locally without Cloudflare Access
```

`STRIPE_WEBHOOK_SECRET` comes from the Stripe CLI when you run `stripe listen` locally (see Developing below).

## Developing

Install dependencies:

```sh
npm install
```

Start the dev server and Stripe webhook forwarder in two separate terminals:

**Terminal 1 — dev server:**
```sh
npm run dev
```

**Terminal 2 — Stripe webhooks:**
```sh
stripe login
stripe listen --forward-to localhost:5173/api/webhook
```

`stripe listen` prints a `whsec_...` key on startup — set that as `STRIPE_WEBHOOK_SECRET` in `.env.local`, then restart the dev server.

Use Stripe's test card `4242 4242 4242 4242` (any future expiry, any CVC) for test purchases.

> **Resend test-mode note:** in test mode Resend only delivers to verified addresses. Either verify `iansebelius.com` in the Resend dashboard first, or temporarily point `to` at your verified address while testing.

## Building

```sh
npm run build
```

The build no longer bundles images — they're served from Supabase Storage. Build time is ~8 seconds.

Preview the production build:

```sh
npm run preview
```

## Deploying

Deployment is handled automatically by Cloudflare's Git integration on every push to `main`. For manual deploys: `npx wrangler deploy`.

### Environment variables (Cloudflare)

Add these in the Worker's **Settings → Variables and Secrets** under Production:

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
RESEND_API_KEY
CF_ACCESS_TEAM_DOMAIN     # https://<team>.cloudflareaccess.com — owner-JWT verification
CF_ACCESS_AUD             # the Access application's Audience (AUD) tag
```

Use live keys (`sk_live_...`) for `STRIPE_SECRET_KEY` in production. `CF_ACCESS_*` gate the owner-only `/admin` surfaces (see Project structure).

### Stripe webhook

In the [Stripe Dashboard](https://dashboard.stripe.com/webhooks), add a webhook endpoint:

- **URL:** `https://iansebelius.com/api/webhook`
- **Events:** `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`

The two `async_payment_*` events matter for delayed payment methods (bank transfer, OXXO) that settle after the redirect. Copy the signing secret and set it as `STRIPE_WEBHOOK_SECRET` in Cloudflare.

### Resend domain

Emails are sent from `no-reply@iansebelius.com`. Verify the domain in the [Resend dashboard](https://resend.com/domains) and add the required DNS records to Cloudflare DNS.

### Going live — checklist

- [ ] **Stripe live keys** — `STRIPE_SECRET_KEY` set to `sk_live_...` in the Worker.
- [ ] **Live products/prices in CAD** — re-run `set-price.js` against the live Stripe account so every for-sale drawing has a live `stripe_price_id`. All prices are **CAD**; never mix currencies (a mixed-currency cart fails at Stripe session creation).
- [ ] **Live webhook** — add the endpoint above in live mode with all four events, and set its signing secret as `STRIPE_WEBHOOK_SECRET`.
- [ ] **Resend domain verified** — `iansebelius.com` verified so mail delivers to real buyers (test mode only delivers to verified addresses).
- [ ] **`pg_cron` sweep** — the stale-reservation cleanup job from `scripts/schema.sql` is installed on the live database (backstop for a missed `expired` webhook).
- [ ] **Cloudflare Access** — the `/admin` Access application exists and `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` are set.

## Adding new drawings

### Naming convention

Files follow this pattern:

```
{color}_{id}_{drawing:02d}.webp
```

| Part | Format | Examples |
|---|---|---|
| color | lowercase word | `negro`, `verde`, `azul`, `rojo` |
| id | sequential int or yymmdd date | `1`, `2`, `260115` |
| drawing | 2-digit zero-padded int | `01`, `15` |

Examples: `negro_1_01.webp`, `negro_7_15.webp`, `negro_260115_01.webp`

Size variants use a `-` suffix before the size: `negro_1_01-sm.webp`, `negro_1_01-md.webp`, `negro_1_01-lg.webp`

### Workflow for new scans

1. **Rename** raw scans to the naming convention above
2. **Generate variants** — run the standardize script to produce `-sm/-md/-lg` webp files:
   ```sh
   node scripts/standardize-images.js
   ```
3. **Upload** to Supabase Storage:
   ```sh
   npm run upload
   ```
   This uploads all files under `src/lib/assets/drawings/` to the `drawings` bucket, skipping any already uploaded. Use `--force` to overwrite.

4. **Add DB rows** — re-run the seed script (safe to run repeatedly, uses upsert):
   ```sh
   npm run seed
   ```
   This reads all files under `src/lib/assets/drawings/`, creates one row per original, and links any existing Stripe products.

5. **List for sale** (optional) — to add a buy button, set a price with the `set-price.js` script:
   ```sh
   # Single drawing
   node --env-file=.env.local scripts/set-price.js negro_7_01 150

   # Entire notebook at once
   node --env-file=.env.local scripts/set-price.js --notebook negro_7 150
   ```
   This creates a Stripe product + price and updates the DB row in one step.

### Operational scripts

```sh
# Set or update a price (creates Stripe product + price, updates Supabase)
node --env-file=.env.local scripts/set-price.js <slug> <dollars>
node --env-file=.env.local scripts/set-price.js --notebook <notebook> <dollars>

# Delete one or more drawings (removes DB rows + all 4 storage variants)
node --env-file=.env.local scripts/delete-drawing.js <slug> [slug2 slug3 ...]
```

### Migration scripts

These one-time scripts were used to migrate from bundled assets to Supabase. They remain in the repo for reference or if you need to re-run them.

```sh
npm run rename        # preview file renames (old convention → new)
npm run rename:apply  # execute renames + write scripts/rename-map.json
npm run upload        # upload renamed files to Supabase Storage
npm run seed:dry      # preview DB rows before inserting
npm run seed          # seed DB from filesystem + link existing Stripe products
```

## Project structure

```
src/
  hooks.server.ts             # Runs on every request: session seed + locals.isAdmin
  routes/
    +page.svelte              # Home (binary clock)
    drawing/
      +page.svelte            # Notebook list (+ cart success landing)
      [slug]/
        +page.server.ts       # Loads drawings from Supabase
        +page.svelte          # Gallery grid
    cart/                      # Client-side cart review page (localStorage)
    new-music/                # Public read-only curated release list
    admin/                    # Owner-only surfaces, gated by Cloudflare Access
      new-music/status/       # POST: write a release's status (re-checks isAdmin)
    video/                    # Video section
    api/
      checkout/               # Stripe checkout session creation (1–20 drawings)
        cancel/               # Best-effort reservation release on back-out
        session-status/       # Public { paid, slugs } lookup for a session
      drawings/status/        # Public sold/reserved/price lookup for a slug list
      webhook/                # Stripe webhook (marks sold, writes orders, emails)
  lib/
    components/               # Gallery, Lightbox, PurchaseButton, etc.
    server/
      supabase.ts             # Supabase client (service role)
      stripe.ts               # Stripe client
      resend.ts               # Resend client
      reservations.ts         # STALE_RESERVATION_MS + shared reservation release
      checkoutSlugs.ts        # The one reader of a session's slug metadata
      access.ts               # Cloudflare Access JWT verification
    stores/                   # Theme, fullscreen, cart state
    utils/                    # formatPrice (CAD), checkoutReturn, shuffle, …
scripts/
  standardize-images.js       # Generates sm/md/lg webp variants
  rename.js                   # One-time file rename migration
  upload.js                   # Uploads images to Supabase Storage
  seed.js                     # Seeds Supabase DB from filesystem + Stripe
  set-price.js                # Creates Stripe product + CAD price, updates Supabase
  delete-drawing.js           # Deletes drawings from DB and Storage
  schema.sql                  # Supabase DDL: drawings + orders tables, pg_cron sweep
```

The `orders` table (see `scripts/schema.sql`) is the durable record of each sale — one row per sold drawing, written by the webhook at fulfillment independently of whether the confirmation emails succeed.

## Admin panel

The owner-only `/admin` surface is **partially shipped** — it's gated by
Cloudflare Access (JWT-verified at the origin; `CF_ACCESS_*` env vars, or
`ADMIN_DEV_BYPASS=1` locally) and currently hosts the hub page and the
music-worklist editor (`/admin/new-music/status`). See CLAUDE.md for the
full owner-gate design.

## Roadmap

- **Admin drawing management** — extend `/admin` to upload new drawings, set
  prices, create Stripe products, reorder the gallery, and manage notebooks
  without touching the Supabase or Stripe dashboards.
