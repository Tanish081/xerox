import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function PATCH(request: Request) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Database admin access not configured.' }, { status: 500 });

  try {
    const body = await request.json();
    const { orderId, updates } = body;

    const { error } = await supabaseAdmin
      .from('orders')
      .update(updates)
      .eq('id', orderId);

    if (error) throw error;
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
  }
}
