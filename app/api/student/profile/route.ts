import { NextResponse } from 'next/server';
import { ensureDepartmentCredit, findDepartmentByName, getDepartmentById } from '@/lib/departments';
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

    // HODs place print requests too. Their profile is stored as staff so it
    // flows through the same ordering machinery; the HOD's extra powers come
    // from departments.hod_auth_user_id, not from this row.
    const metaUserType = (user.user_metadata?.user_type as string) ?? user_type;
    const isDepartmentUser = metaUserType === 'staff' || metaUserType === 'hod';

    // The department comes from the verified auth user, never the request body,
    // so nobody can attach themselves to a department they didn't register
    // under. Falls back to a name lookup for accounts created before ids existed.
    let departmentRow = null;
    if (isDepartmentUser) {
      const metaDepartmentId = user.user_metadata?.department_id as string | undefined;
      departmentRow = metaDepartmentId
        ? await getDepartmentById(supabaseAdmin, metaDepartmentId)
        : await findDepartmentByName(supabaseAdmin, (user.user_metadata?.department as string) || department || '');
    }

    const storedUserType = isDepartmentUser ? 'staff' : 'student';

    if (!name || !phone || !shop_id) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
    }

    if (!isDepartmentUser && !roll_no) {
      return NextResponse.json({ error: 'Roll number is required for students.' }, { status: 400 });
    }

    if (isDepartmentUser && !departmentRow) {
      return NextResponse.json(
        { error: 'Your department could not be resolved. Please register again under a listed department.' },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from('students')
      .upsert(
        {
          // No id field — let the DB generate a UUID for new records.
          // Each unique (phone, shop_id) pair is a distinct student.
          auth_user_id: user.id,
          name,
          roll_no: isDepartmentUser ? null : roll_no,
          department: departmentRow?.name ?? null,
          department_id: departmentRow?.id ?? null,
          user_type: storedUserType,
          phone,
          shop_id,
        },
        { onConflict: 'phone,shop_id' },
      )
      .select('id,name,user_type,department,department_id')
      .single();

    if (error) {
      console.error('Student profile upsert:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Staff print on department credit — make sure the department has a credit
    // limit at this center before their first order.
    if (departmentRow) {
      await ensureDepartmentCredit(supabaseAdmin, departmentRow.id, shop_id);
    }

    // Sync to Auth Metadata for easier access. Merge rather than replace —
    // staff registration stores name/department/phone here and we must not
    // wipe it when the same person registers at a second shop.
    // Keep the account's own user_type (an HOD stays an 'hod' account even
    // though their orderable profile is stored as staff).
    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...(user.user_metadata ?? {}), user_type: metaUserType },
    });

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error('Student profile route:', error);
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
}
