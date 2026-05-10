// One-time script to seed an operator account + shop
// Run: node scripts/create-operator.mjs

const SUPABASE_URL = 'https://qfgwhzlgpgvhzowkqbmv.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmZ3doemxncGd2aHpvd2txYm12Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM3OTM0MiwiZXhwIjoyMDkwOTU1MzQyfQ.rNad6VNZTuiZ_bkgfr8OwbEAcjOBjlCcKl30e0eaZMg';

const OPERATOR_EMAIL    = 'operator@printq.test';
const OPERATOR_PASSWORD = 'PrintQ@1234';
const SHOP_NAME         = 'PrintQ Demo Shop';
const SHOP_UPI_ID       = 'demo@upi';

const headers = {
  'Content-Type': 'application/json',
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
};

async function run() {
  console.log('▶ Creating operator user…');

  // 1. Create user (auto-confirmed via admin API)
  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email: OPERATOR_EMAIL,
      password: OPERATOR_PASSWORD,
      email_confirm: true,
    }),
  });

  const createData = await createRes.json();

  if (!createRes.ok) {
    // If user already exists, try to fetch them
    if (createData.msg?.includes('already') || createData.message?.includes('already')) {
      console.log('⚠  User already exists, proceeding to shop creation…');
    } else {
      console.error('✗ Failed to create user:', createData);
      process.exit(1);
    }
  } else {
    console.log('✓ User created:', createData.email);
  }

  // 2. Upsert shop row
  console.log('▶ Creating shop…');
  const shopRes = await fetch(`${SUPABASE_URL}/rest/v1/shops`, {
    method: 'POST',
    headers: {
      ...headers,
      'Prefer': 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({
      name: SHOP_NAME,
      upi_id: SHOP_UPI_ID,
      operator_email: OPERATOR_EMAIL,
      is_open: true,
      avg_time_per_10_pages: 3,
    }),
  });

  const shopData = await shopRes.json();

  if (!shopRes.ok) {
    console.error('✗ Failed to create shop:', shopData);
    process.exit(1);
  }

  console.log('✓ Shop created:', shopData[0]?.name ?? SHOP_NAME);
  console.log('');
  console.log('════════════════════════════════════════');
  console.log('  OPERATOR CREDENTIALS');
  console.log('════════════════════════════════════════');
  console.log(`  Email   : ${OPERATOR_EMAIL}`);
  console.log(`  Password: ${OPERATOR_PASSWORD}`);
  console.log(`  Shop    : ${SHOP_NAME}`);
  console.log('  URL     : http://localhost:3000/operator/login');
  console.log('════════════════════════════════════════');
}

run().catch(console.error);
