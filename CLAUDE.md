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

## About page — `/about`

Artist bio and contact details. The content is **plain data in source**, not
database rows: `ABOUT` in `src/lib/about.ts` holds the bio paragraphs, role,
location, email, and Instagram handle (stored without the `@` — the URL is
derived). Editing it is a code change.

Publishing is the `ABOUT_PUBLISHED` flag in that same file. While it's `false`,
`about/+page.server.ts` 404s the page for everyone except the owner (404, not
403 — an unfinished page shouldn't advertise that it exists), and the nav shows
it as "About (draft)" while the footer link and the sitemap entry stay hidden.
Flip the flag and push to `main` to go live. The `/admin` hub links to the
draft. Nothing here runs at the edge beyond the flag check, so keep it that way
— it's a static text page, no Supabase round trip.

Gating on `locals.isAdmin` is sound because `hooks.server.ts` verifies the
Cloudflare Access JWT's RS256 signature rather than trusting the cookie's
presence.

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
- `src/routes/api/webhook/+server.ts` — handles `checkout.session.completed`
  (only when `payment_status === 'paid'`), `async_payment_succeeded`,
  `async_payment_failed`, and `expired`
- `src/lib/server/reservations.ts` — `STALE_RESERVATION_MS` (35 min, the
  single source of truth for "how old is a dead reservation") and
  `releaseSessionReservations(session)`, shared by the webhook and the
  cancel endpoint. Release is scoped to reservations that both (a) aren't
  sold and (b) were taken out at or before the given session's creation
  time — so a stale/replayed session id can never release a *different*,
  newer buyer's live hold, and a paid session's reservation is never
  released by the cancel endpoint
- **Metadata contract:** `metadata.slugs` is the JSON-encoded array of every
  slug in the session (what a cart checkout actually needs); `metadata.slug`
  is kept as the first slug for backward compat with older sessions.
  `src/lib/server/checkoutSlugs.ts`'s `getSlugsFromSession(session)` is the
  one place that reads this — falls back to the legacy single-slug field if
  `slugs` is missing or unparseable. `client_reference_id` is also just the
  first slug, not the full cart
- **Success/cancel URLs** differ by flow: a single drawing bought with
  notebook context (the notebook page's Buy button) keeps
  `/drawing/[notebook]?success=…` / `?canceled=…`; everything else (a
  multi-item cart, or a single item with no notebook context) routes
  through `/drawing?success=…` / `/cart?canceled=…`
- **Orders table** (`scripts/schema.sql`, service-role only): one row per
  sold drawing, written at webhook fulfillment alongside the sold-update and
  the confirmation emails. Durable in a way the emails aren't — a Resend
  failure doesn't lose the buyer's details. `amount_total` is per-drawing
  (that row's price), not the session total

## Currency

All prices are **CAD** (owner decision — never mix currencies across
`stripe_price_id`s, or a mixed-currency cart 500s at Stripe session
creation). Three places encode this and must stay in sync:

- `src/lib/utils/formatPrice.ts` — the full (non-compact) format uses
  `Intl.NumberFormat('en-CA', { currency: 'CAD' })`. The compact badge
  variant is `'$' + toLocaleString('en-US', …)` — `en-US` there is only
  digit grouping (no currency), so it's fine to leave.
- `src/routes/api/webhook/+server.ts` — the confirmation email formats the
  amount with `en-CA` / `CAD`.
- `scripts/set-price.js` — creates Stripe prices with `currency: 'cad'`.

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
npm run set-price         # create Stripe product/price + update Supabase
npm run scrape            # scrape new music from sources
npm run enrich            # Tidal enrichment
npm run enrich:spotify    # Spotify enrichment
npm run enrich:apple      # Apple Music enrichment (no credentials needed)
npm run enrich:all        # Tidal + Spotify + Apple in sequence
```

Safety rules:

- All of the above hit the **dev** DB. The `:prod` variants (`seed:prod`,
  `upload:prod`, `set-price:prod`, `scrape:prod`, `enrich:all:prod`) are the
  only local path to production — never run one unprompted.
- `delete-drawing.js` is destructive and deliberately has no wrapper, no
  dry-run, and no `:prod` variant; a prod deletion is a manual, careful,
  hand-assembled command.
- `seed` preserves DB-side `sold` / `reserved` / `display_order` (and the
  Stripe link, when its Stripe scan finds none) on rows that already exist —
  keep it that way; the webhook records sales in Supabase only.
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
