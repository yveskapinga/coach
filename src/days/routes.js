'use strict';

const { query } = require('../db');
const { authenticate } = require('../middleware/auth');

async function dayRoutes(fastify, options) {

  // POST /days — Create Day
  fastify.post('/days', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.id;
    const { date } = request.body || {};

    if (!date) {
      return reply.status(400).send({ error: 'Date is required' });
    }

    try {
      const result = await query(
        `SELECT create_day($1, $2) as day_id`,
        [userId, date],
        userId
      );
      const dayId = result.rows[0].day_id;

      const dayResult = await query(
        `SELECT * FROM days WHERE id = $1`,
        [dayId],
        userId
      );

      return reply.status(201).send({ day: dayResult.rows[0] });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Failed to create day' });
    }
  });

  // POST /days/:id/morning — Morning setup
  fastify.post('/days/:id/morning', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.id;
    const dayId = request.params.id;
    const { actions, focus } = request.body || {};

    if (!Array.isArray(actions) || actions.length < 1 || actions.length > 3) {
      return reply.status(400).send({ error: 'Actions: 1 to 3 required' });
    }
    if (!focus || typeof focus !== 'string' || focus.trim().length < 2) {
      return reply.status(400).send({ error: 'Focus is required' });
    }

    for (const action of actions) {
      if (typeof action !== 'string' || action.trim().length < 2) {
        return reply.status(400).send({ error: 'Each action must be at least 2 characters' });
      }
    }

    const cleanedActions = actions.map(a => a.trim());
    const cleanedFocus = focus.trim();

    try {
      await query(
        `SELECT set_morning($1, $2, $3, $4)`,
        [userId, dayId, cleanedActions, cleanedFocus],
        userId
      );

      const entries = await query(
        `SELECT * FROM day_entries WHERE day_id = $1 ORDER BY created_at`,
        [dayId],
        userId
      );

      return reply.send({ day_id: dayId, entries: entries.rows });
    } catch (err) {
      if (err.message.includes('access denied')) {
        return reply.status(403).send({ error: 'Access denied' });
      }
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Morning setup failed' });
    }
  });

  // PATCH /days/:id/execution — Update execution
  fastify.patch('/days/:id/execution', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.id;
    const dayId = request.params.id;
    const { actions } = request.body || {};

    if (!Array.isArray(actions) || actions.length === 0) {
      return reply.status(400).send({ error: 'Actions array required' });
    }

    for (const item of actions) {
      if (!item.id || !item.status) {
        return reply.status(400).send({ error: 'Each action must have id and status' });
      }
      if (!['DONE', 'NOT_DONE', 'PENDING'].includes(item.status)) {
        return reply.status(400).send({ error: 'Status must be DONE, NOT_DONE or PENDING' });
      }
    }

    try {
      await query(
        `SELECT update_execution($1, $2, $3::jsonb)`,
        [userId, dayId, JSON.stringify(actions)],
        userId
      );

      const entries = await query(
        `SELECT * FROM day_entries WHERE day_id = $1 AND type = 'ACTION' ORDER BY created_at`,
        [dayId],
        userId
      );

      return reply.send({ day_id: dayId, actions: entries.rows });
    } catch (err) {
      if (err.message.includes('access denied')) {
        return reply.status(403).send({ error: 'Access denied' });
      }
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Execution update failed' });
    }
  });

  // POST /days/:id/evening — Evening reflection
  fastify.post('/days/:id/evening', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.id;
    const dayId = request.params.id;
    const { accomplishments, avoidances, failure_reason, lessons, rule_for_tomorrow } = request.body || {};

    const validateText = (val) => {
      if (val === undefined || val === null) return true;
      return typeof val === 'string' && val.trim().length >= 10;
    };

    const fields = { accomplishments, avoidances, failure_reason, lessons, rule_for_tomorrow };
    for (const [key, val] of Object.entries(fields)) {
      if (val !== undefined && val !== null && (typeof val !== 'string' || val.trim().length < 10)) {
        return reply.status(400).send({ error: `${key} must be at least 10 characters if provided` });
      }
    }

    try {
      await query(
        `SELECT set_evening($1, $2, $3, $4, $5, $6, $7)`,
        [
          userId, dayId,
          accomplishments?.trim() || null,
          avoidances?.trim() || null,
          failure_reason?.trim() || null,
          lessons?.trim() || null,
          rule_for_tomorrow?.trim() || null
        ],
        userId
      );

      const scoreResult = await query(
        `SELECT get_day_score($1, $2) as score`,
        [userId, dayId],
        userId
      );

      return reply.send({ day_id: dayId, score: scoreResult.rows[0].score });
    } catch (err) {
      if (err.message.includes('access denied')) {
        return reply.status(403).send({ error: 'Access denied' });
      }
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Evening setup failed' });
    }
  });

  // POST /days/:id/gratitude — Gratitude
  fastify.post('/days/:id/gratitude', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.id;
    const dayId = request.params.id;
    const { items } = request.body || {};

    if (!Array.isArray(items) || items.length !== 3) {
      return reply.status(400).send({ error: 'Exactly 3 gratitude items required' });
    }

    for (const item of items) {
      if (typeof item !== 'string' || item.trim().length < 2) {
        return reply.status(400).send({ error: 'Each item must be at least 2 characters' });
      }
    }

    const cleaned = items.map(i => i.trim());

    try {
      await query(
        `SELECT set_gratitude($1, $2, $3)`,
        [userId, dayId, cleaned],
        userId
      );

      const entries = await query(
        `SELECT * FROM day_entries WHERE day_id = $1 AND type = 'GRATITUDE' ORDER BY created_at`,
        [dayId],
        userId
      );

      return reply.send({ day_id: dayId, items: entries.rows });
    } catch (err) {
      if (err.message.includes('access denied')) {
        return reply.status(403).send({ error: 'Access denied' });
      }
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Gratitude setup failed' });
    }
  });

  // GET /days — list user days
  fastify.get('/days', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.id;
    try {
      const result = await query(
        `SELECT * FROM days WHERE user_id = $1 ORDER BY date DESC`,
        [userId],
        userId
      );
      return reply.send({ days: result.rows });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Failed to list days' });
    }
  });

  // GET /days/:id — get day with entries
  fastify.get('/days/:id', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.id;
    const dayId = request.params.id;
    try {
      const dayResult = await query(
        `SELECT * FROM days WHERE id = $1`,
        [dayId],
        userId
      );
      if (dayResult.rows.length === 0) {
        return reply.status(404).send({ error: 'Day not found' });
      }
      const entriesResult = await query(
        `SELECT * FROM day_entries WHERE day_id = $1 ORDER BY created_at`,
        [dayId],
        userId
      );
      return reply.send({ day: dayResult.rows[0], entries: entriesResult.rows });
    } catch (err) {
      if (err.message.includes('access denied')) {
        return reply.status(403).send({ error: 'Access denied' });
      }
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Failed to get day' });
    }
  });

  // GET /days/:id/score
  fastify.get('/days/:id/score', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.id;
    const dayId = request.params.id;

    try {
      const result = await query(
        `SELECT get_day_score($1, $2) as score`,
        [userId, dayId],
        userId
      );
      return reply.send({ score: result.rows[0].score });
    } catch (err) {
      if (err.message.includes('access denied')) {
        return reply.status(403).send({ error: 'Access denied' });
      }
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Score retrieval failed' });
    }
  });
}

module.exports = dayRoutes;
