-- 2026-10-01 — Paid digital file: price columns on `drawings`, `kind` on `orders`.
--
-- What: adds three nullable columns to `drawings` — `digital_stripe_product_id`,
-- `digital_stripe_price_id`, `digital_price_cents` — and `orders.kind`
-- (TEXT NOT NULL DEFAULT 'original', CHECK in ('original','digital')). Drops
-- `drawings.digital_url`.
--
-- Why: the high-resolution file is now also sold on its own, through Stripe
-- Managed Payments (owner decision 2026-10-01). The digital Stripe product and
-- price live beside the physical ones, and each `orders` row records whether it
-- is the original or the digital file. Existing rows backfill to 'original' via
-- the column default, which is correct: every order before this was physical.
--
-- Availability stays derived, never stored: a drawing is listed for digital
-- sale iff `digital_object_path IS NOT NULL AND digital_stripe_price_id IS NOT
-- NULL AND digital_price_cents > 0`.
--
-- `digital_url` (the Gumroad deep link) was removed from
-- 2026-08-13-drawings-digital.sql before that file ever ran on prod, so only a
-- DEV database that ran the earlier version has the column; DROP COLUMN IF
-- EXISTS is a no-op everywhere else.
--
-- How to run: paste into the Supabase SQL editor — DEV first. Prod stays
-- untouched until the owner rolls it out. Idempotent (IF NOT EXISTS / IF
-- EXISTS): re-running is a no-op. The CHECK is declared inline on the ADD
-- COLUMN, so it is created exactly once, with the column.

ALTER TABLE drawings
    ADD COLUMN IF NOT EXISTS digital_stripe_product_id TEXT,
    ADD COLUMN IF NOT EXISTS digital_stripe_price_id   TEXT,
    ADD COLUMN IF NOT EXISTS digital_price_cents       INT;

ALTER TABLE drawings
    DROP COLUMN IF EXISTS digital_url;

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'original'
        CONSTRAINT orders_kind_check CHECK (kind IN ('original', 'digital'));
