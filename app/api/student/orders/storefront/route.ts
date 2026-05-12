import { NextResponse } from 'next/server';
import { ordersStationaryCartHint } from '@/lib/postgrest-schema-errors';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database admin access not configured.' }, { status: 500 });
  }

  try {
    const formData = await request.formData();
    const studentId = formData.get('studentId') as string;
    const shopId = formData.get('shopId') as string;
    const token = formData.get('token') as string;
    const stationaryCart = JSON.parse(formData.get('stationaryCart') as string);
    const estimatedAmount = parseFloat(formData.get('estimatedAmount') as string);
    const utrNumber = formData.get('utrNumber') as string;
    const screenshot = formData.get('screenshot') as File | null;

    if (!studentId || !shopId || !stationaryCart?.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    let paymentScreenshotUrl: string | null = null;

    const itemIds = stationaryCart.map((item: { id: string }) => item.id);
    const { data: stockRows, error: stockError } = await supabaseAdmin
      .from('stationary_items')
      .select('id,name,stock_quantity,is_available')
      .eq('shop_id', shopId)
      .in('id', itemIds);

    if (stockError) {
      return NextResponse.json({ error: stockError.message }, { status: 400 });
    }

    const byId = new Map((stockRows ?? []).map((row) => [row.id, row]));
    for (const item of stationaryCart as Array<{ id: string; name: string; qty: number }>) {
      const row = byId.get(item.id);
      if (!row || !row.is_available) {
        return NextResponse.json({ error: `${item.name} is not available.` }, { status: 400 });
      }
      if (item.qty <= 0 || row.stock_quantity < item.qty) {
        return NextResponse.json({ error: `Insufficient stock for ${item.name}.` }, { status: 400 });
      }
    }

    // Upload payment screenshot if provided
    if (screenshot) {
      const screenshotBuffer = Buffer.from(await screenshot.arrayBuffer());
      const screenshotPath = `${shopId}/storefront-${Date.now()}/payment.jpg`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from('payment-screenshots')
        .upload(screenshotPath, screenshotBuffer, {
          contentType: screenshot.type || 'image/jpeg',
          upsert: true,
        });

      if (!uploadError) {
        paymentScreenshotUrl = screenshotPath;
      }
    }

    // Create the stationery-only order via admin key
    const { data, error } = await supabaseAdmin
      .from('orders')
      .insert({
        token,
        student_id: studentId,
        shop_id: shopId,
        status: 'pending_approval',
        priority_class: 'B',
        print_settings: {},
        estimated_amount: estimatedAmount,
        stationary_cart: stationaryCart,
        payment_screenshot_url: paymentScreenshotUrl,
        utr_number: utrNumber || null,
      })
      .select('id')
      .single();

    if (error) {
      const hint = ordersStationaryCartHint(error);
      if (hint) {
        return NextResponse.json({ error: hint, code: 'SCHEMA_DRIFT' }, { status: 503 });
      }
      throw error;
    }

    for (const item of stationaryCart as Array<{ id: string; qty: number }>) {
      const row = byId.get(item.id)!;
      const nextStock = row.stock_quantity - item.qty;
      await supabaseAdmin
        .from('stationary_items')
        .update({ stock_quantity: nextStock, is_available: nextStock > 0 && row.is_available })
        .eq('id', item.id)
        .eq('shop_id', shopId);
    }

    return NextResponse.json({ success: true, token, orderId: data.id }, { status: 200 });
  } catch (err) {
    console.error('Storefront order error:', err);
    const hint = ordersStationaryCartHint(err);
    if (hint) {
      return NextResponse.json({ error: hint, code: 'SCHEMA_DRIFT' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Failed to place order. Please try again.' }, { status: 500 });
  }
}
