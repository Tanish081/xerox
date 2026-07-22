import { NextResponse } from 'next/server';
import { getDepartmentForHodEmail } from '@/lib/departments';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Role-based access: the caller is an HOD if their signed-in email is the
 * designated hod_email of some department. The role is read from the verified
 * token's email, never the request, so it can't be spoofed.
 */
async function authorizeHod(request: Request) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return { error: NextResponse.json({ error: 'Authorization required.' }, { status: 401 }) };
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin!.auth.getUser(token);

  if (userError || !user?.id) {
    return { error: NextResponse.json({ error: 'Invalid or expired session.' }, { status: 401 }) };
  }

  const department = await getDepartmentForHodEmail(supabaseAdmin!, user.email);

  if (!department) {
    return { error: NextResponse.json({ error: 'You are not a department HOD.' }, { status: 403 }) };
  }

  return { department };
}

/** Print requests from this HOD's department awaiting approval, across all centers. */
export async function GET(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database admin access not configured.' }, { status: 500 });
  }

  const auth = await authorizeHod(request);
  if (auth.error) return auth.error;

  const { department } = auth;
  const scope = new URL(request.url).searchParams.get('scope') ?? 'pending';

  let query = supabaseAdmin
    .from('orders')
    // orders references students twice (student_id, hod_approved_by), so the
    // embed must name the foreign key explicitly.
    .select('*,student:students!orders_student_id_fkey(id,name,phone),shop:shops(id,name)')
    .eq('department_id', department.id);

  query =
    scope === 'history'
      ? query.order('created_at', { ascending: false }).limit(200)
      : query.eq('status', 'pending_hod_approval').order('created_at', { ascending: true });

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const body: Record<string, unknown> = {
    data: data ?? [],
    department: { id: department.id, name: department.name },
  };

  if (scope === 'history') {
    body.summary = summarise((data ?? []) as OrderRow[]);
  }

  return NextResponse.json(body);
}

type OrderRow = {
  status: string;
  estimated_amount: number | string;
  total_pages: number | null;
  department_settled_at: string | null;
};

/**
 * Department spend at a glance. Cancelled jobs never cost anything, and
 * "outstanding" is what the operator has not yet billed and settled.
 */
function summarise(orders: OrderRow[]) {
  const byStatus: Record<string, number> = {};
  let totalSpend = 0;
  let outstanding = 0;
  let totalPages = 0;
  let billable = 0;

  for (const order of orders) {
    byStatus[order.status] = (byStatus[order.status] ?? 0) + 1;

    // Cancelled and not-yet-released jobs cost the department nothing.
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

/** Approve (release to the operator) or reject a large print request. */
export async function PATCH(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database admin access not configured.' }, { status: 500 });
  }

  const auth = await authorizeHod(request);
  if (auth.error) return auth.error;

  const { department } = auth;
  const body = (await request.json()) as { orderId?: string; action?: 'approve' | 'reject'; reason?: string };
  const orderId = body.orderId?.trim();

  if (!orderId || (body.action !== 'approve' && body.action !== 'reject')) {
    return NextResponse.json({ error: 'orderId and a valid action are required.' }, { status: 400 });
  }

  // Scoped to this HOD's own department so one head can never act on another's.
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id,status')
    .eq('id', orderId)
    .eq('department_id', department.id)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ error: 'Request not found for your department.' }, { status: 404 });
  }

  if (order.status !== 'pending_hod_approval') {
    return NextResponse.json({ error: 'This request has already been decided.' }, { status: 409 });
  }

  const reason = body.reason?.trim() || 'Rejected by the department head.';

  const update =
    body.action === 'approve'
      ? { status: 'pending_approval', hod_approved_at: new Date().toISOString(), hod_rejection_reason: null }
      : { status: 'cancelled', hod_rejection_reason: reason, rejection_reason: reason };

  const { error } = await supabaseAdmin.from('orders').update(update).eq('id', orderId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
