# iansebelius.com

Personal portfolio and drawing gallery with e-commerce, built with SvelteKit and deployed on Cloudflare Pages.

Live at [iansebelius.com](https://iansebelius.com)

## Stack

- **SvelteKit** — framework
- **Tailwind CSS** — styling
- **Cloudflare Pages** — hosting and edge runtime
- **Supabase** — image storage (Storage) and drawing metadata (Postgres)
- **Stripe** — payments
- **Resend** — transactional email

## Environment variables

Create a `.env.local` file in the project root:

```sh
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...
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

Deployment is handled automatically by Cloudflare Pages on every push to `main`.

### Environment variables (Cloudflare)

Add these in **Cloudflare dashboard → Pages → portafolio → Settings → Environment variables** under Production:

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
RESEND_API_KEY
```

Use live keys (`sk_live_...`) for `STRIPE_SECRET_KEY` in production.

### Stripe webhook

In the [Stripe Dashboard](https://dashboard.stripe.com/webhooks), add a webhook endpoint:

- **URL:** `https://iansebelius.com/api/webhook`
- **Events:** `checkout.session.completed`, `checkout.session.expired`

Copy the signing secret and set it as `STRIPE_WEBHOOK_SECRET` in Cloudflare.

### Resend domain

Emails are sent from `no-reply@iansebelius.com`. Verify the domain in the [Resend dashboard](https://resend.com/domains) and add the required DNS records to Cloudflare DNS.

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

4. **Add DB rows** — open the Supabase dashboard → Table Editor → `drawings` and insert a row for each new original image:
   - `slug`: e.g. `negro_7_01`
   - `notebook`: e.g. `negro_7`
   - `drawing_number`: e.g. `1`
   - `display_order`: position in the gallery
   - `storage_url`: `https://your-project.supabase.co/storage/v1/object/public/drawings/negro_7/negro_7_01.webp`

5. **List for sale** (optional) — to add a buy button, create a product in the Stripe dashboard, copy its price ID, and set `stripe_price_id` and `price_cents` on the DB row.

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
  routes/
    +page.svelte              # Home (binary clock)
    drawing/
      +page.svelte            # Notebook list
      [slug]/
        +page.server.ts       # Loads drawings from Supabase
        +page.svelte          # Gallery grid
    video/                    # Video section
    api/
      checkout/               # Stripe checkout session creation
      webhook/                # Stripe webhook (marks sold, sends emails)
  lib/
    components/               # Gallery, Lightbox, PurchaseButton, etc.
    server/
      supabase.ts             # Supabase client (service role)
      stripe.ts               # Stripe client
      resend.ts               # Resend client
    stores/                   # Theme, fullscreen state
scripts/
  standardize-images.js       # Generates sm/md/lg webp variants
  rename.js                   # One-time file rename migration
  upload.js                   # Uploads images to Supabase Storage
  seed.js                     # Seeds Supabase DB from filesystem + Stripe
  schema.sql                  # Supabase table DDL (run once in SQL editor)
```

## Roadmap

- **Admin panel** — password-protected `/admin` route to upload new drawings, set prices, create Stripe products, reorder gallery, and manage notebooks without touching the Supabase or Stripe dashboards
