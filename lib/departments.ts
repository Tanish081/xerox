import type { SupabaseClient } from '@supabase/supabase-js';

type Admin = SupabaseClient<any, any, any>;

export const DEFAULT_DEPARTMENT_CREDIT_LIMIT = 5000;

export type DepartmentRow = {
  id: string;
  name: string;
  hod_auth_user_id: string | null;
  hod_email: string | null;
  hod_name: string | null;
  hod_phone: string | null;
  staff_email: string | null;
};

/** Case-insensitive lookup — department names are claimed exclusively. */
export async function findDepartmentByName(admin: Admin, name: string): Promise<DepartmentRow | null> {
  const { data } = await admin
    .from('departments')
    .select('id,name,hod_auth_user_id,hod_email,hod_name,hod_phone,staff_email')
    .ilike('name', name.trim())
    .maybeSingle();

  return (data as DepartmentRow) ?? null;
}

export async function getDepartmentById(admin: Admin, id: string): Promise<DepartmentRow | null> {
  const { data } = await admin
    .from('departments')
    .select('id,name,hod_auth_user_id,hod_email,hod_name,hod_phone,staff_email')
    .eq('id', id)
    .maybeSingle();

  return (data as DepartmentRow) ?? null;
}

/**
 * The department this email is the designated HOD of, if any. This is the RBAC
 * check: HOD is a role a staff account holds when its email matches a
 * department's designated hod_email — not a separate account type.
 */
export async function getDepartmentForHodEmail(admin: Admin, email: string | null | undefined): Promise<DepartmentRow | null> {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;

  const { data } = await admin
    .from('departments')
    .select('id,name,hod_auth_user_id,hod_email,hod_name,hod_phone,staff_email')
    .ilike('hod_email', normalized)
    .maybeSingle();

  return (data as DepartmentRow) ?? null;
}

/**
 * Credit limit for a department at one shop, creating the row with the default
 * the first time that department orders from that center.
 */
export async function ensureDepartmentCredit(admin: Admin, departmentId: string, shopId: string): Promise<number> {
  const { data: existing } = await admin
    .from('department_credits')
    .select('credit_limit')
    .eq('department_id', departmentId)
    .eq('shop_id', shopId)
    .maybeSingle();

  if (existing) return Number(existing.credit_limit);

  const { data: created, error } = await admin
    .from('department_credits')
    .upsert(
      { department_id: departmentId, shop_id: shopId, credit_limit: DEFAULT_DEPARTMENT_CREDIT_LIMIT },
      { onConflict: 'department_id,shop_id' },
    )
    .select('credit_limit')
    .single();

  if (error || !created) {
    console.error('ensureDepartmentCredit:', error);
    return DEFAULT_DEPARTMENT_CREDIT_LIMIT;
  }

  return Number(created.credit_limit);
}
