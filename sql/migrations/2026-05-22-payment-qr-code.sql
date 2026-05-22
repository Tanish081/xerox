-- Add payment QR code URL to shops table
alter table public.shops
  add column if not exists payment_qr_url text;

-- Track when a student first opened the payment step (used for 10-min window fallback)
alter table public.orders
  add column if not exists payment_initiated_at timestamptz;

-- Public bucket for shop QR code images
insert into storage.buckets (id, name, public)
values ('shop-qr-codes', 'shop-qr-codes', true)
on conflict (id) do nothing;

-- Anyone authenticated can read QR codes (students need to display them)
create policy "authenticated can read shop qr codes" on storage.objects
for select using (bucket_id = 'shop-qr-codes' and auth.role() = 'authenticated');

-- Only authenticated users (operators) can upload QR codes
create policy "authenticated can insert shop qr codes" on storage.objects
for insert with check (bucket_id = 'shop-qr-codes' and auth.role() = 'authenticated');

-- Only authenticated users (operators) can update/replace QR codes
create policy "authenticated can update shop qr codes" on storage.objects
for update using (bucket_id = 'shop-qr-codes' and auth.role() = 'authenticated');

-- Only authenticated users (operators) can delete QR codes
create policy "authenticated can delete shop qr codes" on storage.objects
for delete using (bucket_id = 'shop-qr-codes' and auth.role() = 'authenticated');
