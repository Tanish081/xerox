import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Service role key missing' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const shopId = searchParams.get('shop_id');
  const studentId = searchParams.get('student_id');

  let query = supabaseAdmin.from('orders').select('*').order('created_at', { ascending: false });

  if (shopId) {
    query = query.eq('shop_id', shopId);
  }

  if (studentId) {
    query = query.eq('student_id', studentId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Service role key missing' }, { status: 500 });
  }

  const body = await request.json();
  const { data, error } = await supabaseAdmin.from('orders').insert(body).select('*').single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
