# iansebelius.com

Personal portfolio and drawing gallery with e-commerce, built with SvelteKit and deployed on Cloudflare Workers.

Live at [iansebelius.com](https://iansebelius.com)

## Stack

- **SvelteKit** — framework
- **Tailwind CSS** — styling
- **Cloudflare Workers** — hosting and edge runtime
- **Stripe** — payments
- **Resend** — transactional email

## Requirements

- Node.js
- [Stripe CLI](https://docs.stripe.com/stripe-cli) — for forwarding webhook events locally

Install the Stripe CLI on Ubuntu/WSL:

```sh
curl -L https://github.com/stripe/stripe-cli/releases/latest/download/stripe_1.40.9_linux_amd64.deb -o stripe.deb
sudo dpkg -i stripe.deb
rm stripe.deb
```

## Environment variables

Create a `.env` file in the project root (also create `.dev.vars` with the same values for `wrangler dev`):

```sh
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...
```

`STRIPE_WEBHOOK_SECRET` comes from the Stripe CLI when you run `stripe listen` (see below).

## Developing

Install dependencies:

```sh
npm install
```

Then start the dev server and Stripe webhook forwarder in two separate terminals:

**Terminal 1 — dev server:**
```sh
npm run dev
```

**Terminal 2 — Stripe webhooks:**
```sh
stripe login
stripe listen --forward-to localhost:5173/api/webhook
```

`stripe listen` will print a `whsec_...` key on startup — set that as `STRIPE_WEBHOOK_SECRET` in `.env` and `.dev.vars`, then restart the dev server.

Use Stripe's test card `4242 4242 4242 4242` (any future expiry, any CVC) to make test purchases.

**Watching the workflow end-to-end:**
- The `stripe listen` terminal shows each event as it arrives and is forwarded
- The dev server terminal logs `Product marked as sold` and email send results
- Check your inbox and the [Resend dashboard](https://resend.com) for the two outbound emails

> **Resend test-mode note:** in test mode Resend only delivers to addresses verified in your account. To receive emails at an arbitrary address, either verify the sending domain (`iansebelius.com`) in Resend first, or temporarily set `to` to your verified address while testing.

## Building

The build step pre-processes images before running Vite:

```sh
npm run build
```

Preview the production build locally:

```sh
npm run preview
```

## Deploying

### 1. Cloudflare

Log in and deploy:

```sh
npx wrangler login
npx wrangler deploy
```

The site deploys to `iansebelius.com` via the custom domain configured in `wrangler.jsonc`. The domain must be on Cloudflare DNS for this to work.

### 2. Production secrets

Set each secret via Wrangler — do not commit these to the repo:

```sh
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put RESEND_API_KEY
```

Alternatively, add them as encrypted environment variables in the **Cloudflare dashboard → Workers & Pages → portafolio → Settings → Environment Variables** (required if deploying via Cloudflare Pages CI rather than Wrangler CLI).

Use live keys (`sk_live_...`) for `STRIPE_SECRET_KEY` in production. `STRIPE_WEBHOOK_SECRET` comes from the Stripe dashboard after registering the webhook endpoint (step 3).

### 3. Stripe webhook

In the [Stripe Dashboard](https://dashboard.stripe.com/webhooks), add a webhook endpoint:

- **URL:** `https://iansebelius.com/api/webhook`
- **Events to listen for:**
  - `checkout.session.completed`
  - `checkout.session.expired`

Copy the signing secret and set it as `STRIPE_WEBHOOK_SECRET` via Wrangler.

### 4. Resend domain

The emails are sent from `no-reply@iansebelius.com`. Verify the domain in the [Resend dashboard](https://resend.com/domains) and add the required DNS records to Cloudflare.

## Project structure

```
src/
  routes/
    +page.svelte        # Home
    drawing/            # Drawing gallery
    api/
      checkout/         # Stripe checkout session creation
      webhook/          # Stripe webhook handler (marks sold, sends emails)
  lib/
    assets/drawings/    # Drawing images (webp, multiple sizes)
scripts/
  standardize-images.js # Image pre-processing run before build
```
