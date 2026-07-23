-- Shared department staff logins mean every order's `students` row shows the
-- same account name (e.g. "AIDS Staff"). This records the actual person who
-- placed each order, typed in at submit time, so the HOD's department history
-- can tell staff apart even though they all share one login.
--
-- Safe to run as a single transaction — no new enum values.

alter table public.orders add column if not exists placed_by_name text;
