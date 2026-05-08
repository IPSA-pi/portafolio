# Ecommerce Implementation Plan v2 (Optimized)

This version replaces the static "No DB" approach with a "Stripe-as-Source-of-Truth" strategy to ensure real-time inventory management without needing a dedicated database.

---

## 1. The Strategy: Stripe-as-Source-of-Truth

Since Vercel's filesystem is read-only, we cannot update a local `products.ts` file via webhooks. Instead:
- **Inventory**: Fetch product status directly from Stripe during the page load.
- **Mapping**: Use Stripe **Metadata** (`slug`) to link Stripe products to local image files.
- **UI**: Integrate "Buy" buttons directly into the existing Lightbox to keep the portfolio feel.

---

## 2. Updated Project Structure

```
/src
  /routes
    /api
      /checkout
        +server.ts          ← Creates Stripe session (uses dynamic origins)
      /webhook
        +server.ts          ← Handles fulfillment & signature verification
    /drawing
      [slug]
        +page.server.ts     ← Fetches real-time "Sold" status from Stripe
  /lib
    /server
      stripe.ts             ← Stripe SDK initialization
    /components
      PurchaseButton.svelte ← Reusable component for the Lightbox
```

---

## 3. Implementation Steps

### Step 1: Stripe Dashboard Setup
- Create a Product in Stripe for each original drawing.
- **Critical**: Add a metadata field `slug` to each product (e.g., `slug: negro_1_a-1`).
- Set quantity to 1 to prevent double-selling.

### Step 2: Real-time Status Check (`src/routes/drawing/[slug]/+page.server.ts`)
Instead of a static list, we query Stripe.
```ts
import { stripe } from '$lib/server/stripe';

export async function load({ params }) {
    // Fetch all products from Stripe that match this notebook's slug prefix
    const products = await stripe.products.list({
        active: true,
        expand: ['data.default_price']
    });

    // Map Stripe products to local drawings via metadata.slug
    const soldItems = products.data
        .filter(p => p.metadata.sold === 'true')
        .map(p => p.metadata.slug);

    return { soldItems };
}
```

### Step 3: Secure Checkout (`/api/checkout/+server.ts`)
```ts
import { stripe } from '$lib/server/stripe';
import { error, json } from '@sveltejs/kit';

export const POST = async ({ request, url }) => {
    const { priceId, slug } = await request.json();
    
    const session = await stripe.checkout.sessions.create({
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'payment',
        success_url: `${url.origin}/drawing/${slug}?success=true`,
        cancel_url: `${url.origin}/drawing/${slug}`,
        metadata: { slug }, // Crucial for webhook tracking
        shipping_address_collection: { allowed_countries: ['US', 'CA'] },
    });

    return json({ url: session.url });
};
```

### Step 4: Webhook & Fulfillment (`/api/webhook/+server.ts`)
When payment succeeds:
1. Verify the Stripe signature.
2. Update the Stripe Product metadata to `sold: true`.
3. Use **Resend** to email the artist (fulfillment alert) and the customer (receipt).

---

## 4. Environment Variables

Add these to `.env` (local) and Vercel (production):
```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...
PUBLIC_STRIPE_KEY=pk_test_...
```

---

## 5. Why this is better than v1

| Feature | v1 (Original) | v2 (Updated) |
| :--- | :--- | :--- |
| **Inventory** | Manual update (Code change) | Automatic (Real-time Stripe check) |
| **Integrity** | Filesystem writes (Will fail) | API-based updates (Reliable) |
| **UX** | Separate Shop page | Integrated Portfolio/Lightbox |
| **Security** | `process.env` | Type-safe `$env/static/private` |
| **Shipping** | Hardcoded/Estimated | Stripe Shipping Rates (Dynamic) |

---

## 6. Next Actions

1. [ ] Install Stripe & Resend: `npm install stripe resend`
2. [ ] Create `$lib/server/stripe.ts` to share the client instance.
3. [ ] Modify `src/routes/drawing/[slug]/+page.ts` to `+page.server.ts` to allow Stripe SDK calls.
4. [ ] Add `PurchaseButton.svelte` to the `Lightbox.svelte` component.
