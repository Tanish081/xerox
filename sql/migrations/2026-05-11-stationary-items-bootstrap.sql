-- Bootstrap missing stationery inventory objects.
-- Run this in Supabase SQL Editor if `public.stationary_items` is missing.

begin;

create table if not exists public.stationary_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  price numeric(10,2) not null,
  stock_quantity integer not null default 0,
  is_available boolean not null default true,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_stationary_items_shop on public.stationary_items (shop_id);

alter table public.stationary_items enable row level security;

drop policy if exists "authenticated can read stationary items" on public.stationary_items;
create policy "authenticated can read stationary items" on public.stationary_items
for select using (auth.role() = 'authenticated');

drop policy if exists "operators can manage stationary items" on public.stationary_items;
create policy "operators can manage stationary items" on public.stationary_items
for all using (public.is_operator_for_shop(shop_id));

drop trigger if exists trg_stationary_items_updated_at on public.stationary_items;
create trigger trg_stationary_items_updated_at
before update on public.stationary_items
for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "public can read product images" on storage.objects;
create policy "public can read product images" on storage.objects
for select using (bucket_id = 'product-images');

drop policy if exists "operators can insert product images" on storage.objects;
create policy "operators can insert product images" on storage.objects
for insert with check (bucket_id = 'product-images' and auth.role() = 'authenticated');

drop policy if exists "operators can update product images" on storage.objects;
create policy "operators can update product images" on storage.objects
for update using (bucket_id = 'product-images' and auth.role() = 'authenticated');

commit;
