# Ecommerce Implementation Plan

## Stack

SvelteKit API routes + Stripe Checkout + Resend (email) — no separate backend or database required.

---

## Project Structure

```
/src
  /routes
    /shop
      +page.svelte              ← product listing
      /[slug]
        +page.svelte            ← individual product page
      /success
        +page.svelte            ← post-payment confirmation page
    /api
      /checkout
        +server.ts              ← creates Stripe checkout session
      /webhook
        +server.ts              ← handles post-payment fulfillment
  /lib
    products.ts                 ← static product catalog
```

---

## Product Catalog

Each original drawing is a unique item with a `sold` flag and a Stripe price ID.

```ts
// /lib/products.ts
export const products = [
  {
    slug: "notebook-01-page-3",
    name: "Notebook 01 — Page 3",
    price: 8000,                  // in cents — $80.00
    stripePriceId: "price_xxx",   // from Stripe dashboard
    image: "/originals/nb01-p3.webp",
    sold: false,
  },
]
```

---

## Purchase Flow

1. User browses `/shop` and clicks "Buy"
2. Frontend calls `/api/checkout` with the product's `priceId`
3. Server creates a Stripe Checkout Session and returns a redirect URL
4. User completes payment on Stripe's hosted page
5. Stripe redirects user back to `/shop/success`
6. Stripe fires a webhook to `/api/webhook` — fulfillment logic runs here

---

## Key API Routes

### `/api/checkout/+server.ts`
```ts
import Stripe from 'stripe'
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

export async function POST({ request }) {
  const { priceId } = await request.json()
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: 'https://yoursite.com/shop/success',
    cancel_url: 'https://yoursite.com/shop',
  })
  return Response.json({ url: session.url })
}
```

### `/api/webhook/+server.ts`
Receives Stripe events after payment. Responsibilities:
- Verify the Stripe signature
- Send a confirmation email to the buyer (via Resend)
- Mark the item as sold

---

## Inventory Control for Originals

Since each drawing is one-of-a-kind, use **Stripe's built-in stock control** — set `quantity: 1` on the Stripe price. Stripe will automatically refuse duplicate purchases. No database needed.

Show a "SOLD" overlay on the drawing instead of removing it from the gallery — good for portfolio credibility.

---

## Fulfillment for Original Drawings

Fulfillment is manual — you are the logistics:

1. Webhook fires → Resend sends buyer a confirmation email with estimated shipping time
2. You package and ship the drawing (USPS, FedEx, etc.)
3. You email the buyer a tracking number

**Shipping cost**: either build it into the price or use Stripe's shipping rate feature to add it as a line item at checkout.

---

## Required Services

| Service | Purpose | Cost |
|---|---|---|
| [Stripe](https://stripe.com) | Payments + stock control | Free (2.9% + 30¢ per transaction) |
| [Resend](https://resend.com) | Transactional email | Free tier (3k emails/mo) |
| Vercel | Hosting + serverless functions | Already in use |

---

## Environment Variables

Add these to your Vercel project dashboard:

```
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
RESEND_API_KEY=re_xxx
```

---

## Effort Estimate

| Task | Time |
|---|---|
| Stripe account + products setup | ~30 min |
| `/shop` page + product catalog | 1–2 hrs |
| `/api/checkout` route | ~30 min |
| `/api/webhook` + email | ~1 hr |
| Styling to match existing site | 1–2 hrs |

**Total: ~half a day of focused work.**
