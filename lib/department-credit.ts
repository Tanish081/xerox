import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_DEPARTMENT_CREDIT_LIMIT, ensureDepartmentCredit, getDepartmentById } from '@/lib/departments';

export { DEFAULT_DEPARTMENT_CREDIT_LIMIT };

export type DepartmentCredit = {
  departmentId: string;
  department: string;
  creditLimit: number;
  used: number;
  remaining: number;
  orderCount: number;
  limitReached: boolean;
};

type Admin = SupabaseClient<any, any, any>;

/**
 * Sum of unsettled department-credit orders for one department at one shop.
 *
 * `excludeOrderId` drops one order from the total — used when submitting, where
 * the draft is already counted at its provisional amount and the caller wants
 * to test the final amount instead.
 */
export async function getDepartmentUsage(
  admin: Admin,
  shopId: string,
  departmentId: string,
  excludeOrderId?: string,
): Promise<{ used: number; orderCount: number }> {
  let query = admin
    .from('orders')
    .select('estimated_amount')
    .eq('shop_id', shopId)
    .eq('department_id', departmentId)
    .eq('billing_mode', 'department_credit')
    .is('department_settled_at', null)
    // Only orders that were actually placed draw down credit — cancelled ones,
    // abandoned drafts, and jobs still awaiting the HOD must not hold it.
    .not('status', 'in', '(cancelled,pending_payment,pending_hod_approval)');

  if (excludeOrderId) query = query.neq('id', excludeOrderId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const used = rows.reduce(
    (sum: number, row: { estimated_amount: number | string }) => sum + Number(row.estimated_amount ?? 0),
    0,
  );

  return { used: Number(used.toFixed(2)), orderCount: rows.length };
}

/** Full credit picture for one department at one shop. */
export async function getDepartmentCredit(
  admin: Admin,
  shopId: string,
  departmentId: string,
  excludeOrderId?: string,
): Promise<DepartmentCredit> {
  const department = await getDepartmentById(admin, departmentId);
  const creditLimit = await ensureDepartmentCredit(admin, departmentId, shopId);
  const { used, orderCount } = await getDepartmentUsage(admin, shopId, departmentId, excludeOrderId);
  const remaining = Number(Math.max(0, creditLimit - used).toFixed(2));

  return {
    departmentId,
    department: department?.name ?? 'Department',
    creditLimit,
    used,
    remaining,
    orderCount,
    limitReached: used >= creditLimit,
  };
}
