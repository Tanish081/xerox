-- Student auth RLS: authenticated users can manage their own student row and orders.
-- Demo seed: three shops + stationery lines for testing (idempotent via operator_email / item names).

begin;

-- ---------------------------------------------------------------------------
-- Students: own row when logged in (JWT sub = students.id)
-- ---------------------------------------------------------------------------
drop policy if exists "students auth select own" on public.students;
create policy "students auth select own" on public.students
for select to authenticated
using (id = auth.uid());

drop policy if exists "students auth insert own" on public.students;
create policy "students auth insert own" on public.students
for insert to authenticated
with check (id = auth.uid());

drop policy if exists "students auth update own" on public.students;
create policy "students auth update own" on public.students
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Orders: authenticated student CRUD on rows where student_id = auth.uid()
-- (Anon policies remain for legacy flows; these apply when JWT present.)
-- ---------------------------------------------------------------------------
drop policy if exists "orders auth student select own" on public.orders;
create policy "orders auth student select own" on public.orders
for select to authenticated
using (student_id = auth.uid());

drop policy if exists "orders auth student insert own" on public.orders;
create policy "orders auth student insert own" on public.orders
for insert to authenticated
with check (student_id = auth.uid());

drop policy if exists "orders auth student update own" on public.orders;
create policy "orders auth student update own" on public.orders
for update to authenticated
using (student_id = auth.uid())
with check (student_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Demo shops (safe re-run)
-- ---------------------------------------------------------------------------
insert into public.shops (name, upi_id, operator_email, is_open, avg_time_per_10_pages)
select 'Demo Campus North', 'demo-north@paytm', 'demo-shop-north@printq.local', true, 3
where not exists (select 1 from public.shops where operator_email = 'demo-shop-north@printq.local');

insert into public.shops (name, upi_id, operator_email, is_open, avg_time_per_10_pages)
select 'Demo Campus East', 'demo-east@paytm', 'demo-shop-east@printq.local', true, 4
where not exists (select 1 from public.shops where operator_email = 'demo-shop-east@printq.local');

insert into public.shops (name, upi_id, operator_email, is_open, avg_time_per_10_pages)
select 'Demo Campus Central', 'demo-central@paytm', 'demo-shop-central@printq.local', true, 3
where not exists (select 1 from public.shops where operator_email = 'demo-shop-central@printq.local');

-- Stationery for each demo shop (only if table exists — skip otherwise)
do $$
begin
  if to_regclass('public.stationary_items') is null then
    raise notice 'stationary_items missing; run 2026-05-11-stationary-items-bootstrap.sql first.';
  else
    insert into public.stationary_items (shop_id, name, price, stock_quantity, is_available)
    select s.id, 'Ball Pen (Blue)', 12.00, 50, true
    from public.shops s
    where s.operator_email = 'demo-shop-north@printq.local'
      and not exists (
        select 1 from public.stationary_items i where i.shop_id = s.id and i.name = 'Ball Pen (Blue)'
      );

    insert into public.stationary_items (shop_id, name, price, stock_quantity, is_available)
    select s.id, 'Classmate Notebook A4', 85.00, 25, true
    from public.shops s
    where s.operator_email = 'demo-shop-north@printq.local'
      and not exists (
        select 1 from public.stationary_items i where i.shop_id = s.id and i.name = 'Classmate Notebook A4'
      );

    insert into public.stationary_items (shop_id, name, price, stock_quantity, is_available)
    select s.id, 'A4 Sheets (100 pack)', 120.00, 15, true
    from public.shops s
    where s.operator_email = 'demo-shop-north@printq.local'
      and not exists (
        select 1 from public.stationary_items i where i.shop_id = s.id and i.name = 'A4 Sheets (100 pack)'
      );

    insert into public.stationary_items (shop_id, name, price, stock_quantity, is_available)
    select s.id, 'Ball Pen (Blue)', 12.00, 50, true
    from public.shops s
    where s.operator_email = 'demo-shop-east@printq.local'
      and not exists (
        select 1 from public.stationary_items i where i.shop_id = s.id and i.name = 'Ball Pen (Blue)'
      );

    insert into public.stationary_items (shop_id, name, price, stock_quantity, is_available)
    select s.id, 'Highlighter Set', 65.00, 20, true
    from public.shops s
    where s.operator_email = 'demo-shop-east@printq.local'
      and not exists (
        select 1 from public.stationary_items i where i.shop_id = s.id and i.name = 'Highlighter Set'
      );

    insert into public.stationary_items (shop_id, name, price, stock_quantity, is_available)
    select s.id, 'Ball Pen (Blue)', 12.00, 50, true
    from public.shops s
    where s.operator_email = 'demo-shop-central@printq.local'
      and not exists (
        select 1 from public.stationary_items i where i.shop_id = s.id and i.name = 'Ball Pen (Blue)'
      );

    insert into public.stationary_items (shop_id, name, price, stock_quantity, is_available)
    select s.id, 'Sticky Notes', 45.00, 30, true
    from public.shops s
    where s.operator_email = 'demo-shop-central@printq.local'
      and not exists (
        select 1 from public.stationary_items i where i.shop_id = s.id and i.name = 'Sticky Notes'
      );
  end if;
end $$;

commit;
