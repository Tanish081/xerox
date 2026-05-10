// Force-confirms an existing operator's email via Supabase Admin API
// Run: node scripts/confirm-operator.mjs

const SUPABASE_URL = 'https://qfgwhzlgpgvhzowkqbmv.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmZ3doemxncGd2aHpvd2txYm12Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM3OTM0MiwiZXhwIjoyMDkwOTU1MzQyfQ.rNad6VNZTuiZ_bkgfr8OwbEAcjOBjlCcKl30e0eaZMg';
const TARGET_EMAIL = 'operator@printq.test';
const NEW_PASSWORD = 'PrintQ@1234';

const headers = {
  'Content-Type': 'application/json',
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
};

async function run() {
  // 1. List all users and find ours
  console.log('▶ Finding user…');
  const listRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=100`, { headers });
  const listData = await listRes.json();
  const users = listData.users ?? [];
  const user = users.find(u => u.email === TARGET_EMAIL);

  if (!user) {
    console.error('✗ User not found:', TARGET_EMAIL);
    process.exit(1);
  }

  console.log(`✓ Found user: ${user.email} (id: ${user.id})`);
  console.log(`  Confirmed: ${user.email_confirmed_at ?? 'NOT CONFIRMED'}`);

  // 2. Update user: confirm email + set password
  console.log('▶ Confirming email and resetting password…');
  const updateRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      email_confirm: true,
      password: NEW_PASSWORD,
    }),
  });

  const updateData = await updateRes.json();

  if (!updateRes.ok) {
    console.error('✗ Failed to update user:', updateData);
    process.exit(1);
  }

  console.log('✓ Email confirmed and password set!');
  console.log('');
  console.log('════════════════════════════════════════');
  console.log('  LOGIN NOW AT:');
  console.log('  http://localhost:3000/operator/login');
  console.log(`  Email   : ${TARGET_EMAIL}`);
  console.log(`  Password: ${NEW_PASSWORD}`);
  console.log('════════════════════════════════════════');
}

run().catch(console.error);
