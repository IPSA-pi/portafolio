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

## Stripe integration

- `src/routes/api/checkout/+server.ts` — creates a Checkout session
- `src/routes/api/webhook/+server.ts` — handles `checkout.session.completed`
- `client_reference_id` on the checkout session is the **drawing slug**
  (individual piece, not notebook slug) — the webhook uses it to identify
  which drawing was purchased

## Drawing data model

Two concepts that are easy to conflate:

- **Notebook** — a physical sketchbook. Slugs like `negro_1`, `verde_3`.
  Defined statically in `src/lib/notebooks.ts` (not in Supabase). One OG
  image per notebook at `static/og/[slug].jpg`.
- **Drawing** — an individual piece within a notebook. Stored in Supabase
  `drawings` table with columns: `slug`, `notebook`, `storage_url`,
  `stripe_price_id`, `price_cents`, `sold`, `reserved`, `display_order`.

Drawing images are served from Supabase storage (not `static/`), with four
size variants derived by suffix: original, `-sm.webp`, `-md.webp`, `-lg.webp`.

Post-purchase flow: Stripe redirects to `/drawing/[notebook_slug]?session_id=...&success`.
The page optimistically marks the drawing sold by retrieving the session from
Stripe directly. The webhook does the authoritative DB write. These run in
parallel — both are needed.

## Data-pipeline scripts (`scripts/`)

Node.js scripts, not part of the app build. Always run via the npm script
wrappers — they pass `--env-file=.env.local` automatically. Don't call
`node scripts/X.js` directly unless you pass the flag yourself.

```bash
npm run seed              # seed drawings to Supabase
npm run upload            # upload drawing assets
npm run scrape            # scrape new music from sources
npm run enrich            # Tidal enrichment
npm run enrich:spotify    # Spotify enrichment
npm run enrich:all        # Tidal + Spotify in sequence
```

`scripts/sources/` contains scraper source modules — one file per source:
`ra.js` (Resident Advisor GraphQL), `nodata.js` (nodata.tv RSS).

A daily GitHub Actions workflow (`.github/workflows/scrape-music.yml`) runs
`scrape` + `enrich` + `enrich:spotify` automatically at 08:00 UTC.

## Static media — `static/`

- `static/drawings/covers/` — WebP thumbnails for the shop listing
- `static/home/` — hero video poster frames (WebP)
- `static/og/` — OG images (**JPG**, not WebP — intentional for social
  crawler compatibility, do not convert these)

`npm run build` runs `scripts/standardize-images.js` first, which converts
source images to WebP. The OG images are the exception.
