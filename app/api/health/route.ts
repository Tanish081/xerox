import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export function GET() {
  return NextResponse.json({ ok: true, service: 'PrintQ' });
}

export async function POST() {
  if (!supabaseAdmin) {
    return NextResponse.json(
      {
        ok: false,
        checks: {
          env: false,
          stationaryItemsTable: false,
          productImagesBucket: false,
        },
        missing: ['SUPABASE_SERVICE_ROLE_KEY'],
      },
      { status: 500 },
    );
  }

  const checks = {
    env: true,
    stationaryItemsTable: false,
    productImagesBucket: false,
  };
  const missing: string[] = [];

  const { error: tableError } = await supabaseAdmin.from('stationary_items').select('id').limit(1);
  if (!tableError) {
    checks.stationaryItemsTable = true;
  } else {
    missing.push('public.stationary_items table');
  }

  const { data: buckets, error: bucketsError } = await supabaseAdmin.storage.listBuckets();
  if (!bucketsError && (buckets ?? []).some((bucket) => bucket.id === 'product-images')) {
    checks.productImagesBucket = true;
  } else {
    missing.push('product-images storage bucket');
  }

  return NextResponse.json({
    ok: checks.env && checks.stationaryItemsTable && checks.productImagesBucket,
    checks,
    missing,
  });
}
