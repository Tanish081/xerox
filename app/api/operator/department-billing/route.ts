import { NextResponse } from 'next/server';
import { getDepartmentUsage } from '@/lib/department-credit';
import { getDepartmentById } from '@/lib/departments';
import { supabaseAdmin } from '@/lib/supabase';

function readEmailFromBearerToken(authHeader: string | null) {
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  const parts = authHeader.slice(7).split('.');
  if (parts.length < 2) {
    return null;
  }

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
    .select('id,operator_email')
    .eq('id', shopId)
    .maybeSingle();

  if (!shop || shop.operator_email?.toLowerCase() !== operatorEmail) {
    return { error: NextResponse.json({ error: 'You do not manage this shop.' }, { status: 403 }) };
  }

  return { operatorEmail };
}

/** Departments at this shop with their limit, outstanding usage, and open requests. */
export async function GET(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Service role key missing' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const shopId = searchParams.get('shopId');

  const auth = await authorizeShop(request, shopId);
  if (auth.error) return auth.error;

  // Departments are college-wide; the credit limit is per center.
  const { data: credits, error } = await supabaseAdmin
    .from('department_credits')
    .select('id,credit_limit,department:departments(id,name,hod_email,hod_name)')
    .eq('shop_id', shopId as string);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const departments = (credits ?? [])
    .map((row: any) => ({
      creditRowId: row.id,
      id: row.department?.id as string,
      name: row.department?.name as string,
      hodEmail: row.department?.hod_email as string | null,
      hodName: row.department?.hod_name as string | null,
      credit_limit: row.credit_limit,
    }))
    .filter((row) => row.id)
    .sort((a, b) => a.name.localeCompare(b.name));

  const { data: requests } = await supabaseAdmin
    .from('payment_requests')
    .select('id,department,amount,order_count,status,note,created_at,settled_at')
    .eq('shop_id', shopId as string)
    .order('created_at', { ascending: false });

  const openRequests = (requests ?? []).filter((row) => row.status === 'pending');

  const data = await Promise.all(
    departments.map(async (row) => {
      const { used, orderCount } = await getDepartmentUsage(supabaseAdmin!, shopId as string, row.id);
      const creditLimit = Number(row.credit_limit);

      return {
        id: row.id,
        name: row.name,
        hodEmail: row.hodEmail,
        hodName: row.hodName,
        creditLimit,
        used,
        orderCount,
        remaining: Number(Math.max(0, creditLimit - used).toFixed(2)),
        limitReached: used >= creditLimit,
        pendingRequest: openRequests.find((req) => req.department === row.name) ?? null,
      };
    }),
  );

  return NextResponse.json({ data, requests: requests ?? [] });
}

/**
 * Raises a payment request against a department: snapshots the outstanding
 * orders and links them to the request so the amount can't drift afterwards.
 */
export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Service role key missing' }, { status: 500 });
  }

  const body = (await request.json()) as { shopId?: string; departmentId?: string; note?: string };
  const shopId = body.shopId?.trim();
  const departmentId = body.departmentId?.trim();

  const auth = await authorizeShop(request, shopId);
  if (auth.error) return auth.error;

  if (!departmentId) {
    return NextResponse.json({ error: 'departmentId is required.' }, { status: 400 });
  }

  const departmentRow = await getDepartmentById(supabaseAdmin, departmentId);

  if (!departmentRow) {
    return NextResponse.json({ error: 'Department not found.' }, { status: 404 });
  }

  const department = departmentRow.name;

  const { data: existing } = await supabaseAdmin
    .from('payment_requests')
    .select('id')
    .eq('shop_id', shopId as string)
    .eq('department', department)
    .eq('status', 'pending')
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: 'A payment request is already open for this department.' }, { status: 409 });
  }

  const { data: orders, error: ordersError } = await supabaseAdmin
    .from('orders')
    .select('id,estimated_amount')
    .eq('shop_id', shopId as string)
    .eq('department_id', departmentId)
    .eq('billing_mode', 'department_credit')
    .is('department_settled_at', null)
    .is('payment_request_id', null)
    .not('status', 'in', '(cancelled,pending_payment,pending_hod_approval)');

  if (ordersError) {
    return NextResponse.json({ error: ordersError.message }, { status: 400 });
  }

  const covered = orders ?? [];

  if (covered.length === 0) {
    return NextResponse.json({ error: 'This department has no unbilled orders.' }, { status: 400 });
  }

  const amount = Number(
    covered.reduce((sum: number, row: { estimated_amount: number | string }) => sum + Number(row.estimated_amount ?? 0), 0).toFixed(2),
  );

  const { data: created, error: createError } = await supabaseAdmin
    .from('payment_requests')
    .insert({
      shop_id: shopId,
      department,
      amount,
      order_count: covered.length,
      note: body.note?.trim() || null,
      status: 'pending',
    })
    .select('id,department,amount,order_count,status,note,created_at')
    .single();

  if (createError || !created) {
    return NextResponse.json({ error: createError?.message ?? 'Failed to raise payment request.' }, { status: 500 });
  }

  const { error: linkError } = await supabaseAdmin
    .from('orders')
    .update({ payment_request_id: created.id })
    .in('id', covered.map((row) => row.id));

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 400 });
  }

  return NextResponse.json({ data: created });
}

/**
 * Marks a payment request settled (department paid) or updates a department's
 * credit limit. Settling frees the credit its orders were holding.
 */
export async function PATCH(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Service role key missing' }, { status: 500 });
  }

  const body = (await request.json()) as {
    shopId?: string;
    requestId?: string;
    departmentId?: string;
    creditLimit?: number;
  };

  const shopId = body.shopId?.trim();

  const auth = await authorizeShop(request, shopId);
  if (auth.error) return auth.error;

  // Credit-limit update — scoped to this shop, since limits are per center.
  if (body.departmentId && typeof body.creditLimit === 'number') {
    if (!Number.isFinite(body.creditLimit) || body.creditLimit < 0) {
      return NextResponse.json({ error: 'Enter a valid credit limit.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('department_credits')
      .update({ credit_limit: body.creditLimit })
      .eq('shop_id', shopId as string)
      .eq('department_id', body.departmentId.trim());

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  }

  // Settle a payment request
  const requestId = body.requestId?.trim();

  if (!requestId) {
    return NextResponse.json({ error: 'requestId is required.' }, { status: 400 });
  }

  const { data: paymentRequest } = await supabaseAdmin
    .from('payment_requests')
    .select('id,status')
    .eq('id', requestId)
    .eq('shop_id', shopId as string)
    .maybeSingle();

  if (!paymentRequest) {
    return NextResponse.json({ error: 'Payment request not found.' }, { status: 404 });
  }

  if (paymentRequest.status === 'settled') {
    return NextResponse.json({ error: 'This payment request is already settled.' }, { status: 409 });
  }

  const settledAt = new Date().toISOString();

  const { error: ordersError } = await supabaseAdmin
    .from('orders')
    .update({ department_settled_at: settledAt })
    .eq('payment_request_id', requestId);

  if (ordersError) {
    return NextResponse.json({ error: ordersError.message }, { status: 400 });
  }

  const { error: requestError } = await supabaseAdmin
    .from('payment_requests')
    .update({ status: 'settled', settled_at: settledAt })
    .eq('id', requestId);

  if (requestError) {
    return NextResponse.json({ error: requestError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
