import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

function readEmailFromBearerToken(authHeader: string | null) {
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  const parts = token.split('.');
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

export async function GET(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Service role key missing' }, { status: 500 });
  }

  const operatorEmail = readEmailFromBearerToken(request.headers.get('authorization'));
  if (!operatorEmail) {
    return NextResponse.json({ error: 'Operator authentication token missing' }, { status: 401 });
  }

  const shopId = new URL(request.url).searchParams.get('shopId');
  if (!shopId) {
    return NextResponse.json({ error: 'shopId is required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.from('orders').select('*,student:students(*)').eq('shop_id', shopId).order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data, operatorEmail });
}

export async function PATCH(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Service role key missing' }, { status: 500 });
  }

  const operatorEmail = readEmailFromBearerToken(request.headers.get('authorization'));
  if (!operatorEmail) {
    return NextResponse.json({ error: 'Operator authentication token missing' }, { status: 401 });
  }

  const payload = (await request.json()) as { orderId?: string; status?: string; rejectionReason?: string | null };
  const orderId = payload.orderId?.trim();
  const status = payload.status?.trim();

  if (!orderId || !status) {
    return NextResponse.json({ error: 'orderId and status are required' }, { status: 400 });
  }

  const updatePayload: Record<string, unknown> = { status };
  if (typeof payload.rejectionReason !== 'undefined') {
    updatePayload.rejection_reason = payload.rejectionReason?.trim() || null;
  }

  const { data, error } = await supabaseAdmin.from('orders').update(updatePayload).eq('id', orderId).select('*').single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data, operatorEmail });
}