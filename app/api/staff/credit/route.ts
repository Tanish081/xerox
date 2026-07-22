import { NextResponse } from 'next/server';
import { getDepartmentCredit } from '@/lib/department-credit';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Department credit status for a staff member at a shop, used by the order
 * flow to decide whether another order can be placed.
 */
export async function GET(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database admin access not configured.' }, { status: 500 });
  }

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

  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get('studentId')?.trim();

  if (!studentId) {
    return NextResponse.json({ error: 'studentId is required.' }, { status: 400 });
  }

  // Read the department off the student row rather than trusting the client.
  const { data: student, error: studentError } = await supabaseAdmin
    .from('students')
    .select('id,shop_id,department,department_id,user_type,auth_user_id')
    .eq('id', studentId)
    .maybeSingle();

  if (studentError) {
    return NextResponse.json({ error: studentError.message }, { status: 400 });
  }

  if (!student || student.auth_user_id !== user.id) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
  }

  if (student.user_type !== 'staff' || !student.department_id) {
    return NextResponse.json({ error: 'Not a staff profile.' }, { status: 400 });
  }

  try {
    const credit = await getDepartmentCredit(supabaseAdmin, student.shop_id, student.department_id);
    return NextResponse.json({ data: credit });
  } catch (error) {
    console.error('Staff credit route:', error);
    return NextResponse.json({ error: 'Unable to load department credit.' }, { status: 500 });
  }
}
