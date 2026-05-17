-- Remap existing student IDs that were tied to auth UIDs.
--
-- DISABLE TRIGGER ALL is blocked by Supabase. This version instead drops
-- the FK constraint, does the remapping, then restores it — which the
-- postgres (table-owner) user IS allowed to do.

BEGIN;

-- Step 1: Drop the FK constraint from orders → students
--         (find the constraint name dynamically to be safe)
DO $$
DECLARE
    cname TEXT;
BEGIN
    SELECT conname INTO cname
    FROM   pg_constraint
    WHERE  conrelid  = 'public.orders'::regclass
      AND  contype   = 'f'
      AND  confrelid = 'public.students'::regclass
    LIMIT 1;

    IF cname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT %I', cname);
    END IF;
END $$;

-- Step 2: Remap every student whose id still equals auth_user_id (old-style row)
DO $$
DECLARE
    s   RECORD;
    nid UUID;
BEGIN
    FOR s IN
        SELECT id
        FROM   public.students
        WHERE  id = auth_user_id
    LOOP
        nid := gen_random_uuid();

        -- Remap orders before changing the PK
        UPDATE public.orders
        SET    student_id = nid
        WHERE  student_id = s.id;

        -- Update the student primary key
        UPDATE public.students
        SET    id = nid
        WHERE  id = s.id;
    END LOOP;
END $$;

-- Step 3: Restore the FK constraint
ALTER TABLE public.orders
    ADD CONSTRAINT orders_student_id_fkey
    FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

COMMIT;
