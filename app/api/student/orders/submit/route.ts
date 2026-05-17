import { NextResponse } from 'next/server';
import { ordersStationaryCartHint } from '@/lib/postgrest-schema-errors';
import { supabaseAdmin } from '@/lib/supabase';

type StationaryCartItem = {
  id: string;
  name: string;
  qty: number;
  unit_price: number;
};

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

    // Look up the order to get priority_class and any existing token (idempotency)
    const { data: orderRow, error: orderLookupError } = await supabaseAdmin
      .from('orders')
      .select('token, priority_class')
      .eq('id', orderId)
      .eq('shop_id', shopId)
      .single();

    if (orderLookupError || !orderRow) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
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
      token = tokenData as string;
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

    const addonTotal = stationaryCart.reduce((sum, item) => sum + Number(item.unit_price || 0) * Number(item.qty || 0), 0);
    const printAmount = Number(body.printAmount || 0);
    const finalAmount = Number((printAmount + addonTotal).toFixed(2));

    const { error: orderError } = await supabaseAdmin
      .from('orders')
      .update({
        status: 'pending_approval',
        payment_screenshot_url: body.paymentPath ?? null,
        utr_number: body.utrNumber?.trim() || null,
        token,
        estimated_ready_time: body.estimatedReadyTime ?? null,
        stationary_cart: stationaryCart,
        estimated_amount: finalAmount,
      })
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

    return NextResponse.json({ success: true, amount: finalAmount, token });
  } catch (error) {
    console.error('Submit order error', error);
    return NextResponse.json({ error: 'Failed to submit order' }, { status: 500 });
  }
}
