process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { Pool } = require('pg');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL environment variable not set");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // You can also specify ssl options here, but with the global flag above it isn't necessary:
  ssl: false // SSL disabled per your previous request.
});

const createTableQuery = `
CREATE TABLE IF NOT EXISTS saved_models (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    prompt TEXT NOT NULL,
    thumbnail_url TEXT,
    model_3d_url TEXT NOT NULL,
    video_url TEXT,
    texture_urls TEXT,
    attack_power INTEGER NOT NULL,
    defense INTEGER NOT NULL,
    speed_agility INTEGER NOT NULL,
    strategy INTEGER NOT NULL,
    endurance INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT
);
`;

async function migrate() {
  try {
    await pool.query(createTableQuery);
    console.log('Migration successful: Table "saved_models" is ready.');
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();