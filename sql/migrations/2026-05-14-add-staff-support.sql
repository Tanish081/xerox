-- Migration to add staff support
alter table public.students add column if not exists user_type text default 'student';
alter table public.students add column if not exists department text;
alter table public.students alter column roll_no drop not null;

-- Update RLS policies if needed (they currently use id = auth.uid(), which is fine)
