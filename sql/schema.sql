create extension if not exists pgcrypto;
create extension if not exists pg_cron;

do $$
begin
  create type public.order_status as enum (
    'pending_payment',
    'pending_approval',
    'queued',
    'processing',
    'completed',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.priority_class as enum ('A', 'B', 'C');
exception when duplicate_object then null;
end $$;

create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  upi_id text not null,
  operator_email text not null,
  avg_time_per_10_pages integer not null default 3,
  is_open boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  roll_no text not null,
  phone text not null,
  shop_id uuid not null references public.shops(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  token text unique,
  shop_id uuid not null references public.shops(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  status public.order_status not null default 'pending_payment',
  priority_class public.priority_class not null default 'B',
  scheduled_after timestamptz,
  print_settings jsonb not null default '{}'::jsonb,
  file_url text,
  file_name text,
  file_page_count integer,
  estimated_amount numeric(10,2) not null default 0,
  payment_screenshot_url text,
  utr_number text,
  payment_verified boolean not null default false,
  estimated_ready_time timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.token_sequence (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  date date not null,
  last_sequence integer not null default 0,
  unique (shop_id, date)
);

create index if not exists idx_orders_shop_status_created_at on public.orders (shop_id, status, created_at desc);
create index if not exists idx_orders_student_id on public.orders (student_id);
create index if not exists idx_token_sequence_shop_date on public.token_sequence (shop_id, date);

alter table public.shops enable row level security;
alter table public.students enable row level security;
alter table public.orders enable row level security;
alter table public.token_sequence enable row level security;

create or replace function public.is_operator_for_shop(target_shop_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.shops s
    where s.id = target_shop_id
      and lower(s.operator_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.generate_printq_token(p_shop_id uuid, p_priority_class public.priority_class)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date := current_date;
  v_sequence integer;
begin
  insert into public.token_sequence (shop_id, date, last_sequence)
  values (p_shop_id, v_date, 0)
  on conflict (shop_id, date) do nothing;

  select last_sequence
  into v_sequence
  from public.token_sequence
  where shop_id = p_shop_id
    and date = v_date
  for update;

  v_sequence := coalesce(v_sequence, 0) + 1;

  update public.token_sequence
  set last_sequence = v_sequence
  where shop_id = p_shop_id
    and date = v_date;

  return 'PQ-' || to_char(current_date, 'DDMM') || '-' || p_priority_class || '-' || lpad(v_sequence::text, 3, '0');
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

grant usage on schema public to anon, authenticated;

create policy "students can read own student row" on public.students
for select using (auth.uid() = id);

create policy "students can insert own student row" on public.students
for insert with check (auth.uid() = id);

create policy "students can update own student row" on public.students
for update using (auth.uid() = id);

create policy "operators can read shop students" on public.students
for select using (public.is_operator_for_shop(shop_id));

create policy "students can read own orders" on public.orders
for select using (student_id = auth.uid());

create policy "operators can read shop orders" on public.orders
for select using (public.is_operator_for_shop(shop_id));

create policy "operators can update shop orders" on public.orders
for update using (public.is_operator_for_shop(shop_id));

create policy "operators can insert shop orders" on public.orders
for insert with check (public.is_operator_for_shop(shop_id));

create policy "operators can read token sequence" on public.token_sequence
for select using (public.is_operator_for_shop(shop_id));

create policy "operators can update token sequence" on public.token_sequence
for update using (public.is_operator_for_shop(shop_id));

create policy "operators can insert token sequence" on public.token_sequence
for insert with check (public.is_operator_for_shop(shop_id));

create policy "no public access shops" on public.shops
for select using (auth.role() = 'authenticated');

create policy "authenticated can read shops" on public.shops
for select using (auth.role() = 'authenticated');

create policy "operators can update shop" on public.shops
for update using (public.is_operator_for_shop(id));

create or replace function public.cleanup_token_sequences()
returns void
language sql
security definer
as $$
  delete from public.token_sequence
  where date < current_date - interval '7 days';
$$;

create or replace function public.cancel_stale_pending_orders()
returns void
language sql
security definer
as $$
  update public.orders
  set status = 'cancelled'
  where status = 'pending_payment'
    and created_at < now() - interval '2 hours';
$$;

create or replace function public.cleanup_old_completed_files()
returns void
language plpgsql
security definer
as $$
declare
  r record;
begin
  for r in
    select id, file_url, payment_screenshot_url
    from public.orders
    where status = 'completed'
      and updated_at < now() - interval '24 hours'
  loop
    update public.orders
    set file_url = null
    where id = r.id;
  end loop;
end;
$$;

create or replace function public.delete_old_orders()
returns void
language sql
security definer
as $$
  delete from public.orders
  where status in ('completed', 'cancelled')
    and created_at < now() - interval '30 days';
$$;

select cron.schedule('printq-token-sequence-cleanup', '0 0 * * *', $$select public.cleanup_token_sequences();$$);
select cron.schedule('printq-stale-order-cleanup', '30 0 * * *', $$select public.cancel_stale_pending_orders();$$);
select cron.schedule('printq-file-cleanup', '0 * * * *', $$select public.cleanup_old_completed_files();$$);
select cron.schedule('printq-old-order-cleanup', '10 0 * * *', $$select public.delete_old_orders();$$);

-- Storage buckets
insert into storage.buckets (id, name, public)
values ('print-files', 'print-files', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('payment-screenshots', 'payment-screenshots', false)
on conflict (id) do nothing;

create policy "authenticated can read print files" on storage.objects
for select using (bucket_id = 'print-files' and auth.role() = 'authenticated');

create policy "authenticated can insert print files" on storage.objects
for insert with check (bucket_id = 'print-files' and auth.role() = 'authenticated');

create policy "authenticated can read payment screenshots" on storage.objects
for select using (bucket_id = 'payment-screenshots' and auth.role() = 'authenticated');

create policy "authenticated can insert payment screenshots" on storage.objects
for insert with check (bucket_id = 'payment-screenshots' and auth.role() = 'authenticated');
