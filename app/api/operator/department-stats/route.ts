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

  return { shop, operatorEmail };
}

type OrderRow = {
  status: string;
  estimated_amount: number | string;
  total_pages: number | null;
};

/**
 * Department spend for the selected window. Cancelled and not-yet-released
 * jobs never cost anything — mirrors the summary shown in the HOD's own
 * department history so the two views agree with each other.
 *
 * Settled/Outstanding are NOT derived from these orders — they come from the
 * `department_settlements` ledger (amounts the operator has actually recorded
 * as received), applied against `totalSpend` here.
 */
function summariseOrders(orders: OrderRow[]) {
  const byStatus: Record<string, number> = {};
  let totalSpend = 0;
  let totalPages = 0;
  let billable = 0;

  for (const order of orders) {
    byStatus[order.status] = (byStatus[order.status] ?? 0) + 1;

    if (order.status === 'cancelled' || order.status === 'pending_payment' || order.status === 'pending_hod_approval') {
      continue;
    }

    totalSpend += Number(order.estimated_amount ?? 0);
    totalPages += Number(order.total_pages ?? 0);
    billable += 1;
  }

  return {
    totalOrders: orders.length,
    billableOrders: billable,
    totalSpend: Number(totalSpend.toFixed(2)),
    totalPages,
    byStatus,
  };
}

async function fetchSettlements(shopId: string, departmentId: string, from: string | null, to: string | null) {
  let query = supabaseAdmin!
    .from('department_settlements')
    .select('id,amount,note,created_at')
    .eq('shop_id', shopId)
    .eq('department_id', departmentId)
    .order('created_at', { ascending: false });

  // Settlements are scoped to the same window as the orders they're being
  // matched against, so a bill for July doesn't get offset by a payment
  // recorded in June.
  if (from) query = query.gte('created_at', `${from}T00:00:00`);
  if (to) query = query.lte('created_at', `${to}T23:59:59.999`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
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
      settlements: [],
    });
  }

  let query = supabaseAdmin
    .from('orders')
    // orders references students twice (student_id, hod_approved_by), so the
    // embed must name the foreign key explicitly.
    .select('id,token,status,created_at,total_pages,estimated_amount,file_name,placed_by_name,student:students!orders_student_id_fkey(id,name)')
    .eq('shop_id', shopId as string)
    .eq('department_id', department.id)
    .order('created_at', { ascending: false });

  if (from) query = query.gte('created_at', `${from}T00:00:00`);
  if (to) query = query.lte('created_at', `${to}T23:59:59.999`);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  let settlements: Awaited<ReturnType<typeof fetchSettlements>>;
  try {
    settlements = await fetchSettlements(shopId as string, department.id, from, to);
  } catch (settlementError) {
    return NextResponse.json({ error: (settlementError as Error).message }, { status: 400 });
  }

  const orderSummary = summariseOrders((data ?? []) as OrderRow[]);
  const totalSettled = Number(settlements.reduce((sum, row) => sum + Number(row.amount), 0).toFixed(2));
  const outstanding = Number(Math.max(orderSummary.totalSpend - totalSettled, 0).toFixed(2));

  return NextResponse.json({
    found: true,
    department: { id: department.id, name: department.name },
    shop: { id: auth.shop.id, name: auth.shop.name, upiId: auth.shop.upi_id },
    data: data ?? [],
    summary: { ...orderSummary, settled: totalSettled, outstanding },
    settlements,
  });
}

/** Records an amount received from the department — the "Settle up" action. */
export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Service role key missing' }, { status: 500 });
  }

  const body = (await request.json()) as { shopId?: string; department?: string; amount?: number; note?: string };
  const shopId = body.shopId?.trim();

  const auth = await authorizeShop(request, shopId);
  if (auth.error) return auth.error;

  const departmentName = body.department?.trim();
  if (!departmentName) {
    return NextResponse.json({ error: 'department is required.' }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Enter a valid amount received.' }, { status: 400 });
  }

  const department = await findDepartmentByName(supabaseAdmin, departmentName);
  if (!department) {
    return NextResponse.json({ error: `${departmentName} hasn't been set up in the system yet.` }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('department_settlements')
    .insert({
      shop_id: shopId,
      department_id: department.id,
      amount: Number(amount.toFixed(2)),
      note: body.note?.trim() || null,
      settled_by: auth.operatorEmail,
    })
    .select('id,amount,note,created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data });
}
