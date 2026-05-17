import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database admin access not configured.' }, { status: 500 });
  }

  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : null;

    if (!token) {
      return NextResponse.json({ error: 'Authorization required.' }, { status: 401 });
    }

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user?.id) {
      return NextResponse.json({ error: 'Invalid or expired session.' }, { status: 401 });
    }

    const body = (await request.json()) as { shop_id?: string; phone?: string };
    const shop_id = body.shop_id?.trim();
    const phone = body.phone?.trim();

    if (!shop_id || !phone) {
      return NextResponse.json({ error: 'Shop and phone are required.' }, { status: 400 });
    }

    const { data: row, error } = await supabaseAdmin
      .from('students')
      .select('id,name,user_type,auth_user_id')
      .eq('shop_id', shop_id)
      .eq('phone', phone)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!row) {
      return NextResponse.json({ status: 'new' as const });
    }

    // Phone belongs to a different auth account — block to prevent session hijack
    if (row.auth_user_id !== user.id) {
      return NextResponse.json({ status: 'conflict' as const });
    }

    return NextResponse.json({
      status: 'ok' as const,
      student: { id: row.id, name: row.name, user_type: row.user_type },
    });
  } catch (e) {
    console.error('lookup-phone:', e);
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
}
