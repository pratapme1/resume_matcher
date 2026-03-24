import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;
const __dir = dirname(fileURLToPath(import.meta.url));

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const DROP_SQL = `
DROP TABLE IF EXISTS usage_events CASCADE;
DROP TABLE IF EXISTS job_search_sessions CASCADE;
DROP TABLE IF EXISTS tailor_sessions CASCADE;
DROP TABLE IF EXISTS job_descriptions CASCADE;
DROP TABLE IF EXISTS uploaded_resumes CASCADE;
DROP TABLE IF EXISTS users CASCADE;
`;

const CREATE_SQL = readFileSync(join(__dir, 'create-tables.sql'), 'utf8');

async function run() {
  await client.connect();
  console.log('Connected to Supabase PostgreSQL');

  console.log('Dropping existing tables...');
  await client.query(DROP_SQL);
  console.log('Tables dropped.');

  console.log('Creating new tables...');
  await client.query(CREATE_SQL);
  console.log('Tables created successfully.');

  await client.end();
}

run().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
