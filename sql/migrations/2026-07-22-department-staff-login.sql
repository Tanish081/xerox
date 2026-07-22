-- Shared per-department staff login.
--
-- Each department gets one common staff email (e.g. aidsdypcoe@gmail.com) that
-- everyone in the department uses to place orders. The operator provisions it
-- from the Departments panel; the department is inferred from the email (RBAC),
-- so staff no longer register individually.
--
-- Safe to run as a single transaction — no new enum values.

alter table public.departments add column if not exists staff_email text;

-- One shared email per department. NULLs stay distinct (Postgres allows many
-- NULLs in a unique index), so departments without a staff login are fine.
create unique index if not exists departments_staff_email_lower_key
  on public.departments (lower(staff_email))
  where staff_email is not null;
