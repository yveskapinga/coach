'use strict';

const { hashPassword, verifyPassword } = require('./password');
const { generateAccessToken, generateRefreshToken } = require('./tokens');
const { query, transaction } = require('../db');
const { authenticate } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const { sendPasswordReset } = require('./email');

async function authRoutes(fastify, options) {

  // POST /auth/register
  fastify.post('/auth/register', async (request, reply) => {
    const { username, email, first_name, password } = request.body || {};

    if (!username || !email || !first_name || !password) {
      return reply.status(400).send({ error: 'All fields are required' });
    }
    if (password.length < 6) {
      return reply.status(400).send({ error: 'Password must be at least 6 characters' });
    }

    const passwordHash = await hashPassword(password);

    try {
      const result = await query(
        `INSERT INTO users (id, username, email, first_name, password_hash)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, username, email, first_name, created_at`,
        [uuidv4(), username.trim(), email.trim().toLowerCase(), first_name.trim(), passwordHash]
      );
      return reply.status(201).send({ user: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        return reply.status(409).send({ error: 'Username or email already exists' });
      }
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Registration failed' });
    }
  });

  // POST /auth/login
  fastify.post('/auth/login', async (request, reply) => {
    const { username, password } = request.body || {};

    if (!username || !password) {
      return reply.status(400).send({ error: 'Username and password required' });
    }

    const result = await query(
      `SELECT id, password_hash FROM users WHERE username = $1 AND is_active = TRUE`,
      [username.trim()]
    );

    if (result.rows.length === 0) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const accessToken = generateAccessToken(fastify, user.id);
    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await query(
      `INSERT INTO auth_sessions (id, user_id, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [uuidv4(), user.id, refreshToken, expiresAt]
    );

    return reply.send({ access_token: accessToken, refresh_token: refreshToken });
  });

  // POST /auth/refresh
  fastify.post('/auth/refresh', async (request, reply) => {
    const { refresh_token } = request.body || {};

    if (!refresh_token) {
      return reply.status(400).send({ error: 'Refresh token required' });
    }

    const result = await query(
      `SELECT user_id FROM auth_sessions
       WHERE refresh_token = $1 AND expires_at > NOW() AND used = FALSE`,
      [refresh_token]
    );

    if (result.rows.length === 0) {
      return reply.status(401).send({ error: 'Invalid or expired refresh token' });
    }

    const userId = result.rows[0].user_id;
    await query(
      `UPDATE auth_sessions SET used = TRUE WHERE refresh_token = $1`,
      [refresh_token]
    );

    const newAccessToken = generateAccessToken(fastify, userId);
    const newRefreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await query(
      `INSERT INTO auth_sessions (id, user_id, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [uuidv4(), userId, newRefreshToken, expiresAt]
    );

    return reply.send({ access_token: newAccessToken, refresh_token: newRefreshToken });
  });

  // POST /auth/reset-request
  fastify.post('/auth/reset-request', async (request, reply) => {
    const { email } = request.body || {};
    if (!email) {
      return reply.status(400).send({ error: 'Email required' });
    }

    const userResult = await query(
      `SELECT id, first_name FROM users WHERE email = $1 AND is_active = TRUE`,
      [email.trim().toLowerCase()]
    );

    if (userResult.rows.length === 0) {
      // Ne pas révéler si l'email existe
      return reply.send({ message: 'If the email exists, a reset link will be sent' });
    }

    const userId = userResult.rows[0].id;
    const firstName = userResult.rows[0].first_name;
    const token = generateRefreshToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await query(
      `INSERT INTO password_resets (id, user_id, token, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [uuidv4(), userId, token, expiresAt]
    );

    try {
      const result = await sendPasswordReset(email.trim().toLowerCase(), token, firstName);
      if (result.sent) {
        return reply.send({ message: 'Un email de réinitialisation a été envoyé' });
      }
      // Fallback if no SMTP configured
      const isTest = process.env.NODE_ENV === 'test';
      return reply.send({
        message: 'Un email de réinitialisation a été envoyé',
        ...(isTest ? { debug_token: token } : {}),
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Failed to send reset email' });
    }
  });

  // GET /auth/me
  fastify.get('/auth/me', { preHandler: authenticate }, async (request, reply) => {
    try {
      const result = await query(
        `SELECT id, username, email, first_name, is_active, created_at FROM users WHERE id = $1`,
        [request.user.id]
      );
      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'User not found' });
      }
      return reply.send({ user: result.rows[0] });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Failed to get user' });
    }
  });

  // POST /auth/logout
  fastify.post('/auth/logout', { preHandler: authenticate }, async (request, reply) => {
    try {
      const { refresh_token } = request.body || {};
      if (refresh_token) {
        await query(
          `UPDATE auth_sessions SET used = TRUE WHERE refresh_token = $1 AND user_id = $2`,
          [refresh_token, request.user.id]
        );
      }
      return reply.send({ message: 'Logged out' });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Logout failed' });
    }
  });

  // POST /auth/reset-password
  fastify.post('/auth/reset-password', async (request, reply) => {
    const { token, new_password } = request.body || {};

    if (!token || !new_password) {
      return reply.status(400).send({ error: 'Token and new password required' });
    }
    if (new_password.length < 6) {
      return reply.status(400).send({ error: 'Password must be at least 6 characters' });
    }

    const result = await query(
      `SELECT user_id FROM password_resets
       WHERE token = $1 AND expires_at > NOW() AND used = FALSE`,
      [token]
    );

    if (result.rows.length === 0) {
      return reply.status(400).send({ error: 'Invalid or expired token' });
    }

    const userId = result.rows[0].user_id;
    const passwordHash = await hashPassword(new_password);

    await transaction(async (client) => {
      await client.query(
        `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
        [passwordHash, userId]
      );
      await client.query(
        `UPDATE password_resets SET used = TRUE WHERE token = $1`,
        [token]
      );
    });

    return reply.send({ message: 'Password updated successfully' });
  });
}

module.exports = authRoutes;
