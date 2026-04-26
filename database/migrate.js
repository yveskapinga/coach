'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: process.env.PG_PORT || 5432,
  database: process.env.PG_DATABASE || 'coach_life',
  user: process.env.PG_USER || 'coach_user',
  password: process.env.PG_PASSWORD || 'change_me',
});

async function migrate() {
  const file = path.join(__dirname, 'migrations', '001_initial.sql');
  const sql = fs.readFileSync(file, 'utf8');
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('Migration 001_initial.sql appliquée avec succès.');
  } catch (err) {
    console.error('Erreur migration:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
