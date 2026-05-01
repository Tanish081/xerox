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

  const { data, error } = await supabaseAdmin
    .from('shops')
    .select('id,name,is_open,operator_email,upi_id,avg_time_per_10_pages,created_at')
    .order('name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data, operatorEmail });
}