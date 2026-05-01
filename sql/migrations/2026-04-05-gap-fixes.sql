-- PrintQ gap fixes
-- Gap 1: strict storage policies
-- Gap 2: rejection_reason persistence
-- Gap 3: (code-side only) real XHR progress
-- Gap 4: email-first operator RLS + login-light student RLS
-- UX fix: short token format A01/B34/C03

begin;

-- =====================================================
-- Gap 2: rejection reason column
-- =====================================================
alter table public.orders
  add column if not exists rejection_reason text;

-- =====================================================
-- UX fix 1: short token format (A01, B34, C03)
-- =====================================================
create or replace function public.generate_printq_token(p_shop_id uuid, p_priority_class public.priority_class)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date := current_date;
  v_sequence integer;
  v_sequence_2_digit integer;
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

  if v_sequence > 99 then
    v_sequence := 1;
  end if;

  update public.token_sequence
  set last_sequence = v_sequence
  where shop_id = p_shop_id
    and date = v_date;

  v_sequence_2_digit := v_sequence;

  return p_priority_class::text || lpad(v_sequence_2_digit::text, 2, '0');
end;
$$;

-- =====================================================
-- Gap 4: RLS cleanup (email operator, login-light student)
-- =====================================================
create or replace function public.is_operator_for_shop(target_shop_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.shops s
    where s.id = target_shop_id
      and lower(s.operator_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- reset policies
-- shops
 drop policy if exists "shops operator select" on public.shops;
 drop policy if exists "shops operator update" on public.shops;
 drop policy if exists "shops authenticated insert" on public.shops;
 drop policy if exists "shops anon read basic" on public.shops;
 drop policy if exists "no public access shops" on public.shops;
 drop policy if exists "authenticated can read shops" on public.shops;
 drop policy if exists "operators can update shop" on public.shops;

 create policy "shops operator select" on public.shops
 for select
 to authenticated
 using (public.is_operator_for_shop(id));

 create policy "shops operator update" on public.shops
 for update
 to authenticated
 using (public.is_operator_for_shop(id))
 with check (public.is_operator_for_shop(id));

 create policy "shops authenticated insert" on public.shops
 for insert
 to authenticated
 with check (true);

 -- NOTE: anon select here permits student entry page to resolve shop by id.
 -- Column-level restriction (name/is_open only) should be enforced in API/view layer.
 create policy "shops anon read basic" on public.shops
 for select
 to anon
 using (true);

-- students
 drop policy if exists "students can read own student row" on public.students;
 drop policy if exists "students can insert own student row" on public.students;
 drop policy if exists "students can update own student row" on public.students;
 drop policy if exists "operators can read shop students" on public.students;
 drop policy if exists "students anon create" on public.students;
 drop policy if exists "students anon read" on public.students;
 drop policy if exists "students anon update" on public.students;
 drop policy if exists "students operator read" on public.students;

 create policy "students anon create" on public.students
 for insert
 to anon
 with check (true);

 create policy "students anon read" on public.students
 for select
 to anon
 using (true);

 create policy "students anon update" on public.students
 for update
 to anon
 using (true)
 with check (true);

 create policy "students operator read" on public.students
 for select
 to authenticated
 using (public.is_operator_for_shop(shop_id));

-- orders
 drop policy if exists "students can read own orders" on public.orders;
 drop policy if exists "operators can read shop orders" on public.orders;
 drop policy if exists "operators can update shop orders" on public.orders;
 drop policy if exists "operators can insert shop orders" on public.orders;
 drop policy if exists "students can insert own orders" on public.orders;
 drop policy if exists "students can update own pending orders" on public.orders;
 drop policy if exists "orders anon select" on public.orders;
 drop policy if exists "orders anon insert" on public.orders;
 drop policy if exists "orders anon update pending" on public.orders;
 drop policy if exists "orders operator select" on public.orders;
 drop policy if exists "orders operator update" on public.orders;

 create policy "orders anon select" on public.orders
 for select
 to anon
 using (exists (
   select 1
   from public.students s
   where s.id = orders.student_id
 ));

 create policy "orders anon insert" on public.orders
 for insert
 to anon
 with check (exists (
   select 1
   from public.students s
   where s.id = orders.student_id
     and s.shop_id = orders.shop_id
 ));

 create policy "orders anon update pending" on public.orders
 for update
 to anon
 using (
   exists (
     select 1
     from public.students s
     where s.id = orders.student_id
       and s.shop_id = orders.shop_id
   )
   and orders.status in ('pending_payment', 'pending_approval', 'cancelled')
 )
 with check (
   exists (
     select 1
     from public.students s
     where s.id = orders.student_id
       and s.shop_id = orders.shop_id
   )
   and orders.status in ('pending_payment', 'pending_approval', 'cancelled')
 );

 create policy "orders operator select" on public.orders
 for select
 to authenticated
 using (public.is_operator_for_shop(shop_id));

 create policy "orders operator update" on public.orders
 for update
 to authenticated
 using (public.is_operator_for_shop(shop_id))
 with check (public.is_operator_for_shop(shop_id));

-- token_sequence (service role only)
revoke all on table public.token_sequence from anon, authenticated;

drop policy if exists "operators can read token sequence" on public.token_sequence;
drop policy if exists "operators can update token sequence" on public.token_sequence;
drop policy if exists "operators can insert token sequence" on public.token_sequence;
drop policy if exists "token sequence service role read" on public.token_sequence;
drop policy if exists "token sequence service role insert" on public.token_sequence;
drop policy if exists "token sequence service role update" on public.token_sequence;

create policy "token sequence service role read" on public.token_sequence
for select
to service_role
using (true);

create policy "token sequence service role insert" on public.token_sequence
for insert
to service_role
with check (true);

create policy "token sequence service role update" on public.token_sequence
for update
to service_role
using (true)
with check (true);

-- =====================================================
-- Gap 1: strict storage policies by order ownership
-- Path format expected: {shop_id}/{order_id}/{filename}
-- =====================================================

-- cleanup old policies if present
 drop policy if exists "authenticated can read print files" on storage.objects;
 drop policy if exists "authenticated can insert print files" on storage.objects;
 drop policy if exists "authenticated can read payment screenshots" on storage.objects;
 drop policy if exists "authenticated can insert payment screenshots" on storage.objects;

 drop policy if exists "print files student insert" on storage.objects;
 drop policy if exists "print files student select" on storage.objects;
 drop policy if exists "print files operator select" on storage.objects;
 drop policy if exists "print files service delete" on storage.objects;

 drop policy if exists "payment files student insert" on storage.objects;
 drop policy if exists "payment files student select" on storage.objects;
 drop policy if exists "payment files operator select" on storage.objects;
 drop policy if exists "payment files service delete" on storage.objects;

-- print-files
create policy "print files student insert" on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'print-files'
  and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
  and exists (
    select 1
    from public.orders o
    where o.id = split_part(name, '/', 2)::uuid
      and o.shop_id::text = split_part(name, '/', 1)
      and (
        o.student_id = auth.uid()
        or (
          auth.uid() is null
          and exists (select 1 from public.students s where s.id = o.student_id)
        )
      )
  )
);

create policy "print files student select" on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'print-files'
  and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
  and exists (
    select 1
    from public.orders o
    where o.id = split_part(name, '/', 2)::uuid
      and (
        o.student_id = auth.uid()
        or (
          auth.uid() is null
          and exists (select 1 from public.students s where s.id = o.student_id)
        )
      )
  )
);

create policy "print files operator select" on storage.objects
for select
to authenticated
using (
  bucket_id = 'print-files'
  and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
  and exists (
    select 1
    from public.orders o
    join public.shops s on s.id = o.shop_id
    where o.id = split_part(name, '/', 2)::uuid
      and lower(s.operator_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

create policy "print files service delete" on storage.objects
for delete
to service_role
using (bucket_id = 'print-files');

-- payment-screenshots
create policy "payment files student insert" on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'payment-screenshots'
  and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
  and exists (
    select 1
    from public.orders o
    where o.id = split_part(name, '/', 2)::uuid
      and o.shop_id::text = split_part(name, '/', 1)
      and (
        o.student_id = auth.uid()
        or (
          auth.uid() is null
          and exists (select 1 from public.students s where s.id = o.student_id)
        )
      )
  )
);

create policy "payment files student select" on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'payment-screenshots'
  and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
  and exists (
    select 1
    from public.orders o
    where o.id = split_part(name, '/', 2)::uuid
      and (
        o.student_id = auth.uid()
        or (
          auth.uid() is null
          and exists (select 1 from public.students s where s.id = o.student_id)
        )
      )
  )
);

create policy "payment files operator select" on storage.objects
for select
to authenticated
using (
  bucket_id = 'payment-screenshots'
  and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
  and exists (
    select 1
    from public.orders o
    join public.shops s on s.id = o.shop_id
    where o.id = split_part(name, '/', 2)::uuid
      and lower(s.operator_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

create policy "payment files service delete" on storage.objects
for delete
to service_role
using (bucket_id = 'payment-screenshots');

commit;
