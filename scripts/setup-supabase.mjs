import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function loadEnvFile() {
  const envPath = path.join(projectRoot, '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex < 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function ensureProductImagesBucket(admin) {
  const { data: buckets, error } = await admin.storage.listBuckets();
  if (error) {
    throw new Error(`Unable to list storage buckets: ${error.message}`);
  }

  const exists = (buckets ?? []).some((bucket) => bucket.id === 'product-images');
  if (exists) {
    console.log('✓ Bucket exists: product-images');
    return;
  }

  const { error: createError } = await admin.storage.createBucket('product-images', { public: true });
  if (createError) {
    throw new Error(`Unable to create product-images bucket: ${createError.message}`);
  }
  console.log('✓ Created bucket: product-images');
}

async function ensureStationaryItemsTable(admin) {
  const { error } = await admin.from('stationary_items').select('id').limit(1);
  if (!error) {
    console.log('✓ Table exists: public.stationary_items');
    return true;
  }
  console.log('ℹ Table missing: public.stationary_items');
  return false;
}

async function runSqlMigration(dbUrl) {
  const sqlPath = path.join(projectRoot, 'sql', 'migrations', '2026-05-11-stationary-items-bootstrap.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function main() {
  loadEnvFile();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl = process.env.SUPABASE_DB_URL;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('▶ Checking Supabase resources...');
  await ensureProductImagesBucket(admin);
  const tableExists = await ensureStationaryItemsTable(admin);

  if (!tableExists) {
    if (!dbUrl) {
      throw new Error(
        'stationary_items table is missing and SUPABASE_DB_URL is not set. Add SUPABASE_DB_URL to .env and rerun.',
      );
    }

    console.log('▶ Running SQL bootstrap migration...');
    await runSqlMigration(dbUrl);
    console.log('✓ Migration executed');
  }

  console.log('▶ Verifying final readiness...');
  await ensureProductImagesBucket(admin);
  const finalTableExists = await ensureStationaryItemsTable(admin);
  if (!finalTableExists) {
    throw new Error('Setup incomplete: stationary_items table still missing after migration.');
  }

  console.log('✅ Supabase inventory setup complete.');
}

main().catch((error) => {
  console.error('❌ Setup failed:', error.message);
  process.exit(1);
});
