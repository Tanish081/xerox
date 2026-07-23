import { NextResponse } from 'next/server';
import { findDepartmentByName } from '@/lib/departments';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

function readEmailFromBearerToken(authHeader: string | null) {
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) return null;
  const parts = authHeader.slice(7).split('.');
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { email?: string };
    return payload.email?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

/** Resolves the operator's email and confirms they own the shop. */
async function authorizeShop(request: Request, shopId: string | null | undefined) {
  const operatorEmail = readEmailFromBearerToken(request.headers.get('authorization'));

  if (!operatorEmail) {
    return { error: NextResponse.json({ error: 'Operator authentication token missing' }, { status: 401 }) };
  }

  if (!shopId) {
    return { error: NextResponse.json({ error: 'shopId is required.' }, { status: 400 }) };
  }

  const { data: shop } = await supabaseAdmin!
    .from('shops')
    .select('id,name,upi_id,operator_email')
    .eq('id', shopId)
    .maybeSingle();

  if (!shop || shop.operator_email?.toLowerCase() !== operatorEmail) {
    return { error: NextResponse.json({ error: 'You do not manage this shop.' }, { status: 403 }) };
  }

  return { shop };
}

type OrderRow = {
  status: string;
  estimated_amount: number | string;
  total_pages: number | null;
  department_settled_at: string | null;
};

/**
 * Department spend for the selected window. Cancelled and not-yet-released
 * jobs never cost anything — mirrors the summary shown in the HOD's own
 * department history so the two views agree with each other.
 */
function summarise(orders: OrderRow[]) {
  const byStatus: Record<string, number> = {};
  let totalSpend = 0;
  let outstanding = 0;
  let totalPages = 0;
  let billable = 0;

  for (const order of orders) {
    byStatus[order.status] = (byStatus[order.status] ?? 0) + 1;

    if (order.status === 'cancelled' || order.status === 'pending_payment' || order.status === 'pending_hod_approval') {
      continue;
    }

    const amount = Number(order.estimated_amount ?? 0);
    totalSpend += amount;
    totalPages += Number(order.total_pages ?? 0);
    billable += 1;
    if (!order.department_settled_at) outstanding += amount;
  }

  return {
    totalOrders: orders.length,
    billableOrders: billable,
    totalSpend: Number(totalSpend.toFixed(2)),
    outstanding: Number(outstanding.toFixed(2)),
    settled: Number((totalSpend - outstanding).toFixed(2)),
    totalPages,
    byStatus,
  };
}

/**
 * Department-wise print statistics for the operator's own shop, with an
 * optional date range — the same data a bill would be generated from.
 */
export async function GET(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Service role key missing' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const shopId = searchParams.get('shopId');
  const departmentName = searchParams.get('department')?.trim();
  const from = searchParams.get('from')?.trim() || null;
  const to = searchParams.get('to')?.trim() || null;

  const auth = await authorizeShop(request, shopId);
  if (auth.error) return auth.error;

  if (!departmentName) {
    return NextResponse.json({ error: 'department is required.' }, { status: 400 });
  }

  const department = await findDepartmentByName(supabaseAdmin, departmentName);

  if (!department) {
    // Not an error — the department just hasn't been set up in the system yet.
    return NextResponse.json({
      found: false,
      department: departmentName,
      shop: { id: auth.shop.id, name: auth.shop.name },
      data: [],
      summary: null,
    });
  }

  let query = supabaseAdmin
    .from('orders')
    // orders references students twice (student_id, hod_approved_by), so the
    // embed must name the foreign key explicitly.
    .select('id,token,status,created_at,total_pages,estimated_amount,file_name,placed_by_name,department_settled_at,student:students!orders_student_id_fkey(id,name)')
    .eq('shop_id', shopId as string)
    .eq('department_id', department.id)
    .order('created_at', { ascending: false });

  if (from) query = query.gte('created_at', `${from}T00:00:00`);
  if (to) query = query.lte('created_at', `${to}T23:59:59.999`);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    found: true,
    department: { id: department.id, name: department.name },
    shop: { id: auth.shop.id, name: auth.shop.name, upiId: auth.shop.upi_id },
    data: data ?? [],
    summary: summarise((data ?? []) as OrderRow[]),
  });
}
