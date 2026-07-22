import { NextResponse } from 'next/server';
import { getDepartmentCredit } from '@/lib/department-credit';
import { getDepartmentById } from '@/lib/departments';
import { HOD_APPROVAL_PAGE_THRESHOLD, needsHodApproval, totalPrintedPages } from '@/lib/hod';
import { ordersStationaryCartHint } from '@/lib/postgrest-schema-errors';
import { supabaseAdmin } from '@/lib/supabase';
import type { PrintSettings } from '@/types';

type StationaryCartItem = {
  id: string;
  name: string;
  qty: number;
  unit_price: number;
};

/**
 * Turns the DB's daily queue number ("B01") into a date-scoped, shop-unique
 * token ("PQ-2207-B-001"). Already-scoped tokens pass through unchanged. This
 * keeps the (shop_id, token) unique constraint collision-free across days while
 * displayToken() still shows the short "B01" at the counter.
 */
function dateScopeToken(raw: string): string {
  const short = raw.match(/^([ABC])(\d+)$/);
  if (!short) return raw; // already a full token or an unexpected shape

  const now = new Date();
  const ddmm = `${String(now.getUTCDate()).padStart(2, '0')}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `PQ-${ddmm}-${short[1]}-${short[2].padStart(3, '0')}`;
}

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database admin access not configured.' }, { status: 500 });
  }

  try {
    const body = (await request.json()) as {
      orderId?: string;
      shopId?: string;
      studentId?: string;
      paymentPath?: string | null;
      utrNumber?: string | null;
      estimatedReadyTime?: string | null;
      printAmount?: number;
      stationaryCart?: StationaryCartItem[];
    };

    const orderId = body.orderId?.trim();
    const shopId = body.shopId?.trim();
    const studentId = body.studentId?.trim();
    const stationaryCart = Array.isArray(body.stationaryCart) ? body.stationaryCart : [];

    if (!orderId || !shopId || !studentId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const addonTotal = stationaryCart.reduce((sum, item) => sum + Number(item.unit_price || 0) * Number(item.qty || 0), 0);
    const printAmount = Number(body.printAmount || 0);
    const finalAmount = Number((printAmount + addonTotal).toFixed(2));

    // Look up the order first — its print settings drive the HOD threshold and
    // its token makes re-submits idempotent.
    const { data: orderRow, error: orderLookupError } = await supabaseAdmin
      .from('orders')
      .select('token, priority_class, print_settings, file_page_count')
      .eq('id', orderId)
      .eq('shop_id', shopId)
      .single();

    if (orderLookupError || !orderRow) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    // Staff orders are billed to their department instead of paid up front.
    // Decide this from the student row — never from the client — and enforce
    // the department credit limit before consuming a token or any stock.
    const { data: student, error: studentError } = await supabaseAdmin
      .from('students')
      .select('user_type, department, department_id, auth_user_id')
      .eq('id', studentId)
      .eq('shop_id', shopId)
      .maybeSingle();

    if (studentError) {
      return NextResponse.json({ error: studentError.message }, { status: 400 });
    }

    if (!student) {
      return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
    }

    const isStaffOrder = student.user_type === 'staff' && Boolean(student.department_id);

    // Sheets actually printed (selected pages x copies). Computed server-side
    // from the stored order so the client can't understate it to dodge review.
    const totalPages = totalPrintedPages(
      (orderRow.print_settings ?? {}) as PrintSettings,
      orderRow.file_page_count ?? 1,
    );
    const overThreshold = isStaffOrder && needsHodApproval(totalPages);

    // The HOD is the approver, so their own large jobs are self-authorised and
    // go straight to the operator rather than into their own queue.
    let selfApproved = false;
    let requiresHod = overThreshold;

    if (overThreshold) {
      const department = await getDepartmentById(supabaseAdmin, student.department_id as string);

      if (!department?.hod_email) {
        return NextResponse.json(
          {
            error:
              `Jobs over ${HOD_APPROVAL_PAGE_THRESHOLD} pages need HOD approval, but ${student.department ?? 'your department'} ` +
              `has no HOD assigned yet. Ask the xerox operator to designate an HOD for your department.`,
            code: 'NO_HOD_REGISTERED',
          },
          { status: 409 },
        );
      }

      // The HOD approves for their department, so their own large jobs are
      // self-authorised. Compare the submitting account's email to the
      // designated hod_email.
      let submitterEmail: string | null = null;
      if (student.auth_user_id) {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(student.auth_user_id);
        submitterEmail = authUser.user?.email?.toLowerCase() ?? null;
      }

      if (submitterEmail && submitterEmail === department.hod_email.toLowerCase()) {
        selfApproved = true;
        requiresHod = false;
      }
    }

    // HOD sign-off authorises the spend, so large jobs skip the credit gate and
    // are held for the department head instead.
    if (isStaffOrder && !requiresHod) {
      // The draft is already counted at its provisional (print-only) amount, so
      // exclude it and test the final amount — add-ons included.
      const credit = await getDepartmentCredit(supabaseAdmin, shopId, student.department_id as string, orderId);

      if (credit.used + finalAmount > credit.creditLimit) {
        return NextResponse.json(
          {
            error:
              `Your department has reached its print limit of ₹${credit.creditLimit.toFixed(2)}. ` +
              `The xerox operator needs to raise a payment request with ${credit.department} before new orders can be placed.`,
            code: 'DEPARTMENT_LIMIT_REACHED',
            credit,
          },
          { status: 409 },
        );
      }
    }

    // Generate token server-side. If the order already has a token (re-submit after network
    // error), reuse it so we never hit the unique constraint twice for the same order.
    let token: string = orderRow.token ?? '';
    if (!token) {
      const { data: tokenData, error: tokenError } = await supabaseAdmin.rpc('generate_printq_token', {
        p_shop_id: shopId,
        p_priority_class: orderRow.priority_class,
      });
      if (tokenError || !tokenData) {
        return NextResponse.json({ error: tokenError?.message ?? 'Failed to generate token.' }, { status: 500 });
      }
      // The DB function returns a date-less queue number (e.g. "B01") whose
      // counter resets each day, but `orders_shop_token_unique` is (shop_id,
      // token) across all dates — so the same number recurs on a later day and
      // collides. Store the date-scoped form (PQ-DDMM-B-001) instead; it stays
      // unique per shop, and displayToken() renders it back to "B01" for users.
      token = dateScopeToken(tokenData as string);
    }

    if (stationaryCart.length > 0) {
      const itemIds = stationaryCart.map((item) => item.id);
      const { data: stockRows, error: stockError } = await supabaseAdmin
        .from('stationary_items')
        .select('id,name,stock_quantity,is_available')
        .eq('shop_id', shopId)
        .in('id', itemIds);

      if (stockError) {
        return NextResponse.json({ error: stockError.message }, { status: 400 });
      }

      const byId = new Map((stockRows ?? []).map((row) => [row.id, row]));
      for (const cartItem of stationaryCart) {
        const row = byId.get(cartItem.id);
        if (!row || !row.is_available) {
          return NextResponse.json({ error: `${cartItem.name} is not available.` }, { status: 400 });
        }
        if (cartItem.qty <= 0 || row.stock_quantity < cartItem.qty) {
          return NextResponse.json({ error: `Insufficient stock for ${cartItem.name}.` }, { status: 400 });
        }
      }

      for (const cartItem of stationaryCart) {
        const row = byId.get(cartItem.id)!;
        const nextStock = row.stock_quantity - cartItem.qty;
        const { error: updateError } = await supabaseAdmin
          .from('stationary_items')
          .update({
            stock_quantity: nextStock,
            is_available: nextStock > 0 && row.is_available,
          })
          .eq('id', cartItem.id)
          .eq('shop_id', shopId)
          .gte('stock_quantity', cartItem.qty);

        if (updateError) {
          return NextResponse.json({ error: updateError.message }, { status: 400 });
        }
      }
    }

    const orderUpdate: Record<string, unknown> = {
      // Large staff jobs wait on the department head; everything else goes
      // straight into the operator's approval queue.
      status: requiresHod ? 'pending_hod_approval' : 'pending_approval',
      utr_number: body.utrNumber?.trim() || null,
      token,
      estimated_ready_time: body.estimatedReadyTime ?? null,
      stationary_cart: stationaryCart,
      estimated_amount: finalAmount,
      billing_mode: isStaffOrder ? 'department_credit' : 'upi',
      billed_department: isStaffOrder ? student.department : null,
      department_id: isStaffOrder ? student.department_id : null,
      total_pages: totalPages,
    };

    // Record self-authorisation explicitly: hod_approved_by matching the order's
    // own student is what marks a job the HOD approved for themselves.
    if (selfApproved) {
      orderUpdate.hod_approved_by = studentId;
      orderUpdate.hod_approved_at = new Date().toISOString();
    }
    // Only set screenshot URL if the client has it — otherwise keep whatever
    // verify-payment already saved (avoids overwriting with null on stale state).
    if (body.paymentPath) orderUpdate.payment_screenshot_url = body.paymentPath;

    const { error: orderError } = await supabaseAdmin
      .from('orders')
      .update(orderUpdate)
      .eq('id', orderId)
      .eq('shop_id', shopId)
      .eq('student_id', studentId);

    if (orderError) {
      const hint = ordersStationaryCartHint(orderError);
      return NextResponse.json(
        { error: hint ?? orderError.message, code: hint ? 'SCHEMA_DRIFT' : undefined },
        { status: hint ? 503 : 400 },
      );
    }

    return NextResponse.json({
      success: true,
      amount: finalAmount,
      token,
      totalPages,
      pendingHodApproval: requiresHod,
      selfApproved,
    });
  } catch (error) {
    console.error('Submit order error', error);
    return NextResponse.json({ error: 'Failed to submit order' }, { status: 500 });
  }
}
