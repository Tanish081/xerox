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

    // ── 1. Look for existing record at THIS shop ───────────────────────────────
    const { data: row, error } = await supabaseAdmin
      .from('students')
      .select('id,name,roll_no,department,user_type,auth_user_id')
      .eq('shop_id', shop_id)
      .eq('phone', phone)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (row) {
      // Re-link to current auth user if needed (phone = primary identity)
      if (row.auth_user_id !== user.id) {
        await supabaseAdmin
          .from('students')
          .update({ auth_user_id: user.id })
          .eq('id', row.id);
      }
      return NextResponse.json({
        status: 'ok' as const,
        student: { id: row.id, name: row.name, user_type: row.user_type },
      });
    }

    // ── 2. No record at this shop — check any other shop for the same phone ────
    const { data: existing } = await supabaseAdmin
      .from('students')
      .select('name,roll_no,department,user_type')
      .eq('phone', phone)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Auto-create profile for this new shop using the existing profile data
      const { data: created, error: createError } = await supabaseAdmin
        .from('students')
        .insert({
          auth_user_id: user.id,
          phone,
          shop_id,
          name: existing.name,
          roll_no: existing.roll_no ?? null,
          department: existing.department ?? null,
          user_type: existing.user_type ?? 'student',
        })
        .select('id,name,user_type')
        .single();

      if (createError || !created) {
        return NextResponse.json({ error: createError?.message ?? 'Failed to create profile.' }, { status: 500 });
      }

      return NextResponse.json({
        status: 'ok' as const,
        student: { id: created.id, name: created.name, user_type: created.user_type },
      });
    }

    // ── 3. Genuinely new user — needs to fill profile ─────────────────────────
    return NextResponse.json({ status: 'new' as const });

  } catch (e) {
    console.error('lookup-phone:', e);
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
}
