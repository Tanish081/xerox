import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Without both of these the staff dropdown serves a stale snapshot: `dynamic`
// stops the route being prerendered, and `fetchCache` stops Next caching the
// HTTP call supabase-js makes underneath. A newly registered department has to
// show up immediately.
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * Departments staff can register under — all of them, created by the operator.
 * A department may not have an HOD assigned yet; staff can still join, and large
 * jobs are simply blocked until the operator designates one.
 */
export async function GET(_request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database admin access not configured.' }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin
    .from('departments')
    .select('id,name')
    .order('name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data: data ?? [] });
}
