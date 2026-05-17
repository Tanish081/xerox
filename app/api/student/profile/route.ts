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

    const body = (await request.json()) as {
      name?: string;
      roll_no?: string;
      department?: string;
      user_type?: string;
      phone?: string;
      shop_id?: string;
    };

    const name = body.name?.trim();
    const roll_no = body.roll_no?.trim();
    const department = body.department?.trim();
    const user_type = body.user_type?.trim() || 'student';
    const phone = body.phone?.trim();
    const shop_id = body.shop_id?.trim();

    if (!name || !phone || !shop_id) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
    }

    if (user_type === 'student' && !roll_no) {
      return NextResponse.json({ error: 'Roll number is required for students.' }, { status: 400 });
    }

    if (user_type === 'staff' && !department) {
      return NextResponse.json({ error: 'Department is required for staff.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('students')
      .upsert(
        {
          id: user.id,
          name,
          roll_no: user_type === 'student' ? roll_no : null,
          department: user_type === 'staff' ? department : null,
          user_type,
          phone,
          shop_id,
        },
        { onConflict: 'id' },
      )
      .select('id,name,user_type')
      .single();

    if (error) {
      console.error('Student profile upsert:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Sync to Auth Metadata for easier access
    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: { user_type },
    });

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error('Student profile route:', error);
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
}
