-- Replace the global token uniqueness constraint with a per-shop one.
-- Tokens only need to be unique within a shop; the old global constraint caused
-- false duplicate-key errors when two shops (or the same shop on different days)
-- independently generated identical short tokens (e.g. "B01").

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_token_key;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_shop_token_unique
  UNIQUE (shop_id, token);
