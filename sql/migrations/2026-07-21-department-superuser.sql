-- Departments become first-class, college-wide entities with exactly one HOD
-- superuser account each.
--
-- Before: `departments` was one row per (shop, free-text name), and staff typed
-- their department as text. After: `departments` is one row per department for
-- the whole college, owning its HOD login; per-shop credit limits move to
-- `department_credits`; staff and orders reference a department id.
--
-- Safe to run as a single transaction — no new enum values are introduced.

-- ── 1. Preserve the existing per-shop rows under their new name ─────────────
alter table if exists public.departments rename to department_shop_limits;

-- Indexes/constraints created under the old name keep working; only the table
-- identity changed.

-- ── 2. College-wide departments, each owning one HOD superuser ──────────────
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  hod_auth_user_id uuid unique,
  hod_email text unique,
  hod_name text,
  hod_phone text,
  created_at timestamptz not null default now()
);

-- Department names are claimed exclusively, case-insensitively, so "AIDS" and
-- "aids" cannot become two departments.
create unique index if not exists departments_name_lower_key
  on public.departments (lower(name));

-- ── 3. Backfill departments from existing data ──────────────────────────────
insert into public.departments (name)
select distinct on (lower(l.name)) l.name
from public.department_shop_limits l
where l.name is not null and btrim(l.name) <> ''
order by lower(l.name), l.created_at
on conflict (lower(name)) do nothing;

insert into public.departments (name)
select distinct on (lower(s.department)) s.department
from public.students s
where s.department is not null and btrim(s.department) <> ''
order by lower(s.department), s.created_at
on conflict (lower(name)) do nothing;

-- ── 4. Per-shop credit limits, now keyed by department id ───────────────────
create table if not exists public.department_credits (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  credit_limit numeric(10,2) not null default 5000,
  created_at timestamptz not null default now(),
  unique (department_id, shop_id)
);

insert into public.department_credits (department_id, shop_id, credit_limit)
select d.id, l.shop_id, l.credit_limit
from public.department_shop_limits l
join public.departments d on lower(d.name) = lower(l.name)
on conflict (department_id, shop_id) do nothing;

-- ── 5. Link staff and orders to the department id ───────────────────────────
alter table public.students add column if not exists department_id uuid references public.departments(id) on delete set null;
alter table public.orders   add column if not exists department_id uuid references public.departments(id) on delete set null;

update public.students s
set department_id = d.id
from public.departments d
where s.department_id is null
  and s.department is not null
  and lower(s.department) = lower(d.name);

update public.orders o
set department_id = d.id
from public.departments d
where o.department_id is null
  and o.billed_department is not null
  and lower(o.billed_department) = lower(d.name);

create index if not exists idx_students_department_id on public.students (department_id);
create index if not exists idx_orders_department_id   on public.orders (department_id, status);

alter table public.departments enable row level security;
alter table public.department_credits enable row level security;

-- Reached only through service-role API routes, which bypass RLS. No policies
-- means no direct client access, which is intended.
--
-- NOTE: students.is_hod is now vestigial — HOD identity lives on
-- departments.hod_auth_user_id. The column is left in place rather than dropped
-- so this migration stays non-destructive.
