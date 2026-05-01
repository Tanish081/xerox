import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

async function deleteStoragePath(path: string | null) {
  if (!supabaseAdmin || !path) {
    return;
  }

  const bucket = path.includes('payment.jpg') ? 'payment-screenshots' : 'print-files';
  await supabaseAdmin.storage.from(bucket).remove([path]);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Service role key missing' }, { status: 500 });
  }

  const { id } = await params;
  const body = await request.json();

  if (body.status === 'completed') {
    const { data: order } = await supabaseAdmin.from('orders').select('file_url').eq('id', id).single();
    await deleteStoragePath(order?.file_url ?? null);
    body.file_url = null;
  }

  const { data, error } = await supabaseAdmin.from('orders').update(body).eq('id', id).select('*').single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Service role key missing' }, { status: 500 });
  }

  const { id } = await params;
  const { data: order } = await supabaseAdmin.from('orders').select('file_url,payment_screenshot_url').eq('id', id).single();

  await deleteStoragePath(order?.file_url ?? null);
  await deleteStoragePath(order?.payment_screenshot_url ?? null);

  const { error } = await supabaseAdmin.from('orders').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
