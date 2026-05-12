-- Fix PGRST204: orders.stationary_cart missing on older DBs / schema drift.
-- Run in Supabase SQL Editor. PostgREST reloads schema automatically after ALTER.

alter table public.orders
  add column if not exists stationary_cart jsonb not null default '[]'::jsonb;
