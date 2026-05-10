import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database admin access not configured.' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { id, name, roll_no, phone, shop_id } = body;

    if (!id || !name || !roll_no || !phone || !shop_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Using supabaseAdmin automatically bypasses the strict Row Level Security (RLS) rules
    const { data, error } = await supabaseAdmin
      .from('students')
      .insert({
        id,
        name,
        roll_no,
        phone,
        shop_id,
      })
      .select('id,name')
      .single();

    if (error) {
      console.error('Error inserting student:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error('Failed to parse request:', error);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
