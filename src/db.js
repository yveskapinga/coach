'use strict';

const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
  host: config.pg.host,
  port: config.pg.port,
  database: config.pg.database,
  user: config.pg.user,
  password: config.pg.password,
});

async function query(sql, params, userId = null) {
  const client = await pool.connect();
  try {
    if (userId) {
      await client.query('SELECT set_config($1, $2, false)', ['app.user_id', userId]);
    }
    const result = await client.query(sql, params);
    return result;
  } finally {
    if (userId) {
      await client.query("RESET app.user_id;").catch(() => {});
    }
    client.release();
  }
}

async function transaction(callback, userId = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (userId) {
      await client.query('SELECT set_config($1, $2, false)', ['app.user_id', userId]);
    }
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    if (userId) {
      await client.query("RESET app.user_id;").catch(() => {});
    }
    client.release();
  }
}

module.exports = { pool, query, transaction };
