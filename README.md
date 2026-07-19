# iansebelius.com

Personal portfolio and drawing gallery with e-commerce, built with SvelteKit and deployed on Cloudflare Workers.

Live at [iansebelius.com](https://iansebelius.com)

> New to the codebase or learning web dev? See [LEARN.md](./LEARN.md) for a concept-first
> walkthrough of how the site works and the ideas behind it, organized as chapters in
> [`learn/`](./learn) and published at [iansebelius.com/learn](https://iansebelius.com/learn).
> This README covers running and operating the site.

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
DB_LABEL=dev         # printed by every data-pipeline script at startup
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co     # the DEV project — never prod
SUPABASE_SERVICE_ROLE_KEY=eyJ...
STRIPE_SECRET_KEY=sk_test_...   # always the TEST key — the live key lives in .env.prod
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...
ADMIN_DEV_BYPASS=1   # optional — unlocks /admin locally without Cloudflare Access
```

`STRIPE_WEBHOOK_SECRET` comes from the Stripe CLI when you run `stripe listen` locally (see Developing below). The music-pipeline scripts additionally read `TIDAL_CLIENT_ID`/`TIDAL_CLIENT_SECRET` and `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` from `.env.local` — each enrich script skips itself cleanly if its pair is missing.

`.env.local` always points at the **dev** Supabase project. Production database credentials live in a separate `.env.prod` — see the next section.

## Dev and prod databases

Two Supabase projects, two env files:

| File | Contents | Loaded by |
|---|---|---|
| `.env.local` | dev `SUPABASE_URL` + key, `DB_LABEL=dev`, **test** Stripe key, Resend/Tidal/Spotify creds | `npm run dev`, every default script wrapper |
| `.env.prod` | prod `SUPABASE_URL` + key, `DB_LABEL=prod`, **live** Stripe key — nothing else | `:prod` script wrappers only |

Both are gitignored. The safe database is the default everywhere: nothing loads `.env.prod` implicitly, so the only way a local run touches production is an explicit `:prod` wrapper (`seed:prod`, `upload:prod`, `set-price:prod`, `scrape:prod`, `enrich:all:prod`), which layers a second `--env-file` on top:

```sh
node --env-file=.env.local --env-file=.env.prod scripts/seed.js
```

Later files win, so `.env.prod` overrides the Supabase pair and `DB_LABEL` while everything else still comes from `.env.local`.

**The overlay swaps Stripe too.** `.env.prod` carries the live `STRIPE_SECRET_KEY`, so a `:prod` run is fully prod: prod database + live Stripe. Conversely, everything default is fully sandboxed — dev database + test Stripe. Never cross the streams: a test price ID written into the prod database breaks live checkout.

**Check the target lines.** Every data-pipeline script prints its Supabase target before writing anything, and the two Stripe-using scripts (`seed`, `set-price`) print the Stripe mode as well (derived from the key prefix — the key itself is never printed):

```
Supabase target: xxxxxxxxxxxx [DEV]
Stripe target: [TEST]
```

The project ref comes from `SUPABASE_URL`; the label comes from `DB_LABEL`, which lives in each env file next to the credentials it describes so the two can't drift apart. Read these lines before trusting what a run did — it's the whole point of the split.

**What the app itself uses.** The deployed Worker reads secrets from the Cloudflare dashboard (Settings → Variables and Secrets) and the daily scraper workflow injects GitHub repo secrets directly, with `DB_LABEL: prod` set inline — neither touches the env files. Consequence for local dev: `npm run dev` serves the **dev** database, so an empty local shop or `/new-music` list means unseeded dev data, not a bug. Populate it with `npm run seed` / `npm run scrape`.

**Rotating a key:** Supabase dashboard → Project Settings → API → regenerate the service role key. The prod key lives in three places — `.env.prod`, the Worker's secrets, and the repo's Actions secrets; update all three. The dev key lives only in `.env.local`. The live Stripe key lives in two — `.env.prod` and the Worker's secrets.

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

- [ ] **Stripe live keys** — `STRIPE_SECRET_KEY` set to `sk_live_...` in the Worker, and in `.env.prod` so `set-price:prod` / `seed:prod` hit the live Stripe account.
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

```sh
# 1. Name raw scans to the convention above, under src/lib/assets/drawings/{notebook}/
node scripts/standardize-images.js        # 2. generate -sm/-md/-lg webp variants
npm run upload                            # 3. push images to Supabase Storage
npm run seed                              # 4. create/refresh drawings rows
npm run set-price -- --notebook negro_7 150   # 5. (optional) list for sale, $150 CAD
```

Steps 3–5 hit the dev database by default; repeat with the `:prod` wrappers to publish. Flags, safety notes, and per-script details in [Data-pipeline scripts](#data-pipeline-scripts) below.

## Data-pipeline scripts

Node scripts in `scripts/`, run manually (or by CI) — not part of the app build. Always use the npm wrappers: they pass `--env-file=.env.local`, so a bare `node scripts/X.js` gets no credentials. Default wrappers hit the **dev** database; the `:prod` variants are the only local path to production (see [Dev and prod databases](#dev-and-prod-databases)). Every script prints `Supabase target: <ref> [<label>]` before writing — read it.

Script flags go after `--`: `npm run seed -- --dry-run`.

Two pipelines, in order:

```
Drawings:   rename → standardize-images → upload → seed → set-price
New music:  scrape → enrich (Tidal) → enrich:spotify
```

| Script | Wrappers | Writes to |
|---|---|---|
| `rename.js` | `rename`, `rename:apply` | filesystem only |
| `upload.js` | `upload`, `upload:prod` | Storage `drawings` bucket |
| `seed.js` | `seed`, `seed:dry`, `seed:prod` | `drawings` table |
| `set-price.js` | `set-price`, `set-price:prod` | Stripe products + prices, `drawings` table |
| `delete-drawing.js` | *none — manual on purpose* | deletes `drawings` rows + storage files |
| `scrape-music.js` | `scrape`, `scrape:dry`, `scrape:prod` | `releases` table |
| `enrich-music.js` | `enrich`, `enrich:dry`; in `enrich:all(:prod)` | `releases` Tidal columns |
| `enrich-spotify.js` | `enrich:spotify`, `enrich:spotify:dry`; in `enrich:all(:prod)` | `releases` Spotify columns |

### `rename.js` — migrate filenames to the current convention

One-time migration from the old `negro_1_a-1.webp` naming to `negro_1_01.webp`, assigning drawing numbers sequentially per notebook. Dry-run by default; `--apply` executes (two-pass via `.tmp` names, so overlapping renames can't collide) and writes `scripts/rename-map.json`, which `seed.js` needs to link Stripe products created under old slugs.

```sh
npm run rename         # preview
npm run rename:apply   # execute + write rename-map.json
```

Filesystem only — no env vars, no database. Kept for reference; name new scans to the convention directly.

### `upload.js` — push drawing images to Supabase Storage

Uploads every convention-named webp under `src/lib/assets/drawings/` to the `drawings` bucket at `{notebook}/{filename}`. Files that don't match the naming convention are skipped with a warning. Run before `seed` — seed writes storage URLs assuming the files are already live.

```sh
npm run upload               # dev
npm run upload -- --force    # overwrite files that already exist in Storage
npm run upload:prod
```

Needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. Idempotent: existing files are skipped unless `--force`. Exits 1 if anything failed — check the `Uploaded / Skipped / Failed` summary line.

### `seed.js` — build the `drawings` table from filesystem + Stripe

Creates one row per original (non-variant) webp on disk, linked to existing Stripe products by `metadata.slug` (translated through `rename-map.json` for pre-migration slugs), and upserts on `slug`. Run after `upload`.

```sh
npm run seed:dry    # preview rows, writes nothing
npm run seed        # dev
npm run seed:prod
```

Needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`.

Safe to re-run: upsert-on-slug means no duplicate rows, and rows that already exist keep their DB-side state — `sold` (the webhook marks sales in Supabase only; Stripe `metadata.sold` can add a sold flag but never clear one), `reserved` (an in-flight checkout hold is never released), and `display_order` (manual reordering survives). An existing row also keeps its Stripe product/price link when the Stripe scan finds nothing for its slug, so a missing `rename-map.json` can't de-list drawings. The startup summary reports `N existing rows (DB state preserved), M new`.

A missing `rename-map.json` is still a warning worth heeding for **new** rows: they're created, but Stripe products won't be linked (`stripe_price_id` stays null → no buy button). Same for `no match for Stripe slug` warnings — a product whose slug maps to no file on disk.

### `set-price.js` — create a Stripe product + CAD price

Prices one drawing or every unsold drawing in a notebook. Creates the Stripe product if the drawing has none, creates a new price (Stripe prices are immutable — "updating" means a new price set as default), and mirrors `stripe_price_id` / `price_cents` into Supabase. Already-sold drawings are skipped.

```sh
npm run set-price -- negro_2_09 150            # one drawing, $150 CAD
npm run set-price -- --notebook negro_2 150    # whole notebook
npm run set-price:prod -- --notebook negro_2 150
```

Needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`. Prices are always `cad` — a mixed-currency cart fails at Stripe session creation, so never create prices in anything else. The `:prod` wrapper swaps in the **live** Stripe key along with the prod database; confirm the `Stripe target: [LIVE]` startup line matches your intent.

Write order is deliberate: Supabase is updated before the new price becomes the product default, and a failed Supabase write deactivates the just-created Stripe price so re-runs don't accumulate orphans. Failures are per-drawing — the script keeps going and reports `success/total` at the end; re-run for the stragglers.

### `delete-drawing.js` — remove drawings everywhere (destructive)

Deletes the `drawings` row and all four storage files (original + `-sm/-md/-lg`) for each slug. Deliberately friction-full: no npm wrapper, no dry-run, and no `:prod` variant — a prod deletion means assembling the double `--env-file` command by hand.

```sh
node --env-file=.env.local scripts/delete-drawing.js negro_2_09 [negro_2_10 ...]
```

Needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. All slugs are format-validated up front before anything is touched; then storage is deleted first, rows second. Storage `remove` doesn't error on already-missing paths, so a partially-failed run can be re-run to finish. There is **no sold-check** — a mistyped-but-valid slug deletes a sold drawing's record just as happily. Read the target line before pressing enter on a prod invocation.

### `scrape-music.js` — pull new releases into the `releases` table

Fetches releases from every source module in `scripts/sources/`, dedupes across sources on `dedupe_key` (`lower(artist)|lower(title)`), and inserts. Insert-only: conflicts on `dedupe_key` are ignored, so existing rows — including the owner's manually-set `status` — are never overwritten. Re-runs only add new releases, merge the `sources` array, and fill a missing `release_year` on existing rows.

```sh
npm run scrape:dry   # fetch + preview only — needs no env vars at all
npm run scrape       # dev
npm run scrape:prod  # prod — what the daily CI job effectively does
```

Needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (not for `--dry-run`, which exits before connecting). A failing source is logged and skipped; the others still run — so one site being down doesn't kill the daily scrape.

### `enrich-music.js` — Tidal availability pre-check

Stage 2 of the music pipeline: searches Tidal for each unchecked release (`tidal_available IS NULL`) and writes `tidal_available` + `tidal_album_url` (`tidal_track_id` is reserved for a future playlist stage). Also re-checks releases marked unavailable within the last 45 days (by `released_at`, falling back to `created_at` when the source gave no date) — sources announce ahead of street dates, so early misses get another look; older misses stay settled, keeping re-runs cheap.

```sh
npm run enrich                       # dev
npm run enrich:dry                   # search but write nothing
npm run enrich -- --limit 20 --debug # cap rows (default 200), dump raw API responses
npm run enrich:all                   # Tidal then Spotify
npm run enrich:all:prod              # both against prod (there is no standalone enrich:prod)
```

Needs `TIDAL_CLIENT_ID`/`TIDAL_CLIENT_SECRET` on top of the Supabase pair — exits 0 with a warning if they're missing, so a pipeline run doesn't fail before creds exist. Matching (`scripts/tidal-client.js`) is deliberately conservative — it only accepts an album whose own title matches ours, since Tidal's search happily returns an artist's *other* albums. A ✗ means "not confidently found", not proof of absence. An individual search failure skips the row; it's retried next run because the column stays null.

### `enrich-spotify.js` — Spotify availability pre-check

Same shape as the Tidal pass: fills `spotify_available` + `spotify_album_url` where `spotify_available IS NULL`, and re-checks unavailable releases within the same 45-day recheck window (same `released_at` → `created_at` fallback). Same `--dry-run` / `--limit` / `--debug` flags; wrappers are `enrich:spotify` and `enrich:spotify:dry`. Needs `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET`, exits 0 if missing.

### Scheduled runs (CI)

`.github/workflows/scrape-music.yml` runs `scrape → enrich → enrich:spotify` daily at 08:00 UTC against **prod** (plus a manual "Run workflow" button). It injects GitHub repo secrets directly with `DB_LABEL: prod` set inline — it never reads the env files, so local credentials and CI credentials rotate independently. The enrich steps are no-ops until their API secrets are added to the repo.

### Supporting modules

- `db-target.js` — prints the `Supabase target: <ref> [<label>]` line; imported by every script above.
- `sources/` — one module per scrape source (`ra.js` — Resident Advisor GraphQL, `nodata.js` — nodata.tv RSS). Each exports `fetch()` returning normalized release objects; to add a source, write a module and list it in `SOURCES` in `scrape-music.js`.
- `tidal-client.js` / `spotify-client.js` — minimal catalog-search clients: client-credentials auth with token caching, 429 retry, and conservative title matching.
- `rename-map.json` — old→new slug map written by `rename:apply`, read by `seed.js`.
- `schema.sql` — DDL for `drawings`, `releases`, `orders` plus the `pg_cron` stale-reservation sweep. Run it in the Supabase SQL editor when standing up a project (dev or prod).

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
    learn/                    # Learn section: index + [chapter] pages, prerendered
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
scripts/                      # Data-pipeline scripts — see the section above
  standardize-images.js       # Generates sm/md/lg webp variants (also runs in build)
  rename.js                   # One-time filename migration (+ rename-map.json)
  upload.js                   # Uploads drawing images to Supabase Storage
  seed.js                     # Seeds drawings table from filesystem + Stripe
  set-price.js                # Creates Stripe product + CAD price, updates Supabase
  delete-drawing.js           # Deletes drawings from DB + Storage (manual only)
  scrape-music.js             # Scrapes new releases into the releases table
  enrich-music.js             # Tidal availability pre-check
  enrich-spotify.js           # Spotify availability pre-check
  db-target.js                # Prints "Supabase target: ref [LABEL]" at startup
  sources/                    # Scraper source modules (ra.js, nodata.js)
  schema.sql                  # Supabase DDL: drawings, releases, orders + pg_cron sweep
learn/                        # Learn-section chapters (one .md per chapter) — see LEARN.md
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
