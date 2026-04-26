'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const app = require('../src/server');
const { pool, query } = require('../src/db');

describe('Coach-Life API', () => {
  let baseUrl;
  const userA = {};
  const userB = {};

  before(async () => {
    await app.ready();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    baseUrl = `http://${address.address}:${address.port}`;

    // Nettoyage total
    await query('DELETE FROM analysis_events');
    await query('DELETE FROM day_entries');
    await query('DELETE FROM concept_aliases');
    await query('DELETE FROM concepts');
    await query('DELETE FROM days');
    await query('DELETE FROM auth_sessions');
    await query('DELETE FROM password_resets');
    await query('DELETE FROM users');
  });

  after(async () => {
    await app.close();
    await pool.end();
  });

  // ============================================================
  // AUTH
  // ============================================================
  describe('Auth', () => {
    it('should register user A', async () => {
      const res = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'alice',
          email: 'alice@mail.com',
          first_name: 'Alice',
          password: 'password123',
        }),
      });
      const body = await res.json();
      assert.strictEqual(res.status, 201);
      assert.ok(body.user.id);
      userA.id = body.user.id;
    });

    it('should register user B', async () => {
      const res = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'bob',
          email: 'bob@mail.com',
          first_name: 'Bob',
          password: 'password123',
        }),
      });
      const body = await res.json();
      assert.strictEqual(res.status, 201);
      assert.ok(body.user.id);
      userB.id = body.user.id;
    });

    it('should reject duplicate username', async () => {
      const res = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'alice',
          email: 'alice2@mail.com',
          first_name: 'Alice2',
          password: 'password123',
        }),
      });
      assert.strictEqual(res.status, 409);
    });

    it('should login user A', async () => {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'alice', password: 'password123' }),
      });
      const body = await res.json();
      assert.strictEqual(res.status, 200);
      assert.ok(body.access_token);
      assert.ok(body.refresh_token);
      userA.token = body.access_token;
    });

    it('should login user B', async () => {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'bob', password: 'password123' }),
      });
      const body = await res.json();
      assert.strictEqual(res.status, 200);
      userB.token = body.access_token;
    });

    it('should reject bad password', async () => {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'alice', password: 'wrong' }),
      });
      assert.strictEqual(res.status, 401);
    });

    it('should refresh token', async () => {
      const loginRes = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'alice', password: 'password123' }),
      });
      const loginBody = await loginRes.json();

      const res = await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: loginBody.refresh_token }),
      });
      const body = await res.json();
      assert.strictEqual(res.status, 200);
      assert.ok(body.access_token);
      assert.ok(body.refresh_token);
    });

    it('should request password reset', async () => {
      const res = await fetch(`${baseUrl}/auth/reset-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice@mail.com' }),
      });
      const body = await res.json();
      assert.strictEqual(res.status, 200);
      assert.ok(body.debug_token);
      userA.resetToken = body.debug_token;
    });

    it('should reset password', async () => {
      const res = await fetch(`${baseUrl}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: userA.resetToken, new_password: 'newpass456' }),
      });
      assert.strictEqual(res.status, 200);

      const loginRes = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'alice', password: 'newpass456' }),
      });
      assert.strictEqual(loginRes.status, 200);

      // Restore password for following tests
      const reqRes = await fetch(`${baseUrl}/auth/reset-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice@mail.com' }),
      });
      const reqBody = await reqRes.json();
      await fetch(`${baseUrl}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: reqBody.debug_token, new_password: 'password123' }),
      });
      const relogin = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'alice', password: 'password123' }),
      });
      const reloginBody = await relogin.json();
      userA.token = reloginBody.access_token;
    });
  });

  // ============================================================
  // DAY FLOW
  // ============================================================
  describe('Day Flow', () => {
    it('should create a day for user A', async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch(`${baseUrl}/days`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA.token}`,
        },
        body: JSON.stringify({ date: today }),
      });
      const body = await res.json();
      assert.strictEqual(res.status, 201);
      assert.ok(body.day.id);
      userA.dayId = body.day.id;
    });

    it('should create a day for user B', async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch(`${baseUrl}/days`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userB.token}`,
        },
        body: JSON.stringify({ date: today }),
      });
      const body = await res.json();
      assert.strictEqual(res.status, 201);
      userB.dayId = body.day.id;
    });

    it('should set morning for user A', async () => {
      const res = await fetch(`${baseUrl}/days/${userA.dayId}/morning`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA.token}`,
        },
        body: JSON.stringify({
          actions: ['Faire du sport', 'Coder API', 'Lire 20 pages'],
          focus: 'Discipline totale',
        }),
      });
      const body = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(body.entries.length, 4); // 3 actions + 1 focus
    });

    it('should reject too many actions', async () => {
      const res = await fetch(`${baseUrl}/days/${userA.dayId}/morning`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA.token}`,
        },
        body: JSON.stringify({
          actions: ['A1', 'A2', 'A3', 'A4'],
          focus: 'F',
        }),
      });
      assert.strictEqual(res.status, 400);
    });

    it('should update execution for user A', async () => {
      const actionsResult = await query(
        `SELECT id FROM day_entries WHERE day_id = $1 AND type = 'ACTION' ORDER BY created_at`,
        [userA.dayId],
        userA.id
      );
      const actionIds = actionsResult.rows.map(r => r.id);
      assert.strictEqual(actionIds.length, 3);

      const res = await fetch(`${baseUrl}/days/${userA.dayId}/execution`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA.token}`,
        },
        body: JSON.stringify({
          actions: [
            { id: actionIds[0], status: 'DONE' },
            { id: actionIds[1], status: 'DONE' },
            { id: actionIds[2], status: 'NOT_DONE' },
          ],
        }),
      });
      const body = await res.json();
      assert.strictEqual(res.status, 200);
      const doneCount = body.actions.filter(a => a.status === 'DONE').length;
      assert.strictEqual(doneCount, 2);
    });

    it('should set evening for user A', async () => {
      const res = await fetch(`${baseUrl}/days/${userA.dayId}/evening`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA.token}`,
        },
        body: JSON.stringify({
          accomplishments: 'J ai fait du sport et code l API correctement',
          avoidances: 'J ai evite les reseaux sociaux toute la journee',
          failure_reason: 'Manque de sommeil ce matin',
          lessons: 'Se coucher tot est essentiel pour la productivite',
          rule_for_tomorrow: 'Eteindre les ecrans a 21h pile',
        }),
      });
      const body = await res.json();
      assert.strictEqual(res.status, 200);
      assert.ok(body.score);
      assert.strictEqual(body.score.completion_rate, 67);
    });

    it('should reject short evening text', async () => {
      const res = await fetch(`${baseUrl}/days/${userA.dayId}/evening`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA.token}`,
        },
        body: JSON.stringify({
          accomplishments: 'Short',
        }),
      });
      assert.strictEqual(res.status, 400);
    });

    it('should set gratitude for user A', async () => {
      const res = await fetch(`${baseUrl}/days/${userA.dayId}/gratitude`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA.token}`,
        },
        body: JSON.stringify({
          items: ['Ma sante', 'Ma famille', 'Le soleil'],
        }),
      });
      const body = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(body.items.length, 3);
    });

    it('should reject gratitude != 3 items', async () => {
      const res = await fetch(`${baseUrl}/days/${userA.dayId}/gratitude`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA.token}`,
        },
        body: JSON.stringify({
          items: ['Un seul'],
        }),
      });
      assert.strictEqual(res.status, 400);
    });

    it('should get day score', async () => {
      const res = await fetch(`${baseUrl}/days/${userA.dayId}/score`, {
        headers: { Authorization: `Bearer ${userA.token}` },
      });
      const body = await res.json();
      assert.strictEqual(res.status, 200);
      assert.ok(body.score);
      assert.strictEqual(body.score.score, 97); // 67 + 20 + 10
    });
  });

  // ============================================================
  // ISOLATION
  // ============================================================
  describe('Isolation', () => {
    it('should not allow user B to access user A day', async () => {
      const res = await fetch(`${baseUrl}/days/${userA.dayId}/score`, {
        headers: { Authorization: `Bearer ${userB.token}` },
      });
      assert.strictEqual(res.status, 403);
    });

    it('should not allow user B to update user A execution', async () => {
      const res = await fetch(`${baseUrl}/days/${userA.dayId}/execution`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userB.token}`,
        },
        body: JSON.stringify({
          actions: [{ id: '00000000-0000-0000-0000-000000000000', status: 'DONE' }],
        }),
      });
      assert.strictEqual(res.status, 403);
    });
  });

  // ============================================================
  // CONCEPTS
  // ============================================================
  describe('Concepts', () => {
    it('should suggest concepts', async () => {
      const res = await fetch(`${baseUrl}/concepts/suggest?type=ACTION&q=sport`, {
        headers: { Authorization: `Bearer ${userA.token}` },
      });
      const body = await res.json();
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(body.concepts));
      assert.ok(body.concepts.length > 0);
    });
  });

  // ============================================================
  // ANALYTICS
  // ============================================================
  describe('Analytics', () => {
    it('should get user patterns', async () => {
      const res = await fetch(`${baseUrl}/patterns`, {
        headers: { Authorization: `Bearer ${userA.token}` },
      });
      const body = await res.json();
      assert.strictEqual(res.status, 200);
      assert.ok(body.patterns);
      assert.strictEqual(body.patterns.user_id, userA.id);
    });
  });
});
