import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

function readEmailFromBearerToken(authHeader: string | null) {
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) return null;
  const parts = authHeader.slice(7).split('.');
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { email?: string };
    return payload.email?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

/** Departments are college-wide, so any operator (owns ≥1 shop) may manage them. */
async function authorizeOperator(request: Request) {
  const email = readEmailFromBearerToken(request.headers.get('authorization'));
  if (!email) {
    return { error: NextResponse.json({ error: 'Operator authentication token missing' }, { status: 401 }) };
  }

  const { data: shop } = await supabaseAdmin!
    .from('shops')
    .select('id')
    .eq('operator_email', email)
    .limit(1)
    .maybeSingle();

  if (!shop) {
    return { error: NextResponse.json({ error: 'Only operators can manage departments.' }, { status: 403 }) };
  }

  return { email };
}

/** All departments college-wide, with their designated HOD. */
export async function GET(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Service role key missing' }, { status: 500 });
  }

  const auth = await authorizeOperator(request);
  if (auth.error) return auth.error;

  const { data, error } = await supabaseAdmin
    .from('departments')
    .select('id,name,hod_email,hod_name,staff_email')
    .order('name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data: data ?? [] });
}

/** Create a department, optionally designating its HOD email. */
export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Service role key missing' }, { status: 500 });
  }

  const auth = await authorizeOperator(request);
  if (auth.error) return auth.error;

  const body = (await request.json()) as { name?: string; hodEmail?: string };
  const name = body.name?.trim();
  const hodEmail = body.hodEmail?.trim().toLowerCase() || null;

  if (!name) {
    return NextResponse.json({ error: 'Enter a department name.' }, { status: 400 });
  }

  if (hodEmail && !hodEmail.includes('@')) {
    return NextResponse.json({ error: 'Enter a valid HOD email.' }, { status: 400 });
  }

  // Name is claimed case-insensitively.
  const { data: existing } = await supabaseAdmin.from('departments').select('id').ilike('name', name).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: `A department named "${name}" already exists.` }, { status: 409 });
  }

  if (hodEmail) {
    const conflict = await columnConflict('hod_email', hodEmail, null, 'the HOD of');
    if (conflict) return conflict;
  }

  const { data, error } = await supabaseAdmin
    .from('departments')
    .insert({ name, hod_email: hodEmail })
    .select('id,name,hod_email,staff_email')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data });
}

/**
 * Update a department. Two intents, chosen by which field is present:
 *  - `staffEmail` (+ optional `staffPassword`): provision the shared staff login.
 *  - `hodEmail`: designate the HOD.
 */
export async function PATCH(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Service role key missing' }, { status: 500 });
  }

  const auth = await authorizeOperator(request);
  if (auth.error) return auth.error;

  const body = (await request.json()) as {
    departmentId?: string;
    hodEmail?: string | null;
    staffEmail?: string | null;
    staffPassword?: string;
  };
  const departmentId = body.departmentId?.trim();

  if (!departmentId) {
    return NextResponse.json({ error: 'departmentId is required.' }, { status: 400 });
  }

  const { data: department } = await supabaseAdmin
    .from('departments')
    .select('id,name')
    .eq('id', departmentId)
    .maybeSingle();

  if (!department) {
    return NextResponse.json({ error: 'Department not found.' }, { status: 404 });
  }

  // ── Shared staff login ──────────────────────────────────────────────────
  if ('staffEmail' in body) {
    const staffEmail = body.staffEmail?.trim().toLowerCase() || null;

    if (staffEmail) {
      if (!staffEmail.includes('@')) {
        return NextResponse.json({ error: 'Enter a valid staff email.' }, { status: 400 });
      }
      const password = body.staffPassword?.trim();
      if (!password || password.length < 6) {
        return NextResponse.json({ error: 'Set a staff password of at least 6 characters.' }, { status: 400 });
      }

      const conflict = await columnConflict('staff_email', staffEmail, departmentId, 'the staff login for');
      if (conflict) return conflict;

      const provisioned = await ensureStaffAccount(staffEmail, password, department.name, department.id);
      if (!provisioned.ok) {
        return NextResponse.json({ error: provisioned.error }, { status: 400 });
      }
    }

    const { error } = await supabaseAdmin.from('departments').update({ staff_email: staffEmail }).eq('id', departmentId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  }

  // ── HOD designation ─────────────────────────────────────────────────────
  const hodEmail = body.hodEmail?.trim().toLowerCase() || null;

  if (hodEmail && !hodEmail.includes('@')) {
    return NextResponse.json({ error: 'Enter a valid HOD email.' }, { status: 400 });
  }

  if (hodEmail) {
    const conflict = await columnConflict('hod_email', hodEmail, departmentId, 'the HOD of');
    if (conflict) return conflict;
  }

  // Setting the email via the operator supersedes any legacy HOD account link.
  const { error } = await supabaseAdmin
    .from('departments')
    .update({ hod_email: hodEmail, hod_auth_user_id: null })
    .eq('id', departmentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}

/** Random-ish 10-digit Indian mobile for the shared account's synthetic identity. */
function syntheticPhone() {
  return `9${Math.floor(100000000 + Math.random() * 900000000)}`;
}

/** Finds an auth user by email (no direct filter API, so page through). */
async function findAuthUserByEmail(email: string) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 10; page += 1) {
    const { data } = await supabaseAdmin!.auth.admin.listUsers({ page, perPage: 200 });
    const users = data?.users ?? [];
    const match = users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match;
    if (users.length < 200) break;
  }
  return null;
}

/**
 * Creates or updates the shared staff auth account for a department. The
 * account's metadata carries the department so the ordering flow auto-provisions
 * a staff profile without a phone-entry step.
 */
async function ensureStaffAccount(email: string, password: string, deptName: string, deptId: string) {
  const metadata = { user_type: 'staff', name: `${deptName} Staff`, department: deptName, department_id: deptId };

  const { data: created, error } = await supabaseAdmin!.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { ...metadata, phone: syntheticPhone() },
  });

  if (!error && created?.user) {
    return { ok: true as const, userId: created.user.id };
  }

  // Email already exists — adopt it as this department's staff login, keeping
  // any phone it already had so its existing orders stay under one profile.
  const existing = await findAuthUserByEmail(email);
  if (!existing) {
    return { ok: false as const, error: error?.message ?? 'Could not provision the staff account.' };
  }

  await supabaseAdmin!.auth.admin.updateUserById(existing.id, {
    password,
    user_metadata: {
      ...(existing.user_metadata ?? {}),
      ...metadata,
      phone: existing.user_metadata?.phone ?? syntheticPhone(),
    },
  });

  return { ok: true as const, userId: existing.id };
}

/** An email may fill a given role for only one department. */
async function columnConflict(
  column: 'hod_email' | 'staff_email',
  email: string,
  exceptDepartmentId: string | null,
  roleLabel: string,
) {
  const { data } = await supabaseAdmin!
    .from('departments')
    .select('id,name')
    .ilike(column, email)
    .maybeSingle();

  if (data && data.id !== exceptDepartmentId) {
    return NextResponse.json(
      { error: `${email} is already ${roleLabel} ${data.name}. Use a different email.` },
      { status: 409 },
    );
  }

  return null;
}
