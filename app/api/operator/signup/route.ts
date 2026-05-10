import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Admin client not configured.' }, { status: 500 });
  }

  try {
    const { shopName, upiId, email, password } = await request.json();

    if (!shopName || !upiId || !email || !password) {
      return NextResponse.json({ error: 'All fields are required.' }, { status: 400 });
    }

    // Use admin key to create user — this auto-confirms the email,
    // bypassing the "email confirmation required" Supabase setting entirely.
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true, // <-- key: marks email as confirmed immediately
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    const userId = authData.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'User creation failed.' }, { status: 500 });
    }

    // Create the shop linked to this operator's email
    const { error: shopError } = await supabaseAdmin.from('shops').insert({
      name: shopName.trim(),
      upi_id: upiId.trim(),
      operator_email: email.trim().toLowerCase(),
    });

    if (shopError) {
      // Roll back: delete the user if shop creation fails
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: 'Failed to create shop: ' + shopError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('Signup error:', err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
