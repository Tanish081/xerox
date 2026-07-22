-- Staff print on department credit instead of paying up front.
--
-- A department has a rupee credit limit per shop. Every staff order draws down
-- that shared balance. When the balance is exhausted, staff cannot place new
-- orders until the operator raises a payment request and marks it settled —
-- settling stamps `department_settled_at` on the covered orders, which frees
-- the credit again.

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  credit_limit numeric(10,2) not null default 5000,
  created_at timestamptz not null default now(),
  unique (shop_id, name)
);

create table if not exists public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  department text not null,
  amount numeric(10,2) not null default 0,
  order_count integer not null default 0,
  status text not null default 'pending',
  note text,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  constraint payment_requests_status_check check (status in ('pending', 'settled'))
);

-- 'upi' = student pays before the order is placed (existing behaviour).
-- 'department_credit' = staff order, billed to their department later.
alter table public.orders add column if not exists billing_mode text not null default 'upi';
alter table public.orders add column if not exists billed_department text;
alter table public.orders add column if not exists payment_request_id uuid references public.payment_requests(id) on delete set null;
alter table public.orders add column if not exists department_settled_at timestamptz;

do $$
begin
  alter table public.orders
    add constraint orders_billing_mode_check check (billing_mode in ('upi', 'department_credit'));
exception when duplicate_object then null;
end $$;

-- Outstanding department usage is always filtered on these three columns.
create index if not exists idx_orders_department_outstanding
  on public.orders (shop_id, billed_department)
  where billing_mode = 'department_credit' and department_settled_at is null;

create index if not exists idx_payment_requests_shop_status
  on public.payment_requests (shop_id, status, created_at desc);

alter table public.departments enable row level security;
alter table public.payment_requests enable row level security;

-- Both tables are reached only through the service-role API routes, which
-- bypass RLS. No policies means no direct client access, which is intended.
