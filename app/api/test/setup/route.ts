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

    // 3. Create Stationary Items
    const { data: existingItems } = await supabaseAdmin.from('stationary_items').select('id').eq('shop_id', shopId);
    
    if (!existingItems || existingItems.length === 0) {
      const items = [
        { shop_id: shopId, name: 'Blue Pen (Cello)', price: 10, stock_quantity: 50, is_available: true },
        { shop_id: shopId, name: 'Project File (Transparent)', price: 15, stock_quantity: 20, is_available: true },
        { shop_id: shopId, name: 'A4 Blank Paper (10 sheets)', price: 20, stock_quantity: 100, is_available: true },
      ];
      
      const { error: itemsError } = await supabaseAdmin.from('stationary_items').insert(items);
      if (itemsError) throw itemsError;
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Test environment setup successfully!',
      operatorEmail: email,
      operatorPassword: password,
      shopId: shopId
    }, { status: 200 });

  } catch (error) {
    console.error('Setup error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error during setup' }, { status: 500 });
  }
}
