import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST() {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase Admin client not initialized. Check SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 });
  }

  try {
    // 1. Create Test Operator User
    const email = 'operator@printq.test';
    const password = 'password123';
    
    // Check if user exists first to avoid errors
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    let userId = existingUsers?.users.find(u => u.email === email)?.id;

    if (!userId && !listError) {
      const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createError) throw createError;
      userId = userData.user.id;
    }

    // 2. Create Test Shop
    const shopName = "PrintQ Demo Shop";
    const { data: existingShops } = await supabaseAdmin.from('shops').select('id').eq('operator_email', email).single();
    
    let shopId = existingShops?.id;

    if (!shopId) {
      const { data: newShop, error: shopError } = await supabaseAdmin.from('shops').insert({
        name: shopName,
        upi_id: 'test@ybl',
        operator_email: email,
        avg_time_per_10_pages: 5,
        is_open: true,
      }).select('id').single();
      
      if (shopError) throw shopError;
      shopId = newShop.id;
    }

    // 3. Seed stationery data for all shops if empty
    const baseItems = [
      {
        name: 'Blue Ball Pen',
        price: 10,
        stock_quantity: 120,
        is_available: true,
        image_url: 'https://images.unsplash.com/photo-1583485088034-697b5a69f000?auto=format&fit=crop&w=700&q=80',
      },
      {
        name: 'A4 Paper Pack (100 sheets)',
        price: 95,
        stock_quantity: 80,
        is_available: true,
        image_url: 'https://images.unsplash.com/photo-1612198188060-c7c2a3b66eae?auto=format&fit=crop&w=700&q=80',
      },
      {
        name: 'Spiral Notebook',
        price: 60,
        stock_quantity: 75,
        is_available: true,
        image_url: 'https://images.unsplash.com/photo-1531346878377-a5be20888e57?auto=format&fit=crop&w=700&q=80',
      },
      {
        name: 'Highlighter Set',
        price: 80,
        stock_quantity: 40,
        is_available: true,
        image_url: 'https://images.unsplash.com/photo-1596073419667-9d77d59f033f?auto=format&fit=crop&w=700&q=80',
      },
      {
        name: 'Mini Stapler',
        price: 75,
        stock_quantity: 45,
        is_available: true,
        image_url: 'https://images.unsplash.com/photo-1527689368864-3a821dbccc34?auto=format&fit=crop&w=700&q=80',
      },
      {
        name: 'Permanent Marker',
        price: 25,
        stock_quantity: 60,
        is_available: true,
        image_url: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=700&q=80',
      },
      {
        name: 'Geometry Box',
        price: 120,
        stock_quantity: 30,
        is_available: true,
        image_url: 'https://images.unsplash.com/photo-1517420879524-86d64ac2f339?auto=format&fit=crop&w=700&q=80',
      },
      {
        name: 'Pencil Pack (10 pcs)',
        price: 35,
        stock_quantity: 90,
        is_available: true,
        image_url: 'https://images.unsplash.com/photo-1452860606245-08befc0ff44b?auto=format&fit=crop&w=700&q=80',
      },
    ];

    const { data: allShops, error: allShopsError } = await supabaseAdmin.from('shops').select('id,name');
    if (allShopsError) throw allShopsError;

    let seededShops = 0;
    let seededItems = 0;

    for (const currentShop of allShops ?? []) {
      const { data: existingItems, error: existingItemsError } = await supabaseAdmin
        .from('stationary_items')
        .select('id')
        .eq('shop_id', currentShop.id)
        .limit(1);

      if (existingItemsError) throw existingItemsError;
      if (existingItems && existingItems.length > 0) continue;

      const shopItems = baseItems.map((item) => ({
        ...item,
        shop_id: currentShop.id,
      }));

      const { error: itemsError } = await supabaseAdmin.from('stationary_items').insert(shopItems);
      if (itemsError) throw itemsError;

      seededShops += 1;
      seededItems += shopItems.length;
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Test environment setup successfully!',
      operatorEmail: email,
      operatorPassword: password,
      shopId: shopId,
      inventorySeededShops: seededShops,
      inventorySeededItems: seededItems
    }, { status: 200 });

  } catch (error) {
    console.error('Setup error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error during setup' }, { status: 500 });
  }
}
