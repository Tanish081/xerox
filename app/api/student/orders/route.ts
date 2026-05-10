import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database admin access not configured.' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { 
      token, shop_id, student_id, priority_class, scheduled_after,
      print_settings, file_url, file_name, file_page_count,
      estimated_amount, payment_screenshot_url, utr_number 
    } = body;

    if (!shop_id || !student_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Insert order using admin key to bypass RLS
    const { data, error } = await supabaseAdmin
      .from('orders')
      .insert({
        token,
        shop_id,
        student_id,
        priority_class,
        scheduled_after,
        print_settings,
        file_url,
        file_name,
        file_page_count,
        estimated_amount,
        payment_screenshot_url,
        utr_number,
        status: 'pending_approval' // Ensure initial status is set properly
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error creating order:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error('Failed to parse request:', error);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
