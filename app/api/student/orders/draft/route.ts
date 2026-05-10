import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Database admin access not configured.' }, { status: 500 });

  try {
    const body = await request.json();
    const { student_id, shop_id, priority_class, scheduled_after, print_settings, estimated_amount } = body;

    const { data, error } = await supabaseAdmin
      .from('orders')
      .insert({
        student_id,
        shop_id,
        status: 'pending_payment',
        priority_class,
        scheduled_after,
        print_settings,
        estimated_amount,
      })
      .select('id')
      .single();

    if (error) throw error;
    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}
