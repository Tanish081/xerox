import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

function readEmailFromBearerToken(authHeader: string | null) {
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { email?: string };
    return payload.email?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

async function assertOperatorShop(operatorEmail: string, shopId: string) {
  const { data: shop, error } = await supabaseAdmin!
    .from('shops')
    .select('id,operator_email')
    .eq('id', shopId)
    .single();

  if (error || !shop) {
    return { ok: false as const, status: 404, error: error?.message ?? 'Shop not found' };
  }

  if ((shop.operator_email ?? '').toLowerCase() !== operatorEmail) {
    return { ok: false as const, status: 403, error: 'Not authorized for this shop' };
  }

  return { ok: true as const };
}

export async function GET(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Service role key missing' }, { status: 500 });
  }

  const operatorEmail = readEmailFromBearerToken(request.headers.get('authorization'));
  if (!operatorEmail) {
    return NextResponse.json({ error: 'Operator authentication token missing' }, { status: 401 });
  }

  const shopId = new URL(request.url).searchParams.get('shopId');
  if (!shopId) {
    return NextResponse.json({ error: 'shopId is required' }, { status: 400 });
  }

  const authResult = await assertOperatorShop(operatorEmail, shopId);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  const { data, error } = await supabaseAdmin
    .from('stationary_items')
    .select('*')
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Service role key missing' }, { status: 500 });
  }

  const operatorEmail = readEmailFromBearerToken(request.headers.get('authorization'));
  if (!operatorEmail) {
    return NextResponse.json({ error: 'Operator authentication token missing' }, { status: 401 });
  }

  const body = (await request.json()) as {
    shopId?: string;
    name?: string;
    price?: number;
    stockQuantity?: number;
    isAvailable?: boolean;
    imageUrl?: string | null;
  };

  const shopId = body.shopId?.trim();
  const name = body.name?.trim();
  const price = Number(body.price);
  const stockQuantity = Number(body.stockQuantity ?? 0);

  if (!shopId || !name || !Number.isFinite(price) || price < 0 || !Number.isInteger(stockQuantity) || stockQuantity < 0) {
    return NextResponse.json({ error: 'Invalid inventory payload' }, { status: 400 });
  }

  const authResult = await assertOperatorShop(operatorEmail, shopId);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  const { data, error } = await supabaseAdmin
    .from('stationary_items')
    .insert({
      shop_id: shopId,
      name,
      price,
      stock_quantity: stockQuantity,
      is_available: body.isAvailable ?? stockQuantity > 0,
      image_url: body.imageUrl ?? null,
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data });
}

export async function PATCH(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Service role key missing' }, { status: 500 });
  }

  const operatorEmail = readEmailFromBearerToken(request.headers.get('authorization'));
  if (!operatorEmail) {
    return NextResponse.json({ error: 'Operator authentication token missing' }, { status: 401 });
  }

  const body = (await request.json()) as {
    itemId?: string;
    shopId?: string;
    name?: string;
    price?: number;
    stockQuantity?: number;
    isAvailable?: boolean;
    imageUrl?: string | null;
  };

  const itemId = body.itemId?.trim();
  const shopId = body.shopId?.trim();
  if (!itemId || !shopId) {
    return NextResponse.json({ error: 'itemId and shopId are required' }, { status: 400 });
  }

  const authResult = await assertOperatorShop(operatorEmail, shopId);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.name === 'string') updates.name = body.name.trim();
  if (typeof body.price !== 'undefined') {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: 'Invalid price' }, { status: 400 });
    }
    updates.price = price;
  }
  if (typeof body.stockQuantity !== 'undefined') {
    const stockQuantity = Number(body.stockQuantity);
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
      return NextResponse.json({ error: 'Invalid stock quantity' }, { status: 400 });
    }
    updates.stock_quantity = stockQuantity;
  }
  if (typeof body.isAvailable !== 'undefined') updates.is_available = body.isAvailable;
  if (typeof body.imageUrl !== 'undefined') updates.image_url = body.imageUrl;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No update fields provided' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('stationary_items')
    .update(updates)
    .eq('id', itemId)
    .eq('shop_id', shopId)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data });
}

export async function DELETE(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Service role key missing' }, { status: 500 });
  }

  const operatorEmail = readEmailFromBearerToken(request.headers.get('authorization'));
  if (!operatorEmail) {
    return NextResponse.json({ error: 'Operator authentication token missing' }, { status: 401 });
  }

  const body = (await request.json()) as { itemId?: string; shopId?: string };
  const itemId = body.itemId?.trim();
  const shopId = body.shopId?.trim();
  if (!itemId || !shopId) {
    return NextResponse.json({ error: 'itemId and shopId are required' }, { status: 400 });
  }

  const authResult = await assertOperatorShop(operatorEmail, shopId);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  const { error } = await supabaseAdmin.from('stationary_items').delete().eq('id', itemId).eq('shop_id', shopId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
