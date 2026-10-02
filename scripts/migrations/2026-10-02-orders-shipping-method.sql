-- Orders: which shipping option the buyer paid for (2026-10-02).
--
-- shipping_method is a ShippingOption id from src/lib/shipping.ts —
-- 'free' | 'standard' | 'registered'. NULL = not recorded: orders from before
-- this column, in-person sales, digital files, or an amount that matched no
-- option. shipping_cents is what the buyer paid for shipping on the whole
-- ORDER (a session ships as one package), repeated on every row of the
-- session like shipped_at — never sum it across rows.
--
-- Safe to run before or after the deploy: the webhook retries its insert
-- without these two columns if they don't exist yet, and /admin/sales simply
-- shows no method for a row that has none.
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS shipping_method TEXT,
    ADD COLUMN IF NOT EXISTS shipping_cents  INT;
