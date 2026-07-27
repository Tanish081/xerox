-- Ledger of amounts an operator has actually received from a department.
-- Powers the "Settle up" action in the Statistics tab: Settled/Outstanding in
-- both the Statistics panel and generated bills are computed from this table.
--
-- This is intentionally independent of the existing Departments-tab flow
-- (`payment_requests` + `orders.department_settled_at`), which gates whether
-- staff can keep placing new orders against their department credit limit —
-- that mechanism is untouched. This ledger exists purely for bookkeeping and
-- billing display: "how much has the department actually paid so far."
--
-- Safe to run as a single transaction — no new enum values.

create table if not exists public.department_settlements (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  note text,
  settled_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_department_settlements_shop_dept
  on public.department_settlements (shop_id, department_id, created_at desc);

alter table public.department_settlements enable row level security;

-- Reached only through service-role API routes, which bypass RLS. No policies
-- means no direct client access, which is intended.
