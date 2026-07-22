import { NextResponse } from 'next/server';
import { getDepartmentForHodEmail } from '@/lib/departments';
import { supabaseAdmin } from '@/lib/supabase';

// Role is derived live from the signed-in email, so never serve a snapshot.
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * Tells the staff UI which role the signed-in account holds. The HOD role is
 * granted when the account's email is a department's designated hod_email.
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

  const department = await getDepartmentForHodEmail(supabaseAdmin, user.email);

  return NextResponse.json({
    isHod: Boolean(department),
    department: department ? { id: department.id, name: department.name } : null,
  });
}
