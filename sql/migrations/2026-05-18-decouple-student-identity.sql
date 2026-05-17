-- Decouple student identity from Supabase auth user ID.
--
-- Problem: students.id was set to auth.uid() by the profile API, meaning one
-- auth account could only ever have one student profile. Any new phone
-- registration on the same auth session overwrote the previous profile and
-- inherited all its order history.
--
-- Fix:
--   1. Add auth_user_id to track which auth account owns a student record.
--   2. Add UNIQUE(phone, shop_id) so each physical student is distinct.
--   3. Update RLS to use auth_user_id instead of id.
--   4. Update orders RLS to allow access via student membership, not auth.uid().

begin;

-- 1. Add auth_user_id column
alter table public.students
  add column if not exists auth_user_id uuid;

-- 2. Backfill: existing rows have id = auth.uid(), so auth_user_id = id
update public.students
  set auth_user_id = id
  where auth_user_id is null;

-- 3. Remove duplicate (phone, shop_id) pairs before adding the constraint.
--    Keep the most recently created row per pair.
delete from public.students a
  using public.students b
  where a.phone    = b.phone
    and a.shop_id  = b.shop_id
    and a.created_at < b.created_at;

alter table public.students
  drop constraint if exists students_phone_shop_key;

alter table public.students
  add constraint students_phone_shop_key unique (phone, shop_id);

-- 4. Update student RLS to use auth_user_id
drop policy if exists "students auth select own"   on public.students;
drop policy if exists "students auth insert own"   on public.students;
drop policy if exists "students auth update own"   on public.students;
drop policy if exists "students can read own student row"   on public.students;
drop policy if exists "students can insert own student row" on public.students;
drop policy if exists "students can update own student row" on public.students;

create policy "students auth select own" on public.students
  for select to authenticated
  using (auth_user_id = auth.uid());

create policy "students auth insert own" on public.students
  for insert to authenticated
  with check (auth_user_id = auth.uid());

create policy "students auth update own" on public.students
  for update to authenticated
  using  (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- 5. Update orders RLS so a student can read/write orders belonging to any
--    of their student records (identified by auth_user_id).
drop policy if exists "orders auth student select own" on public.orders;
drop policy if exists "orders auth student insert own" on public.orders;
drop policy if exists "orders auth student update own" on public.orders;
drop policy if exists "students can read own orders"   on public.orders;

create policy "orders auth student select own" on public.orders
  for select to authenticated
  using (
    student_id in (
      select id from public.students where auth_user_id = auth.uid()
    )
  );

create policy "orders auth student insert own" on public.orders
  for insert to authenticated
  with check (
    student_id in (
      select id from public.students where auth_user_id = auth.uid()
    )
  );

create policy "orders auth student update own" on public.orders
  for update to authenticated
  using (
    student_id in (
      select id from public.students where auth_user_id = auth.uid()
    )
  );

commit;
