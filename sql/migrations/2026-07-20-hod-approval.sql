-- HOD approval for large staff print jobs.
--
-- A staff order whose total sheets (document pages x copies) exceed
-- HOD_APPROVAL_PAGE_THRESHOLD waits on the department head instead of going
-- straight to the operator. HOD approval also authorises the spend, so those
-- orders bypass the department credit limit.
--
-- NOTE: the ALTER TYPE below adds an enum value. Postgres will not let a new
-- enum value be *used* in the transaction that adds it, and the SQL editor runs
-- this whole file as one transaction — so nothing below may reference
-- 'pending_hod_approval' as a literal. That is why the HOD queue index is a
-- plain composite index rather than a partial one.

alter type public.order_status add value if not exists 'pending_hod_approval';

-- Department heads approve orders for their own department only.
alter table public.students add column if not exists is_hod boolean not null default false;

-- Sheets actually printed, recorded at submit so the threshold and the HOD's
-- review both work off the same number.
alter table public.orders add column if not exists total_pages integer;

alter table public.orders add column if not exists hod_approved_by uuid references public.students(id) on delete set null;
alter table public.orders add column if not exists hod_approved_at timestamptz;
alter table public.orders add column if not exists hod_rejection_reason text;

-- Set when the operator marks a department order collected-ready, so the
-- WhatsApp nudge isn't silently sent twice.
alter table public.orders add column if not exists ready_notified_at timestamptz;

-- The HOD queue is read as "orders for my department at my shop awaiting me".
-- Composite rather than partial: a partial index would need the new enum value
-- as a literal, which Postgres rejects until this transaction commits.
create index if not exists idx_orders_pending_hod
  on public.orders (shop_id, billed_department, status);

create index if not exists idx_students_hod
  on public.students (shop_id, department)
  where is_hod = true;
