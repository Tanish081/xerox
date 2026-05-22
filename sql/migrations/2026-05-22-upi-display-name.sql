-- Name shown in UPI payment confirmation screens (e.g. "Vrishabh Chadchan").
-- Used to verify the recipient in uploaded payment screenshots.
alter table public.shops
  add column if not exists upi_display_name text;
